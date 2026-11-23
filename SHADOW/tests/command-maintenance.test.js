"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const commandModule = require("../../commands/command");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "quasar-command-load-"));
}

test("command load يعيد بناء جدول الأوامر ويحتفظ بالاختصارات غير المعروضة", () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, "primary.js"), 'function handler() {}\nhandler.aliases = ["p", "primary-short"];\nmodule.exports = handler;\n');
    fs.writeFileSync(path.join(dir, "second.js"), 'module.exports = function second() {};\n');
    const target = { obsolete: () => {} };
    const result = commandModule.loadCommands(target, dir);
    assert.equal(result.commandCount, 2);
    assert.equal(result.aliasCount, 2);
    assert.equal(typeof target.primary, "function");
    assert.equal(target.p, target.primary);
    assert.equal(target["primary-short"], target.primary);
    assert.equal(Object.keys(target).includes("p"), false);
    assert.equal(target.obsolete, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("command load لا يغيّر الجدول النشط عند وجود تعارض أسماء", () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, "first.js"), 'function first() {}\nfirst.aliases = ["second"];\nmodule.exports = first;\n');
    fs.writeFileSync(path.join(dir, "second.js"), 'module.exports = function second() {};\n');
    const original = () => {};
    const target = { keep: original };
    assert.throws(() => commandModule.loadCommands(target, dir), /يتعارض/);
    assert.deepEqual(Object.keys(target), ["keep"]);
    assert.equal(target.keep, original);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("الأوامر المحذوفة غير موجودة، والأوامر المطلوبة محفوظة", () => {
  const root = path.resolve(__dirname, "../..");
  const removed = [
    "pp.js", "حماية_الصورة.js", "setavt.js", "setname.js", "emojimix.js", "rest.js",
    "pin.js", "ادمن.js", "ضيف.js", "all.js", "grouptag.js", "kick.js",
    "threadinfo.js", "tid.js", "uid.js", "userinfo.js", "prefix.js",
    "nm.js", "nik.js", "atomic.js", "unsend.js", "ابتايم.js"
  ];
  for (const file of removed) assert.equal(fs.existsSync(path.join(root, "commands", file)), false, file);

  const retained = ["فتح.js", "قفل.js", "بيس.js", "محرك.js", "اسم.js", "كنيات.js", "setbio.js", "حذف.js", "خروج.js", "help.js", "command.js", "uptime.js", "dev.js", "جلسة.js", "تحميل.js", "التحكم.js", "صورة.js", "angel.js"];
  for (const file of retained) assert.equal(fs.existsSync(path.join(root, "commands", file)), true, file);
  assert.equal(fs.existsSync(path.join(root, "SHADOW", "group-photo-guard.js")), false);
});

test("الاختصارات في جدول SHADOW قابلة للاستبدال عند command load", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");
  assert.match(source, /configurable:\s*true/);
  assert.match(source, /writable:\s*true/);
});

test("قائمة المساعدة مزخرفة ولا تعرض أوامر محذوفة أو اختصارات مكررة", () => {
  const help = require("../../commands/help");
  let output = "";
  help({ sendMessage(value) { output = String(value); } }, { threadID: "g" }, [], 0,
    () => ({ prefix: "!" }), () => {}, {}, {}, {}, {}, "bot",
    ["help", "بيس", "محرك", "اسم", "كنيات", "setbio", "حذف", "خروج", "command", "uptime", "angel"], [], Object.fromEntries(["h","bs","eng","ag","nm","nk","bio","del","lv","cmd","up"].map(x => [x, true])));
  assert.match(output, /ALPHA/);
  assert.match(output, /!nm —/);
  assert.match(output, /!nk —/);
  assert.doesNotMatch(output, /!اسم|!كنيات/);
  assert.match(output, /🛡️ إدارة المجموعة/);
  assert.match(output, /🔁 أنظمة التكرار/);
  assert.match(output, /!ag — إرسال نص تلقائي/);
  for (const removed of ["pp", "حماية_الصورة", "setavt", "emojimix", "rest", "kick", "grouptag"]) {
    assert.doesNotMatch(output, new RegExp("!" + removed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s"));
  }
  assert.doesNotMatch(output, /طرق الاستخدام|الاختصارات:|اتوميك|تكرار النص/);
});

test("ملفات الأوامر الفعلية تُحمّل بلا تصادم بين الأوامر والاختصارات", () => {
  const Module = require("node:module");
  const originalLoad = Module._load;
  const target = {};
  try {
    Module._load = function(request, parent, isMain) {
      if (request === "axios") return { get: async () => ({ data: null }), post: async () => ({ data: null }) };
      return originalLoad.call(this, request, parent, isMain);
    };
    const commandDir = path.resolve(__dirname, "../../commands");
    const result = commandModule.loadCommands(target, commandDir);
    assert.equal(result.commandCount, 20);
    assert.equal(target["لوحة"], target["التحكم"]);
    assert.equal(target["تحكم"], target["التحكم"]);
    assert.equal(target.ctl, target["التحكم"]);
    assert.equal(target.nm, target["اسم"]);
    assert.equal(target.dv, target.dev);
    assert.equal(target.bs, target["بيس"]);
    assert.equal(target.dl, target["تحميل"]);
    assert.equal(target.ss, target["جلسة"]);
    assert.equal(target.h, target.help);
    assert.equal(target.ag, target.angel);
    assert.equal(target.au, target.aut);
    assert.equal(target.nik, target["كنيات"]);
    assert.equal(target.بايو, target.setbio);
    assert.equal(target.avatar, target["صورة"]);
    assert.equal(target.cmd, target.command);
    for (const name of Object.keys(target)) {
      assert.ok(Array.isArray(target[name].aliases) && target[name].aliases.length > 0, `${name} must have a shortcut`);
    }
    assert.equal(typeof target.load, "undefined");
  } finally {
    Module._load = originalLoad;
  }
});

test("نقطة التشغيل تشغّل لوحة ALPHA NEBULA لإدارة الجلسات المعزولة", () => {
  const entry = fs.readFileSync(path.resolve(__dirname, "../../index.js"), "utf8");
  const runtime = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");
  const panel = fs.readFileSync(path.resolve(__dirname, "../panel.js"), "utf8");
  assert.match(entry, /require\(["']\.\/SHADOW\/panel\.js["']\)/);
  assert.match(panel, /SHADOW_SESSION_ID/);
  assert.match(panel, /SHADOW_DATA_DIR/);
  assert.match(panel, /app\.listen\(PORT, "0\.0\.0\.0"/);
  assert.match(runtime, /createServer\(.*listen\(PORT, "0\.0\.0\.0"\)/s);
});

test("حماية اسم المجموعة تعمل كل 30 ثانية وتمنع إعادة المحاولة الأقرب من ذلك", () => {
  const runtime = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");
  assert.match(runtime, /if \(now - last < 30000\) continue;/);
  assert.match(runtime, /setInterval\(checkSavedGroupNames, 30000\)/);
});
