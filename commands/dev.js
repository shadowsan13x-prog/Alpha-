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

function readDisabledDevelopers(data) {
  return uniqueIds(data?.disabledDevelopers);
}

module.exports = async function devCommand(
  api, event, args, _startTime, loadData, saveData, _automicTimers,
  config = {}, _hostingInfo, _botSentMessages, BOT_ID,
  _builtInCommandNames, _customCommandNames, _commands, access = {}
) {
  const threadID = String(event?.threadID || "");
  const senderID = String(event?.senderID || "");
  const send = message => api.sendMessage(
    String(message),
    threadID,
    event?.messageID == null ? undefined : String(event.messageID)
  );

  const data = (typeof loadData === "function" ? loadData() : {}) || {};
  const storedDevs = readStoredDevelopers(data);
  const configDevs = uniqueIds([
    ...(Array.isArray(config.DEV_CONFIGURED_IDS)
      ? config.DEV_CONFIGURED_IDS
      : (Array.isArray(config.DEV_IDS) ? config.DEV_IDS : [])),
    config.DEV_ID
  ]);
  const allDevs = uniqueIds([
    ...(Array.isArray(config.DEV_ALL_IDS) ? config.DEV_ALL_IDS : []),
    ...configDevs,
    ...storedDevs
  ]);
  const disabled = new Set(readDisabledDevelopers(data));
  const activeDevs = allDevs.filter(uid => !disabled.has(uid));

  // Authorization always uses the active list, never a stale config ID.
  if (!activeDevs.includes(senderID)) {
    return send("⛔ هذا الأمر للمطورين الفعّالين في هذه الجلسة فقط.");
  }

  const sub = String(args?.[1] || "").trim().toLowerCase();

  if (!sub) {
    return send(
      "🛠 أوامر المطورين:\n" +
      "• !dev add [UID] — إضافة مطور أو إعادة تفعيله\n" +
      "• !dev rm [UID] — تعطيل مطور\n" +
      "• !dev ls — عرض قائمة المطورين"
    );
  }

  if (["ls", "list", "l"].includes(sub)) {
    if (!allDevs.length) return send("📭 لا يوجد مطورون مسجلون.");

    const lines = [`👨‍💻 مطورو ALPHA (${activeDevs.length} فعّال):`];
    for (let index = 0; index < allDevs.length; index++) {
      const uid = allDevs[index];
      const name = await getUserName(api, uid);
      const status = disabled.has(uid) ? "⛔ معطّل" : "✅ فعّال";
      const source = configDevs.includes(uid) ? "⭐ إعدادات الجلسة" : "🔹 مطور إضافي";
      lines.push(`${index + 1}. ${name} — ${status} · ${source}\n   UID: ${uid}`);
    }
    return send(lines.join("\n\n"));
  }

  if (!["add", "a", "rm", "remove", "del", "r"].includes(sub)) {
    return send("❓ الاستخدام: dev add [UID] | dev rm [UID] | dev ls");
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

  const name = await getUserName(api, target);

  if (["add", "a"].includes(sub)) {
    if (target === String(BOT_ID || "")) {
      return send("🤖 لا يمكن إضافة حساب البوت كمطور.");
    }

    if (allDevs.includes(target)) {
      if (!disabled.has(target)) {
        return send(`ℹ️ ${name} مطور فعّال بالفعل.\nUID: ${target}`);
      }

      data.disabledDevelopers = [...disabled].filter(uid => uid !== target);
      try {
        saveData(data);
        return send(`✅ تمت إعادة تفعيل ${name} كمطور في هذه الجلسة.\nUID: ${target}`);
      } catch (error) {
        return send(`❌ تعذرت إعادة تفعيل المطور.\nالسبب: ${String(error?.message || error).slice(0, 180)}`);
      }
    }

    data.developers = uniqueIds([...storedDevs, target]);
    try {
      saveData(data);
      return send(`✅ تمت إضافة ${name} كمطور في هذه الجلسة.\nUID: ${target}`);
    } catch (error) {
      return send(`❌ تعذرت إضافة المطور وحفظ القائمة.\nالسبب: ${String(error?.message || error).slice(0, 180)}`);
    }
  }

  if (!allDevs.includes(target) || disabled.has(target)) {
    return send(`ℹ️ ${name} ليس مطوراً فعّالاً في هذه الجلسة.`);
  }

  if (activeDevs.length <= 1) {
    return send("🔒 لا يمكن تعطيل آخر مطور فعّال في الجلسة.");
  }

  data.disabledDevelopers = uniqueIds([...disabled, target]);
  try {
    saveData(data);
    return send(`🗑️ تم تعطيل ${name} كمطور في هذه الجلسة.\nUID: ${target}`);
  } catch (error) {
    return send(`❌ تعذر تعطيل المطور وحفظ القائمة.\nالسبب: ${String(error?.message || error).slice(0, 180)}`);
  }
};

module.exports.aliases = ["dv", "devs"];
