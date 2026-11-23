"use strict";

const {
  acquireRepeatLock,
  releaseRepeatLock
} = require("../SHADOW/repeat-coordinator");

const ACTIVE_PREFIX = "__shadow_angel__:";
const MIN_INTERVAL_MS = 5 * 1000;
const MAX_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const IDLE_LIMIT_MS = 16 * 60 * 1000;
const WATCH_INTERVAL_MS = 3 * 60 * 1000;
const HISTORY_TIMEOUT_MS = 12 * 1000;
const UNIT_MS = Object.freeze({
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000
});
const INTERVAL_RE = /^(\d+(?:\.\d+)?)([smhd])(?:-(\d+(?:\.\d+)?)([smhd]))?$/i;

// Active jobs are scoped to this ALPHA process. The shared repeat lock prevents
// Angel from overlapping with بيس or محرك in the same conversation.
const active = new Map();

function stateKey(threadID) {
  return ACTIVE_PREFIX + String(threadID);
}

function parseInterval(value) {
  const match = INTERVAL_RE.exec(String(value || "").trim());
  if (!match) return null;

  const first = Number(match[1]) * UNIT_MS[match[2].toLowerCase()];
  const second = match[3]
    ? Number(match[3]) * UNIT_MS[match[4].toLowerCase()]
    : first;

  if (!Number.isFinite(first) || !Number.isFinite(second) || first <= 0 || second <= 0) {
    return null;
  }

  const min = Math.min(Math.round(first), Math.round(second));
  const max = Math.max(Math.round(first), Math.round(second));
  if (min < MIN_INTERVAL_MS || max > MAX_INTERVAL_MS) return null;
  return { min, max };
}

function formatInterval(milliseconds) {
  for (const [unit, factor] of [["d", UNIT_MS.d], ["h", UNIT_MS.h], ["m", UNIT_MS.m], ["s", UNIT_MS.s]]) {
    if (milliseconds % factor === 0) return `${milliseconds / factor}${unit}`;
  }
  return `${milliseconds}ms`;
}

function stopThread(threadID, automicTimers = {}) {
  const id = String(threadID);
  const job = active.get(id);
  if (!job) return false;
  job.stop();
  if (automicTimers[stateKey(id)] === job) delete automicTimers[stateKey(id)];
  return true;
}

function stopAll(automicTimers = {}) {
  const ids = [...active.keys()];
  for (const id of ids) stopThread(id, automicTimers);
  return ids.length;
}

function rememberBotMessage(botSentMessages, threadID, info) {
  const messageID = info && info.messageID;
  if (!messageID || !botSentMessages || typeof botSentMessages !== "object") return;
  if (!Array.isArray(botSentMessages[threadID])) botSentMessages[threadID] = [];
  if (!botSentMessages[threadID].includes(String(messageID))) {
    botSentMessages[threadID].push(String(messageID));
  }
  if (botSentMessages[threadID].length > 60) botSentMessages[threadID].shift();
}

function sendMessage(api, text, threadID, replyToMessageID, botSentMessages) {
  // Use the same callback/Promise-compatible send flow as commands/بيس.js.
  // FCA expects the callback as argument 3 and an optional reply ID as argument 4.
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("انتهت مهلة الإرسال بعد 30 ثانية")), 30000);
    if (typeof timeout.unref === "function") timeout.unref();

    function finish(error, info) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) return reject(error);
      rememberBotMessage(botSentMessages, String(threadID), info);
      resolve(info || null);
    }

    try {
      const callback = (error, info) => finish(error, info);
      const result = api.sendMessage(
        String(text),
        String(threadID),
        callback,
        replyToMessageID == null ? undefined : String(replyToMessageID)
      );

      if (result && typeof result.then === "function") {
        result.then(info => finish(null, info), error => finish(error));
      } else if (api.sendMessage.length < 3) {
        finish(null, result);
      }
    } catch (error) {
      finish(error);
    }
  });
}

function timestampToMs(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

async function readRecentHistory(api, threadID) {
  if (typeof api.getThreadHistory !== "function") return null;

  return new Promise(resolve => {
    let settled = false;
    const finish = history => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(Array.isArray(history) ? history : null);
    };
    const timeout = setTimeout(() => finish(null), HISTORY_TIMEOUT_MS);
    if (typeof timeout.unref === "function") timeout.unref();

    try {
      const result = api.getThreadHistory(threadID, 15, null, (error, history) => {
        finish(error ? null : history);
      });
      if (result && typeof result.then === "function") {
        result.then(value => finish(value), () => finish(null));
      } else if (api.getThreadHistory.length < 4) {
        finish(result);
      }
    } catch {
      finish(null);
    }
  });
}

