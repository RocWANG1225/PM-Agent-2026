async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (res.status === 401) {
    window.location.href = "/login.html";
    return data;
  }
  if (!res.ok) throw new Error(data.message || "请求失败");
  return data;
}

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (res.status === 401) {
    window.location.href = "/login.html";
    return data;
  }
  if (!res.ok) throw new Error(data.message || "请求失败");
  return data;
}

async function loadCurrentUser() {
  const data = await getJson("/api/me");
  const currentUser = document.getElementById("currentUser");
  if (currentUser && data.username) currentUser.textContent = `已登录：${data.username}`;
}

async function logout() {
  await postJson("/api/logout", {});
  window.location.href = "/login.html";
}

const WEEKLY_RULES_STORAGE_KEY = "pmAgent.weeklyRules.saved.v2";
const MODULE_ORDER_STORAGE_KEY = "pmAgent.moduleOrder.v1";
const DEFAULT_MODULE_ORDER = ["weekly", "feishu-weekly", "automation", "ones", "logs"];

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function savedModuleOrder() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MODULE_ORDER_STORAGE_KEY) || "[]");
    const valid = parsed.filter((id) => DEFAULT_MODULE_ORDER.includes(id));
    return [...valid, ...DEFAULT_MODULE_ORDER.filter((id) => !valid.includes(id))];
  } catch {
    return DEFAULT_MODULE_ORDER;
  }
}

function saveModuleOrder(order) {
  localStorage.setItem(MODULE_ORDER_STORAGE_KEY, JSON.stringify(order));
}

function applyModuleOrder(order) {
  const nav = document.getElementById("moduleNav");
  const main = document.querySelector("main");
  for (const id of order) {
    const navItem = nav?.querySelector(`[data-module-id="${id}"]`);
    const section = document.getElementById(id);
    if (navItem) nav.appendChild(navItem);
    if (section) main.appendChild(section);
  }
}

function activeModuleId() {
  const hashId = window.location.hash.slice(1);
  if (DEFAULT_MODULE_ORDER.includes(hashId)) return hashId;
  return document.querySelector("nav a.active")?.getAttribute("href")?.slice(1) || DEFAULT_MODULE_ORDER[0];
}

function showModule(id) {
  const nextId = DEFAULT_MODULE_ORDER.includes(id) ? id : DEFAULT_MODULE_ORDER[0];
  document.querySelectorAll("nav a").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${nextId}`);
  });
  DEFAULT_MODULE_ORDER.forEach((moduleId) => {
    const section = document.getElementById(moduleId);
    if (section) section.hidden = moduleId !== nextId;
  });
}

function currentModuleOrder() {
  return [...document.querySelectorAll(".module-nav-item")]
    .map((item) => item.dataset.moduleId)
    .filter(Boolean);
}

function saveCurrentModuleOrder() {
  const id = activeModuleId();
  const order = currentModuleOrder();
  saveModuleOrder(order);
  applyModuleOrder(order);
  showModule(id);
}

function initModuleOrdering() {
  const nav = document.getElementById("moduleNav");
  let draggedItem = null;
  let activePointerId = null;

  function startDrag(item) {
    draggedItem = item;
    draggedItem?.classList.add("is-dragging");
  }

  function moveDraggedItem(clientY) {
    if (!nav || !draggedItem) return;
    const targetItem = [...nav.querySelectorAll(".module-nav-item:not(.is-dragging)")]
      .find((item) => {
        const rect = item.getBoundingClientRect();
        return clientY < rect.top + rect.height / 2;
      });
    nav.insertBefore(draggedItem, targetItem || null);
  }

  function finishDrag() {
    if (!draggedItem) return;
    draggedItem.classList.remove("is-dragging");
    draggedItem = null;
    activePointerId = null;
    saveCurrentModuleOrder();
  }

  applyModuleOrder(savedModuleOrder());

  nav?.querySelectorAll(".drag-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const item = handle.closest(".module-nav-item");
      if (!item) return;
      startDrag(item);
      activePointerId = event.pointerId;
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener("pointerup", (event) => {
      if (event.pointerId !== activePointerId) return;
      handle.releasePointerCapture(event.pointerId);
      finishDrag();
    });

    handle.addEventListener("pointercancel", finishDrag);

    handle.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || draggedItem) return;
      const item = handle.closest(".module-nav-item");
      if (!item) return;
      startDrag(item);
      event.preventDefault();
    });

    handle.addEventListener("dragstart", (event) => {
      const item = handle.closest(".module-nav-item");
      if (!item) return;
      startDrag(item);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedItem.dataset.moduleId || "");
    });

    handle.addEventListener("dragend", () => {
      finishDrag();
    });
  });

  nav?.addEventListener("dragover", (event) => {
    if (!draggedItem) return;
    const targetItem = event.target.closest(".module-nav-item");
    if (!targetItem || targetItem === draggedItem || targetItem.parentElement !== nav) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    moveDraggedItem(event.clientY);
  });

  nav?.addEventListener("drop", (event) => {
    if (!draggedItem) return;
    event.preventDefault();
    saveCurrentModuleOrder();
  });

  document.addEventListener("pointermove", (event) => {
    if (!draggedItem || event.pointerId !== activePointerId) return;
    event.preventDefault();
    moveDraggedItem(event.clientY);
  });

  document.addEventListener("pointerup", (event) => {
    if (!draggedItem || event.pointerId !== activePointerId) return;
    finishDrag();
  });

  document.addEventListener("mousemove", (event) => {
    if (!draggedItem || activePointerId !== null) return;
    event.preventDefault();
    moveDraggedItem(event.clientY);
  });

  document.addEventListener("mouseup", () => {
    if (!draggedItem || activePointerId !== null) return;
    finishDrag();
  });
}

function initModuleNavigation() {
  document.querySelectorAll("nav a").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const id = link.getAttribute("href")?.slice(1);
      if (!id) return;
      window.history.replaceState(null, "", `#${id}`);
      showModule(id);
    });
  });
  window.addEventListener("hashchange", () => showModule(activeModuleId()));
  showModule(activeModuleId());
}

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function weekdayIndex(name, fallback) {
  const values = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  return values[name] || fallback;
}

