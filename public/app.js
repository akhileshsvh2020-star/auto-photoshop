const els = {
  loginShell: document.querySelector("#loginShell"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError"),
  logoutButton: document.querySelector("#logoutButton"),
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  connectorState: document.querySelector("#connectorState"),
  pairButton: document.querySelector("#pairButton"),
  installPanel: document.querySelector("#installPanel"),
  designForm: document.querySelector("#designForm"),
  createButton: document.querySelector("#createButton"),
  prompt: document.querySelector("#prompt"),
  size: document.querySelector("#size"),
  sizeUnit: document.querySelector("#sizeUnit"),
  resolution: document.querySelector("#resolution"),
  resolutionError: document.querySelector("#resolutionError"),
  result: document.querySelector("#result"),
};

const LOGIN_KEY = "autoPhotoshopLoggedInUser";
const TOKEN_KEY = "autoPhotoshopToken";
const BRIDGE_URL = "http://127.0.0.1:4765";
let bridgeOnline = false;
let lastPrompt = "";
let resolutionValid = true;

function isLoggedIn() {
  return Boolean(sessionStorage.getItem(LOGIN_KEY));
}

function showApp() {
  els.loginShell.classList.add("hidden");
  els.appShell.classList.remove("hidden");
  setDeviceAllowed(Boolean(localStorage.getItem(TOKEN_KEY)));
  checkBridge();
}

function showLogin() {
  els.appShell.classList.add("hidden");
  els.loginShell.classList.remove("hidden");
  els.loginPassword.value = "";
  els.loginEmail.focus();
}

function bridgeBase() {
  return BRIDGE_URL;
}

function setStatus(ok, text) {
  bridgeOnline = ok;
  els.statusDot.classList.toggle("ready", ok);
  els.connectorState.classList.toggle("connected", ok);
  els.connectorState.textContent = ok ? "connected" : "not connected";
  els.statusText.textContent = text;
  els.installPanel.classList.toggle("hidden", ok);
  els.designForm.classList.toggle("locked", !ok);
  updateCreateButtonState();
}

function setResult(html) {
  els.result.innerHTML = html;
}

function setDeviceAllowed(allowed) {
  els.pairButton.textContent = allowed ? "Device allowed" : "Allow this device";
  els.pairButton.disabled = allowed;
  els.pairButton.classList.toggle("allowed", allowed);
}

function parseResolution() {
  const value = Number(els.resolution.value);
  if (!Number.isInteger(value)) return { ok: false, error: "Resolution must be a whole number between 72 and 500 pixels/inch." };
  if (value < 72) return { ok: false, error: "Resolution is too low. Minimum allowed resolution is 72 pixels/inch." };
  if (value > 500) return { ok: false, error: "Resolution is too high. Maximum allowed resolution is 500 pixels/inch." };
  return { ok: true, value };
}

function validateResolution() {
  const result = parseResolution();
  resolutionValid = result.ok;
  els.resolution.classList.toggle("input-error", !result.ok);
  els.resolutionError.textContent = result.ok ? "" : result.error;
  updateCreateButtonState();
  return result;
}

function updateCreateButtonState() {
  els.createButton.disabled = !bridgeOnline || !resolutionValid;
}

function updateSizePlaceholder() {
  if (els.sizeUnit.value === "cm") {
    els.size.placeholder = "30x30, 21x29.7, 10x15";
    return;
  }
  els.size.placeholder = "12x12, 8.5x11, 4x6";
}

function renderProgress() {
  setResult(`
    <div class="result-card result-loading">
      <span class="result-kicker">Creating design in Photoshop...</span>
      <strong>Photoshop is building your design.</strong>
      <p>Keep Photoshop open while the connector creates the canvas, layers, text, color system, and export.</p>
    </div>
  `);
}

function renderSuccess(data) {
  setResult(`
    <div class="result-card result-success">
      <span class="result-kicker">Design completed</span>
      <strong>Your editable Photoshop design is ready.</strong>
      <p>Saved file: <code>${data.outputPng}</code></p>
      <p>Style: ${data.plan.style} / Palette: ${data.plan.palette.name}</p>
      <div class="result-actions">
        <button class="mini-button" type="button" data-action="open-photoshop">Open Photoshop</button>
        <button class="mini-button" type="button" data-action="open-output-folder">Open Output Folder</button>
        <button class="mini-button mini-button-dark" type="button" data-action="update-prompt">Create Update Prompt</button>
      </div>
    </div>
  `);
}

function renderError(message) {
  setResult(`
    <div class="result-card result-error">
      <span class="result-kicker">Could not create design</span>
      <strong>The design was not completed.</strong>
      <p>${message}</p>
      <div class="result-actions">
        <button class="mini-button" type="button" data-action="open-photoshop">Open Photoshop</button>
        <button class="mini-button mini-button-dark" type="button" data-action="update-prompt">Create Update Prompt</button>
      </div>
    </div>
  `);
}

async function bridgeFetch(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { ...(options.headers || {}) };
  if (token) headers["X-Auto-Photoshop-Token"] = token;
  if (options.body) headers["Content-Type"] = "application/json";

  const response = await fetch(`${bridgeBase()}${path}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || "Bridge request failed.");
  return data;
}

async function checkBridge() {
  if (!isLoggedIn()) return;
  try {
    await bridgeFetch("/health");
    setStatus(true, "click download button to make website work fully");
  } catch {
    setStatus(false, "click download button to make website work fully");
  }
}

els.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  login();
});

async function login() {
  els.loginError.textContent = "";
  const submitButton = els.loginForm.querySelector("button[type='submit']");
  submitButton.disabled = true;

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: els.loginEmail.value,
        password: els.loginPassword.value
      })
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || "Login failed.");

    sessionStorage.setItem(LOGIN_KEY, data.token);
    showApp();
  } catch (error) {
    els.loginError.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

els.logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(LOGIN_KEY);
  showLogin();
});

els.pairButton.addEventListener("click", async () => {
  try {
    const data = await bridgeFetch("/pair", { method: "POST", body: "{}" });
    localStorage.setItem(TOKEN_KEY, data.token);
    setDeviceAllowed(true);
    setStatus(true, "Device allowed");
    setResult("<strong>Permission granted.</strong> This browser can now send approved designs to Photoshop on this computer.");
  } catch (error) {
    setStatus(false, "click download button to make website work fully");
    setResult(`<strong>Could not connect.</strong> Please install and open Auto Photoshop Connector, then try again. ${error.message}`);
  }
});

els.designForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const resolution = validateResolution();
  if (!resolution.ok) return;

  els.createButton.disabled = true;
  els.createButton.querySelector("span").textContent = "Creating in Photoshop...";
  lastPrompt = els.prompt.value.trim();
  renderProgress();

  try {
    const data = await bridgeFetch("/design", {
      method: "POST",
      body: JSON.stringify({
        prompt: els.prompt.value,
        size: els.size.value,
        sizeUnit: els.sizeUnit.value,
        resolution: resolution.value,
      }),
    });

    renderSuccess(data);
  } catch (error) {
    renderError(error.message);
  } finally {
    updateCreateButtonState();
    els.createButton.querySelector("span").textContent = "Create in Photoshop";
    checkBridge();
  }
});

els.resolution.addEventListener("input", validateResolution);
els.sizeUnit.addEventListener("change", updateSizePlaceholder);

els.result.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  if (action === "update-prompt") {
    els.prompt.value = lastPrompt ? `${lastPrompt}\n\nUpdate this design: ` : "Update this design: ";
    els.prompt.focus();
    els.prompt.setSelectionRange(els.prompt.value.length, els.prompt.value.length);
    return;
  }

  button.disabled = true;
  try {
    if (action === "open-photoshop") await bridgeFetch("/open-photoshop", { method: "POST", body: "{}" });
    if (action === "open-output-folder") await bridgeFetch("/open-output-folder", { method: "POST", body: "{}" });
  } catch (error) {
    renderError(error.message);
  } finally {
    button.disabled = false;
  }
});

if (isLoggedIn()) {
  validateResolution();
  updateSizePlaceholder();
  showApp();
} else {
  updateSizePlaceholder();
  showLogin();
}