function scheduleNext(job) {
  if (job.stopped) return;
  const range = job.intervals[job.count % job.intervals.length];
  job.count += 1;
  const delay = range.min + Math.random() * (range.max - range.min);
  job.timer = setTimeout(() => runTick(job), delay);
  if (typeof job.timer.unref === "function") job.timer.unref();
}

async function runTick(job) {
  if (job.stopped || job.sending) return;
  job.sending = true;
  try {
    await sendMessage(job.api, job.text, job.threadID, undefined, job.botSentMessages);
  } catch (error) {
    console.error("ALPHA ANGEL SEND ERROR:", error?.message || error);
  } finally {
    job.sending = false;
    scheduleNext(job);
  }
}

async function checkIdle(job) {
  if (job.stopped || job.checkingIdle) return;
  job.checkingIdle = true;
  try {
    const history = await readRecentHistory(job.api, job.threadID);
    if (!history || job.stopped) return;

    const botIds = new Set(
      Array.isArray(job.botSentMessages?.[job.threadID])
        ? job.botSentMessages[job.threadID].map(String)
        : []
    );

    for (const message of history) {
      const senderID = String(message?.senderID || "");
      const messageID = String(message?.messageID || "");
      if (!senderID || senderID === job.botID || botIds.has(messageID)) continue;
      const sentAt = timestampToMs(message.timestamp);
      if (sentAt > job.lastHumanAt) job.lastHumanAt = sentAt;
    }

    if (Date.now() - job.lastHumanAt >= IDLE_LIMIT_MS) {
      const threadID = job.threadID;
      job.stop();
      await sendMessage(job.api,
        "🛑 تم إيقاف Angel تلقائياً: لا يوجد تفاعل بشري منذ 16 دقيقة.",
        threadID, undefined, job.botSentMessages).catch(() => {});
    }
  } finally {
    job.checkingIdle = false;
  }
}