function weeklyRangeFromRules(rules, today = new Date()) {
  const current = new Date(today);
  current.setHours(12, 0, 0, 0);
  const day = current.getDay() || 7;
  const startWeekday = weekdayIndex((rules.match(/开始日期[^。]*上一个周([一二三四五六日天])/) || [])[1], 5);
  const endWeekday = weekdayIndex((rules.match(/截止日期[^。]*本周([一二三四五六日天])/) || [])[1], 4);
  const endDate = new Date(current);
  endDate.setDate(current.getDate() + (endWeekday - day));
  const startDate = new Date(current);
  startDate.setDate(current.getDate() + (startWeekday - day) - 7);
  return {
    start: formatDateInput(startDate),
    end: formatDateInput(endDate)
  };
}

function getWeeklyRulesElements() {
  const form = document.getElementById("weeklyForm");
  return {
    form,
    rulesInput: form?.elements.weeklyRules,
    status: document.getElementById("weeklyRulesStatus")
  };
}

function savedWeeklyRules() {
  const { rulesInput } = getWeeklyRulesElements();
  return localStorage.getItem(WEEKLY_RULES_STORAGE_KEY) || rulesInput?.defaultValue || "";
}

function updateWeeklyRulesStatus() {
  const { rulesInput, status } = getWeeklyRulesElements();
  if (!rulesInput || !status) return;
  status.textContent = rulesInput.value === savedWeeklyRules()
    ? "当前使用已保存规则。"
    : "规则已修改，保存后才会用于生成周报。";
}

function applyWeeklyDateDefaults(options = {}) {
  const { form } = getWeeklyRulesElements();
  if (!form) return;
  const range = weeklyRangeFromRules(savedWeeklyRules());
  if (options.force || !form.elements.startDate.value) form.elements.startDate.value = range.start;
  if (options.force || !form.elements.endDate.value) form.elements.endDate.value = range.end;
}

function initWeeklyRules() {
  const { rulesInput } = getWeeklyRulesElements();
  if (!rulesInput) return;
  if (!localStorage.getItem(WEEKLY_RULES_STORAGE_KEY)) {
    localStorage.setItem(WEEKLY_RULES_STORAGE_KEY, rulesInput.value);
  }
  rulesInput.value = savedWeeklyRules();
  rulesInput.addEventListener("input", updateWeeklyRulesStatus);
  updateWeeklyRulesStatus();
  applyWeeklyDateDefaults({ force: true });
}

function saveWeeklyRules() {
  const { rulesInput, status } = getWeeklyRulesElements();
  if (!rulesInput) return;
  localStorage.setItem(WEEKLY_RULES_STORAGE_KEY, rulesInput.value.trim());
  applyWeeklyDateDefaults({ force: true });
  if (status) status.textContent = "已保存，生成周报将按此规则执行。";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsText(file);
  });
}

async function weeklyFormData(form) {
  const values = formData(form);
  const file = form.elements.sourceFile.files[0];
  delete values.sourceFile;
  values.weeklyRules = savedWeeklyRules();
  if (file) {
    values.sourceName = file.name;
    values.sourceBase64 = await fileToBase64(file);
  }
  return values;
}

