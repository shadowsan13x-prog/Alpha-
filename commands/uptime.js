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

function getCommandNames(value) {
  if (!value) return [];

  let items = [];
  if (value instanceof Map) items = [...value.keys()];
  else if (value instanceof Set) items = [...value];
  else if (Array.isArray(value)) items = value;
  else if (typeof value === "object") items = Object.keys(value);

  return items
    .map(item => typeof item === "string"
      ? item
      : item?.name || item?.command || "")
    .map(name => String(name).trim())
    .filter(Boolean);
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
    let remaining = Math.floor(
      (Number(startTime) > 0
        ? Math.max(0, Date.now() - Number(startTime))
        : process.uptime() * 1000) / 1000
    );

    const days = Math.floor(remaining / 86400);
    remaining %= 86400;

    const hours = Math.floor(remaining / 3600);
    remaining %= 3600;

    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;

    const hosting = hostingInfo
      ? String(hostingInfo)
      : getHosting();

    const prefix = getPrefix(config);
    const memory = process.memoryUsage();
    const ram = (memory.rss / 1024 / 1024).toFixed(1);

    const commands = [...new Set([
      ...getCommandNames(builtInCommands),
      ...getCommandNames(customCommandNames)
    ])].sort((a, b) => a.localeCompare(b, "ar"));

    const commandText = commands.length
      ? commands.map(name => `  ◈ ${prefix}${name}`).join("\n")
      : "  ◈ قائمة الأوامر غير متاحة";

    const message = [
      "╭━━━━━━ ⌁ ALPHA ⌁ ━━━━━━╮",
      "       NEBULA SYSTEM",
      "╰━━━━━━━━━━━━━━━━━━━━╯",
      "",
      "◈ الحالة      : يعمل",
      `◈ الاستضافة  : ${hosting}`,
      `◈ البادئة     : ${prefix}`,
      `◈ مدة التشغيل: ${days} يوم | ${hours} ساعة`,
      `                ${minutes} دقيقة | ${seconds} ثانية`,
      "",
      "◈ RAM         : " + ram + " MB",
      "◈ النظام      : " + os.platform(),
      "◈ Node.js     : " + process.version,
      "",
      "╭──── ⌁ الأوامر المتاحة ⌁ ────╮",
      commandText,
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
module.exports.aliases = ["ابتايم", "up"];
