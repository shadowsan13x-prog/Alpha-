"use strict";

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { normalizeDeveloperIds } = require("./developer-ids");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(__dirname, "public");
const SESSIONS_DIR = path.join(ROOT, "sessions");
const PORT = Number(process.env.PORT || process.env.PANEL_PORT || 3001);
const PASSWORD = String(process.env.PANEL_PASSWORD || "");
const COOKIE_NAME = "alpha_nebula_auth";
const SESSION_HOURS = 12;
const MAX_LOG_LINES = 250;

if (PASSWORD.length < 12) {
  console.error("[NEBULA] Set PANEL_PASSWORD to a secret of at least 12 characters.");
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const children = new Map();
const logs = new Map();
const loginAttempts = new Map();

function sessionDir(id) {
  if (!["1", "2"].includes(String(id))) throw new Error("Invalid session");
  return path.join(SESSIONS_DIR, String(id));
}

function atomicJSON(file, value) {
  const temp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}

function readJSON(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readConfig(id) {
  return readJSON(path.join(sessionDir(id), "config.json"), {});
}

function readSessionData(id) {
  return readJSON(path.join(sessionDir(id), "data.json"), {});
}

function readCustomCommands(id) {
  const value = readJSON(path.join(sessionDir(id), "custom-commands.json"), {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isSessionRunning(id) {
  const child = children.get(String(id));
  return Boolean(child && child.exitCode === null && !child.spawnFailed);
}

function normalizeAppState(input) {
  let parsed = input;

  if (typeof parsed === "string") {
    const raw = parsed.trim();
    if (!raw) throw new Error("أدخل بيانات appState أو Cookie أولاً.");

    try {
      parsed = JSON.parse(raw);
    } catch {
      const cookieText = raw.replace(/^cookie:\s*/i, "");
      const pairs = cookieText.split(";").map(part => part.trim()).filter(Boolean);
      const cookies = new Map();

      for (const pair of pairs) {
        const index = pair.indexOf("=");
        if (index <= 0) continue;
        const key = pair.slice(0, index).trim();
        const value = pair.slice(index + 1).trim();
        if (key && value) cookies.set(key, value);
      }

      parsed = [...cookies.entries()].map(([key, value]) => ({
        key, value, domain: ".facebook.com", path: "/"
      }));
    }
  }

  if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
    parsed = Object.entries(parsed).map(([key, value]) => ({
      key,
      value: String(value),
      domain: ".facebook.com",
      path: "/"
    }));
  }

  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error("تنسيق appState غير صحيح.");
  }

  const cleaned = parsed.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("يوجد عنصر غير صالح داخل بيانات الدخول.");
    }
    return {
      ...item,
      key: String(item.key || "").trim(),
      value: String(item.value ?? "")
    };
  });

  const valid = key => cleaned.some(item => item.key === key && item.value.length > 0);
  if (!valid("c_user") || !valid("xs")) {
    throw new Error("بيانات الدخول لا تحتوي على c_user و xs صالحين.");
  }

  return cleaned;
}

function validCustomCommandName(name) {
  return typeof name === "string" &&
    /^[\p{L}\p{N}_-]{1,32}$/u.test(name);
}

function isBuiltInCommand(name) {
  const dir = path.join(ROOT, "commands");
  if (!fs.existsSync(dir)) return false;

  return fs.readdirSync(dir).some(file => {
    if (!file.endsWith(".js")) return false;
    return path.basename(file, ".js").toLowerCase() === name.toLowerCase();
  });
}

function validAppState(file) {
  try {
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(state)) return false;
    const keys = new Set(state.map(item => String(item?.key || "")));
    return keys.has("c_user") && keys.has("xs");
  } catch {
    return false;
  }
}

function addLog(id, line) {
  const list = logs.get(id) || [];
  list.push({ time: new Date().toISOString(), line: String(line).slice(0, 1200) });
  while (list.length > MAX_LOG_LINES) list.shift();
  logs.set(id, list);
}

