"use strict";

const os = require("os");

function getHosting() {
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) return "Railway";
  if (process.env.RENDER) return "Render";
  if (process.env.DYNO) return "Heroku";
  if (process.env.VERCEL) return "Vercel";
  if (process.env.TERMUX_VERSION || process.env.PREFIX?.includes("com.termux")) return "Termux";
  return process.env.HOSTING || "ALPHA Server";
}

function getPrefix(config = {}) {
  return String(
    config.PREFIX ||
    config.prefix ||
    config.COMMAND_PREFIX ||
    "!"
  );
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
  hostingInfo,
  botSentMessages,
  BOT_ID,
  builtInCommands,
  customCommandNames
) => {
  try {
    const elapsed = Number(startTime) > 0
      ? Math.max(0, Date.now() - Number(startTime))
      : process.uptime() * 1000;

    let seconds = Math.floor(elapsed / 1000);
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;

    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;

    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    const hosting = hostingInfo
      ? String(hostingInfo)
      : getHosting();

    const prefix = getPrefix(config);

    const message = [
      "⏳ UPTIME・وقت التشغيل",
      "",
      `📅 Days・الأيام: ${days}`,
      `🕒 Hours・الساعات: ${hours}`,
      `⏱️ Minutes・الدقائق: ${minutes}`,
      `⌛ Seconds・الثواني: ${seconds}`,
      "",
      "⚡ Status・الحالة: Online",
      `🔰 Prefix・البادئة: ${prefix}`,
      `🖥️ Hosting・الاستضافة: ${hosting}`,
      "🌐 Connection・الاتصال: Stable",
      "",
      "⌁ Powered by ALPHA SYSTEM"
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
module.exports.aliases = ["ابتايم", "up"];
