"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function getSessionId(value = process.env.SHADOW_SESSION_ID || "1") {
  const id = String(value);
  return id === "1" || id === "2" ? id : "1";
}

function getLockDirectory() {
  const root = process.env.SHADOW_REPEAT_LOCK_DIR ||
    path.join(
      path.resolve(process.env.SHADOW_DATA_DIR || path.resolve(__dirname, "..")),
      ".repeat-locks"
    );
  return path.resolve(root);
}

function getLockPath(threadID, directory = getLockDirectory(), sessionId = getSessionId()) {
  const id = String(threadID || "").trim();
  if (!id || id.length > 256) throw new Error("معرف المجموعة غير صالح");

  const key = crypto.createHash("sha256")
    .update(getSessionId(sessionId) + ":" + id)
    .digest("hex");

  return path.join(directory, `${key}.lock`);
}

// Used only to recognize lock files created by the older coordinator.
function getLegacyLockPath(threadID, directory = getLockDirectory()) {
  const id = String(threadID || "").trim();
  if (!id || id.length > 256) throw new Error("معرف المجموعة غير صالح");
  const key = crypto.createHash("sha256").update(id).digest("hex");
  return path.join(directory, `${key}.lock`);
}

function processIsAlive(pid) {
  const value = Number(pid);
  if (!Number.isSafeInteger(value) || value <= 0) return false;

  try {
    process.kill(value, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function readLock(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

// Move the candidate atomically, then verify the moved record before deleting it.
// If it is live or changed during the operation, attempt to restore it.
function cleanStaleLock(file) {
  let before;
  let current;

  try {
    before = fs.statSync(file);
    current = readLock(file);
  } catch (error) {
    return error && error.code === "ENOENT";
  }

  if (!current || processIsAlive(current.pid)) return false;

  const quarantine = `${file}.stale-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;

  try {
    fs.renameSync(file, quarantine);
  } catch (error) {
    return Boolean(error && error.code === "ENOENT");
  }

  const moved = readLock(quarantine);
  let movedStat;

  try {
    movedStat = fs.statSync(quarantine);
  } catch {
    return false;
  }

  const sameFile = movedStat.dev === before.dev && movedStat.ino === before.ino;
  const sameRecord = moved &&
    moved.token === current.token &&
    Number(moved.pid) === Number(current.pid);

  if (sameFile && sameRecord && !processIsAlive(moved.pid)) {
    try {
      fs.unlinkSync(quarantine);
      return true;
    } catch {
      return false;
    }
  }

  // Do not discard a lock that may belong to a live process.
  try {
    fs.linkSync(quarantine, file);
    fs.unlinkSync(quarantine);
  } catch {
    // Keep the quarantined file rather than deleting an uncertain lock.
  }

  return false;
}

function acquireRepeatLock(threadID, kind) {
  const directory = getLockDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(directory, 0o700); } catch {}

  const sessionId = getSessionId();
  const file = getLockPath(threadID, directory, sessionId);
  const legacyFile = getLegacyLockPath(threadID, directory);

  const record = {
    token: crypto.randomBytes(18).toString("hex"),
    pid: process.pid,
    sessionId,
    kind: String(kind || "repeat"),
    createdAt: new Date().toISOString()
  };

  // A stale legacy lock is cleaned automatically. A live legacy lock from
  // this same session is respected until its owner releases it.
  if (legacyFile !== file && fs.existsSync(legacyFile)) {
    const legacy = readLock(legacyFile);

    if (legacy && String(legacy.sessionId || "1") === sessionId) {
      if (processIsAlive(legacy.pid)) {
        return { acquired: false, current: legacy, legacy: true };
      }
      cleanStaleLock(legacyFile);
    }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    let descriptor;

    try {
      descriptor = fs.openSync(file, "wx", 0o600);
      fs.writeFileSync(descriptor, JSON.stringify(record));
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      return { acquired: true, lock: record, path: file };
    } catch (error) {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); } catch {}
      }

      if (error.code !== "EEXIST") throw error;

      const current = readLock(file);
      if (current && processIsAlive(current.pid)) {
        return { acquired: false, current };
      }

      if (!cleanStaleLock(file)) {
        return { acquired: false, current, stale: true };
      }
    }
  }

  return { acquired: false, current: readLock(file) };
}

function releaseRepeatLock(threadID, lock) {
  if (!lock || !lock.token) return false;

  let file;
  try {
    file = getLockPath(threadID, getLockDirectory(), lock.sessionId || getSessionId());
  } catch {
    return false;
  }

  const current = readLock(file);
  if (
    !current ||
    current.token !== lock.token ||
    Number(current.pid) !== process.pid
  ) {
    return false;
  }

  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getSessionId,
  getLockDirectory,
  getLockPath,
  getLegacyLockPath,
  acquireRepeatLock,
  releaseRepeatLock,
  processIsAlive,
  cleanStaleLock
};
