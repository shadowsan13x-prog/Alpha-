"use strict";

const $ = id => document.getElementById(id);

const state = {
  sessions: [],
  selected: "1",
  view: "home",
  busy: false,
  commands: {}
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 2800);
}

function showApp(loggedIn) {
  $("loginView").classList.toggle("hidden", loggedIn);
  $("appView").classList.toggle("hidden", !loggedIn);

  if (!loggedIn) {
    $("dock").classList.add("hidden");
  } else {
    showView(state.view);
  }
}

function showView(view) {
  state.view = view;

  const home = view === "home";

  $("homeView").classList.toggle("hidden", !home);
  $("sessionView").classList.toggle("hidden", home);

  $("dock").classList.toggle(
    "hidden",
    home || $("appView").classList.contains("hidden")
  );

  if (!home) {
    $("sessionTitle").textContent =
      selectedSession()?.name || `ALPHA-0${state.selected}`;
  }
}

function fmtUptime(seconds) {
  seconds = Math.max(0, Number(seconds) || 0);

  const d = Math.floor(seconds / 86400);
  const h = Math.floor(seconds % 86400 / 3600);
  const m = Math.floor(seconds % 3600 / 60);

  return d
    ? `${d} يوم ${h} ساعة`
    : `${h} ساعة ${m} دقيقة`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function selectedSession() {
  return state.sessions.find(
    s => String(s.id) === state.selected
  );
}

function renderSessions() {
  $("sessionsGrid").innerHTML = state.sessions.map(s => `
    <article class="session-card">
      <div class="session-head">
        <h3>${esc(s.name)}</h3>
        <span class="status ${s.running ? "on" : ""}">
          ${s.running ? "● تعمل" : "○ متوقفة"}
        </span>
      </div>

      <p class="muted">
        الحساب:
        ${s.appStateReady ? "بيانات الدخول جاهزة" : "لم يتم تجهيز بيانات الدخول"}
      </p>

      <div class="session-stats">
        <div>
          <strong>${Number(s.stats?.messages || 0)}</strong>
          <small>رسائل</small>
        </div>
        <div>
          <strong>${Number(s.stats?.commands || 0)}</strong>
          <small>أوامر</small>
        </div>
        <div>
          <strong>${Number(s.stats?.groups || 0)}</strong>
          <small>مجموعات</small>
        </div>
      </div>

      <div class="session-meta">
        <span>البادئة: <b>${esc(s.prefix || "!")}</b></span>
        <span>أوامر مخصصة: <b>${Number(s.customCommandCount || 0)}</b></span>
      </div>

      <div class="session-actions">
        <button class="primary" data-action="select" data-id="${esc(s.id)}">
          فتح الجلسة ↗
        </button>
        <button data-action="start" data-id="${esc(s.id)}" ${s.running ? "disabled" : ""}>
          تشغيل
        </button>
        <button data-action="stop" data-id="${esc(s.id)}" ${!s.running ? "disabled" : ""}>
          إيقاف
        </button>
      </div>
    </article>
  `).join("");

  $("activeCount").textContent =
    state.sessions.filter(s => s.running).length;

  $("messageCount").textContent =
    state.sessions.reduce((n, s) => n + Number(s.stats?.messages || 0), 0);

  $("commandCount").textContent =
    state.sessions.reduce((n, s) => n + Number(s.stats?.commands || 0), 0);
}

function renderSelected() {
  const s = selectedSession();

  if (!s) return;

  const c = s.config || {};

  $("selectedLabel").textContent = s.name;
  $("sessionTitle").textContent = s.name;

  $("sessionRunState").textContent =
    s.running ? "الجلسة تعمل" : "الجلسة متوقفة";

  $("sessionOverview").innerHTML = [
    ["اسم الجلسة", s.name],
    ["الحالة", s.running ? "تعمل" : "متوقفة"],
    ["معرّف العملية", s.pid || "—"],
    ["ملف الدخول", s.appStateReady ? "جاهز" : "غير موجود"],
    ["المجموعات", s.stats?.groups || 0],
    ["المستخدمون", s.stats?.users || 0],
    ["البادئة", s.prefix || "!"],
    ["الأوامر المخصصة", s.customCommandCount || 0]
  ].map(([k, v]) => `
    <div>
      <small>${esc(k)}</small>
      <strong>${esc(v)}</strong>
    </div>
  `).join("");

  document.querySelectorAll(".dev-id").forEach((input, i) => {
    input.value = c.DEV_IDS?.[i] || "";
  });

  $("botName").value = c.BOT_NAME || "";
  $("botNick").value = c.BOT_NICK || "";
  $("devName").value = c.DEV_NAME || "";
  $("devNick").value = c.DEV_NICK || "";

  $("botGuard").checked = c.NICK_GUARD_ENABLED !== false;
  $("devGuard").checked = c.DEV_NICK_GUARD_ENABLED !== false;

  $("prefixInput").value = s.prefix || "!";
  $("freePrefix").checked = s.freePrefix === true;

  $("appStateStatus").textContent = s.appStateReady
    ? "بيانات appState جاهزة لهذه الجلسة"
    : "لا توجد بيانات appState صالحة لهذه الجلسة";

  document.querySelectorAll("[data-session-action]").forEach(b => {
    const a = b.dataset.sessionAction;

    b.disabled =
      (a === "start" && s.running) ||
      (a === "stop" && !s.running);
  });
}

async function refresh() {
  const data = await api("/api/state");

  state.sessions = data.sessions || [];

  $("panelUptime").textContent =
    fmtUptime(data.system?.uptime);

  renderSessions();
  renderSelected();
}

function activateTab(name) {
  document.querySelectorAll(".tab").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === name);
  });

  document.querySelectorAll(".tab-content").forEach(p => {
    p.classList.toggle("active", p.id === `tab-${name}`);
  });

  document.querySelectorAll(".dock-item").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === name);
  });

  if (name === "logs") loadLogs();
  if (name === "custom") loadCommands();
}