function renderTable(data) {
  if (!data.ok) return `<p>${data.message}</p>`;
  const rows = data.suggestions.map((item) => `
    <tr>
      <td>${escapeHtml(item.id)}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${escapeHtml(item.priority || "")}</td>
      <td>${escapeHtml(item.status || "")}</td>
      <td>${escapeHtml(item.testDate || "")}</td>
    </tr>
  `).join("");
  return `
    <p>当前迭代：${escapeHtml(data.currentSprint)}；目标迭代：${escapeHtml(data.targetSprint)}；共识别 ${data.total} 项，建议移动 ${data.suggestions.length} 项。</p>
    ${data.onesUrl ? `<p>ONES 链接：${escapeHtml(data.onesUrl)}</p>` : ""}
    <p>${escapeHtml(data.safety)}</p>
    <table>
      <thead><tr><th>ID</th><th>标题</th><th>优先级</th><th>状态</th><th>提测时间</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='5'>没有命中筛选规则的工作项。</td></tr>"}</tbody>
    </table>
  `;
}

function renderPlan(data) {
  const plan = data.plan;
  return [
    `自动化：${plan.automationName}`,
    `需求表格：${plan.spreadsheetPath}`,
    `目标迭代：${plan.targetIteration}`,
    `负责人：${plan.assignee}`,
    `待创建：${plan.analysis.pendingCreateCount} 项`,
    `已排除：${plan.analysis.excludedCount} 项`,
    `导入 CSV：${plan.csvFile}`,
    "",
    "候选规则：",
    ...plan.candidateRules.map((item) => `- ${item}`),
    "",
    "排除规则：",
    ...plan.exclusionRules.map((item) => `- ${item}`),
    "",
    `重复判断：${plan.duplicateRule}`,
    `标题格式：${plan.titleRule}`,
    "",
    "导入字段：",
    ...Object.entries(plan.importFields).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "确认节点：",
    ...plan.approvalGates.map((item) => `- ${item}`),
    "",
    plan.safety,
    "",
    `已保存：${data.savedTo}`
  ].join("\n");
}

async function loadSpreadsheets() {
  const select = document.getElementById("spreadsheetSelect");
  select.innerHTML = "<option value=''>正在读取表格...</option>";
  try {
    const data = await getJson("/api/materials/spreadsheets");
    if (!data.files.length) {
      select.innerHTML = `<option value="">未找到 Excel：${escapeHtml(data.directory)}</option>`;
      return;
    }
    select.innerHTML = data.files.map((file) => (
      `<option value="${escapeHtml(file.path)}">${escapeHtml(file.name)}</option>`
    )).join("");
  } catch (error) {
    select.innerHTML = `<option value="">${escapeHtml(error.message)}</option>`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.getElementById("weeklyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const output = document.getElementById("weeklyOutput");
  output.textContent = "正在生成周报...";
  try {
    const data = await postJson("/api/weekly-report", await weeklyFormData(event.currentTarget));
    output.innerHTML = `
      ${data.warning ? `<p>${escapeHtml(data.warning)}</p>` : ""}
      <p><a class="download-link" href="${escapeHtml(data.docxDownloadUrl)}">下载 Word 周报</a></p>
      <p>运行规则：${escapeHtml(data.weeklyRules.keywordRule)}</p>
      <pre>${escapeHtml(data.report)}</pre>
      <p>Word 已保存：${escapeHtml(data.docxSavedTo)}</p>
    `;
  } catch (error) {
    output.textContent = error.message;
  }
});

document.getElementById("feishuWeeklyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const output = document.getElementById("feishuWeeklyOutput");
  output.textContent = "正在生成飞书周报...";
  try {
    const data = await postJson("/api/feishu-weekly-report", formData(event.currentTarget));
    output.innerHTML = `
      <p><a class="download-link" href="${escapeHtml(data.docxDownloadUrl)}">下载 Word 周报</a></p>
      <p>时间范围：${escapeHtml(data.range.start)} 至 ${escapeHtml(data.range.end)}；识别消息：${escapeHtml(data.matchedMessages)} 条。</p>
      <pre>${escapeHtml(data.report)}</pre>
      <p>Word 已保存：${escapeHtml(data.docxSavedTo)}</p>
    `;
  } catch (error) {
    output.textContent = error.message;
  }
});

document.getElementById("onesForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const output = document.getElementById("onesOutput");
  output.textContent = "正在分析...";
  try {
    const data = await postJson("/api/ones/analyze", formData(event.currentTarget));
    output.innerHTML = renderTable(data);
  } catch (error) {
    output.textContent = error.message;
  }
});

