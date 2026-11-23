"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const commandsDir = path.join(__dirname, "../../commands");

test("الاختصارات تشير إلى الأمر الأساسي دون ملفات أوامر مكررة", () => {
  const Module = require("node:module");
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === "axios") return { get: async () => ({ data: null }), post: async () => ({ data: null }) };
    return originalLoad.call(this, request, parent, isMain);
  };
  let name, nicknames;
  try {
    name = require("../../commands/اسم");
    nicknames = require("../../commands/كنيات");
  } finally {
    Module._load = originalLoad;
  }
  const uptime = require("../../commands/uptime");
  const deletionSource = fs.readFileSync(path.join(commandsDir, "حذف.js"), "utf8");
  assert.ok(name.aliases.includes("nm"));
  assert.ok(uptime.aliases.includes("up"));
  assert.ok(nicknames.aliases.includes("nk"));
  assert.ok(require("../../commands/dev").aliases.includes("dv"));
  assert.ok(require("../../commands/angel").aliases.includes("ag"));
  assert.ok(require("../../commands/aut").aliases.includes("au"));
  assert.match(deletionSource, /\["delete",\s*"unsend",\s*"سحب",\s*"حذف_رسالة",\s*"del"\]/);
  for (const duplicate of ["nm.js", "atomic.js", "ابتايم.js", "nik.js", "unsend.js"]) {
    assert.equal(fs.existsSync(path.join(commandsDir, duplicate)), false, `${duplicate} يجب ألا يبقى ملف أمر مستقل`);
  }
});

test("قائمة الأوامر تعرض الاسم الأساسي ولا تكرر الاختصارات", () => {
  const help = require("../../commands/help");
  let output = "";
  const api = { sendMessage(message) { output = String(message); } };
  help(api, { threadID: "group" }, [], 0, () => ({ prefix: "!" }), () => {}, {}, {}, {}, {}, "bot",
    ["help", "اسم", "كنيات", "uptime", "حذف", "setbio", "command", "بيس", "محرك", "angel"], [], Object.fromEntries(["h","nm","nk","up","del","bio","cmd","bs","eng","ag","au"].map(x => [x, true])));
  assert.match(output, /!nm —/);
  assert.match(output, /!nk —/);
  assert.match(output, /!up —/);
  assert.doesNotMatch(output, /!اسم|!كنيات|!uptime/);
  assert.doesNotMatch(output, /!atomic|!unsend/);
  assert.match(output, /🛡️ إدارة المجموعة/);
  assert.match(output, /🔁 أنظمة التكرار/);
  assert.match(output, /!ag — إرسال نص تلقائي/);
  assert.match(output, /!au — الرد تلقائياً على الرسائل الجديدة/);
  assert.match(output, /👤 حساب البوت/);
  assert.match(output, /🧰 أدوات ALPHA/);
  assert.doesNotMatch(output, /طرق الاستخدام|الاختصارات:|اتوميك/);
});


test("مخرجات الأوامر المشتركة نص عادي بلا إطارات مزخرفة", () => {
  const Module = require("node:module");
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === "axios" && parent && /[\\/]SHADOW[\\/]quasar-command-utils\.js$/.test(parent.filename)) {
      return { get: async () => ({}) };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  let styledFrame;
  try {
    ({ styledFrame } = require("../../SHADOW/quasar-command-utils"));
  } finally {
    Module._load = originalLoad;
  }
  const output = styledFrame("عنوان", ["السطر الأول", "السطر الثاني"]);
  assert.equal(output, "عنوان\nالسطر الأول\nالسطر الثاني");
  assert.doesNotMatch(output, /╭|╮|╰|╯|━━|┃/);
});