async function selectSession(id) {
  state.selected = String(id);

  renderSelected();
  showView("session");
  activateTab("general");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

async function saveConfig(config) {
  await api(`/api/session/${state.selected}/config`, {
    method: "PUT",
    body: JSON.stringify(config)
  });

  await refresh();
}

async function loadCommands() {
  try {
    const data = await api(
      `/api/session/${state.selected}/custom-commands`
    );

    state.commands = data.commands || {};
    renderCommands();
  } catch (err) {
    toast(err.message);
  }
}

function renderCommands() {
  const entries = Object.entries(state.commands);

  $("customCommandsList").innerHTML = entries.length
    ? entries.map(([name, command]) => `
      <article class="command-item">
        <div>
          <strong>${esc(name)}</strong>
          <small>${command.code ? "JavaScript" : "رد نصي"}</small>
          <span>${command.enabled === false ? "معطل" : "مفعل"}</span>
        </div>
        <div class="command-actions">
          <button data-command-edit="${esc(name)}">تعديل</button>
          <button data-command-delete="${esc(name)}">حذف</button>
        </div>
      </article>
    `).join("")
    : '<p class="muted">لا توجد أوامر مخصصة حتى الآن.</p>';
}

function clearCommandForm() {
  $("customCommandForm").reset();
  $("customCommandName").disabled = false;
  $("customCommandForm").querySelector('[type="submit"]').textContent = "إضافة الأمر";
}

function editCommand(name) {
  const command = state.commands[name];
  if (!command) return;

  $("customCommandName").value = name;
  $("customCommandName").disabled = true;
  $("customCommandReply").value = command.reply || "";
  $("customCommandCode").value = command.code || "";
  $("customCommandEnabled").checked = command.enabled !== false;
  $("customCommandForm").querySelector('[type="submit"]').textContent = "حفظ التعديلات";

  $("customCommandForm").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

async function deleteCommand(name) {
  if (!confirm(`هل تريد حذف الأمر ${name}؟`)) return;

  try {
    await api(
      `/api/session/${state.selected}/custom-commands/${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );

    toast("تم حذف الأمر");
    await loadCommands();
    await refresh();
  } catch (err) {
    toast(err.message);
  }
}

async function loadLogs() {
  try {
    const data = await api(
      `/api/session/${state.selected}/logs`
    );

    const logs = data.logs || [];

    $("logsBox").innerHTML = logs.length
      ? logs.map(item => `
        <div class="log-line">
          <time>${esc(item.time || "")}</time>
          <span>${esc(item.line || "")}</span>
        </div>
      `).join("")
      : '<p class="muted">لا توجد سجلات متاحة.</p>';

    $("logsBox").scrollTop = $("logsBox").scrollHeight;
  } catch (err) {
    $("logsBox").textContent = err.message;
  }
}

async function sessionAction(action, id = state.selected) {
  try {
    await api(`/api/session/${id}/${action}`, {
      method: "POST"
    });

    toast(action === "start" ? "تم طلب تشغيل الجلسة" : "تم طلب إيقاف الجلسة");

    await refresh();
  } catch (err) {
    toast(err.message);
  }
}

async function login(password) {
  await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });

  state.view = "home";
  showApp(true);
  await refresh();

  toast("تم تسجيل الدخول");
}

async function logout() {
  try {
    await api("/api/logout", {
      method: "POST"
    });

    state.sessions = [];
    state.view = "home";
    showApp(false);
    toast("تم تسجيل الخروج");
  } catch (err) {
    toast(err.message);
  }
}

async function saveAppStateText() {
  const value = $("appstateText").value.trim();

  if (!value) {
    toast("أدخل بيانات appState أولاً");
    return;
  }

  try {
    await api(`/api/session/${state.selected}/appstate-text`, {
      method: "POST",
      body: JSON.stringify({ content: value })
    });

    $("appstateText").value = "";
    toast("تم حفظ بيانات الدخول");
    await refresh();
  } catch (err) {
    toast(err.message);
  }
}

async function uploadAppState(file) {
  if (!file) return;

  const form = new FormData();
  form.append("appstate", file);

  try {
    await api(`/api/session/${state.selected}/appstate`, {
      method: "POST",
      body: form
    });

    toast("تم رفع ملف الدخول");
    await refresh();
  } catch (err) {
    toast(err.message);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();

    try {
      await login($("password").value);
      $("password").value = "";
    } catch (err) {
      toast(err.message);
    }
  });

  $("logoutBtn")?.addEventListener("click", logout);

  $("backHome").addEventListener("click", () => {
    showView("home");
    refresh().catch(err => toast(err.message));
  });

  $("sessionsGrid").addEventListener("click", async e => {
    const button = e.target.closest("[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;

    if (action === "select") {
      await selectSession(id);
      return;
    }

    await sessionAction(action, id);
  });


  document.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tab);
    });
  });

  $("developerForm").addEventListener("submit", async e => {
    e.preventDefault();

    const ids = [...document.querySelectorAll(".dev-id")]
      .map(input => input.value.trim())
      .filter(Boolean);

    try {
      await saveConfig({ DEV_IDS: ids });
      toast("تم حفظ المطورين");
    } catch (err) {
      toast(err.message);
    }
  });

  $("identityForm").addEventListener("submit", async e => {
    e.preventDefault();

    const config = {
      BOT_NAME: $("botName").value.trim(),
      BOT_NICK: $("botNick").value.trim(),
      DEV_NAME: $("devName").value.trim(),
      DEV_NICK: $("devNick").value.trim(),
      NICK_GUARD_ENABLED: $("botGuard").checked,
      DEV_NICK_GUARD_ENABLED: $("devGuard").checked
    };

    try {
      await saveConfig(config);
      toast("تم حفظ إعدادات الأسماء");
    } catch (err) {
      toast(err.message);
    }
  });

  $("prefixForm").addEventListener("submit", async e => {
    e.preventDefault();

    try {
      await api(`/api/session/${state.selected}/prefix`, {
        method: "PUT",
        body: JSON.stringify({
          prefix: $("prefixInput").value,
          freePrefix: $("freePrefix").checked
        })
      });

      await refresh();
      toast("تم حفظ البادئة");
    } catch (err) {
      toast(err.message);
    }
  });

  $("customCommandForm").addEventListener("submit", async e => {
    e.preventDefault();

    const name = $("customCommandName").value.trim();
    const reply = $("customCommandReply").value;
    const code = $("customCommandCode").value;

    if (!name || (!reply.trim() && !code.trim()) ||
        (reply.trim() && code.trim())) {
      toast("أدخل الاسم ونوعًا واحدًا فقط: رد أو كود");
      return;
    }

    try {
      await api(
        `/api/session/${state.selected}/custom-commands/${encodeURIComponent(name)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            reply,
            code,
            enabled: $("customCommandEnabled").checked
          })
        }
      );

      clearCommandForm();
      await loadCommands();
      await refresh();
      toast("تم حفظ الأمر");
    } catch (err) {
      toast(err.message);
    }
  });

  $("customCommandsList").addEventListener("click", async e => {
    const edit = e.target.closest("[data-command-edit]");
    const remove = e.target.closest("[data-command-delete]");

    if (edit) editCommand(edit.dataset.commandEdit);
    if (remove) await deleteCommand(remove.dataset.commandDelete);
  });

  $("clearCommandForm").addEventListener("click", clearCommandForm);

  $("appstateTextForm").addEventListener("submit", async e => {
    e.preventDefault();
    await saveAppStateText();
  });

  $("uploadForm").addEventListener("submit", async e => {
    e.preventDefault();
    await uploadAppState($("appstateFile").files[0]);
  });

  $("logsRefresh").addEventListener("click", loadLogs);


  try {
    const data = await api("/api/state");

    if (data.authenticated === false || data.loggedIn === false) {
      showApp(false);
      return;
    }

    showApp(true);
    await refresh();
  } catch {
    showApp(false);
  }

  setInterval(() => {
    if (!$("appView").classList.contains("hidden")) {
      refresh().catch(() => {});
    }
  }, 12000);
});