document.getElementById("automationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const output = document.getElementById("automationOutput");
  output.textContent = "正在生成运行计划...";
  try {
    const data = await postJson("/api/automation/save", formData(event.currentTarget));
    output.innerHTML = `<p><a class="download-link" href="${escapeHtml(data.plan.csvDownloadUrl)}">下载 ONES 导入 CSV</a></p><pre>${escapeHtml(renderPlan(data))}</pre>`;
  } catch (error) {
    output.textContent = error.message;
  }
});

document.getElementById("refreshSpreadsheets").addEventListener("click", loadSpreadsheets);
document.getElementById("logoutButton").addEventListener("click", logout);
document.getElementById("saveWeeklyRules").addEventListener("click", saveWeeklyRules);

// ─── 日志查看 ───

let logEntries = [];

function formatLogSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLogTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("zh-CN", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function levelClass(level) {
  if (level === "ERROR") return "log-level-error";
  if (level === "WARN") return "log-level-warn";
  return "log-level-info";
}

function renderLogEntry(entry) {
  const time = formatLogTime(entry.timestamp);
  const level = entry.level || "?";
  const msg = escapeHtml(entry.message || entry.raw || "");
  const meta = Object.entries(entry)
    .filter(([k]) => !["timestamp", "level", "message", "raw"].includes(k))
    .map(([k, v]) => `<span class="log-meta-field"><b>${escapeHtml(k)}</b>: ${escapeHtml(String(v))}</span>`)
    .join(" ");
  return `<div class="log-entry ${levelClass(level)}">
    <span class="log-time">${escapeHtml(time)}</span>
    <span class="log-level">${escapeHtml(level)}</span>
    <span class="log-message">${msg}</span>
    ${meta ? `<div class="log-meta">${meta}</div>` : ""}
  </div>`;
}

function filterLogEntries() {
  const level = document.getElementById("logLevelFilter")?.value || "";
  const search = (document.getElementById("logSearchInput")?.value || "").trim().toLowerCase();
  return logEntries.filter((entry) => {
    if (level && entry.level !== level) return false;
    if (search) {
      const text = JSON.stringify(entry).toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });
}

function renderLogs() {
  const output = document.getElementById("logsOutput");
  if (!output) return;
  const filtered = filterLogEntries();
  if (!filtered.length) {
    output.innerHTML = `<p class="log-empty">${logEntries.length ? "没有匹配的日志记录。" : "暂无日志记录。"}</p>`;
    return;
  }
  const errorCount = filtered.filter((e) => e.level === "ERROR").length;
  const warnCount = filtered.filter((e) => e.level === "WARN").length;
  const infoCount = filtered.filter((e) => e.level === "INFO").length;
  output.innerHTML = `<div class="log-summary">
    <span class="log-level-info">INFO ${infoCount}</span>
    <span class="log-level-warn">WARN ${warnCount}</span>
    <span class="log-level-error">ERROR ${errorCount}</span>
    <span class="log-total">共 ${filtered.length} 条</span>
  </div>` + filtered.map(renderLogEntry).join("");
}

async function loadLogFiles() {
  const select = document.getElementById("logFileSelect");
  if (!select) return;
  select.innerHTML = "<option value=''>加载中...</option>";
  try {
    const data = await getJson("/api/logs");
    if (!data.files.length) {
      select.innerHTML = "<option value=''>暂无日志文件</option>";
      return;
    }
    select.innerHTML = data.files.map((f) =>
      `<option value="${escapeHtml(f.name)}">${escapeHtml(f.name)} (${formatLogSize(f.size)})</option>`
    ).join("");
    select.selectedIndex = 0;
    loadLogContent(data.files[0].name);
  } catch (error) {
    select.innerHTML = `<option value="">加载失败：${escapeHtml(error.message)}</option>`;
  }
}

async function loadLogContent(name) {
  const output = document.getElementById("logsOutput");
  if (!output) return;
  output.textContent = "正在加载日志...";
  try {
    const data = await getJson(`/api/logs/view?name=${encodeURIComponent(name)}`);
    logEntries = data.entries || [];
    renderLogs();
  } catch (error) {
    logEntries = [];
    output.textContent = `加载失败：${error.message}`;
  }
}

function initLogs() {
  const select = document.getElementById("logFileSelect");
  const levelFilter = document.getElementById("logLevelFilter");
  const searchInput = document.getElementById("logSearchInput");
  const refreshBtn = document.getElementById("refreshLogs");
  select?.addEventListener("change", () => {
    if (select.value) loadLogContent(select.value);
  });
  levelFilter?.addEventListener("change", renderLogs);
  searchInput?.addEventListener("input", renderLogs);
  refreshBtn?.addEventListener("click", loadLogFiles);
  loadLogFiles();
}

initModuleOrdering();
initModuleNavigation();
initWeeklyRules();
initLogs();
loadCurrentUser();
loadSpreadsheets();
