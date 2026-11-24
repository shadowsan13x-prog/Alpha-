const fcaLogin = require("@dongdev/fca-unofficial");
const { getThreadInfoSafe, getThreadListSafe, isCoolingDown, installThreadOperationGuard } = require("./thread-info-guard");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(process.env.SHADOW_DATA_DIR || ROOT);
const ISOLATED_SESSION = Boolean(process.env.SHADOW_DATA_DIR);
fs.mkdirSync(DATA_DIR, { recursive: true });
const os = require("os");
const http = require("http");
const stats = require("./stats");
const { canExecuteCommand } = require("./command-access");
const autoDownload = require("./auto-download");
const { createMessageActivity } = require("./message-activity");

process.on("uncaughtException", (err) => console.log("خطأ:", err.message));
process.on("unhandledRejection", (reason) => console.log("خطأ:", reason));

const savedConfig = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "config.json"), "utf8")); }
  catch { return {}; }
})();
const SESSION_ID = String(process.env.SHADOW_SESSION_ID || "1");
if (!/^[12]$/.test(SESSION_ID)) throw new Error("رقم الجلسة غير صالح");
const SESSION_SUFFIX = ISOLATED_SESSION ? "" : (SESSION_ID === "1" ? "" : SESSION_ID);
const SESSION_FILE = path.join(DATA_DIR, "appState" + SESSION_SUFFIX + ".json");
const DATA_FILE = path.join(DATA_DIR, "data" + SESSION_SUFFIX + ".json");
const CUSTOM_COMMANDS_FILE = path.join(DATA_DIR, "custom-commands" + SESSION_SUFFIX + ".json");
const PORT = Number(process.env.PORT || process.env.SHADOW_BOT_PORT || (SESSION_ID === "1" ? 3000 : 3002));
const sessionConfig = savedConfig.SESSIONS?.[SESSION_ID] || (ISOLATED_SESSION ? savedConfig : {});
const environmentDevIds = String(process.env.DEV_IDS || "")
  .split(",").map(value => value.trim()).filter(value => /^[0-9]{5,25}$/.test(value));

function getSessionDeveloperSettings(sourceConfig = {}) {
  const session = sourceConfig.SESSIONS?.[SESSION_ID] || (ISOLATED_SESSION ? sourceConfig : {});
  let rawIds = [];

  if (Array.isArray(session.DEV_IDS)) {
    rawIds = session.DEV_IDS;
  } else if (session.DEV_ID) {
    rawIds = [session.DEV_ID];
  } else if (SESSION_ID === "1" || ISOLATED_SESSION) {
    rawIds = [
      ...(Array.isArray(sourceConfig.DEV_IDS) ? sourceConfig.DEV_IDS : []),
      sourceConfig.DEV_ID,
      process.env.DEV_ID,
      ...environmentDevIds
    ];
  }

  const ids = [...new Set(rawIds.map(String)
    .map(value => value.trim())
    .filter(value => /^[0-9]{5,25}$/.test(value)))].slice(0, 50);

  const preferredId = String(
    session.DEV_ID ||
    ((SESSION_ID === "1" || ISOLATED_SESSION) ? sourceConfig.DEV_ID || process.env.DEV_ID || "" : "") ||
    ids[0] || ""
  ).trim();

  if (/^[0-9]{5,25}$/.test(preferredId) && !ids.includes(preferredId)) {
    ids.unshift(preferredId);
  }

  return {
    id: /^[0-9]{5,25}$/.test(preferredId) ? preferredId : (ids[0] || ""),
    ids
  };
}

function getStoredDeveloperIds(data = {}) {
  const raw = Array.isArray(data?.developers)
    ? data.developers
    : Array.isArray(data?.developers?.list)
      ? data.developers.list
      : [];
  return [...new Set(raw.map(value => String(value || "").trim())
    .filter(value => /^[0-9]{5,25}$/.test(value)))];
}

