"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const control = require("../../commands/التحكم");
const aut = require("../../commands/aut");
const guard = require("../thread-info-guard");

test("التحكم ينفّذ Aut في المحادثة المختارة ويحافظ على صلاحية المطور", async () => {
  const originalGetThreadListSafe = guard.getThreadListSafe;
  const sent = [];
  const api = {
    sendMessage(message, threadID, callback, replyToMessageID) {
      sent.push({ message: String(message), threadID: String(threadID), replyToMessageID });
      if (typeof callback === "function") {
        queueMicrotask(() => callback(null, { messageID: `bot-${sent.length}` }));
      }
    },
    getThreadHistory(_threadID, _limit, _timestamp, callback) {
      callback(null, []);
    },
    sendTypingIndicator() {},
    removeUserFromGroup: async () => {}
  };
  const timers = {};
  const config = { DEV_ID: "primary-owner", DEV_IDS: ["primary-owner"] };
  const loadData = () => ({ prefix: "!", developers: ["stored-developer"] });
  const event = {
    threadID: "control-origin",
    messageID: "control-message-id",
    senderID: "stored-developer"
  };
  const makeArgs = rawText => {
    const args = ["التحكم"];
    args.rawText = rawText;
    return args;
  };

  guard.getThreadListSafe = async (_api, _limit, _timestamp, folders) =>
    folders?.includes("INBOX")
      ? [{ threadID: "selected-target-group", name: "مجموعة اختبار", isGroup: true }]
      : [];

  try {
    await control(api, event, makeArgs(""), Date.now(), loadData, () => {}, timers, config, {}, {}, "bot-id", [], [], {});
    await control(api, event, makeArgs("1"), Date.now(), loadData, () => {}, timers, config, {}, {}, "bot-id", [], [], {});
    await control(api, event, makeArgs("تنفيذ aut رد من التحكم"), Date.now(), loadData, () => {}, timers, config, {}, {}, "bot-id", [], [], { aut });

    const job = timers[aut.stateKey("selected-target-group")];
    assert.ok(job, "يجب تشغيل Aut داخل المجموعة المختارة");
    assert.equal(job.text, "رد من التحكم");
    assert.equal(job.botID, "bot-id");
    assert.equal(job.threadID, "selected-target-group");
    assert.ok(sent.some(item => item.threadID === "selected-target-group" && /Aut يعمل الآن/.test(item.message)));
    assert.ok(sent.some(item => item.threadID === "control-origin" && /تم تمرير الأمر "aut"/.test(item.message)));
  } finally {
    aut.stopAll(timers);
    guard.getThreadListSafe = originalGetThreadListSafe;
  }
});
