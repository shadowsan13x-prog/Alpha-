"use strict";

const TYPING_TIME_MS = 4000;

async function repeatTyping(api, threadID) {
  if (typeof api?.sendTypingIndicator === "function") {
    try {
      const result = api.sendTypingIndicator(String(threadID), true, {
        duration: TYPING_TIME_MS,
        autoStop: true
      });
      if (result && typeof result.then === "function") await result;
    } catch (error) {
      console.log("[ALPHA REPEAT TYPING]", error?.message || error);
    }
  }

  await new Promise(resolve => setTimeout(resolve, TYPING_TIME_MS));

  if (typeof api?.sendTypingIndicator === "function") {
    try {
      const result = api.sendTypingIndicator(String(threadID), false);
      if (result && typeof result.then === "function") await result;
    } catch {}
  }
}

module.exports = { repeatTyping, TYPING_TIME_MS };
