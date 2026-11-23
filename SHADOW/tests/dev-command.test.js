"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const devCommand = require("../../commands/dev");
const { DEVELOPER_ONLY_COMMANDS } = require("../command-access");

function context({ senderID = "111111", args = ["dev", "ls"], initial = {}, isDeveloper = true } = {}) {
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
  const cfg = { DEV_ID: "111111", DEV_IDS: ["111111", "222222"] };
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

test("المطور الإضافي لا يستطيع إضافة أو حذف مطورين", async () => {
  const add = context({ senderID: "222222", args: ["dev", "add", "333333"] });
  await add.run();
  assert.equal(add.saves, 0);
  assert.deepEqual(add.data.developers, undefined);
  assert.match(add.sent[0], /للمالك الأساسي فقط/);

  const remove = context({ senderID: "222222", args: ["dev", "rm", "333333"], initial: { developers: ["333333"] } });
  await remove.run();
  assert.deepEqual(remove.data.developers, ["333333"]);
  assert.equal(remove.saves, 0);
  assert.match(remove.sent[0], /للمالك الأساسي فقط/);
});

test("المطور الإضافي يستطيع عرض القائمة ولا يمكن حذف المطور الأساسي", async () => {
  const list = context({ senderID: "222222", args: ["dev", "ls"], initial: { developers: ["333333"] } });
  await list.run();
  assert.match(list.sent[0], /مطورو ALPHA/);
  assert.match(list.sent[0], /111111/);
  assert.match(list.sent[0], /333333/);

  const removeOwner = context({ args: ["dev", "rm", "111111"] });
  await removeOwner.run();
  assert.equal(removeOwner.saves, 0);
  assert.match(removeOwner.sent[0], /لا يمكن حذفه/);
});

test("أمر dev واختصاراته محمية حتى عند فتح الوضع العام", () => {
  for (const alias of ["dev", "devs", "dv"]) {
    assert.equal(DEVELOPER_ONLY_COMMANDS.has(alias), true);
  }
});
