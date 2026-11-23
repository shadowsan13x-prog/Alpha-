"use strict";

// Every alias of a protected command is listed here so public mode cannot bypass it.
const DEVELOPER_ONLY_COMMANDS = new Set([
  "اسم", "الاسم", "nm",
  "كنيات", "nik", "nk",
  "محرك", "eng", "بيس", "bs",
  "setbio", "بايو", "bio", "changebio", "botbio",
  "صورة", "avatar", "changeavatar", "botavatar", "av",
  "خروج", "leave", "lv",
  "تحميل", "autodownload", "download", "dl",
  "command", "cmd",
  "فتح", "open", "فتح_عام", "op",
  "قفل", "close", "قفل_عام", "cl",
  "dev", "devs", "dv",
  "angel", "ag",
  "aut", "au",
  "التحكم", "لوحة", "تحكم", "ctl"
]);

function canExecuteCommand({ cmd, isDeveloper, publicMode }) {
  if (DEVELOPER_ONLY_COMMANDS.has(String(cmd || "").toLowerCase())) {
    return isDeveloper === true;
  }

  return isDeveloper === true || publicMode === true;
}

module.exports = { canExecuteCommand, DEVELOPER_ONLY_COMMANDS };
