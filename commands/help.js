"use strict";

// English-only command shortcuts with concise Arabic descriptions.
const sections = [
  ["🛡️ إدارة المجموعة", [
    ["nm", "تغيير اسم المجموعة"],
    ["nk", "إدارة كنيات الأعضاء"],
    ["lv", "إخراج البوت من المجموعة"],
    ["del", "حذف رسالة البوت بالرد عليها"]
  ]],
  ["🔐 إدارة الوصول", [
    ["op", "فتح استخدام البوت للجميع"],
    ["cl", "قصر استخدام البوت على المطور"],
    ["ctl", "تنفيذ أوامر التحكم للمطورين"]
  ]],
  ["🔁 أنظمة التكرار", [
    ["bs", "إرسال نص متكرر"],
    ["eng", "إدارة محرك التكرار"],
    ["ag", "إرسال نص تلقائي بفواصل زمنية للمطورين"],
    ["au", "الرد تلقائياً على الرسائل الجديدة للمطورين"]
  ]],
  ["👤 حساب البوت", [
    ["bio", "تغيير النبذة التعريفية"],
    ["av", "تغيير صورة حساب البوت"]
  ]],
  ["🧰 أدوات ALPHA", [
    ["dl", "تحميل الوسائط من الروابط المدعومة"],
    ["up", "عرض مدة تشغيل البوت"],
    ["ss", "عرض حالة تشغيل البوت"],
    ["cmd", "عرض وإدارة الأوامر"],
    ["h", "عرض قائمة المساعدة"]
  ]],
  ["👑 إدارة المطورين", [
    ["dv", "إدارة المطورين؛ الإضافة والحذف لجميع مطوري الجلسة"]
  ]]
];

module.exports = (api, event, _args, _startTime, loadData,
  _saveData, _timers, _config, _hosting, _sent, _botID,
  _builtInCommandNames = [], _customCommandNames = [], commands = {}) => {
  const data = typeof loadData === "function" ? loadData() : {};
  const prefix = String((data && data.prefix) || "!");
  const available = new Set();
  for (const [shortcut] of sections.flatMap(([, entries]) => entries)) {
    if (commands && Object.prototype.hasOwnProperty.call(commands, shortcut)) available.add(shortcut);
  }
  const output = [
    "⚛️━━━━━━━━━━ ALPHA ━━━━━━━━━━⚛️",
    "          📜 قائمة الأوامر",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "👑 Developer: KAI"
  ];

  for (const [title, entries] of sections) {
    const active = entries.filter(([shortcut]) => available.has(shortcut));
    if (!active.length) continue;
    output.push(`\n${title}`);
    for (const [shortcut, description] of active) {
      output.push(`🔹 ${prefix}${shortcut} — ${description}`);
    }
  }

  return api.sendMessage(output.join("\n"), event.threadID);
};

module.exports.aliases = ["h", "مساعدة"];
