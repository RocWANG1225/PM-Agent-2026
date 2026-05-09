async function login(username, password) {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "登录失败");
  return data;
}

function base64urlToBuffer(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "请求失败");
  return data;
}

function ensureTouchIdSupported() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error("当前浏览器不支持 Touch ID 登录，请使用 Safari 或 Chrome。");
  }
}

function prepareCreationOptions(options) {
  options.challenge = base64urlToBuffer(options.challenge);
  options.user.id = base64urlToBuffer(options.user.id);
  options.excludeCredentials = (options.excludeCredentials || []).map((item) => ({
    ...item,
    id: base64urlToBuffer(item.id)
  }));
  return options;
}

function prepareRequestOptions(options) {
  options.challenge = base64urlToBuffer(options.challenge);
  options.allowCredentials = (options.allowCredentials || []).map((item) => ({
    ...item,
    id: base64urlToBuffer(item.id)
  }));
  return options;
}

function serializeCredential(credential) {
  const response = credential.response;
  const output = {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON)
    }
  };
  if (response.attestationObject) output.response.attestationObject = bufferToBase64url(response.attestationObject);
  if (response.authenticatorData) output.response.authenticatorData = bufferToBase64url(response.authenticatorData);
  if (response.signature) output.response.signature = bufferToBase64url(response.signature);
  if (response.userHandle) output.response.userHandle = bufferToBase64url(response.userHandle);
  return output;
}

async function registerTouchId(username, password) {
  ensureTouchIdSupported();
  const options = await postJson("/api/webauthn/register/options", { username, password });
  const credential = await navigator.credentials.create({
    publicKey: prepareCreationOptions(options.publicKey)
  });
  return postJson("/api/webauthn/register/verify", {
    username,
    credential: serializeCredential(credential)
  });
}

async function loginWithTouchId(username) {
  ensureTouchIdSupported();
  const options = await postJson("/api/webauthn/login/options", { username });
  const credential = await navigator.credentials.get({
    publicKey: prepareRequestOptions(options.publicKey)
  });
  return postJson("/api/webauthn/login/verify", {
    username,
    credential: serializeCredential(credential)
  });
}

let touchLoginInProgress = false;

async function attemptTouchLogin({ automatic = false } = {}) {
  if (touchLoginInProgress) return;
  touchLoginInProgress = true;
  const form = document.getElementById("loginForm");
  const message = document.getElementById("loginMessage");
  message.textContent = automatic ? "正在尝试 Touch ID 自动登录..." : "正在唤起 Touch ID...";
  try {
    await loginWithTouchId(form.elements.username.value);
    window.location.href = "/";
  } catch (error) {
    const text = error.message || "";
    if (automatic && (text.includes("还没有绑定") || text.includes("not allowed") || text.includes("取消") || text.includes("NotAllowed"))) {
      message.textContent = text.includes("还没有绑定")
        ? "首次使用 Touch ID 前，请先输入账号密码并绑定。"
        : "Touch ID 自动登录未完成，可再次验证或使用账号密码登录。";
    } else {
      message.textContent = text;
    }
  } finally {
    touchLoginInProgress = false;
  }
}

document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById("loginMessage");
  message.textContent = "正在登录...";
  try {
    await login(form.elements.username.value, form.elements.password.value);
    window.location.href = "/";
  } catch (error) {
    message.textContent = error.message;
  }
});

document.getElementById("touchRegisterButton").addEventListener("click", async () => {
  const form = document.getElementById("loginForm");
  const message = document.getElementById("loginMessage");
  message.textContent = "正在绑定 Touch ID...";
  try {
    await registerTouchId(form.elements.username.value, form.elements.password.value);
    window.location.href = "/";
  } catch (error) {
    message.textContent = error.message;
  }
});

document.getElementById("touchLoginButton").addEventListener("click", async () => {
  await attemptTouchLogin({ automatic: false });
});

window.addEventListener("load", () => {
  if (window.PublicKeyCredential && navigator.credentials) {
    window.setTimeout(() => attemptTouchLogin({ automatic: true }), 400);
  }
});