function getSessionState(id) {
  const dir = sessionDir(id);
  const child = children.get(id);
  const config = readConfig(id);
  const data = readSessionData(id);
  const customCommands = readCustomCommands(id);
  const stats = readJSON(path.join(dir, "shadow-stats.json"), {});
  const totals = stats.totals || {};
  const appStatePath = path.join(dir, "appState.json");

  return {
    id,
    name: `ALPHA-0${id}`,
    running: Boolean(child && child.exitCode === null && !child.spawnFailed),
    pid: child?.pid || null,
    appStateReady: validAppState(appStatePath),
    prefix: String(data.prefix || "!"),
    freePrefix: data.freePrefix === true,
    customCommandCount: Object.keys(customCommands).length,
    config: {
      BOT_NAME: String(config.BOT_NAME || "ALPHA"),
      BOT_NICK: String(config.BOT_NICK || "ALPHA"),
      DEV_NAME: String(config.DEV_NAME || "KAI"),
      DEV_NICK: String(config.DEV_NICK || "KAI"),
      DEV_IDS: (Array.isArray(config.DEV_IDS) && config.DEV_IDS.length ? config.DEV_IDS : (config.DEV_ID ? [config.DEV_ID] : [])).slice(0, 4),
      NICK_GUARD_ENABLED: config.NICK_GUARD_ENABLED !== false,
      DEV_NICK_GUARD_ENABLED: config.DEV_NICK_GUARD_ENABLED !== false
    },
    stats: {
      messages: Number(totals.messages || 0),
      commands: Number(totals.commands || 0),
      groups: Number(stats.groups ? Object.keys(stats.groups).length : 0),
      users: Number(stats.users ? Object.keys(stats.users).length : 0)
    }
  };
}

function sign(value) {
  return crypto.createHmac("sha256", PASSWORD).update(value).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function makeCookie(expiry) {
  const value = String(expiry);
  return `${value}.${sign(value)}`;
}

function isAuthenticated(req) {
  const raw = String(req.headers.cookie || "")
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(COOKIE_NAME + "="));
  if (!raw) return false;

  const value = decodeURIComponent(raw.slice(COOKIE_NAME.length + 1));
  const [expiry, signature] = value.split(".");
  if (!expiry || !signature || !/^\d+$/.test(expiry)) return false;
  if (Number(expiry) < Date.now()) return false;
  return safeEqual(sign(expiry), signature);
}

function requireAuth(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "يلزم تسجيل الدخول" });
  }
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

app.get("/health", (_req, res) => res.json({ status: "ok", app: "ALPHA NEBULA" }));

app.post("/api/login", (req, res) => {
  const ip = String(req.ip || "unknown");
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || [];
  const recent = attempts.filter(time => now - time < 15 * 60 * 1000);

  if (recent.length >= 5) {
    return res.status(429).json({ error: "محاولات كثيرة. حاول بعد 15 دقيقة." });
  }

  if (!safeEqual(String(req.body?.password || ""), PASSWORD)) {
    recent.push(now);
    loginAttempts.set(ip, recent);
    return res.status(401).json({ error: "كلمة المرور غير صحيحة" });
  }

  loginAttempts.delete(ip);
  const expiry = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  res.cookie(COOKIE_NAME, makeCookie(expiry), {
    httpOnly: true,
    secure: req.secure,
    sameSite: "strict",
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
    path: "/"
  });
  res.json({ ok: true });
});

app.post("/api/logout", requireAuth, (_req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "strict", path: "/" });
  res.json({ ok: true });
});

app.get("/api/state", requireAuth, (_req, res) => {
  res.json({
    app: "ALPHA NEBULA",
    sessions: ["1", "2"].map(getSessionState),
    system: {
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage().rss
    }
  });
});

function startSession(id) {
  const dir = sessionDir(id);
  fs.mkdirSync(dir, { recursive: true });

  const appState = path.join(dir, "appState.json");
  if (!validAppState(appState)) {
    throw new Error("ملف appState.json غير موجود أو غير صالح لهذه الجلسة.");
  }

  const existing = children.get(id);
  if (existing && existing.exitCode === null && !existing.spawnFailed) {
    throw new Error("الجلسة تعمل بالفعل.");
  }

  const botPort = id === "1" ? "3101" : "3102";
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      SHADOW_SESSION_ID: id,
      SHADOW_DATA_DIR: dir,
      SHADOW_BOT_PORT: botPort,
      PORT: botPort
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.exitCode = null;
  child.spawnFailed = false;
  children.set(id, child);
  addLog(id, `Starting ${`ALPHA-0${id}`}...`);

  child.stdout.on("data", data => {
    for (const line of String(data).split(/\r?\n/).filter(Boolean)) addLog(id, line);
  });
  child.stderr.on("data", data => {
    for (const line of String(data).split(/\r?\n/).filter(Boolean)) addLog(id, "[stderr] " + line);
  });
  child.on("error", error => {
    child.spawnFailed = true;
    addLog(id, "Process error: " + error.message);
  });
  child.on("exit", (code, signal) => {
    child.exitCode = code ?? 1;
    addLog(id, `Process exited: code=${code}, signal=${signal}`);
  });

  return child;
}