function getAllDeveloperIds(settings = {}, data = {}) {
  return [...new Set([
    ...(Array.isArray(settings.ids) ? settings.ids : []),
    ...getStoredDeveloperIds(data)
  ].map(value => String(value || "").trim())
    .filter(id => /^[0-9]{5,25}$/.test(id)))];
}

function getActiveDeveloperIds(settings = {}, data = {}) {
  const disabled = new Set(
    (Array.isArray(data?.disabledDevelopers) ? data.disabledDevelopers : [])
      .map(value => String(value || "").trim())
      .filter(value => /^[0-9]{5,25}$/.test(value))
  );
  return getAllDeveloperIds(settings, data).filter(id => !disabled.has(id));
}

const developerSettings = getSessionDeveloperSettings(savedConfig);
const DEV_ID = developerSettings.id;
const DEV_IDS = developerSettings.ids;

const config = {
  BOT_NAME: String(sessionConfig.BOT_NAME || "ALPHA"),
  BOT_NICK: String(sessionConfig.BOT_NICK || sessionConfig.BOT_NAME || "ALPHA"),
  NICK_GUARD_ENABLED: (sessionConfig.NICK_GUARD_ENABLED ?? (!ISOLATED_SESSION ? savedConfig.NICK_GUARD_ENABLED : undefined)) !== false,
  DEV_ID,
  DEV_IDS,
  DEV_CONFIGURED_IDS: [...developerSettings.ids],
  DEV_ALL_IDS: [...developerSettings.ids],
  DEV_NICK: String(sessionConfig.DEV_NICK || "KAI"),
  DEV_NICK_GUARD_ENABLED: (
    sessionConfig.DEV_NICK_GUARD_ENABLED ??
    (!ISOLATED_SESSION && SESSION_ID === "1" ? savedConfig.DEV_NICK_GUARD_ENABLED : undefined)
  ) !== false,
  DEV_NAME: String(sessionConfig.DEV_NAME || "KAI"),
  DEV_PROFILE_URL: String(sessionConfig.DEV_PROFILE_URL || "")
};


http.createServer((req, res) => res.end("ALPHA OK")).listen(PORT, "0.0.0.0");

if (!fs.existsSync(SESSION_FILE)) {
  throw new Error(`ملف جلسة Facebook غير موجود: ${SESSION_FILE} — أضف appState.json قبل تشغيل ALPHA.`);
}
const appState = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { prefix: "!", freePrefix: false, protected: {}, savedMessages: [], admins: [], locked: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const commands = {};
fs.readdirSync(path.join(ROOT, "commands")).sort().forEach(file => {
  if (!file.endsWith(".js")) return;
  const commandName = file.slice(0, -3);
  const handler = require(path.join(ROOT, "commands", file));
  commands[commandName] = handler;
  for (const alias of Array.isArray(handler.aliases) ? handler.aliases : []) {
    const aliasName = String(alias || "").trim().toLowerCase();
    if (!aliasName || Object.prototype.hasOwnProperty.call(commands, aliasName)) continue;
    Object.defineProperty(commands, aliasName, {
      value: handler,
      enumerable: false,
      configurable: true,
      writable: true
    });
  }
});

const events = {};
fs.readdirSync(path.join(ROOT, "events")).forEach(file => {
  if (file.endsWith(".js")) {
    events[file.replace(".js", "")] = require(path.join(ROOT, "events", file));
  }
});

const automicTimers = {};
const botSentMessages = {};
const startTime = Date.now();

function trackMsg(threadID, msgID) {
  if (!threadID || !msgID) return;
  if (!botSentMessages[threadID]) botSentMessages[threadID] = [];
  botSentMessages[threadID].push(msgID);
  if (botSentMessages[threadID].length > 60) botSentMessages[threadID].shift();
}

function sendMessageAsync(api, message, threadID, replyToMessageID) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(
      () => finish(new Error("انتهت مهلة إرسال الرسالة بعد 30 ثانية")),
      30000
    );

    function finish(error, info) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(info);
    }

    try {
      const result = api.sendMessage(
        message,
        String(threadID),
        replyToMessageID == null ? undefined : String(replyToMessageID)
      );
      Promise.resolve(result).then(
        info => finish(null, info),
        error => finish(error)
      );
    } catch (error) {
      finish(error);
    }
  });
}

