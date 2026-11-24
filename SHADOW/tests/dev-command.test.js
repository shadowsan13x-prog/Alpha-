"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const devCommand = require("../../commands/dev");
const { DEVELOPER_ONLY_COMMANDS } = require("../command-access");

function context({ senderID = "111111", args = ["dev", "ls"], initial = {}, isDeveloper = true, config = {} } = {}) {
  const data = { ...initial };
  const sent = [];
  let saves = 0;
  const api = {
    sendMessage(message) {
      sent.push(String(message));
      return Promise.resolve({ messageID: `m-${sent.length}` });
    },
    getUserInfo(uid, callback) {
      queueMicrotask(() => callback(null, { [uid]: { name: `User ${uid}` } }));
    }
  };
  const cfg = {
    DEV_ID: "111111",
    DEV_IDS: ["111111", "222222"],
    ...config
  };
  const run = () => devCommand(
    api,
    { threadID: "group-1", senderID, messageID: "reply-id" },
    args,
    Date.now(),
    () => data,
    next => { Object.assign(data, next); saves++; },
    {}, cfg, {}, {}, "999999", [], [], {}, { isDeveloper }
  );
  return { run, data, sent, cfg, get saves() { return saves; } };
}

test("dev add يضيف مطوراً ويحفظه في بنية data.json الصحيحة", async () => {
  const ctx = context({ args: ["dev", "add", "333333"] });
  await ctx.run();
  assert.deepEqual(ctx.data.developers, ["333333"]);
  assert.equal(ctx.saves, 1);
  assert.match(ctx.sent[0], /تمت إضافة User 333333/);
});

test("المطور الإضافي يستطيع إضافة وحذف مطورين مثله", async () => {
  const add = context({ senderID: "222222", args: ["dev", "add", "333333"] });
  await add.run();
  assert.deepEqual(add.data.developers, ["333333"]);
  assert.equal(add.saves, 1);
  assert.match(add.sent[0], /تمت إضافة User 333333/);

  const remove = context({
    senderID: "222222",
    args: ["dev", "rm", "333333"],
    initial: { developers: ["333333"] }
  });
  await remove.run();
  assert.deepEqual(remove.data.developers, ["333333"]);
  assert.deepEqual(remove.data.disabledDevelopers, ["333333"]);
  assert.equal(remove.saves, 1);
  assert.match(remove.sent[0], /تم تعطيل User 333333/);
});

test("المطور الإضافي يستطيع عرض القائمة وتعطيل مطور إعدادات الجلسة", async () => {
  const list = context({
    senderID: "222222",
    args: ["dev", "ls"],
    initial: { developers: ["333333"] }
  });
  await list.run();
  assert.match(list.sent[0], /مطورو ALPHA/);
  assert.match(list.sent[0], /111111/);
  assert.match(list.sent[0], /333333/);

  const disable = context({
    senderID: "222222",
    args: ["dev", "rm", "111111"]
  });
  await disable.run();
  assert.deepEqual(disable.data.disabledDevelopers, ["111111"]);
  assert.equal(disable.saves, 1);
  assert.match(disable.sent[0], /تم تعطيل User 111111/);
});

test("dev add يعيد تفعيل المطور المعطّل", async () => {
  const ctx = context({
    senderID: "222222",
    args: ["dev", "add", "111111"],
    initial: { disabledDevelopers: ["111111"] }
  });
  await ctx.run();
  assert.deepEqual(ctx.data.disabledDevelopers, []);
  assert.equal(ctx.saves, 1);
  assert.match(ctx.sent[0], /إعادة تفعيل User 111111/);
});

test("لا يمكن تعطيل آخر مطور فعّال", async () => {
  const ctx = context({
    senderID: "111111",
    args: ["dev", "rm", "111111"],
    initial: { disabledDevelopers: ["222222"] }
  });
  await ctx.run();
  assert.equal(ctx.saves, 0);
  assert.match(ctx.sent[0], /آخر مطور فعّال/);
});

test("المطور المعطّل من إعدادات الجلسة يبقى ظاهرًا ويمكن إعادة تفعيله", async () => {
  const runtimeConfig = {
    DEV_ID: "222222",
    DEV_IDS: ["222222"],
    DEV_CONFIGURED_IDS: ["111111", "222222"],
    DEV_ALL_IDS: ["111111", "222222"]
  };

  const list = context({
    senderID: "222222",
    args: ["dev", "ls"],
    initial: { disabledDevelopers: ["111111"] },
    config: runtimeConfig
  });

  await list.run();

  assert.match(list.sent[0], /111111/);
  assert.match(list.sent[0], /معطّل/);
  assert.match(list.sent[0], /222222/);

  const enable = context({
    senderID: "222222",
    args: ["dev", "add", "111111"],
    initial: { disabledDevelopers: ["111111"] },
    config: runtimeConfig
  });

  await enable.run();

  assert.deepEqual(enable.data.disabledDevelopers, []);
  assert.equal(enable.saves, 1);
  assert.match(enable.sent[0], /إعادة تفعيل/);
});

test("المطور المعطّل لا يستطيع تنفيذ أمر dev حتى لو بقي في الإعدادات الكاملة", async () => {
  const ctx = context({
    senderID: "111111",
    args: ["dev", "ls"],
    initial: { disabledDevelopers: ["111111"] },
    config: {
      DEV_ID: "222222",
      DEV_IDS: ["222222"],
      DEV_CONFIGURED_IDS: ["111111", "222222"],
      DEV_ALL_IDS: ["111111", "222222"]
    }
  });

  await ctx.run();

  assert.match(ctx.sent[0], /للمطورين الفعّالين/);
  assert.equal(ctx.saves, 0);
});

test("أمر dev واختصاراته محمية حتى عند فتح الوضع العام", () => {
  for (const alias of ["dev", "devs", "dv"]) {
    assert.equal(DEVELOPER_ONLY_COMMANDS.has(alias), true);
  }
});
