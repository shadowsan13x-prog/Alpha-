"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const angel = require("../../commands/angel");
const { DEVELOPER_ONLY_COMMANDS, canExecuteCommand } = require("../command-access");

function setupLockDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alpha-angel-locks-"));
  process.env.SHADOW_REPEAT_LOCK_DIR = directory;
  return directory;
}

test("Angel parses seconds, minutes, hours and days correctly", () => {
  assert.deepEqual(angel.parseInterval("30s"), { min: 30_000, max: 30_000 });
  assert.deepEqual(angel.parseInterval("2m"), { min: 120_000, max: 120_000 });
  assert.deepEqual(angel.parseInterval("1.5h"), { min: 5_400_000, max: 5_400_000 });
  assert.deepEqual(angel.parseInterval("1d"), { min: 86_400_000, max: 86_400_000 });
  assert.deepEqual(angel.parseInterval("2m-30s"), { min: 30_000, max: 120_000 });
});

test("Angel rejects intervals below 5 seconds and above 7 days", () => {
  assert.equal(angel.parseInterval("4s"), null);
  assert.equal(angel.parseInterval("8d"), null);
  assert.equal(angel.parseInterval("1x"), null);
});

test("Angel and its English shortcut stay developer-only in public mode", () => {
  for (const command of ["angel", "ag"]) {
    assert.equal(DEVELOPER_ONLY_COMMANDS.has(command), true);
    assert.equal(canExecuteCommand({ cmd: command, isDeveloper: false, publicMode: true }), false);
    assert.equal(canExecuteCommand({ cmd: command, isDeveloper: true, publicMode: true }), true);
  }
});

test("only the primary owner can stop all Angel tasks", async () => {
  const lockDir = setupLockDirectory();
  const sent = [];
  const api = {
    async sendMessage(message, threadID) {
      sent.push({ message: String(message), threadID: String(threadID) });
      return { messageID: `m${sent.length}` };
    }
  };
  const timers = {};
  const config = { DEV_ID: "111111", DEV_IDS: ["111111", "222222"] };
  const run = (senderID, args, rawText) => {
    args.rawText = rawText || "";
    return angel(api, { threadID: "angel-group", senderID, messageID: "source" }, args,
      Date.now(), () => ({}), () => {}, timers, config, {}, {}, "999999",
      [], [], {}, { isDeveloper: true });
  };

  try {
    await run("111111", ["ag", "Hello", "60s"], "Hello 60s");
    assert.ok(timers[angel.stateKey("angel-group")]);
    assert.equal(sent[0].message, "Hello");

    await run("222222", ["ag", "off", "all"], "off all");
    assert.ok(timers[angel.stateKey("angel-group")], "المطور الإضافي يجب ألا يوقف المهام");
    assert.match(sent.at(-1).message, /للمالك الأساسي فقط/);

    await run("111111", ["ag", "off", "all"], "off all");
    assert.equal(timers[angel.stateKey("angel-group")], undefined);
    assert.match(sent.at(-1).message, /تم إيقاف 1 مهمة Angel/);
  } finally {
    angel.stopAll(timers);
    fs.rmSync(lockDir, { recursive: true, force: true });
    delete process.env.SHADOW_REPEAT_LOCK_DIR;
  }
});


test("Angel sends the requested text immediately using the same callback flow as بيس", async () => {
  const lockDir = setupLockDirectory();
  const sent = [];
  const api = {
    sendMessage(message, threadID, callback, replyToMessageID) {
      sent.push({ message: String(message), threadID: String(threadID), replyToMessageID });
      queueMicrotask(() => callback(null, { messageID: `callback-${sent.length}` }));
    }
  };
  const timers = {};
  const botSentMessages = {};
  const args = ["ag", "Hello", "60s"];
  args.rawText = "Hello 60s";

  try {
    await angel(
      api,
      { threadID: "angel-callback-group", senderID: "111111", messageID: "command-id" },
      args, Date.now(), () => ({}), () => {}, timers,
      { DEV_ID: "111111", DEV_IDS: ["111111"] }, {}, botSentMessages, "999999",
      [], [], {}, { isDeveloper: true }
    );

    assert.equal(sent.length, 1, "Angel should not send a separate startup notice");
    assert.equal(sent[0].message, "Hello", "the first send must be the requested text, like بيس");
    assert.equal(sent[0].replyToMessageID, undefined);
    assert.ok(botSentMessages["angel-callback-group"].includes("callback-1"));
    assert.ok(timers[angel.stateKey("angel-callback-group")]);
  } finally {
    angel.stopAll(timers);
    fs.rmSync(lockDir, { recursive: true, force: true });
    delete process.env.SHADOW_REPEAT_LOCK_DIR;
  }
});