function stopSession(id) {
  const child = children.get(id);
  if (!child || child.exitCode !== null || child.spawnFailed) {
    return Promise.resolve(false);
  }

  return new Promise(resolve => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      resolve(true);
    };

    child.once("exit", done);
    child.kill("SIGTERM");

    const forceTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      done();
    }, 8000);
  });
}

app.post("/api/session/:id/start", requireAuth, (req, res) => {
  try {
    const child = startSession(req.params.id);
    res.json({ ok: true, pid: child.pid });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/session/:id/stop", requireAuth, async (req, res) => {
  try {
    const stopped = await stopSession(req.params.id);
    res.json({ ok: true, stopped });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/session/:id/restart", requireAuth, async (req, res) => {
  try {
    await stopSession(req.params.id);
    const child = startSession(req.params.id);
    res.json({ ok: true, pid: child.pid });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/session/:id/appstate", requireAuth, upload.single("appstate"), (req, res) => {
  try {
    const dir = sessionDir(req.params.id);
    if (!req.file) return res.status(400).json({ error: "اختر ملف appState.json" });

    const parsed = normalizeAppState(req.file.buffer.toString("utf8"));

    if (isSessionRunning(req.params.id)) {
      return res.status(409).json({ error: "أوقف الجلسة قبل استبدال ملف الدخول." });
    }

    fs.mkdirSync(dir, { recursive: true });
    atomicJSON(path.join(dir, "appState.json"), parsed);
    res.json({ ok: true, message: "تم حفظ ملف الجلسة بأمان." });
  } catch (error) {
    res.status(400).json({
      error: error.message || "تعذر قراءة الملف. تأكد أنه JSON صالح."
    });
  }
});

app.post("/api/session/:id/appstate-text", requireAuth, (req, res) => {
  try {
    const id = String(req.params.id);
    const dir = sessionDir(id);

    if (isSessionRunning(id)) {
      return res.status(409).json({ error: "أوقف الجلسة قبل استبدال ملف الدخول." });
    }

    const parsed = normalizeAppState(req.body?.content);
    fs.mkdirSync(dir, { recursive: true });
    atomicJSON(path.join(dir, "appState.json"), parsed);

    res.json({ ok: true, message: "تم حفظ بيانات الدخول لهذه الجلسة." });
  } catch (error) {
    res.status(400).json({ error: error.message || "تعذر معالجة بيانات الدخول." });
  }
});

app.put("/api/session/:id/config", requireAuth, (req, res) => {
  try {
    const dir = sessionDir(req.params.id);
    const configPath = path.join(dir, "config.json");
    const current = readJSON(configPath, {});
    const body = req.body || {};

    if (body.DEV_IDS !== undefined) {
      current.DEV_IDS = normalizeDeveloperIds(body.DEV_IDS);
      current.DEV_ID = current.DEV_IDS[0] || "";
    }

    const allowed = ["BOT_NAME", "BOT_NICK", "DEV_NAME", "DEV_NICK"];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        const value = String(body[key]).trim();
        if (value.length > 80) {
          return res.status(400).json({ error: "قيمة إعداد طويلة جدًا." });
        }
        current[key] = value;
      }
    }

    if (body.NICK_GUARD_ENABLED !== undefined) {
      current.NICK_GUARD_ENABLED = body.NICK_GUARD_ENABLED === true;
    }
    if (body.DEV_NICK_GUARD_ENABLED !== undefined) {
      current.DEV_NICK_GUARD_ENABLED = body.DEV_NICK_GUARD_ENABLED === true;
    }

    atomicJSON(configPath, current);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/session/:id/prefix", requireAuth, (req, res) => {
  try {
    const id = String(req.params.id);
    const dir = sessionDir(id);
    const body = req.body || {};
    const prefix = String(body.prefix ?? "").trim();

    if (!prefix || prefix.length > 5 || /\\s/.test(prefix)) {
      return res.status(400).json({ error: "البادئة يجب أن تكون من حرف إلى خمسة أحرف دون مسافات." });
    }

    const file = path.join(dir, "data.json");
    const data = readJSON(file, {});
    data.prefix = prefix;
    data.freePrefix = body.freePrefix === true;

    fs.mkdirSync(dir, { recursive: true });
    atomicJSON(file, data);
    res.json({ ok: true, prefix, freePrefix: data.freePrefix });
  } catch (error) {
    res.status(400).json({ error: error.message || "تعذر حفظ البادئة." });
  }
});

app.get("/api/session/:id/custom-commands", requireAuth, (req, res) => {
  try {
    const id = String(req.params.id);
    sessionDir(id);
    res.json({ commands: readCustomCommands(id) });
  } catch {
    res.status(400).json({ error: "جلسة غير صالحة." });
  }
});

app.put("/api/session/:id/custom-commands/:name", requireAuth, (req, res) => {
  try {
    const id = String(req.params.id);
    const name = String(req.params.name || "");
    const dir = sessionDir(id);
    const body = req.body || {};

    if (!validCustomCommandName(name)) {
      return res.status(400).json({ error: "اسم الأمر غير صالح." });
    }
    if (isBuiltInCommand(name)) {
      return res.status(409).json({ error: "هذا الاسم مستخدم لأمر أساسي." });
    }

    const reply = typeof body.reply === "string" ? body.reply : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (Boolean(reply.trim()) === Boolean(code.trim())) {
      return res.status(400).json({ error: "أدخل ردًا نصيًا أو كودًا، وليس الاثنين معًا." });
    }
    if (reply.length > 5000 || code.length > 5000) {
      return res.status(400).json({ error: "محتوى الأمر أطول من الحد المسموح." });
    }

    const file = path.join(dir, "custom-commands.json");
    const commands = readCustomCommands(id);
    if (!commands[name] && Object.keys(commands).length >= 100) {
      return res.status(400).json({ error: "وصلت إلى الحد الأقصى للأوامر المخصصة." });
    }

    commands[name] = {
      enabled: body.enabled !== false,
      ...(reply.trim() ? { reply } : { code })
    };

    fs.mkdirSync(dir, { recursive: true });
    atomicJSON(file, commands);
    res.json({ ok: true, commands });
  } catch (error) {
    res.status(400).json({ error: error.message || "تعذر حفظ الأمر." });
  }
});

app.delete("/api/session/:id/custom-commands/:name", requireAuth, (req, res) => {
  try {
    const id = String(req.params.id);
    const name = String(req.params.name || "");
    const dir = sessionDir(id);

    if (!validCustomCommandName(name)) {
      return res.status(400).json({ error: "اسم الأمر غير صالح." });
    }

    const commands = readCustomCommands(id);
    if (!Object.prototype.hasOwnProperty.call(commands, name)) {
      return res.status(404).json({ error: "الأمر غير موجود." });
    }

    delete commands[name];
    atomicJSON(path.join(dir, "custom-commands.json"), commands);
    res.json({ ok: true, commands });
  } catch (error) {
    res.status(400).json({ error: error.message || "تعذر حذف الأمر." });
  }
});

app.get("/api/session/:id/logs", requireAuth, (req, res) => {
  try {
    const id = String(req.params.id);
    sessionDir(id);
    res.json({ logs: logs.get(id) || [] });
  } catch {
    res.status(400).json({ error: "جلسة غير صالحة" });
  }
});

app.use(express.static(PUBLIC, { index: "index.html", etag: true }));

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: "حجم الملف أكبر من الحد المسموح أو نوع الرفع غير صالح." });
  }
  res.status(500).json({ error: "حدث خطأ داخلي في اللوحة." });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[NEBULA] ALPHA NEBULA listening on port ${PORT}`);
  console.log("[NEBULA] Sessions are isolated and require manual start.");
});

async function shutdown() {
  console.log("[NEBULA] Shutting down sessions...");
  await Promise.all(["1", "2"].map(stopSession));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
