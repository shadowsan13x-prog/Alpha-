"use strict";

const UID_RE = /^\d{5,25}$/;

function uniqueIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || "").trim())
    .filter(value => UID_RE.test(value)))];
}

async function getUserName(api, uid) {
  if (typeof api.getUserInfo !== "function") return uid;

  try {
    const info = await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(new Error("user-info-timeout")), 8000);
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      };

      try {
        const result = api.getUserInfo(uid, (error, value) => finish(error, value));
        if (result && typeof result.then === "function") {
          result.then(value => finish(null, value), finish);
        }
      } catch (error) {
        finish(error);
      }
    });
    return String(info?.[uid]?.name || uid);
  } catch {
    return uid;
  }
}

function readStoredDevelopers(data) {
  if (Array.isArray(data?.developers)) return uniqueIds(data.developers);
  if (Array.isArray(data?.developers?.list)) return uniqueIds(data.developers.list);
  return [];
}

module.exports = async function devCommand(
  api,
  event,
  args,
  _startTime,
  loadData,
  saveData,
  _automicTimers,
  config = {},
  _hostingInfo,
  _botSentMessages,
  BOT_ID,
  _builtInCommandNames,
  _customCommandNames,
  _commands,
  access = {}
) {
  const threadID = String(event?.threadID || "");
  const senderID = String(event?.senderID || "");
  const send = message => api.sendMessage(String(message), threadID,
    event?.messageID == null ? undefined : String(event.messageID));

  const data = (typeof loadData === "function" ? loadData() : {}) || {};
  const devs = readStoredDevelopers(data);
  const configDevs = uniqueIds([
    ...(Array.isArray(config.DEV_IDS) ? config.DEV_IDS : []),
    config.DEV_ID
  ]);
  const ownerID = String(config.DEV_ID || configDevs[0] || "").trim();
  const isDev = access.isDeveloper === true || devs.includes(senderID) || configDevs.includes(senderID);

  if (!isDev) return send("⛔ هذا الأمر للمطورين فقط.");

  // args[0] is the invoked command name; the subcommand is args[1].
  const sub = String(args?.[1] || "").trim().toLowerCase();
  if (!sub) {
    return send(
      "🛠 أوامر المطورين:\n" +
      "• !dev add [UID] — للمالك الأساسي فقط\n" +
      "• !dev rm [UID] — للمالك الأساسي فقط\n" +
      "• !dev ls — عرض قائمة المطورين"
    );
  }

  if (["ls", "list", "l"].includes(sub)) {
    const all = uniqueIds([...configDevs, ...devs]);
    if (!all.length) return send("📭 لا يوجد مطورون مسجلون.");

    const lines = [`👨‍💻 مطورو ALPHA (${all.length}):`];
    for (let index = 0; index < all.length; index++) {
      const uid = all[index];
      const name = await getUserName(api, uid);
      const tags = [
        uid === ownerID ? "👑 المالك الأساسي" : "",
        configDevs.includes(uid) && uid !== ownerID ? "⭐ من الإعدادات" : ""
      ].filter(Boolean).join(" · ");
      lines.push(`${index + 1}. ${name}${tags ? ` — ${tags}` : ""}\n   UID: ${uid}`);
    }
    return send(lines.join("\n\n"));
  }

  if (!["add", "a", "rm", "remove", "del", "r"].includes(sub)) {
    return send("❓ استخدام الأمر: dev add | dev rm | dev ls");
  }

  // Adding/removing developers changes bot-wide privileges, so only the primary owner may do it.
  if (!ownerID || senderID !== ownerID) {
    return send("🔒 إضافة المطورين وحذفهم متاحان للمالك الأساسي فقط.");
  }

  let target = "";
  if (event?.messageReply?.senderID) {
    target = String(event.messageReply.senderID);
  } else if (UID_RE.test(String(args?.[2] || ""))) {
    target = String(args[2]);
  } else if (event?.mentions && Object.keys(event.mentions).length) {
    target = String(Object.keys(event.mentions)[0]);
  }

  if (!target || !UID_RE.test(target)) {
    return send("↩️ رد على رسالة الشخص أو اكتب UID صحيحاً بعد الأمر.");
  }
  if (target === String(BOT_ID || "")) return send("🤖 لا يمكن إضافة حساب البوت كمطور.");

  const name = await getUserName(api, target);

  if (["add", "a"].includes(sub)) {
    if (configDevs.includes(target) || devs.includes(target)) {
      return send(`ℹ️ ${name} مسجل كمطور بالفعل.\nUID: ${target}`);
    }

    const next = uniqueIds([...devs, target]);
    data.developers = next;
    try {
      saveData(data);
      return send(`✅ تمت إضافة ${name} كمطور في ALPHA.\nUID: ${target}`);
    } catch (error) {
      return send(`❌ تعذرت إضافة المطور وحفظ القائمة.\nالسبب: ${String(error?.message || error).slice(0, 180)}`);
    }
  }

  if (configDevs.includes(target)) {
    return send(`🔒 ${name} مطور أساسي محفوظ في الإعدادات ولا يمكن حذفه بهذا الأمر.`);
  }
  if (!devs.includes(target)) {
    return send(`ℹ️ ${name} ليس ضمن قائمة المطورين الإضافيين.`);
  }

  data.developers = devs.filter(uid => uid !== target);
  try {
    saveData(data);
    return send(`🗑️ تم حذف ${name} من قائمة المطورين.\nUID: ${target}`);
  } catch (error) {
    return send(`❌ تعذر حذف المطور وحفظ القائمة.\nالسبب: ${String(error?.message || error).slice(0, 180)}`);
  }
};

module.exports.aliases = ["dv", "devs"];
