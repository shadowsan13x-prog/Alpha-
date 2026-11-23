"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDeveloperIds } = require("../developer-ids");

test("يقبل ID واحدًا فقط", () => {
  assert.deepEqual(normalizeDeveloperIds(["123456"]), ["123456"]);
});

test("يقبل ترك بقية الخانات فارغة", () => {
  assert.deepEqual(normalizeDeveloperIds(["123456", "", "  ", ""]), ["123456"]);
});

test("يقبل أربعة IDs كحد أقصى", () => {
  assert.equal(normalizeDeveloperIds([
    "123456", "234567", "345678", "456789"
  ]).length, 4);
});

test("يرفض أكثر من أربعة IDs", () => {
  assert.throws(() => normalizeDeveloperIds([
    "123456", "234567", "345678", "456789", "567890"
  ]));
});

test("يرفض ID غير رقمي أو أقصر من المطلوب", () => {
  assert.throws(() => normalizeDeveloperIds(["abc123"]));
  assert.throws(() => normalizeDeveloperIds(["123"]));
});

test("يزيل التكرار", () => {
  assert.deepEqual(
    normalizeDeveloperIds(["123456", "123456"]),
    ["123456"]
  );
});