module.exports = async function angelCommand(
  api,
  event,
  args,
  _startTime,
  loadData,
  _saveData,
  automicTimers = {},
  config = {},
  _hostingInfo,
  botSentMessages,
  BOT_ID,
  _builtInCommandNames,
  _customCommandNames,
  _commands,
  access = {}
) {
  const threadID = String(event?.threadID || "");
  const senderID = String(event?.senderID || "");
  if (!threadID) return;

  let data = {};
  try {
    data = typeof loadData === "function" ? (await loadData()) || {} : {};
  } catch {}

  const storedDevs = Array.isArray(data.developers)
    ? data.developers
    : Array.isArray(data.developers?.list) ? data.developers.list : [];
  const configDevs = [
    ...(Array.isArray(config.DEV_IDS) ? config.DEV_IDS : []),
    config.DEV_ID,
    ...(Array.isArray(config.developers) ? config.developers : []),
    config.owner
  ].map(value => String(value || "").trim()).filter(Boolean);
  const isDeveloper = access.isDeveloper === true ||
    storedDevs.map(String).includes(senderID) || configDevs.includes(senderID);
  const ownerID = String(config.DEV_ID || config.DEV_IDS?.[0] || "").trim();

  const reply = message => sendMessage(api, message, threadID, event?.messageID, botSentMessages);
  if (!isDeveloper) return reply("⛔ أمر Angel للمطورين فقط.");

  const action = String(args?.[1] || "").trim().toLowerCase();
  if (["off", "stop", "إيقاف", "ايقاف", "وقف"].includes(action)) {
    const all = String(args?.[2] || "").trim().toLowerCase() === "all";
    if (all) {
      if (!ownerID || senderID !== ownerID) {
        return reply("🔒 إيقاف جميع مهام Angel متاح للمالك الأساسي فقط.");
      }
      const count = stopAll(automicTimers);
      return reply(`🛑 تم إيقاف ${count} مهمة Angel نشطة في عملية ALPHA الحالية.`);
    }
    return reply(stopThread(threadID, automicTimers)
      ? "🛑 تم إيقاف Angel في هذه المحادثة."
      : "ℹ️ لا توجد مهمة Angel نشطة هنا.");
  }

  const rawText = typeof args?.rawText === "string"
    ? args.rawText
    : (Array.isArray(args) ? args.slice(1).join(" ") : "");
  let remaining = String(rawText || "").trim();
  const intervals = [];

  while (remaining) {
    const match = remaining.match(/(?:^|\s+)(\d+(?:\.\d+)?[smhd](?:-\d+(?:\.\d+)?[smhd])?)\s*$/i);
    if (!match) break;
    const parsed = parseInterval(match[1]);
    if (!parsed) {
      return reply("⚠️ الفاصل غير صالح. الحد الأدنى 5 ثوانٍ والحد الأقصى 7 أيام. الوحدات: s ثوانٍ، m دقائق، h ساعات، d أيام.");
    }
    intervals.unshift(parsed);
    remaining = remaining.slice(0, match.index).trimEnd();
  }

  let text = remaining.trim();
  if (!text && event?.messageReply?.body) text = String(event.messageReply.body).trim();
  if (!text) {
    return reply("⚠️ اكتب النص أولاً. مثال: ag أهلاً بالجميع 60s");
  }
  if (!intervals.length) {
    return reply("⚠️ حدد الفاصل في نهاية الأمر. مثال: ag أهلاً بالجميع 60s");
  }

  // Replace this thread's Angel task, but do not overlap with بيس or محرك.
  stopThread(threadID, automicTimers);
  let reservation;
  try {
    reservation = acquireRepeatLock(threadID, "angel");
  } catch (error) {
    return reply(`❌ تعذر حجز مؤقت Angel: ${String(error?.message || error).slice(0, 180)}`);
  }
  if (!reservation.acquired) {
    const currentKind = String(reservation.current?.kind || "نظام تكرار آخر");
    return reply(`⚠️ يوجد ${currentKind} يعمل في هذه المحادثة. أوقفه أولاً قبل تشغيل Angel.`);
  }

  const job = {
    kind: "shadow-angel",
    threadID,
    api,
    text,
    intervals,
    botID: String(BOT_ID || ""),
    botSentMessages,
    lock: reservation.lock,
    timer: null,
    watch: null,
    count: 0,
    stopped: false,
    sending: false,
    checkingIdle: false,
    lastHumanAt: Date.now(),
    stop() {
      if (this.stopped) return;
      this.stopped = true;
      if (this.timer) clearTimeout(this.timer);
      if (this.watch) clearInterval(this.watch);
      this.timer = null;
      this.watch = null;
      releaseRepeatLock(this.threadID, this.lock);
      if (active.get(this.threadID) === this) active.delete(this.threadID);
      if (automicTimers[stateKey(this.threadID)] === this) delete automicTimers[stateKey(this.threadID)];
    }
  };

  active.set(threadID, job);
  automicTimers[stateKey(threadID)] = job;

  try {
    // Match بيس: send the requested text immediately, without a separate
    // "started" message, then schedule the next send after the selected interval.
    await sendMessage(api, job.text, threadID, undefined, botSentMessages);
    if (job.stopped) return;

    const hasWatchdog = typeof api.getThreadHistory === "function";
    if (hasWatchdog) {
      job.watch = setInterval(() => {
        checkIdle(job).catch(error => console.error("ALPHA ANGEL IDLE CHECK ERROR:", error?.message || error));
      }, WATCH_INTERVAL_MS);
      if (typeof job.watch.unref === "function") job.watch.unref();
    }
    scheduleNext(job);
  } catch (error) {
    job.stop();
    console.error("ALPHA ANGEL START ERROR:", error?.message || error);
    return reply(`❌ فشل إرسال رسالة Angel الأولى.\nالسبب: ${String(error?.message || error).slice(0, 220)}`);
  }
};

module.exports.aliases = ["ag"];
module.exports.parseInterval = parseInterval;
module.exports.formatInterval = formatInterval;
module.exports.stopThread = stopThread;
module.exports.stopAll = stopAll;
module.exports.stateKey = stateKey;
module.exports.constants = {
  MIN_INTERVAL_MS,
  MAX_INTERVAL_MS,
  IDLE_LIMIT_MS,
  WATCH_INTERVAL_MS,
  UNIT_MS
};
