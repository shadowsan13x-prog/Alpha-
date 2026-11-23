"use strict";

const os = require("os");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDuration(milliseconds) {
  let seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    `${seconds}s`
  ].filter(Boolean).join(" ");
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let number = bytes;
  let unit = 0;

  while (number >= 1024 && unit < units.length - 1) {
    number /= 1024;
    unit++;
  }

  return `${number.toFixed(1)} ${units[unit]}`;
}

function buildSessionSvg(info) {
  const e = escapeXml;
  const memoryPercent = info.heapTotal > 0
    ? Math.min(100, Math.max(0, info.heapUsed / info.heapTotal * 100))
    : 0;

  const metric = (x, title, value, subtitle, accent, icon) => `
    <rect x="${x}" y="190" width="258" height="142" rx="20"
      fill="#151a20" stroke="#343e47" stroke-opacity=".65"/>
    <rect x="${x + 18}" y="210" width="38" height="38" rx="12"
      fill="${accent}" fill-opacity=".13"/>
    <text x="${x + 37}" y="236" text-anchor="middle"
      font-size="18" fill="${accent}">${icon}</text>
    <text x="${x + 18}" y="276" font-size="13"
      fill="#87939d" letter-spacing="1">${e(title)}</text>
    <text x="${x + 18}" y="307" font-size="25"
      font-weight="700" fill="#f2f5f7">${e(value)}</text>
    <text x="${x + 18}" y="326" font-size="10"
      fill="#78858e">${e(subtitle)}</text>
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="1280" height="850" viewBox="0 0 1280 850">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#090d12"/>
      <stop offset=".55" stop-color="#111820"/>
      <stop offset="1" stop-color="#080c11"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".075"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity=".018"/>
    </linearGradient>
    <linearGradient id="silver" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#aab8c3"/>
      <stop offset=".5" stop-color="#e5edf2"/>
      <stop offset="1" stop-color="#82939f"/>
    </linearGradient>
    <linearGradient id="cyan" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6bd9df"/>
      <stop offset="1" stop-color="#9ce9e7"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#aab8c3"
        stroke-opacity=".035" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="1280" height="850" fill="url(#bg)"/>
  <rect width="1280" height="850" fill="url(#grid)"/>
  <circle cx="1120" cy="70" r="170" fill="#72dbe0"
    opacity=".055" filter="url(#glow)"/>
  <circle cx="300" cy="780" r="190" fill="#9aaab8"
    opacity=".045" filter="url(#glow)"/>

  <!-- Sidebar -->
  <rect x="0" y="0" width="86" height="850"
    fill="#0a0f14" stroke="#29323a" stroke-opacity=".8"/>
  <rect x="22" y="28" width="42" height="42" rx="14"
    fill="url(#glass)" stroke="#83939e" stroke-opacity=".55"/>
  <text x="43" y="56" text-anchor="middle" font-size="19"
    font-weight="700" fill="#e8f0f3">A</text>

  <rect x="19" y="112" width="48" height="48" rx="15"
    fill="#d6e3e9" fill-opacity=".12" stroke="#b5c7d0"
    stroke-opacity=".45"/>
  <text x="43" y="143" text-anchor="middle" font-size="19"
    fill="#dce9ed">⌂</text>
  <text x="43" y="203" text-anchor="middle" font-size="19"
    fill="#74828d">▤</text>
  <text x="43" y="263" text-anchor="middle" font-size="19"
    fill="#74828d">◈</text>
  <text x="43" y="323" text-anchor="middle" font-size="19"
    fill="#74828d">⚙</text>

  <circle cx="43" cy="796" r="17" fill="#17232a"
    stroke="#52636e"/>
  <text x="43" y="802" text-anchor="middle" font-size="13"
    fill="#dce8ed">K</text>

  <!-- Header -->
  <text x="120" y="48" font-size="13" letter-spacing="4"
    fill="#a6b4bd">A L P H A  /  CONTROL CENTER</text>
  <text x="120" y="105" font-size="34" font-weight="700"
    fill="#f0f4f6">Session Overview</text>
  <text x="120" y="133" font-size="14"
    fill="#87949e">Live system performance and bot information</text>

  <rect x="1050" y="45" width="180" height="43" rx="13"
    fill="#15221f" stroke="#42685d" stroke-opacity=".8"/>
  <circle cx="1073" cy="66" r="5" fill="#7ce0b2"/>
  <text x="1088" y="71" font-size="12" letter-spacing="1"
    fill="#a9e9cb">SYSTEM ONLINE</text>

  <!-- Welcome panel -->
  <rect x="112" y="155" width="1118" height="1"
    fill="#9cabb5" fill-opacity=".18"/>
  <text x="120" y="178" font-size="11" letter-spacing="2"
    fill="#87949e">OVERVIEW / CURRENT SESSION</text>

  ${metric(120, "UPTIME", info.uptime, "Continuous runtime", "#9fdce0", "◷")}
  ${metric(394, "MEMORY USED", info.rss, "Process resident memory", "#b9c8d1", "▥")}
  ${metric(668, "COMMANDS", info.commands, "Available bot commands", "#9fdce0", "⌘")}
  ${metric(942, "GROUPS", info.groups, "Registered conversations", "#b9c8d1", "◫")}

  <!-- Main information panel -->
  <rect x="120" y="358" width="700" height="300" rx="20"
    fill="url(#glass)" stroke="#46535d" stroke-opacity=".65"/>
  <text x="148" y="397" font-size="17" font-weight="700"
    fill="#e8eef1">Runtime Information</text>
  <text x="148" y="420" font-size="11" letter-spacing="1"
    fill="#84929c">ENVIRONMENT DETAILS</text>

  <path d="M148 440H790" stroke="#65747d" stroke-opacity=".25"/>
  <text x="150" y="475" font-size="12" fill="#82919b">BOT NAME</text>
  <text x="770" y="475" text-anchor="end" font-size="14"
    fill="#e4edf0">${e(info.botName)}</text>

  <text x="150" y="518" font-size="12" fill="#82919b">DEVELOPER</text>
  <text x="770" y="518" text-anchor="end" font-size="14"
    fill="#e4edf0">${e(info.developer)}</text>

  <text x="150" y="561" font-size="12" fill="#82919b">NODE VERSION</text>
  <text x="770" y="561" text-anchor="end" font-size="14"
    fill="#e4edf0">${e(info.node)}</text>

  <text x="150" y="604" font-size="12" fill="#82919b">PLATFORM</text>
  <text x="770" y="604" text-anchor="end" font-size="14"
    fill="#e4edf0">${e(info.platform)}</text>

  <!-- Memory panel -->
  <rect x="844" y="358" width="386" height="300" rx="20"
    fill="url(#glass)" stroke="#46535d" stroke-opacity=".65"/>
  <text x="872" y="397" font-size="17" font-weight="700"
    fill="#e8eef1">Memory Monitor</text>
  <text x="872" y="420" font-size="11" letter-spacing="1"
    fill="#84929c">PROCESS HEAP USAGE</text>

  <text x="872" y="478" font-size="29" font-weight="700"
    fill="#edf4f6">${e(info.heapUsed)}</text>
  <text x="872" y="501" font-size="12"
    fill="#82919b">of ${e(info.heapTotal)} allocated</text>

  <rect x="872" y="525" width="330" height="10" rx="5"
    fill="#28343b"/>
  <rect x="872" y="525" width="${Math.round(330 * memoryPercent / 100)}"
    height="10" rx="5" fill="url(#cyan)"/>
  <text x="872" y="558" font-size="12"
    fill="#9baab3">${memoryPercent.toFixed(1)}% heap utilization</text>

  <path d="M872 581H1202" stroke="#65747d" stroke-opacity=".25"/>
  <text x="872" y="610" font-size="11" fill="#82919b">SERVER MEMORY AVAILABLE</text>
  <text x="1202" y="635" text-anchor="end" font-size="14"
    fill="#e4edf0">${e(info.freeMemory)}</text>

  <!-- Bottom details -->
  <rect x="120" y="682" width="1110" height="105" rx="18"
    fill="#111920" stroke="#46535d" stroke-opacity=".55"/>
  <text x="148" y="716" font-size="12" letter-spacing="1"
    fill="#91a0aa">SESSION DETAILS</text>

  <text x="148" y="751" font-size="11" fill="#788994">SESSION</text>
  <text x="148" y="773" font-size="15" fill="#e5edf0">${e(info.session)}</text>

  <text x="405" y="751" font-size="11" fill="#788994">PORT</text>
  <text x="405" y="773" font-size="15" fill="#e5edf0">${e(info.port)}</text>

  <text x="625" y="751" font-size="11" fill="#788994">PREFIX</text>
  <text x="625" y="773" font-size="15" fill="#e5edf0">${e(info.prefix)}</text>

  <text x="830" y="751" font-size="11" fill="#788994">CUSTOM COMMANDS</text>
  <text x="830" y="773" font-size="15" fill="#e5edf0">${e(info.customCommands)}</text>

  <text x="120" y="825" font-size="10" letter-spacing="2"
    fill="#66757f">ALPHA SYSTEMS</text>
  <text x="1230" y="825" text-anchor="end" font-size="10"
    fill="#66757f">LIVE SESSION SNAPSHOT</text>
</svg>`;
}

