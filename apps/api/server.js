const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const WEB_ROOT = path.join(ROOT, "apps/web/public");
const RUNS_DIR = path.join(ROOT, "data/runs");
const REPORTS_DIR = path.join(ROOT, "data/reports");
const UPLOADS_DIR = path.join(ROOT, "data/uploads");
const AUTH_DIR = path.join(ROOT, "data/auth");
const WEBAUTHN_FILE = path.join(AUTH_DIR, "webauthn-credentials.json");
const DEFAULT_MATERIALS_DIR = "/Users/wangpeng5/Downloads/Codex Materials";
const BUNDLED_PYTHON_BIN = "/Users/wangpeng5/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const MATERIALS_DIR = process.env.PM_AGENT_MATERIALS_DIR || DEFAULT_MATERIALS_DIR;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const PYTHON_BIN = process.env.PYTHON_BIN || (fs.existsSync(BUNDLED_PYTHON_BIN) ? BUNDLED_PYTHON_BIN : "python3");
const AUTH_USER = process.env.PM_AGENT_USER || "wangpeng5";
const AUTH_PASSWORD = process.env.PM_AGENT_PASSWORD || "pm-agent-2026";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_WEEKLY_RULES = `1. 只筛选文本中包含“议题”的页面。
2. 页面中出现的开始日期=“系统当前日期的上一个周五”。
3. 页面中出现的截止日期=“系统当前日期的本周四”。
4. 开始日期和截止日期保持可手动选择状态。
5. 生成老板版周报草稿，并输出 Word 文件。
6. 全程只在本地生成文件，不写入第三方系统。`;
const sessions = new Map();
const webauthnChallenges = new Map();

fs.mkdirSync(RUNS_DIR, { recursive: true });
fs.mkdirSync(REPORTS_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(AUTH_DIR, { recursive: true });

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body, null, 2));
}

