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

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
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
  if (file) {
    values.sourceName = file.name;
    values.sourceBase64 = await fileToBase64(file);
  } else if (!values.pptxPath) {
    values.pptxPath = "/Users/wangpeng5/Desktop/20260507-Neusphere internal meeting.pptx";
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
loadCurrentUser();
loadSpreadsheets();
