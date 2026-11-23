"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const command = require("../../commands/جلسة");

test("جلسة يرسل صورة PNG فعلية بتصميم DARK GLASS", async () => {
  let sentMessage;
  let sentThread;

  await command(
    {
      async sendMessage(message, threadID) {
        sentMessage = message;
        sentThread = threadID;
        return { messageID: "image-test-1" };
      }
    },
    { threadID: "group-1" },
    [],
    Date.now() - 5000,
    () => ({ prefix: "!", botGroups: [{ id: "g1" }] }),
    () => {},
    {},
    { BOT_NAME: "ALPHA", DEV_NAME: "KAI" },
    {},
    {},
    "bot-id",
    ["help", "dev"],
    ["custom"]
  );

  assert.equal(sentThread, "group-1");
  assert.ok(sentMessage && typeof sentMessage === "object");
  assert.ok(Buffer.isBuffer(sentMessage.attachment));

  assert.deepEqual(
    [...sentMessage.attachment.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10]
  );

  assert.ok(sentMessage.attachment.length > 1000);
});

test("مولّد الواجهة يضمّن بيانات الجلسة ويهرب النصوص", () => {
  const svg = command.buildSessionSvg({
    uptime: "1h 2m",
    rss: "100 MB",
    commands: 20,
    groups: 5,
    botName: "ALPHA <BOT>",
    developer: "KAI",
    node: "v24",
    platform: "linux x64",
    session: "1",
    port: "3000",
    prefix: "!",
    customCommands: 3,
    heapUsed: "20 MB",
    heapTotal: "50 MB",
    freeMemory: "1 GB"
  });

  assert.match(svg, /Session Overview/);
  assert.match(svg, /Memory Monitor/);
  assert.match(svg, /ALPHA &lt;BOT&gt;/);
  assert.match(svg, /DARK GLASS|SESSION DETAILS/);
  assert.match(svg, /#151a20/);
});