module.exports = async function sessionCommand(
  api,
  event,
  _args,
  startTime,
  loadData,
  _saveData,
  automicTimers = {},
  config = {},
  _hostingInfo,
  _botSentMessages,
  _BOT_ID,
  builtInCommands = [],
  customCommandNames = []
) {
  let tempDir;

  try {
    if (!event?.threadID) {
      throw new Error("Missing thread ID");
    }

    if (typeof api?.sendMessage !== "function") {
      throw new Error("Messenger sendMessage is unavailable");
    }

    const data = typeof loadData === "function" ? loadData() || {} : {};
    const uptimeMs = Number(startTime) > 0
      ? Math.max(0, Date.now() - Number(startTime))
      : process.uptime() * 1000;

    const memory = process.memoryUsage();
    const info = {
      uptime: formatDuration(uptimeMs),
      rss: formatBytes(memory.rss),
      heapUsed: formatBytes(memory.heapUsed),
      heapTotal: formatBytes(memory.heapTotal),
      freeMemory: formatBytes(os.freemem()),
      commands: Array.isArray(builtInCommands) ? builtInCommands.length : 0,
      customCommands: Array.isArray(customCommandNames) ? customCommandNames.length : 0,
      groups: Array.isArray(data.botGroups) ? data.botGroups.length : 0,
      botName: config.BOT_NAME || "ALPHA",
      developer: config.DEV_NAME || "KAI",
      node: process.version,
      platform: `${os.platform()} ${os.arch()}`,
      session: process.env.SHADOW_SESSION_ID || "1",
      port: process.env.PORT || process.env.SHADOW_BOT_PORT || "3000",
      prefix: data.prefix || "!"
    };

    const svg = buildSessionSvg(info);

    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "alpha-session-")
    );

    const svgPath = path.join(tempDir, "session.svg");
    const pngPath = path.join(tempDir, "session.png");

    await fs.promises.writeFile(svgPath, svg, "utf8");

    await execFileAsync("rsvg-convert", [
      "--format", "png",
      "--output", pngPath,
      svgPath
    ], {
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });

    const png = await fs.promises.readFile(pngPath);
    const signature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ]);

    if (png.length < 1000 || !png.subarray(0, 8).equals(signature)) {
      throw new Error("Rendered output is not a valid PNG image");
    }

    // Send the actual PNG bytes as an image attachment, never as a URL.
    return await api.sendMessage(
      { attachment: png },
      event.threadID
    );
  } catch (error) {
    console.error("ALPHA SESSION IMAGE ERROR:", error?.stack || error);

    try {
      return await api.sendMessage(
        "❌ تعذر إنشاء صورة حالة ALPHA أو إرسالها. راجع سجل التشغيل لمعرفة السبب.",
        event.threadID
      );
    } catch (sendError) {
      console.error("ALPHA SESSION ERROR REPLY:", sendError?.message || sendError);
      return undefined;
    }
  } finally {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
        .catch(error => {
          console.error("ALPHA SESSION TEMP CLEANUP:", error?.message || error);
        });
    }
  }
};

module.exports.aliases = ["ss", "session"];
module.exports.buildSessionSvg = buildSessionSvg;
module.exports.formatDuration = formatDuration;
module.exports.formatBytes = formatBytes;
