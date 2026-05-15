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

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
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

document.querySelectorAll("nav a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll("nav a").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});

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
initWeeklyRules();
loadCurrentUser();
loadSpreadsheets();
