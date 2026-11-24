"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "axios") return { get: async () => ({ data: null }), post: async () => ({ data: null }) };
  return originalLoad.call(this, request, parent, isMain);
};
let command;
try {
  command = require("../../commands/كنيات");
} finally {
  Module._load = originalLoad;
}

test("حماية الكنيات الجماعية تستثني كل المطورين والبوت", () => {
  const skipped = command.getSkipped({ DEV_ID: "111111", DEV_IDS: ["111111", "222222"] }, "999999");
  assert.equal(skipped.has("111111"), true);
  assert.equal(skipped.has("222222"), true);
  assert.equal(skipped.has("999999"), true);
  assert.equal(skipped.has("333333"), false);
});

test("استثناء المطورين المضافين من قائمة الجلسة", () => {
  const skipped = command.getSkipped(
    { DEV_IDS: ["111111"], DEV_ID: "111111" },
    "999999",
    { developers: ["222222", "333333"] }
  );

  assert.equal(skipped.has("111111"), true);
  assert.equal(skipped.has("222222"), true);
  assert.equal(skipped.has("333333"), true);
  assert.equal(skipped.has("999999"), true);
});

test("عدم استثناء المطور المعطّل من القائمة المخزنة وحدها", () => {
  const skipped = command.getSkipped(
    { DEV_IDS: ["111111"] },
    "999999",
    {
      developers: ["111111", "222222"],
      disabledDevelopers: ["222222"]
    }
  );

  assert.equal(skipped.has("111111"), true);
  assert.equal(skipped.has("222222"), false);
  assert.equal(skipped.has("999999"), true);
});