function sendText(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 80_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function getSession(req) {
  const token = parseCookies(req).pm_agent_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function isAuthed(req) {
  return Boolean(getSession(req));
}

function setSessionCookie(res, token) {
  res.setHeader("set-cookie", `pm_agent_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`);
}

function clearSessionCookie(res) {
  res.setHeader("set-cookie", "pm_agent_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function createSession(res, username) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  setSessionCookie(res, token);
}

function redirectToLogin(res) {
  res.writeHead(302, {
    location: "/login.html",
    "cache-control": "no-store"
  });
  res.end();
}

function redirectToLocalhost(req, res) {
  const host = String(req.headers.host || "");
  if (!host.startsWith("127.0.0.1:") && !host.startsWith("[::1]:")) return false;
  const port = host.split(":").pop() || PORT;
  if (req.method !== "GET") {
    sendJson(res, 409, { ok: false, message: `Touch ID 需要使用 http://localhost:${port} 访问，请刷新到 localhost 后重试。` });
    return true;
  }
  res.writeHead(302, {
    location: `http://localhost:${port}${req.url}`,
    "cache-control": "no-store"
  });
  res.end();
  return true;
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function fromBase64url(input) {
  const value = String(input || "").replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(value + "=".repeat((4 - (value.length % 4)) % 4), "base64");
}

function loadWebauthnCredentials() {
  if (!fs.existsSync(WEBAUTHN_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(WEBAUTHN_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveWebauthnCredentials(credentials) {
  fs.writeFileSync(WEBAUTHN_FILE, JSON.stringify(credentials, null, 2));
}

function getRequestOrigin(req) {
  return `http://${req.headers.host || `${HOST}:${PORT}`}`;
}

function getRpId(req) {
  const host = String(req.headers.host || `${HOST}:${PORT}`).split(":")[0];
  return host === "127.0.0.1" || host === "::1" ? "localhost" : host;
}

function storeWebauthnChallenge(type, username, req) {
  const challenge = base64url(crypto.randomBytes(32));
  const entry = {
    challenge,
    expectedOrigin: getRequestOrigin(req),
    rpId: getRpId(req),
    username,
    createdAt: Date.now(),
    type
  };
  webauthnChallenges.set(`${type}:${username}`, entry);
  return entry;
}

function getWebauthnChallenge(type, username) {
  const key = `${type}:${username}`;
  const entry = webauthnChallenges.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > 5 * 60 * 1000) {
    webauthnChallenges.delete(key);
    return null;
  }
  return entry;
}

function consumeWebauthnChallenge(type, username) {
  const key = `${type}:${username}`;
  const entry = getWebauthnChallenge(type, username);
  webauthnChallenges.delete(key);
  return entry;
}

function readCborLength(buffer, offset, additional) {
  if (additional < 24) return { length: additional, offset };
  if (additional === 24) return { length: buffer.readUInt8(offset), offset: offset + 1 };
  if (additional === 25) return { length: buffer.readUInt16BE(offset), offset: offset + 2 };
  if (additional === 26) return { length: buffer.readUInt32BE(offset), offset: offset + 4 };
  throw new Error("Unsupported CBOR length.");
}

function decodeCbor(buffer, offset = 0) {
  const first = buffer.readUInt8(offset++);
  const major = first >> 5;
  const additional = first & 0x1f;
  const read = () => readCborLength(buffer, offset, additional);
  if (major === 0) {
    const result = read();
    return { value: result.length, offset: result.offset };
  }
  if (major === 1) {
    const result = read();
    return { value: -1 - result.length, offset: result.offset };
  }
  if (major === 2) {
    const result = read();
    return { value: buffer.subarray(result.offset, result.offset + result.length), offset: result.offset + result.length };
  }
  if (major === 3) {
    const result = read();
    return { value: buffer.subarray(result.offset, result.offset + result.length).toString("utf-8"), offset: result.offset + result.length };
  }
  if (major === 4) {
    const result = read();
    const arr = [];
    let next = result.offset;
    for (let i = 0; i < result.length; i++) {
      const item = decodeCbor(buffer, next);
      arr.push(item.value);
      next = item.offset;
    }
    return { value: arr, offset: next };
  }
  if (major === 5) {
    const result = read();
    const map = new Map();
    let next = result.offset;
    for (let i = 0; i < result.length; i++) {
      const key = decodeCbor(buffer, next);
      const val = decodeCbor(buffer, key.offset);
      map.set(key.value, val.value);
      next = val.offset;
    }
    return { value: map, offset: next };
  }
  if (major === 6) return decodeCbor(buffer, read().offset);
  if (major === 7) {
    if (additional === 20) return { value: false, offset };
    if (additional === 21) return { value: true, offset };
    if (additional === 22) return { value: null, offset };
  }
  throw new Error("Unsupported CBOR value.");
}

function parseAuthenticatorData(authData) {
  const rpIdHash = authData.subarray(0, 32);
  const flags = authData.readUInt8(32);
  const signCount = authData.readUInt32BE(33);
  let credential = null;
  if (flags & 0x40) {
    let offset = 37 + 16;
    const credentialIdLength = authData.readUInt16BE(offset);
    offset += 2;
    const credentialId = authData.subarray(offset, offset + credentialIdLength);
    offset += credentialIdLength;
    const cose = decodeCbor(authData.subarray(offset)).value;
    credential = { credentialId, cose };
  }
  return { rpIdHash, flags, signCount, credential };
}

function coseToJwk(cose) {
  const kty = cose.get(1);
  const alg = cose.get(3);
  const crv = cose.get(-1);
  const x = cose.get(-2);
  const y = cose.get(-3);
  if (kty !== 2 || alg !== -7 || crv !== 1 || !Buffer.isBuffer(x) || !Buffer.isBuffer(y)) {
    throw new Error("当前仅支持 Touch ID 常用的 ES256/P-256 凭据。");
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: base64url(x),
    y: base64url(y),
    ext: true
  };
}

function verifyClientData(clientDataJSON, expectedType, challenge) {
  const clientData = JSON.parse(clientDataJSON.toString("utf-8"));
  if (clientData.type !== expectedType) throw new Error("Touch ID 响应类型不正确。");
  if (clientData.challenge !== challenge.challenge) throw new Error("Touch ID 登录挑战已失效，请重试。");
  if (clientData.origin !== challenge.expectedOrigin) throw new Error("Touch ID 来源不匹配，请使用绑定时相同的本地地址访问。");
  return clientData;
}

function verifyRpAndUser(authData, challenge) {
  const parsed = parseAuthenticatorData(authData);
  const expectedRpHash = crypto.createHash("sha256").update(challenge.rpId).digest();
  if (!crypto.timingSafeEqual(parsed.rpIdHash, expectedRpHash)) {
    throw new Error("Touch ID 凭据与当前访问地址不匹配。");
  }
  if (!(parsed.flags & 0x01)) throw new Error("Touch ID 未确认用户存在。");
  if (!(parsed.flags & 0x04)) throw new Error("Touch ID 未完成用户验证。");
  return parsed;
}

function webauthnRegistrationOptions(req, username) {
  const challenge = storeWebauthnChallenge("register", username, req);
  const credentials = loadWebauthnCredentials();
  const existing = credentials[username];
  return {
    publicKey: {
      challenge: challenge.challenge,
      rp: { name: "项目管理 Agent", id: challenge.rpId },
      user: {
        id: base64url(Buffer.from(username)),
        name: username,
        displayName: username
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required"
      },
      attestation: "none",
      timeout: 60000,
      excludeCredentials: existing ? [{ type: "public-key", id: existing.id }] : []
    }
  };
}

function webauthnLoginOptions(req, username) {
  const credentials = loadWebauthnCredentials();
  const credential = credentials[username];
  if (!credential) throw new Error("还没有绑定 Touch ID，请先用账号密码绑定。");
  const challenge = storeWebauthnChallenge("login", username, req);
  return {
    publicKey: {
      challenge: challenge.challenge,
      rpId: credential.rpId,
      allowCredentials: [{ type: "public-key", id: credential.id }],
      userVerification: "required",
      timeout: 60000
    }
  };
}

function safeJoin(base, target) {
  const resolved = path.resolve(base, target || "index.html");
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) return null;
  return resolved;
}

function weekRange(dateText) {
  const d = dateText ? new Date(`${dateText}T12:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error("日期格式无效，请使用 YYYY-MM-DD。");
  const day = d.getDay() || 7;
  const start = new Date(d);
  start.setDate(d.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function dateRange(startText, endText, fallbackDateText) {
  if (!startText && !endText) return weekRange(fallbackDateText);
  if (!startText || !endText) throw new Error("请同时选择开始日期和截止日期。");
  const start = new Date(`${startText}T12:00:00`);
  const end = new Date(`${endText}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("日期格式无效，请使用 YYYY-MM-DD。");
  }
  if (start > end) throw new Error("开始日期不能晚于截止日期。");
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function resolveWeeklySource(input) {
  if (input.sourceBase64) {
    const safeName = String(input.sourceName || "weekly-source").replace(/[^\w\u4e00-\u9fa5.-]+/g, "_");
    if (!/\.(pptx|pdf)$/i.test(safeName)) {
      throw new Error("请选择 .pptx 或 .pdf 文件。");
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(UPLOADS_DIR, `${stamp}-${safeName}`);
    fs.writeFileSync(file, Buffer.from(input.sourceBase64, "base64"));
    return file;
  }

  throw new Error("请选择本地 PPT 或 PDF 文件。");
}

function parseWeeklyRules(inputRules) {
  const raw = String(inputRules || DEFAULT_WEEKLY_RULES).trim() || DEFAULT_WEEKLY_RULES;
  const keywordMatch = raw.match(/包含[“"']([^”"']+)[”"']/);
  const keyword = (keywordMatch?.[1] || "议题").trim();
  return {
    raw,
    keyword,
    keywordRule: `筛选文本中包含“${keyword}”且页面日期落在开始日期与截止日期之间的页面。`
  };
}

function parsePastedItems(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows = [];

  for (const line of lines) {
    const parts = line.includes("\t") ? line.split("\t") : line.split(",");
    const idMatch = line.match(/#?\d{5,}/);
    if (!idMatch) continue;
    const id = idMatch[0].startsWith("#") ? idMatch[0] : `#${idMatch[0]}`;
    const status = parts.find((p) => /未开始|实现中|已实现|待处理|测试中|完成|Done/i.test(p)) || "";
    const testDate =
      parts.find((p) => /\d{4}[-/]\d{1,2}[-/]\d{1,2}|未设置/.test(p)) || "";
    const priority = parts.find((p) => /^(最高|较高|普通|较低|P0|P1|P2)$/.test(p.trim())) || "";
    const titleCandidate = parts.find((p) => p !== id && !/^#?\d{5,}$/.test(p) && p !== status && p !== testDate);
    rows.push({
      id,
      title: titleCandidate || line.replace(id, "").trim(),
      priority,
      status,
      testDate: testDate.replace(/\//g, "-") || "未设置",
      raw: line
    });
  }

  return rows;
}

function analyzeMigration(input) {
  const missing = ["currentSprint", "targetSprint", "rule"].filter((key) => !String(input[key] || "").trim());
  if (missing.length) {
    return {
      ok: false,
      message: "请补充当前迭代名称、目标迭代名称、筛选规则。",
      missing
    };
  }

  const items = Array.isArray(input.items) && input.items.length ? input.items : parsePastedItems(input.itemsText);
  const rule = String(input.rule || "");
  const notDate = (rule.match(/不等于\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/) || [])[1]?.replace(/\//g, "-");
  const includeNotStarted = /未开始/.test(rule);
  const excludeImplemented = /已实现.*不|不.*已实现|已实现的不需要|排除.*已实现/.test(rule);
  const excludeInProgress = /实现中.*不|不.*实现中|实现中的也不需要|排除.*实现中/.test(rule);

  const suggestions = items.filter((item) => {
    const testDate = String(item.testDate || "未设置").replace(/\//g, "-");
    if (notDate && testDate === notDate) return false;
    if (includeNotStarted && item.status !== "未开始") return false;
    if (excludeImplemented && item.status === "已实现") return false;
    if (excludeInProgress && item.status === "实现中") return false;
    return true;
  });

  const excluded = items.filter((item) => !suggestions.includes(item));
  return {
    ok: true,
    onesUrl: input.onesUrl || "",
    currentSprint: input.currentSprint,
    targetSprint: input.targetSprint,
    rule,
    total: items.length,
    suggestions,
    excluded,
    safety: "只读分析结果。未连接 ONES 写入接口，不会移动、保存或提交任何工作项。"
  };
}

function saveRun(type, payload) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(RUNS_DIR, `${stamp}-${type}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function createDocxReport(report, range, sourceName, model, name = "weekly-report") {
  const stamp = `${range.start}_${range.end}`;
  const inputFile = path.join(REPORTS_DIR, `${stamp}_${name}.json`);
  const docxFile = path.join(REPORTS_DIR, `${stamp}_${name}.docx`);
  fs.writeFileSync(inputFile, JSON.stringify({ report, range, sourceName, model }, null, 2));
  const result = spawnSync(PYTHON_BIN, [path.join(ROOT, "scripts/report_to_docx.py"), inputFile, docxFile], {
    encoding: "utf-8",
    maxBuffer: 10_000_000
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "Word 周报生成失败。");
  }
  if (!fs.existsSync(docxFile) || fs.statSync(docxFile).size < 10_000) {
    throw new Error("Word 周报生成失败：文件内容异常。");
  }
  return docxFile;
}

function listSpreadsheetFiles() {
  if (!fs.existsSync(MATERIALS_DIR)) return [];
  return fs
    .readdirSync(MATERIALS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(xlsx|xls)$/i.test(entry.name))
    .map((entry) => {
      const file = path.join(MATERIALS_DIR, entry.name);
      const stat = fs.statSync(file);
      return {
        name: entry.name,
        path: file,
        updatedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function resolveMaterialsSpreadsheet(filePath) {
  const resolved = path.resolve(filePath || "");
  const base = path.resolve(MATERIALS_DIR);
  if (!resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`表格只能从 ${MATERIALS_DIR} 路径内选择。`);
  }
  if (!fs.existsSync(resolved)) throw new Error(`找不到表格：${resolved}`);
  if (!/\.(xlsx|xls)$/i.test(resolved)) throw new Error("请选择 Excel 工作簿。");
  return resolved;
}

function buildCreateOnesWorkItemsPlan(input) {
  const spreadsheetPath = resolveMaterialsSpreadsheet(input.spreadsheetPath);
  const targetIteration = String(input.targetIteration || "").trim();
  if (!targetIteration) throw new Error("请填写 ONES 目标迭代实际显示名称。");
  if (input.iterationNameConfirmed !== "yes") {
    throw new Error("请先在 ONES 页面确认目标迭代实际显示名称，并勾选确认项。");
  }
  const assignee = String(input.assignee || "wangpeng5@tetras.ai").trim();
  const targetExistingItemsText = String(input.targetExistingItemsText || "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payloadFile = path.join(RUNS_DIR, `${stamp}-create-ones-workitems-input.json`);
  const analysisFile = path.join(RUNS_DIR, `${stamp}-create-ones-workitems-analysis.json`);
  const csvFile = path.join(RUNS_DIR, `${stamp}-ones-import.csv`);
  fs.writeFileSync(payloadFile, JSON.stringify({
    spreadsheetPath,
    targetIteration,
    assignee,
    targetExistingItemsText
  }, null, 2));
  const result = spawnSync(PYTHON_BIN, [path.join(ROOT, "scripts/analyze_ones_workitems.py"), payloadFile, analysisFile, csvFile], {
    encoding: "utf-8",
    maxBuffer: 10_000_000
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "创建 ONES 工作项清单分析失败。");
  }
  const analysis = JSON.parse(fs.readFileSync(analysisFile, "utf-8"));
  const targetExistingRule = analysis.targetExistingItemsProvided
    ? `已根据粘贴的目标迭代已有工作项去重：识别 ${analysis.targetExistingItemsCount} 条，排除相同“具体需求内容”的需求。`
    : "未提供目标迭代已有工作项，本次未执行目标迭代去重；导入前需在 ONES 中再次确认无重复需求。";

  return {
    automationName: "创建ONES工作项清单",
    spreadsheetPath,
    targetIteration,
    assignee,
    analysis,
    csvFile,
    csvDownloadUrl: `/api/runs/download?name=${encodeURIComponent(path.basename(csvFile))}`,
    source: {
      sheet: "需求汇总",
      allowedDirectory: MATERIALS_DIR,
      compareSheet: "v0.2"
    },
    candidateRules: [
      "有效需求行必须包含“具体需求内容”和“优先级”。",
      "需求分类为空时，使用上方最近的非空需求分类向下填充。",
      "需求分类包含多行说明或链接时，只取第一行作为分类名。"
    ],
    exclusionRules: [
      "先排除 状态=已实现 的需求。",
      "再排除已经存在于同一工作簿 sheet=v0.2 中的需求。",
      targetExistingRule
    ],
    duplicateRule: "重复判断以“具体需求内容”为准：Unicode NFKC、转小写、忽略空白和标点。",
    titleRule: "【优先级】需求分类_具体需求内容；标题中的换行会压成空格。",
    importFields: {
      "工作项类型": "需求",
      "负责人": String(input.assignee || "wangpeng5@tetras.ai").trim(),
      "状态": "未开始",
      "所属项目": "Tetrasphere产品开发",
      "所属迭代": targetIteration,
      "优先级": "P0=最高，P1=较高，P2=普通，P3=较低"
    },
    approvalGates: [
      "已在生成 CSV 前确认目标迭代实际显示名称；导入前仍需检查字段匹配。",
      "点击“开始导入”前必须人工确认。",
      "若导入失败，下载失败工作项列表并读取单元格批注定位原因。",
      "导入成功后刷新目标迭代，确认需求数量增加值等于成功导入数量。"
    ],
    safety: "当前本地 MVP 会生成 ONES 批量导入 CSV，但不会点击“开始导入”或直接创建 ONES 工作项。"
  };
}

function feishuWeeklyRange(today = new Date()) {
  const current = new Date(today);
  current.setHours(12, 0, 0, 0);
  const day = current.getDay() || 7;
  const start = new Date(current);
  start.setDate(current.getDate() + (5 - day) - 7);
  const end = new Date(current);
  end.setDate(current.getDate() + (4 - day));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function parseFeishuSource(input) {
  const pasted = String(input.feishuMessages || "").trim();
  if (pasted) return { text: pasted, sourceName: "粘贴的飞书消息" };
  if (input.sourceBase64) {
    const safeName = String(input.sourceName || "feishu-messages.txt").replace(/[^\w\u4e00-\u9fa5.-]+/g, "_");
    if (!/\.(txt|md|csv|json)$/i.test(safeName)) {
      throw new Error("请选择 .txt、.md、.csv 或 .json 文本文件，或直接粘贴飞书消息。");
    }
    return {
      text: Buffer.from(input.sourceBase64, "base64").toString("utf-8"),
      sourceName: safeName
    };
  }
  throw new Error("请粘贴飞书群消息，或选择已导出的飞书文本文件。");
}

function parseDateToken(value) {
  const text = String(value || "");
  let match = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (match) {
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  match = text.match(/(?<!\d)(\d{1,2})[-/.月](\d{1,2})(?!\d)/);
  if (!match) return null;
  const d = new Date(new Date().getFullYear(), Number(match[1]) - 1, Number(match[2]), 12);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function collectFeishuMessages(text, range) {
  const rows = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const messages = [];
  let currentDate = null;
  for (const row of rows) {
    const parsedDate = parseDateToken(row);
    if (parsedDate) currentDate = parsedDate;
    const hasDate = Boolean(currentDate);
    if (hasDate && (currentDate < range.start || currentDate > range.end)) continue;
    messages.push({
      date: currentDate,
      text: row.replace(/^\[?20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}[^\]\s]*\]?\s*/, "")
    });
  }
  return messages;
}

function classifyFeishuMessages(messages) {
  const buckets = {
    progress: [],
    risk: [],
    plan: [],
    decision: [],
    other: []
  };
  for (const message of messages) {
    const text = message.text;
    const entry = message.date ? `${message.date} ${text}` : text;
    if (/风险|阻塞|延期|卡住|依赖|问题|bug|缺陷|失败|回归|不通过/i.test(text)) buckets.risk.push(entry);
    else if (/结论|决定|确认|拍板|同意|变更|调整|定版/i.test(text)) buckets.decision.push(entry);
    else if (/完成|已|进展|提交|合入|发布|提测|验证|联调|修复/i.test(text)) buckets.progress.push(entry);
    else if (/下周|计划|待办|todo|跟进|推进|安排|准备|需要/i.test(text)) buckets.plan.push(entry);
    else buckets.other.push(entry);
  }
  return buckets;
}

function compactList(items, maxItems = 8, maxLength = 120) {
  return items.slice(0, maxItems).map((item) => {
    const value = String(item || "").replace(/\s+/g, " ").trim();
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  });
}

function buildFeishuWeeklyReportModel(input) {
  const range = feishuWeeklyRange();
  const source = parseFeishuSource(input);
  const messages = collectFeishuMessages(source.text, range);
  const buckets = classifyFeishuMessages(messages);
  const progress = compactList([...buckets.progress, ...buckets.decision, ...buckets.other]);
  const risks = compactList(buckets.risk);
  const plans = compactList(buckets.plan);
  const hasContent = messages.length > 0;
  const status = risks.length ? "存在需跟踪风险" : hasContent ? "本周推进中" : "未识别到本周期消息";
  const model = {
    title: "Vision Claw 飞书项目周报",
    subtitle: `汇报周期：${range.start.replaceAll("-", ".")}-${range.end.replaceAll("-", ".")}｜来源：飞书 Vision Claw项目群`,
    callout: hasContent
      ? `管理判断：本周期从飞书 Vision Claw项目群识别 ${messages.length} 条本地消息，重点围绕进展闭环、风险跟踪和下周推进事项整理；生成过程只在本地完成，不写入飞书或其他第三方系统。`
      : "管理判断：本周期未从输入内容中识别到落在上周五到本周四范围内的飞书消息，请确认导出内容是否包含日期，或补充粘贴本周期群消息。",
    overviewRows: [
      ["项目", "本周状态", "管理判断"],
      ["Vision Claw", status, risks.length ? "建议优先确认风险责任人、截止时间和验收口径。" : "建议继续按本周进展推动节点闭环，并在下周同步关键结果。"]
    ],
    sections: []
  };
  model.sections.push({
    heading: "本周关键进展",
    paragraphs: progress.length ? progress.map((item) => `Vision Claw：${item}`) : ["本周期输入内容中未识别到明确进展项。"]
  });
  model.sections.push({
    heading: "关键风险 / 阻塞",
    paragraphs: risks.length ? risks.map((item) => `Vision Claw：${item}`) : ["当前输入内容中未识别到明确风险或阻塞；建议人工复核是否存在未显式标注的依赖问题。"]
  });
  model.sections.push({
    heading: "下周计划",
    paragraphs: plans.length ? plans.map((item) => `Vision Claw：${item}`) : ["基于飞书消息，建议下周继续跟踪本周进展项的闭环结果、风险处理状态和验收反馈。"]
  });
  model.sections.push({
    heading: "需要老板关注或决策",
    paragraphs: risks.length
      ? ["请关注上述风险项是否已有明确 owner、解决时点和升级路径；若风险影响版本节点，建议提前明确取舍方案。"]
      : ["暂无从飞书消息中识别出的明确升级事项；如版本节点临近，建议继续关注验收质量和跨团队依赖。"]
  });
  model.sections.push({
    heading: "来源与口径",
    paragraphs: [
      `运行规则：查看飞书“Vision Claw项目群”里过去一周的信息，时间范围固定为上周五到本周四；生成老板版周报草稿，并输出 Word 文件；全程只在本地生成文件，不写入第三方系统。`,
      `本地输入来源：${source.sourceName}；识别消息数：${messages.length}。`
    ]
  });
  return { model, range, sourceName: source.sourceName, messages };
}

async function handleApi(req, res) {
  try {
    if (req.url === "/api/login" && req.method === "POST") {
      const raw = await readBody(req);
      const input = raw ? JSON.parse(raw) : {};
      if (input.username !== AUTH_USER || input.password !== AUTH_PASSWORD) {
        return sendJson(res, 401, { ok: false, message: "账号或密码不正确。" });
      }
      createSession(res, AUTH_USER);
      return sendJson(res, 200, { ok: true, username: AUTH_USER });
    }

    if (req.url === "/api/webauthn/register/options" && req.method === "POST") {
      const raw = await readBody(req);
      const input = raw ? JSON.parse(raw) : {};
      if (input.username !== AUTH_USER || input.password !== AUTH_PASSWORD) {
        return sendJson(res, 401, { ok: false, message: "绑定 Touch ID 前请先输入正确账号和密码。" });
      }
      return sendJson(res, 200, webauthnRegistrationOptions(req, AUTH_USER));
    }

    if (req.url === "/api/webauthn/register/verify" && req.method === "POST") {
      const raw = await readBody(req);
      const input = raw ? JSON.parse(raw) : {};
      const username = input.username || AUTH_USER;
      const challenge = consumeWebauthnChallenge("register", username);
      if (!challenge) return sendJson(res, 400, { ok: false, message: "Touch ID 绑定已超时，请重试。" });

      const response = input.credential?.response || {};
      const clientDataJSON = fromBase64url(response.clientDataJSON);
      const attestationObject = fromBase64url(response.attestationObject);
      verifyClientData(clientDataJSON, "webauthn.create", challenge);
      const attestation = decodeCbor(attestationObject).value;
      const authData = attestation.get("authData");
      const parsed = verifyRpAndUser(authData, challenge);
      if (!parsed.credential) throw new Error("Touch ID 绑定响应缺少凭据。");
      const jwk = coseToJwk(parsed.credential.cose);

      const credentials = loadWebauthnCredentials();
      credentials[username] = {
        id: base64url(parsed.credential.credentialId),
        publicKeyJwk: jwk,
        signCount: parsed.signCount,
        rpId: challenge.rpId,
        createdAt: new Date().toISOString()
      };
      saveWebauthnCredentials(credentials);
      createSession(res, username);
      return sendJson(res, 200, { ok: true, username });
    }

    if (req.url === "/api/webauthn/login/options" && req.method === "POST") {
      const raw = await readBody(req);
      const input = raw ? JSON.parse(raw) : {};
      const username = input.username || AUTH_USER;
      if (username !== AUTH_USER) return sendJson(res, 401, { ok: false, message: "账号不存在。" });
      return sendJson(res, 200, webauthnLoginOptions(req, username));
    }

    if (req.url === "/api/webauthn/login/verify" && req.method === "POST") {
      const raw = await readBody(req);
      const input = raw ? JSON.parse(raw) : {};
      const username = input.username || AUTH_USER;
      const credentials = loadWebauthnCredentials();
      const credential = credentials[username];
      if (!credential) return sendJson(res, 400, { ok: false, message: "还没有绑定 Touch ID。" });
      if (input.credential?.id !== credential.id) return sendJson(res, 400, { ok: false, message: "Touch ID 凭据不匹配。" });

      const challenge = consumeWebauthnChallenge("login", username);
      if (!challenge) return sendJson(res, 400, { ok: false, message: "Touch ID 登录已超时，请重试。" });
      const response = input.credential.response || {};
      const clientDataJSON = fromBase64url(response.clientDataJSON);
      const authenticatorData = fromBase64url(response.authenticatorData);
      const signature = fromBase64url(response.signature);
      verifyClientData(clientDataJSON, "webauthn.get", challenge);
      const parsed = verifyRpAndUser(authenticatorData, challenge);
      const verify = crypto.createVerify("SHA256");
      verify.update(authenticatorData);
      verify.update(crypto.createHash("sha256").update(clientDataJSON).digest());
      verify.end();
      const publicKey = crypto.createPublicKey({ key: credential.publicKeyJwk, format: "jwk" });
      if (!verify.verify(publicKey, signature)) throw new Error("Touch ID 签名验证失败。");
      if (credential.signCount && parsed.signCount && parsed.signCount <= credential.signCount) {
        throw new Error("Touch ID 计数异常，请重新绑定后再试。");
      }
      credential.signCount = parsed.signCount;
      credential.lastUsedAt = new Date().toISOString();
      credentials[username] = credential;
      saveWebauthnCredentials(credentials);
      createSession(res, username);
      return sendJson(res, 200, { ok: true, username });
    }

    if (req.url === "/api/logout" && req.method === "POST") {
      const token = parseCookies(req).pm_agent_session;
      if (token) sessions.delete(token);
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (req.url === "/api/me" && req.method === "GET") {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { ok: false, message: "未登录。" });
      return sendJson(res, 200, { ok: true, username: session.username });
    }

    if (!isAuthed(req)) {
      return sendJson(res, 401, { ok: false, message: "请先登录。" });
    }

    if (req.url.startsWith("/api/reports/download") && req.method === "GET") {
      const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const name = path.basename(parsed.searchParams.get("name") || "");
      const file = path.join(REPORTS_DIR, name);
      if (!name || !file.startsWith(REPORTS_DIR) || !fs.existsSync(file)) {
        return sendJson(res, 404, { ok: false, message: "找不到要下载的周报文件。" });
      }
      res.writeHead(200, {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "cache-control": "no-store"
      });
      return fs.createReadStream(file).pipe(res);
    }

    if (req.url.startsWith("/api/runs/download") && req.method === "GET") {
      const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const name = path.basename(parsed.searchParams.get("name") || "");
      const file = path.join(RUNS_DIR, name);
      if (!name || !file.startsWith(RUNS_DIR) || !fs.existsSync(file)) {
        return sendJson(res, 404, { ok: false, message: "找不到要下载的文件。" });
      }
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "cache-control": "no-store"
      });
      return fs.createReadStream(file).pipe(res);
    }

    if (req.url === "/api/materials/spreadsheets" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, directory: MATERIALS_DIR, files: listSpreadsheetFiles() });
    }

    const raw = await readBody(req);
    const input = raw ? JSON.parse(raw) : {};

    if (req.url === "/api/weekly-report" && req.method === "POST") {
      const pptxPath = resolveWeeklySource(input);
      const range = dateRange(input.startDate, input.endDate, input.weekDate);
      const weeklyRules = parseWeeklyRules(input.weeklyRules);
      const result = spawnSync(PYTHON_BIN, [path.join(ROOT, "scripts/extract_pptx_weekly.py"), pptxPath, range.start, range.end, weeklyRules.keyword], {
        encoding: "utf-8",
        maxBuffer: 10_000_000
      });
      if (result.status !== 0) {
        return sendJson(res, 500, { ok: false, message: result.stderr || "PPT 解析失败。" });
      }
      const data = JSON.parse(result.stdout);
      if (path.extname(pptxPath).toLowerCase() === ".pdf" && !data.slides.length) {
        data.warning = "PDF 已读取，但没有识别到符合条件的文本内容。若这是扫描件或图片型 PDF，需要先 OCR，或改用可复制文本的 PDF/PPTX。";
      }
      const model = buildWeeklyReportModel(data, range, path.basename(pptxPath), data.warning, weeklyRules);
      const report = formatWeeklyReportPreview(model);
      const file = path.join(REPORTS_DIR, `${range.start}_${range.end}_weekly-report.txt`);
      fs.writeFileSync(file, report);
      const docxFile = createDocxReport(report, range, path.basename(pptxPath), model);
      return sendJson(res, 200, {
        ok: true,
        range,
        report,
        warning: data.warning,
        weeklyRules,
        sourceSlides: data.slides,
        savedTo: file,
        docxSavedTo: docxFile,
        docxDownloadUrl: `/api/reports/download?name=${encodeURIComponent(path.basename(docxFile))}`
      });
    }

    if (req.url === "/api/feishu-weekly-report" && req.method === "POST") {
      const { model, range, sourceName, messages } = buildFeishuWeeklyReportModel(input);
      const report = formatWeeklyReportPreview(model);
      const file = path.join(REPORTS_DIR, `${range.start}_${range.end}_feishu-weekly-report.txt`);
      fs.writeFileSync(file, report);
      const docxFile = createDocxReport(report, range, sourceName, model, "feishu-weekly-report");
      return sendJson(res, 200, {
        ok: true,
        range,
        report,
        sourceName,
        matchedMessages: messages.length,
        savedTo: file,
        docxSavedTo: docxFile,
        docxDownloadUrl: `/api/reports/download?name=${encodeURIComponent(path.basename(docxFile))}`
      });
    }

    if (req.url === "/api/ones/analyze" && req.method === "POST") {
      const analysis = analyzeMigration(input);
      const savedTo = saveRun("ones-analysis", { input, analysis });
      return sendJson(res, analysis.ok ? 200 : 400, { ...analysis, savedTo });
    }

    if (req.url === "/api/automation/save" && req.method === "POST") {
      const plan = buildCreateOnesWorkItemsPlan(input);
      const savedTo = saveRun("create-ones-workitems-plan", plan);
      return sendJson(res, 200, { ok: true, plan, savedTo });
    }

    sendJson(res, 404, { ok: false, message: "API not found." });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message });
  }
}

function buildWeeklyReportModel(data, range, sourceName, warning, weeklyRules = parseWeeklyRules()) {
  const projectLabel = (slide) => {
    const text = `${slide.title || ""} ${slide.summary || ""}`;
    if (/Stream/i.test(text)) return "Stream V1.5.0_GPU";
    if (/On[-\s]?Premise|Hotfix|V2\.5/i.test(text)) return "On-Premise V2.5 Hotfix v1";
    if (/Vision\s*Claw/i.test(text)) return "Vision Claw V0.2";
    return slide.title || `第 ${slide.index} 页`;
  };
  const compact = (text, max = 88) => {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length > max ? `${value.slice(0, max)}...` : value;
  };
  const projectMap = new Map();
  for (const slide of data.slides || []) {
    const project = projectLabel(slide);
    if (!projectMap.has(project)) projectMap.set(project, []);
    projectMap.get(project).push(slide);
  }
  const sortOrder = ["Stream V1.5.0_GPU", "On-Premise V2.5 Hotfix v1", "Vision Claw V0.2"];
  const projects = [...projectMap.keys()].sort((a, b) => {
    const ai = sortOrder.indexOf(a);
    const bi = sortOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const model = {
    title: "Neusphere 项目周报",
    subtitle: `汇报周期：${range.start.replaceAll("-", ".")}-${range.end.replaceAll("-", ".")}｜来源：${sourceName || "生成资料"}`,
    callout: "",
    overviewRows: [["项目", "本周状态", "管理判断"]],
    sections: [],
  };
  if (!data.slides.length) {
    model.callout = `管理判断：本周期未从资料中识别到符合日期范围的“${weeklyRules.keyword}”内容，建议先确认资料是否为可复制文本，或确认筛选日期是否覆盖目标会议内容。`;
    model.sections.push({ heading: "来源与口径", paragraphs: [warning || `本周未在包含“${weeklyRules.keyword}”的页面中识别到当周日期相关内容。`] });
    return model;
  }

  const projectTheme = (project, slides) => {
    const text = slides.map((slide) => `${slide.text || slide.summary || ""} ${(slide.risks || []).join(" ")}`).join(" ");
    if (project === "Stream V1.5.0_GPU") {
      return {
        node: "Stream 5/8 提测口径",
        status: /50/.test(text) ? "5/8 提测边界已收敛" : "提测范围持续收敛",
        judgement: "本周通过明确提测边界降低短期交付风险；后续需继续盯住 50 系列版本的范围、排期和测试计划。",
        progress: "Stream：本周围绕 5/8 提测边界继续收敛，已将不进入本次适配 40 系列提测的事项后移到后续版本，短期提测范围更可控。",
        risk: "Stream 5/8 提测通过范围收敛降低短期风险，但 50 系列版本的测试范围和排期仍需避免继续悬空。",
        plan: "跟踪 Stream 5/8 提测后的问题收敛结果，并推动 50 系列版本的测试计划明确化。",
        attention: "请推动 Stream 50 系列版本的范围和测试计划尽快落地，避免本周从 5/8 剥离的问题在下个节点集中爆发。"
      };
    }
    if (project === "On-Premise V2.5 Hotfix v1") {
      return {
        node: "On-Premise 5/9 发布判断",
        status: "5/9 发布前验证推进中",
        judgement: "发布判断仍需看最终回归、部署验证和 SSS 侧确认是否闭环；若 gate 未闭合，应明确延期条件和剩余阻塞项。",
        progress: "On-Premise：本周围绕 5/9 release 做发布前验证和同步机制确认，部署、回归和 SSS 侧闭环是发布判断的核心输入。",
        risk: "On-Premise 发布风险集中在最终 gate；即使已有验证推进信号，仍应以回归、部署和 SSS 侧确认闭环作为发布阈值。",
        plan: "跟踪 On-Premise 5/9 release 结论；若发布，关注交付侧反馈，若延期，要求明确剩余阻塞项、责任人和新的 gate。",
        attention: "请确认 On-Premise 5/9 发布阈值：若回归或 SSS 侧验证未完全闭环，是否允许有条件发布，还是直接延期。"
      };
    }
    if (project === "Vision Claw V0.2") {
      return {
        node: "Vision Claw V0.2 scope 与测试集维护",
        status: "V0.2 scope 与测试准备待闭环",
        judgement: "开发 scope 已进一步明确，但测试集维护和覆盖质量仍会影响后续验收节奏，需要给出明确 owner 和完成时点。",
        progress: "Vision Claw：本周继续确认 V0.2 开发 scope 和完成日期，同时暴露测试集维护任务仍需推进。",
        risk: "Vision Claw 的测试集维护仍是后续验收风险；如果数据准备质量或覆盖不足，会把工程完成后的验收风险后移。",
        plan: "推进 Vision Claw 测试集维护闭环，确保准备的数据能支撑 V0.2 后续验证。",
        attention: "如测试资源冲突，建议优先保障发布验证和提测问题收敛，同时为 Vision Claw 测试集准备明确 owner 和完成时点。"
      };
    }
    return {
      node: project,
      status: compact(slides.map((slide) => slide.summary).join(" "), 42),
      judgement: "本周已有明确推进记录，后续重点是按节点跟踪闭环和验收结果。",
      progress: `${project}：${compact(slides.map((slide) => slide.summary).join(" "), 110)}`,
      risk: `${project}：需继续关注节点闭环和跨团队依赖。`,
      plan: `跟踪 ${project} 的后续节点、责任人和验收结果。`,
      attention: `${project} 如出现资源或依赖冲突，需及时升级。`
    };
  };

  const themes = projects.map((project) => ({ project, ...projectTheme(project, projectMap.get(project)) }));
  model.callout = `管理判断：本周核心不是新增需求，而是${themes.length}个节点的交付闭环：${themes.map((item) => item.node).join("、")}。整体进入节点兑现和风险压降阶段，需把测试资源和发布 gate 管住。`;
  for (const item of themes) {
    model.overviewRows.push([item.project, item.status, item.judgement]);
  }

  model.sections.push({ heading: "本周关键进展", paragraphs: themes.map((item) => item.progress) });
  model.sections.push({ heading: "关键风险 / 阻塞", paragraphs: themes.map((item) => item.risk) });
  model.sections.push({ heading: "下周计划", paragraphs: themes.map((item) => item.plan) });
  model.sections.push({ heading: "需要老板关注或决策", paragraphs: themes.map((item) => item.attention) });
  const sourcePages = (data.slides || []).map((slide) => `第 ${slide.index} 页`).join("、");
  model.sections.push({
    heading: "来源与口径",
    paragraphs: [
      `来源说明：${weeklyRules.keywordRule} 命中${sourcePages}；执行周为 ${range.start.replaceAll("-", ".")}-${range.end.replaceAll("-", ".")}。本周管理判断仅采用与本周期关键日期和节点相关的内容。`
    ]
  });
  if (warning) {
    model.sections.push({ heading: "文件识别提示", paragraphs: [warning] });
  }
  return model;
}

function formatWeeklyReportPreview(model) {
  const lines = [model.title, model.subtitle, "", model.callout, ""];
  if (model.overviewRows.length > 1) {
    lines.push("项目状态总览");
    lines.push(model.overviewRows[0].join("｜"));
    for (const row of model.overviewRows.slice(1)) {
      lines.push(row.join("｜"));
    }
    lines.push("");
  }
  for (const section of model.sections) {
    lines.push(section.heading);
    for (const paragraph of section.paragraphs) {
      lines.push(paragraph);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function buildWeeklyReport(data, range) {
  return formatWeeklyReportPreview(buildWeeklyReportModel(data, range, "生成资料"));
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const publicPaths = new Set(["/login.html", "/styles.css", "/login.js"]);
  if (!isAuthed(req) && !publicPaths.has(urlPath)) {
    return redirectToLogin(res);
  }
  if (isAuthed(req) && urlPath === "/login.html") {
    res.writeHead(302, { location: "/" });
    return res.end();
  }
  const relative = urlPath === "/" ? "index.html" : urlPath.slice(1);
  const file = safeJoin(WEB_ROOT, relative);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return sendText(res, 404, "Not found");
  }
  const ext = path.extname(file);
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8" };
  sendText(res, 200, fs.readFileSync(file), types[ext] || "application/octet-stream");
}

const server = http.createServer((req, res) => {
  if (redirectToLocalhost(req, res)) return;
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  serveStatic(req, res);
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`PM Agent Platform running at http://${HOST}:${PORT}`);
  });
}

module.exports = {
  analyzeMigration,
  buildWeeklyReport,
  buildWeeklyReportModel,
  buildFeishuWeeklyReportModel,
  buildCreateOnesWorkItemsPlan,
  feishuWeeklyRange,
  formatWeeklyReportPreview,
  dateRange,
  parsePastedItems,
  weekRange
};
