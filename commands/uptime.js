"use strict";

const os = require("os");
const fs = require("fs");

function getHosting() {
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) return "Railway";
  if (process.env.RENDER) return "Render";
  if (process.env.DYNO) return "Heroku";
  if (process.env.VERCEL) return "Vercel";
  if (process.env.TERMUX_VERSION || process.env.PREFIX?.includes("com.termux")) return "Termux";
  return process.env.HOSTING || "ALPHA Server";
}

function getPrefix(config = {}) {
  return String(config.PREFIX || config.prefix || config.COMMAND_PREFIX || "!");
}

function formatDuration(value) {
  let seconds = Math.max(0, Math.floor(Number(value) || 0));
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return `${days} يوم | ${hours} ساعة | ${minutes} دقيقة | ${seconds} ثانية`;
}

function mb(value) {
  return (value / 1024 / 1024).toFixed(1);
}

async function getDiskInfo() {
  try {
    const stats = await fs.promises.statfs("/");
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return `${mb(total - free)} / ${mb(total)} MB`;
  } catch (_) {
    return "غير متاح";
  }
}

async function getProcessCount() {
  try {
    const entries = await fs.promises.readdir("/proc");
    return entries.filter(entry => /^\d+$/.test(entry)).length;
  } catch (_) {
    return "غير متاح";
  }
}

const command = async (
  api,
  event,
  args,
  startTime,
  loadData,
  saveData,
  automicTimers,
  config = {},
  hostingInfo
) => {
  try {
    const uptimeSeconds = Number(startTime) > 0
      ? Math.max(0, (Date.now() - Number(startTime)) / 1000)
      : process.uptime();

    const hosting = hostingInfo ? String(hostingInfo) : getHosting();
    const prefix = getPrefix(config);
    const memory = process.memoryUsage();
    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    const usedRam = totalRam - freeRam;
    const load = os.loadavg();
    const disk = await getDiskInfo();
    const processes = await getProcessCount();

    const message = [
      "╭━━━━━━ ⌁ ALPHA ⌁ ━━━━━━╮",
      "       NEBULA SYSTEM",
      "╰━━━━━━━━━━━━━━━━━━━━╯",
      "",
      "◈ الحالة       : يعمل بنجاح",
      `◈ الاستضافة   : ${hosting}`,
      `◈ البادئة      : ${prefix}`,
      `◈ مدة البوت    : ${formatDuration(uptimeSeconds)}`,
      "",
      "╭──── ⌁ SYSTEM METRICS ⌁ ────╮",
      `◈ حمل المعالج  : ${load.map(v => v.toFixed(2)).join(" | ")}`,
      `◈ الذاكرة      : ${mb(usedRam)} / ${mb(totalRam)} MB`,
      `◈ ذاكرة البوت  : ${mb(memory.rss)} MB`,
      `◈ مساحة القرص  : ${disk}`,
      `◈ عمليات النظام: ${processes}`,
      `◈ تشغيل النظام : ${formatDuration(os.uptime())}`,
      "",
      `◈ المعالج      : ${os.cpus().length} نواة`,
      `◈ النظام       : ${os.platform()} ${os.arch()}`,
      `◈ Node.js      : ${process.version}`,
      "╰━━━━━━━━━━━━━━━━━━━━╯",
      "",
      "       ⌁ ALPHA NEBULA ⌁"
    ].join("\n");

    return api.sendMessage(message, event.threadID);
  } catch (error) {
    console.error("[ALPHA UPTIME ERROR]", error);
    return api.sendMessage(
      "❌ تعذر عرض معلومات وقت التشغيل.",
      event.threadID
    );
  }
};

command.aliases = ["ابتايم", "up"];
module.exports = command;
