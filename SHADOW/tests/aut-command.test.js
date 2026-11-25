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

function run(api, timers, senderID, args, config = {}, event = {}, access = {}, data = {}) {
  return aut(
    api,
    { threadID: "aut-test-group", messageID: "command-message", senderID, ...event },
    args,
    Date.now(),
    () => ({ ...data, prefix: "!", developers: [] }),
    () => {},
    timers,
    config,
    {},
    {},
    "bot-account",
    [], [], {},
    access
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

test("Aut replies only to the latest human message and shows typing for four seconds", async () => {
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

test("every configured developer can stop all Aut tasks in the current session", async () => {
  const api = makeApi();
  const timers = {};
  const config = { DEV_ID: "111111", DEV_IDS: ["111111", "222222"] };
  try {
    await run(api, timers, "111111", makeArgs("رد آلي"), config);
    assert.ok(timers[aut.stateKey("aut-test-group")]);

    await run(api, timers, "222222", makeArgs("off all", ["off", "all"]), config);
    assert.equal(timers[aut.stateKey("aut-test-group")], undefined);
    assert.match(api.sent.at(-1).message, /تم إيقاف 1 مهمة Aut/);
  } finally {
    aut.stopAll(timers);
  }
});



test("Aut rejects disabled developers and respects explicit false access", async () => {
  const api = makeApi();
  const timers = {};
  const config = {
    DEV_ID: "111111",
    DEV_IDS: ["111111"],
    DEV_CONFIGURED_IDS: ["111111"]
  };

  try {
    await run(
      api, timers, "111111", makeArgs("رد آلي"), config, {},
      {},
      { developers: ["111111"], disabledDevelopers: ["111111"] }
    );
    assert.match(api.sent.at(-1).message, /للمطورين فقط/);
    assert.equal(timers[aut.stateKey("aut-test-group")], undefined);

    await run(
      api, timers, "111111", makeArgs("رد آلي"), config, {},
      { isDeveloper: false },
      { developers: ["111111"] }
    );
    assert.match(api.sent.at(-1).message, /للمطورين فقط/);
    assert.equal(timers[aut.stateKey("aut-test-group")], undefined);
  } finally {
    aut.stopAll(timers);
  }
});

test("Aut session 2 has a separate state key and stopAll does not stop session 1", () => {
  const timers = {};
  const stopped = [];
  const key1 = aut.stateKey("same-group", "1");
  const key2 = aut.stateKey("same-group", "2");

  timers[key1] = { stop() { stopped.push("1"); } };
  timers[key2] = { stop() { stopped.push("2"); } };

  assert.notEqual(key1, key2);
  const previous = process.env.SHADOW_SESSION_ID;
  process.env.SHADOW_SESSION_ID = "2";
  try {
    assert.equal(aut.stopAll(timers), 1);
  } finally {
    if (previous === undefined) delete process.env.SHADOW_SESSION_ID;
    else process.env.SHADOW_SESSION_ID = previous;
  }

  assert.deepEqual(stopped, ["2"]);
  assert.ok(timers[key1]);
  assert.equal(timers[key2], undefined);
});

test("Aut maps unsupported session IDs to session 1", () => {
  assert.equal(aut.stateKey("same-group", "3"), aut.stateKey("same-group", "1"));
});

test("Aut uses the requested 80-second check, 4-second typing, and 16-minute idle limit", () => {
  assert.equal(aut.constants.POLL_GAP_MS, 80_000);
  assert.equal(aut.constants.TYPING_TIME_MS, 4_000);
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
