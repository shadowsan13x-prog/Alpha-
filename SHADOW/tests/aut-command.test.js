"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const aut = require("../../commands/aut");
const { DEVELOPER_ONLY_COMMANDS, canExecuteCommand } = require("../command-access");

function makeApi(historyProvider = () => []) {
  const sent = [];
  const typing = [];
  return {
    sent,
    typing,
    sendMessage(message, threadID, callback, replyToMessageID) {
      const item = { message: String(message), threadID: String(threadID), replyToMessageID };
      sent.push(item);
      if (typeof callback === "function") {
        queueMicrotask(() => callback(null, { messageID: `bot-${sent.length}` }));
      }
    },
    sendTypingIndicator(threadID, enabled) {
      typing.push({ threadID: String(threadID), enabled: Boolean(enabled) });
    },
    getThreadHistory(threadID, limit, timestamp, callback) {
      callback(null, historyProvider(threadID, limit));
    }
  };
}

function makeArgs(rawText, values = []) {
  const args = ["au", ...values];
  args.rawText = rawText;
  return args;
}

function run(api, timers, senderID, args, config = {}, event = {}) {
  return aut(
    api,
    { threadID: "aut-test-group", messageID: "command-message", senderID, ...event },
    args,
    Date.now(),
    () => ({ prefix: "!", developers: [] }),
    () => {},
    timers,
    config,
    {},
    {},
    "bot-account",
    [], [], {},
    { isDeveloper: false }
  );
}

test("Aut uses بيس-style rawText parsing and preserves embedded newlines", async () => {
  const api = makeApi();
  const timers = {};
  const text = "السطر الأول\nالسطر الثاني  مع مسافات";
  try {
    await run(api, timers, "111111", makeArgs(text), { DEV_ID: "111111", DEV_IDS: ["111111"] });
    const job = timers[aut.stateKey("aut-test-group")];
    assert.ok(job);
    assert.equal(job.text, text);
    assert.match(api.sent[0].message, /Aut يعمل الآن/);
  } finally {
    aut.stopAll(timers);
  }
});

test("Aut replies only to the latest human message and shows typing for three seconds", async () => {
  const incoming = [
    { messageID: "human-message-1", senderID: "222222", timestamp: Date.now() + 1000 },
    { messageID: "human-message-2", senderID: "333333", timestamp: Date.now() + 2000 }
  ];
  const api = makeApi(() => incoming);
  const timers = {};
  const sentByThread = {};
  try {
    await aut(
      api,
      { threadID: "aut-reply-group", messageID: "command-message", senderID: "111111" },
      makeArgs("رد آلي\nبسطرين"),
      Date.now(),
      () => ({ prefix: "!", developers: [] }),
      () => {},
      timers,
      { DEV_ID: "111111", DEV_IDS: ["111111"] },
      {},
      sentByThread,
      "bot-account",
      [], [], {},
      { isDeveloper: true }
    );
    const responses = api.sent.filter(item => item.message === "رد آلي\nبسطرين");
    assert.equal(responses.length, 1, "يجب إرسال رد واحد فقط لكل دورة فحص");
    assert.equal(responses[0].replyToMessageID, "human-message-2");
    assert.deepEqual(api.typing, [
      { threadID: "aut-reply-group", enabled: true },
      { threadID: "aut-reply-group", enabled: false }
    ]);
    assert.ok(Array.isArray(sentByThread["aut-reply-group"]));
  } finally {
    aut.stopAll(timers);
  }
});

test("Aut and its English shortcut are developer-only in public mode", () => {
  for (const command of ["aut", "au"]) {
    assert.equal(DEVELOPER_ONLY_COMMANDS.has(command), true);
    assert.equal(canExecuteCommand({ cmd: command, isDeveloper: false, publicMode: true }), false);
    assert.equal(canExecuteCommand({ cmd: command, isDeveloper: true, publicMode: true }), true);
  }
});

test("only the primary owner can stop all Aut tasks", async () => {
  const api = makeApi();
  const timers = {};
  const config = { DEV_ID: "111111", DEV_IDS: ["111111", "222222"] };
  try {
    await run(api, timers, "111111", makeArgs("رد آلي"), config);
    assert.ok(timers[aut.stateKey("aut-test-group")]);

    await run(api, timers, "222222", makeArgs("off all", ["off", "all"]), config);
    assert.ok(timers[aut.stateKey("aut-test-group")], "المطور الإضافي لا يستطيع إيقاف الجميع");
    assert.match(api.sent.at(-1).message, /للمالك الأساسي فقط/);

    await run(api, timers, "111111", makeArgs("off all", ["off", "all"]), config);
    assert.equal(timers[aut.stateKey("aut-test-group")], undefined);
    assert.match(api.sent.at(-1).message, /تم إيقاف 1 مهمة Aut/);
  } finally {
    aut.stopAll(timers);
  }
});


test("Aut uses the requested 80-second check, 3-second typing, and 16-minute idle limit", () => {
  assert.equal(aut.constants.POLL_GAP_MS, 80_000);
  assert.equal(aut.constants.TYPING_TIME_MS, 3_000);
  assert.equal(aut.constants.IDLE_LIMIT_MS, 16 * 60 * 1000);
});

test("after 16 minutes Aut sends only the closing text then removes the bot from the group", async () => {
  const api = makeApi();
  const removed = [];
  api.removeUserFromGroup = async (userID, threadID) => {
    removed.push({ userID, threadID });
  };
  const job = {
    api,
    threadID: "idle-group",
    botID: "bot-account",
    botSentMessages: {},
    lastTargetID: "last-human-message",
    stopped: false,
    finishing: false,
    stop() { this.stopped = true; }
  };

  assert.equal(await aut.finishJob(job), true);
  assert.equal(job.stopped, true);
  assert.deepEqual(api.sent.map(item => item.message), [aut.constants.STOP_TEXT]);
  assert.equal(api.sent[0].replyToMessageID, "last-human-message");
  assert.deepEqual(removed, [{ userID: "bot-account", threadID: "idle-group" }]);

  // Calling the closing path again must not send another message or leave twice.
  assert.equal(await aut.finishJob(job), false);
  assert.equal(api.sent.length, 1);
  assert.equal(removed.length, 1);
});
