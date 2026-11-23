"use strict";

function normalizeDeveloperIds(values) {
  if (!Array.isArray(values)) {
    throw new Error("قائمة المطورين غير صالحة.");
  }

  const ids = [...new Set(
    values.map(value => String(value ?? "").trim()).filter(Boolean)
  )];

  if (ids.length > 4 || ids.some(id => !/^\d{5,25}$/.test(id))) {
    throw new Error("أدخل ID رقميًا من 5 إلى 25 رقمًا، ويمكنك ترك بقية الخانات فارغة.");
  }

  return ids;
}

module.exports = { normalizeDeveloperIds };