fcaLogin({ appState }, { listenEvents: true, selfListen: false }, (err, api) => {
  if (err) {
    const loginErrorText = String(err?.message || err || "");
    if (/checkpoint|too many sessions|multiple sessions|session limit|login.?blocked|temporarily blocked|rate.?limit|http\s*429|\b429\b|\b368\b/i.test(loginErrorText)) {
      console.log("⛔ رفضت مكتبة FCA تسجيل الدخول أو طلب Facebook تحققًا/قيّد الجلسات. لم تتم أي محاولة دخول إضافية:", loginErrorText.slice(0, 240));
    } else {
      console.log("خطأ في تسجيل الدخول عبر @dongdev/fca-unofficial:", loginErrorText.slice(0, 240));
    }
    return;
  }

  const BOT_ID = api.getCurrentUserID();

  const messageActivity = createMessageActivity({
    developerIds: config.DEV_IDS,
    react: async (messageID, threadID) => {
      if (typeof api.setMessageReactionMqtt !== "function") {
        throw new Error("دالة التفاعل غير متاحة");
      }
      await api.setMessageReactionMqtt("❤️", messageID, threadID);
    }
  });


  // Adapt the new FCA method names to the legacy SHADOW command surface.
  const fcaCompat = require("./fca-compat")(api);
  console.log("[FCA COMPAT] Installed:", fcaCompat.installed.join(", ") || "native methods");

  installThreadOperationGuard(api);

  // Restore saved nickname protections for this session
  const nicknameCommand = commands["كنيات"];
  if (nicknameCommand && typeof nicknameCommand.restoreProtection === "function") {
    const savedNicknameProtections = loadData().nicknameProtections || {};
    for (const [threadID, nickname] of Object.entries(savedNicknameProtections)) {
      if (typeof nickname === "string" && nickname.trim()) {
        nicknameCommand.restoreProtection(
          api, String(threadID), nickname, loadData, automicTimers, config, BOT_ID
        );
      }
    }
  }

  // The replacement library emits explicit account/session restriction events.
  // Never attempt an extra login when Facebook requests a checkpoint or blocks login.
  if (typeof api.on === "function") {
    const restrictedEvents = ["checkpoint", "checkpoint_282", "checkpoint_956", "loginBlocked", "sessionExpired", "account_inactive"];
    for (const eventName of restrictedEvents) {
      api.on(eventName, details => {
        console.log(`[FCA SESSION] ${eventName}:`, String(details?.message || details?.reason || details || "requires account review").slice(0, 220));
        for (const [timerKey, timerValue] of Object.entries(automicTimers)) {
          if (["shadow-atomic", "shadow-engines", "shadow-angel", "alpha-aut"].includes(timerValue?.kind) && typeof timerValue.stop === "function") {
            timerValue.stop();
            delete automicTimers[timerKey];
          }
        }
      });
    }
    api.on("rateLimit", details => {
      console.log("[FCA SESSION] Rate limit reported; SHADOW request queue will apply cooldown.", String(details?.message || details || "").slice(0, 160));
    });
  }
  console.log("✅ يعمل | ID:", BOT_ID);

  const _origSend = api.sendMessage.bind(api);

  // Support legacy callbacks and Promise-returning FCA calls.
  api.sendMessage = (msg, threadID, third, fourth) => {
    const legacyCallback = typeof third === "function" ? third : null;
    const callback = legacyCallback ||
      (typeof fourth === "function" ? fourth : null);

    const rawReplyID = legacyCallback ? fourth : third;
    const replyID = rawReplyID == null ? undefined : String(rawReplyID);

    let result;
    try {
      result = _origSend(msg, String(threadID), replyID);
    } catch (error) {
      if (callback) {
        callback(error);
        return;
      }
      throw error;
    }

    return Promise.resolve(result).then(info => {
      if (info?.messageID) trackMsg(String(threadID), info.messageID);
      if (callback) callback(null, info);
      return info;
    }, error => {
      if (callback) {
        callback(error);
        return undefined;
      }
      throw error;
    });
  };

  const hostingInfo = { platform: os.platform(), arch: os.arch(), node: process.version };

  async function setNicknameCompat(nickname, threadID, userID) {
    const method = [api.nickname, api.changeNickname, api.setNickname]
      .find(fn => typeof fn === "function");
    if (!method) throw new Error("دالة تغيير الكنية غير متاحة في FCA");
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout = null;
      const done = error => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      timeout = setTimeout(() => done(new Error("انتهت مهلة تغيير الكنية بعد 30 ثانية")), 30000);
      try {
        const result = method.call(api, nickname, String(threadID), String(userID), done);
        if (result && typeof result.then === "function") result.then(() => done(), done);
        else if (method.length < 4) done();
      } catch (error) {
        done(error);
      }
    });
  }

  // ===== SHADOW BOT NICKNAME GUARD =====
  let nicknameCheckRunning = false;

  let discoverGroupsRunning = false;
  async function discoverBotGroups() {
    if (discoverGroupsRunning) return false;
    discoverGroupsRunning = true;
    try {
      const data = loadData();
      data.botGroups = Array.isArray(data.botGroups) ? data.botGroups : [];
      const known = new Map(data.botGroups.map(g => [String(g.id), g]));
      let cursor = null;

      for (let page = 0; page < 25; page++) {
        const list = await getThreadListSafe(api, 100, cursor, ["INBOX", "ARCHIVED"]);
        if (!Array.isArray(list) || !list.length) break;

        for (const thread of list) {
          if (!thread || !thread.isGroup || !thread.threadID) continue;
          const id = String(thread.threadID);
          known.set(id, { id, name: thread.threadName || id });
        }

        if (list.length < 100) break;
        const next = Number(list[list.length - 1].timestamp);
        if (!Number.isSafeInteger(next) || next <= 0 || next === cursor) break;
        cursor = next;
      }

      data.botGroups = [...known.values()];
      data.groupsUpdatedAt = new Date().toISOString();
      saveData(data);
      console.log("تم تحديث قروبات البوت:", data.botGroups.length);
      return true;
    } catch (e) {
      console.log("تعذر اكتشاف القروبات:", e.message);
      return false;
    } finally {
      discoverGroupsRunning = false;
    }
  }

  async function checkBotNicknames() {
    if (nicknameCheckRunning) return;
    nicknameCheckRunning = true;

    try {
      let latest = {};
      try {
        latest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "config.json"), "utf8"));
      } catch {}

      const latestSession = latest.SESSIONS?.[SESSION_ID] || (ISOLATED_SESSION ? latest : {});
      const legacyConfig = !ISOLATED_SESSION && SESSION_ID === "1" ? latest : {};

      // Each isolated session owns its own bot and developer identity.
      config.BOT_NAME = String(latestSession.BOT_NAME || "ALPHA");
      config.BOT_NICK = String(latestSession.BOT_NICK || latestSession.BOT_NAME || "ALPHA");
      config.DEV_NAME = String(latestSession.DEV_NAME || "KAI");
      config.DEV_NICK = String(latestSession.DEV_NICK || "KAI");
      config.DEV_PROFILE_URL = String(latestSession.DEV_PROFILE_URL || "");
      config.NICK_GUARD_ENABLED = (latestSession.NICK_GUARD_ENABLED ?? latest.NICK_GUARD_ENABLED) !== false;
      config.DEV_NICK_GUARD_ENABLED = (
        latestSession.DEV_NICK_GUARD_ENABLED ??
        legacyConfig.DEV_NICK_GUARD_ENABLED
      ) !== false;

      const developerSettings = getSessionDeveloperSettings(latest);
      const currentData = loadData() || {};
      config.DEV_CONFIGURED_IDS = [...developerSettings.ids];
      config.DEV_ALL_IDS = getAllDeveloperIds(developerSettings, currentData);
      config.DEV_IDS = getActiveDeveloperIds(developerSettings, currentData);
      config.DEV_ID = config.DEV_IDS.includes(developerSettings.id)
        ? developerSettings.id
        : (config.DEV_IDS[0] || "");
      messageActivity.setDeveloperIds(config.DEV_IDS);

      const targets = [
        ...(config.NICK_GUARD_ENABLED
          ? [{ id: String(BOT_ID), nickname: config.BOT_NICK, label: "البوت" }]
          : []),
        ...(config.DEV_NICK_GUARD_ENABLED
          ? config.DEV_IDS
              .filter(id => id !== String(BOT_ID))
              .map(id => ({ id, nickname: config.DEV_NICK, label: "المطور" }))
          : [])
      ].filter(target => target.nickname && target.nickname.trim());

      if (!targets.length) return;

      const data = currentData;
      const ids = [...new Set([
        ...(Array.isArray(data.botGroups)
          ? data.botGroups.map(g => g && g.id)
          : []),
        ...Object.keys(data.protected || {}),
        ...Object.keys(data.nicknameProtections || {})
      ].map(id => String(id || "")).filter(Boolean))];

      for (let i = 0; i < ids.length; i += 20) {
        const batch = ids.slice(i, i + 20);
        let infos;

        try {
          infos = await getThreadInfoSafe(api, batch);
        } catch (e) {
          console.log("تعذر فحص القروبات:", e.message);
          if (isCoolingDown(api)) break;
          continue;
        }

        for (const id of batch) {
          const info = infos && infos[id];
          if (!info) continue;

          const nicknames = info.nicknames || info.customNicknames || {};

          const groupNickname = loadData().nicknameProtections?.[id];
          for (const target of targets) {
            // A group-wide nickname command takes precedence over the developer's
            // normal nickname guard in that one group; it resumes after !كنيات off.
            if (target.label === "المطور" && typeof groupNickname === "string" && groupNickname.trim()) {
              continue;
            }

            const current = nicknames[target.id] || "";

            if (current !== target.nickname) {
              try {
                await setNicknameCompat(target.nickname, id, target.id);
                console.log("تم استرجاع كنية " + target.label + " في:", id);
                await new Promise(resolve => setTimeout(resolve, 250));
              } catch (e) {
                console.log("تعذر استرجاع كنية " + target.label + ":", e.message);
              }
            }
          }
        }
      }
    } finally {
      nicknameCheckRunning = false;
    }
  }

  // ===== SHADOW GROUP NAME GUARD =====
  let groupNameCheckRunning = false;
  const groupNameLastAttempt = new Map();

  async function checkSavedGroupNames() {
    if (groupNameCheckRunning) return;
    groupNameCheckRunning = true;

    try {
      const data = loadData();
      const saved = data.savedGroupNames || {};
      const ids = Object.keys(saved).filter(id =>
        typeof saved[id] === "string" && saved[id].trim()
      );

      for (let i = 0; i < ids.length; i += 20) {
        const batch = ids.slice(i, i + 20);
        let infos;

        try {
          infos = await getThreadInfoSafe(api, batch);
        } catch (e) {
          if (isCoolingDown(api)) {
            console.log("[GROUP NAME GUARD] Cooldown active; remaining batches skipped.");
            break;
          }
          continue;
        }

        for (const id of batch) {
          const latest = loadData().savedGroupNames || {};
          const wanted = latest[id];

          if (typeof wanted !== "string" || !wanted.trim()) continue;

          const info = infos && infos[id];
          if (!info) continue;

          const current = info.threadName || info.name || "";
          if (current === wanted) continue;

          const now = Date.now();
          const last = groupNameLastAttempt.get(id) || 0;

          if (now - last < 30000) continue;

          groupNameLastAttempt.set(id, now);

          try {
            await api.gcname(wanted, id);
          } catch {
            // استرجاع صامت؛ ستتم المحاولة مجددًا بعد المهلة.
          }
        }
      }
    } catch (e) {
      console.log("خطأ في مراقبة أسماء المجموعات:", e.message);
    } finally {
      groupNameCheckRunning = false;
    }
  }

  discoverBotGroups().then(checkBotNicknames);
  setInterval(checkBotNicknames, 7000);
  checkSavedGroupNames();
  setInterval(checkSavedGroupNames, 30000);

  // تحديث قائمة القروبات دورياً لاكتشاف القروبات الجديدة
  setInterval(discoverBotGroups, 300000);

  let sessionErrorLogged = false;
  // Group-name and member-nickname protection events require listenEvents.
  try {
    if (typeof api.setOptions === "function") api.setOptions({ listenEvents: true });
  } catch (eventOptionsError) {
    console.log("تعذر تفعيل أحداث المجموعة:", eventOptionsError?.message || eventOptionsError);
  }
  api.listenMqtt(async (err, event) => {
    if (err) {
      const errorText = String(err?.message || err || "");
      console.log("SHADOW MQTT ERROR:", errorText);
      if (/checkpoint|logged.?out|login required|invalid app.?state|session.{0,20}(expired|invalid)|authentication|not authenticated|too many sessions|multiple sessions|session limit|rate.?limit|temporarily blocked|http\s*429|\b429\b|\b368\b|\b1545012\b/i.test(errorText)) {
        for (const [timerKey, timerValue] of Object.entries(automicTimers)) {
          if (["shadow-atomic", "shadow-engines", "shadow-angel", "alpha-aut"].includes(timerValue?.kind) && typeof timerValue.stop === "function") {
            timerValue.stop();
            delete automicTimers[timerKey];
          }
        }
        if (!sessionErrorLogged) {
          sessionErrorLogged = true;
          console.log("⚠️ يبدو أن جلسة الحساب انتهت أو رُفضت. لن أبدأ تسجيل دخول جديدًا تلقائيًا؛ افحص جلسة الحساب من تطبيق Facebook الرسمي قبل أي محاولة أخرى.");
        }
        const restrictionDetected = /checkpoint|too many sessions|multiple sessions|session limit|rate.?limit|temporarily blocked|http\s*429|\b429\b|\b368\b|\b1545012\b/i.test(errorText);
        if (restrictionDetected) {
          console.log("⛔ تم إيقاف إعادة تسجيل الدخول التلقائية احترامًا لتقييد الحساب. افحص حالة الحساب من تطبيق Facebook الرسمي قبل أي محاولة جديدة.");
          return;
        }
      }
      return;
    }
    if (!event) return;

    if (["account_inactive", "stop_listen"].includes(String(event.type || ""))) {
      console.log("[FCA SESSION] Listener stopped or account inactive:", String(event.reason || event.error?.message || event.error || event.type).slice(0, 220));
      for (const [timerKey, timerValue] of Object.entries(automicTimers)) {
        if (["shadow-atomic", "shadow-engines", "shadow-angel", "alpha-aut"].includes(timerValue?.kind) && typeof timerValue.stop === "function") {
          timerValue.stop();
          delete automicTimers[timerKey];
        }
      }
      return;
    }

    sessionErrorLogged = false;

    try { stats.recordMessage(event); }
    catch (e) { console.log("خطأ في تسجيل الإحصائيات:", e.message); }

    // Load the standalone developer list before protections and command authorization.
    const currentData = loadData() || {};
    const startupDeveloperSettings = getSessionDeveloperSettings(savedConfig);
    config.DEV_CONFIGURED_IDS = [...startupDeveloperSettings.ids];
    config.DEV_ALL_IDS = getAllDeveloperIds(startupDeveloperSettings, currentData);
    config.DEV_IDS = getActiveDeveloperIds(startupDeveloperSettings, currentData);
    config.DEV_ID = config.DEV_IDS.includes(startupDeveloperSettings.id)
      ? startupDeveloperSettings.id
      : (config.DEV_IDS[0] || "");
    messageActivity.setDeveloperIds(config.DEV_IDS);

    // إيقاف جميع أحداث القروبات المكتومة قبل تشغيل أي معالج
    const eventThreadID = String(event.threadID || "");
    if (eventThreadID && currentData.mutedGroups?.[eventThreadID] === true) return;

    // لا تشغّل أحداث الترحيب/الدخول عندما يكون البوت نفسه هو العضو المضاف.
    // بقية أحداث المجموعة والأعضاء تستمر بشكل طبيعي.
    const addedParticipants = event.logMessageData?.addedParticipants;
    const botWasAdded = event.logMessageType === "log:subscribe" &&
      Array.isArray(addedParticipants) &&
      addedParticipants.some(person => String(
        person?.userFbId ?? person?.userID ?? person?.id ?? ""
      ) === String(BOT_ID));

    if (botWasAdded) {
      // شغّل معالج join فقط لتسجيل المجموعة وضبط الكنيات، بلا رسائل ترحيب.
      try {
        if (typeof events.join === "function") {
          events.join(api, event, config, loadData, saveData, automicTimers, BOT_ID, startTime);
        }
      } catch (eventError) {
        console.log("SHADOW JOIN HANDLER ERROR:", eventError?.message || eventError);
      }
    } else {
      for (const e in events) {
        try {
          events[e](api, event, config, loadData, saveData, automicTimers, BOT_ID, startTime);
        } catch (eventError) {
          console.log(
            `SHADOW EVENT HANDLER ERROR [${e}]:`,
            eventError?.message || eventError
          );
        }
      }
    }

    if (["message", "message_reply"].includes(event.type)) {
      try {
        await messageActivity.record(event, (threadID, messageEvent) => {
          const sender = String(messageEvent.senderID || "");
          if (!sender || sender === String(BOT_ID)) return false;
          if (messageEvent.isGroup === false) return false;
          return threadID !== sender;
        });
      } catch (activityError) {
        console.log("خطأ في عداد رسائل المجموعة:", activityError?.message || activityError);
      }
    }

    if (event.body && ["message", "message_reply"].includes(event.type)) {
      try {
        autoDownload(api, event, BOT_ID);
      } catch (downloadError) {
        console.log("ALPHA AUTO DOWNLOAD ERROR:", downloadError?.message || downloadError);
      }
    }

    if (!event.body || !["message", "message_reply"].includes(event.type)) return;

    const data = loadData() || {};
    const PREFIX = data.prefix || "!";
    const body = String(event.body).trim();
    const senderID = String(event.senderID || "");

    // Developer-only special messages
    const developerIdsForReactions = new Set(
      [...(Array.isArray(config.DEV_IDS) ? config.DEV_IDS : []), config.DEV_ID]
        .filter(Boolean)
        .map(String)
    );

    if (developerIdsForReactions.has(senderID)) {
      if (body === "._.") {
        try {
          await sendMessageAsync(
            api,
            "يا مطوري العظيم، أنت أكثر ما أحب ❤️",
            event.threadID
          );
        } catch (e) {
          console.log("تعذر إرسال رسالة المطور:", e.message);
        }
        return;
      }

      if (body === "مح") {
        try {
          if (!event.messageID) {
            console.log("تعذر التفاعل: معرّف الرسالة غير موجود.");
            return;
          }

          if (typeof api.setMessageReactionMqtt !== "function") {
            console.log("دالة التفاعل غير متاحة في API.");
            return;
          }

          await api.setMessageReactionMqtt(
            "❤️",
            String(event.messageID),
            String(event.threadID)
          );
        } catch (e) {
          console.log("تعذر وضع تفاعل المطور:", e.message);
        }
        return;
      }
    }

    let cmd = null, args = [];

    if (body.startsWith(PREFIX)) {
      args = body.slice(PREFIX.length).trim().split(/\s+/);
      cmd = args[0].toLowerCase();
    } else if (data.freePrefix) {
      args = body.trim().split(/\s+/);
      cmd = args[0].toLowerCase();
    }

    const rawCommandLine = body.startsWith(PREFIX)
      ? body.slice(PREFIX.length)
      : body;
    const rawCommandMatch = rawCommandLine.match(/^\s*\S+(?:\s+([\s\S]*))?$/);
    args.rawText = rawCommandMatch ? (rawCommandMatch[1] || "") : "";

    if (!cmd) return;

    let customCommands = {};
    try {
      customCommands = JSON.parse(fs.readFileSync(CUSTOM_COMMANDS_FILE, "utf8"));
      if (!customCommands || typeof customCommands !== "object" || Array.isArray(customCommands)) {
        customCommands = {};
      }
    } catch {}

    const customCommand = customCommands[cmd];
    const hasCustomCommand = !commands[cmd] &&
      customCommand &&
      customCommand.enabled === true &&
      (typeof customCommand.code === "string" ||
       typeof customCommand.reply === "string");

    if (!commands[cmd] && !hasCustomCommand) return;

    stats.recordCommand(cmd, senderID, event.threadID);
    let liveConfig = {};
    try {
      liveConfig = JSON.parse(
        fs.readFileSync(path.join(DATA_DIR, "config.json"), "utf8")
      );
    } catch {
      liveConfig = config;
    }

    const liveDeveloperSettings = getSessionDeveloperSettings(liveConfig);
    const allDeveloperIds = getAllDeveloperIds(liveDeveloperSettings, data);
    const developerIds = getActiveDeveloperIds(liveDeveloperSettings, data);
    config.DEV_CONFIGURED_IDS = [...liveDeveloperSettings.ids];
    config.DEV_ALL_IDS = allDeveloperIds;
    config.DEV_IDS = developerIds;
    config.DEV_ID = developerIds.includes(liveDeveloperSettings.id)
      ? liveDeveloperSettings.id
      : (developerIds[0] || "");
    messageActivity.setDeveloperIds(developerIds);
    const isDeveloper = developerIds.includes(senderID);

    const publicMode = data.publicMode === true;

    if (!canExecuteCommand({ cmd, isDeveloper, publicMode })) {
      stats.recordUnauthorized(cmd);
      return;
    }

    try {
      if (typeof api.sendTypingIndicator === "function") {
        await api.sendTypingIndicator(String(event.threadID), true, {
          duration: 3000,
          autoStop: true
        });
      } else {
        console.log("مؤشر الكتابة غير متاح في API.");
      }
    } catch (typingError) {
      console.log("تعذر إظهار مؤشر الكتابة:", typingError?.message || typingError);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    if (hasCustomCommand) {
      try {
        if (typeof customCommand.code === "string" && customCommand.code.trim()) {
          const customFn = new Function("return (" + customCommand.code + ")")();

          if (typeof customFn !== "function") {
            throw new Error("كود الأمر يجب أن يكون دالة JavaScript");
          }

          const result = customFn(
            api, event, args, startTime,
            loadData, saveData, automicTimers,
            config, hostingInfo, botSentMessages, BOT_ID
          );

          if (result?.catch) {
            result.catch(e => {
              stats.recordCommandError(cmd);
              console.log("خطأ في الأمر المخصص:", e.message);
            });
          }
        } else if (typeof customCommand.reply === "string") {
          api.sendMessage(customCommand.reply, event.threadID);
        }
      } catch (e) {
        stats.recordCommandError(cmd);
        console.log("خطأ في الأمر المخصص:", e.message);
      }
      return;
    }

    try {
      const result = commands[cmd](
        api, event, args, startTime,
        loadData, saveData, automicTimers,
        config, hostingInfo, botSentMessages, BOT_ID,
        Object.keys(commands),
        Object.keys(customCommands).filter(name => {
          const c = customCommands[name];
          return !commands[name] && c && c.enabled === true &&
            (typeof c.code === "string" || typeof c.reply === "string");
        }),
        commands,
        { isDeveloper }
      );
      if (result?.catch) result.catch(e => {
        stats.recordCommandError(cmd);
        console.log("خطأ:", e.message);
      });
    } catch (e) {
      stats.recordCommandError(cmd);
      console.log("خطأ:", e.message);
    }
  });
});
