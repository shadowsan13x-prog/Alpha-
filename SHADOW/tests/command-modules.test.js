"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const commands = require("../command-modules");

test("autoreply saves developer-selected candidates and toggles per chat", async () => {
  let data = { autoReplyMessages: [], autoReplyEnabled: {} };
  const sent = [];
  const api = { sendMessage(message, threadID) { sent.push({ message, threadID }); } };
  const event = { threadID: "chat-1" };
  const save = next => { data = next; };

  await commands.autoreply(api, event, Object.assign(["autoreply", "Hello", "|", "Welcome"], { rawText: "Hello | Welcome" }), 0, () => data, save, {}, {}, null, null, null, [], [], {}, { isDeveloper: true });
  assert.deepEqual(data.autoReplyMessages, ["Hello", "Welcome"]);

  await commands.autoreply(api, event, ["autoreply", "on"], 0, () => data, save, {}, {}, null, null, null, [], [], {}, { isDeveloper: true });
  assert.equal(data.autoReplyEnabled["chat-1"], true);

  await commands.autoreply(api, event, ["autoreply", "off"], 0, () => data, save, {}, {}, null, null, null, [], [], {}, { isDeveloper: true });
  assert.equal(data.autoReplyEnabled["chat-1"], false);
  assert.equal(sent.length, 3);
});

test("autoreply does not let a non-developer change configured reply texts", async () => {
  const data = { autoReplyMessages: ["Keep this"], autoReplyEnabled: {} };
  const sent = [];
  const api = { sendMessage(message, threadID) { sent.push({ message, threadID }); } };
  await commands.autoreply(api, { threadID: "chat-2" }, ["autoreply", "Replace this"], 0, () => data, () => {}, {}, {}, null, null, null, [], [], {}, { isDeveloper: false });
  assert.deepEqual(data.autoReplyMessages, ["Keep this"]);
  assert.match(sent[0].message, /Only the developer/);
});

test("angel starts immediately and can be stopped without a repeat-count limit", async () => {
  const sent = [];
  const timers = {};
  const api = { async sendMessage(message, threadID) { sent.push({ message, threadID }); } };
  const event = { threadID: "chat-3" };
  await commands.angel(api, event, Object.assign(["angel", "Hello", "1ث", "1ث"], { rawText: "Hello 1ث 1ث" }), 0, () => ({}), () => {}, timers);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message, "Hello");
  assert.ok(timers["angel:chat-3"]);
  await commands.angel(api, event, ["angel", "off"], 0, () => ({}), () => {}, timers);
  assert.equal(timers["angel:chat-3"], undefined);
});
