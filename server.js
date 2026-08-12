const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const loginHandler = require("./api/login");

const PORT = Number(process.env.PORT || 4765);
const isPackagedAsar = __dirname.toLowerCase().includes("app.asar");
const isInstalledElectronApp = Boolean(process.versions?.electron && !process.defaultApp);
const shouldUseUserFolders = isPackagedAsar || isInstalledElectronApp;
const appDataRoot = process.env.LOCALAPPDATA || os.tmpdir();
const picturesRoot = path.join(os.homedir(), "Pictures");
const DATA_DIR = process.env.AUTO_PHOTOSHOP_DATA_DIR || (
  shouldUseUserFolders ? path.join(appDataRoot, "Auto Photoshop Connector", "bridge") : path.join(__dirname, ".bridge")
);
const TOKEN_FILE = path.join(DATA_DIR, "token");
const OUTPUT_DIR = process.env.AUTO_PHOTOSHOP_OUTPUT_DIR || (
  shouldUseUserFolders ? path.join(picturesRoot, "Auto Photoshop") : path.join(__dirname, "outputs")
);
const PUBLIC_DIR = path.join(__dirname, "public");

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost:4765",
  "http://127.0.0.1:4765",
  "https://auto-photoshop.vercel.app",
]);

if (process.env.ALLOWED_ORIGIN) {
  for (const origin of process.env.ALLOWED_ORIGIN.split(",")) {
    if (origin.trim()) allowedOrigins.add(origin.trim());
  }
}

function ensureToken() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  const token = crypto.randomBytes(24).toString("hex");
  fs.writeFileSync(TOKEN_FILE, token, { encoding: "utf8", mode: 0o600 });
  return token;
}

const bridgeToken = ensureToken();

function sendJson(res, status, payload, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Headers": "Content-Type, X-Auto-Photoshop-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
  if (origin && allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

function parseResolution(input) {
  const ppi = Number(input || 300);
  if (!Number.isInteger(ppi)) throw new Error("Resolution must be a whole number between 72 and 500 pixels/inch.");
  if (ppi < 72) throw new Error("Resolution is too low. Minimum allowed resolution is 72 pixels/inch.");
  if (ppi > 500) throw new Error("Resolution is too high. Maximum allowed resolution is 500 pixels/inch.");
  return ppi;
}

function parseSizeUnit(input) {
  const unit = String(input || "in").trim().toLowerCase();
  if (unit === "in" || unit === "inch" || unit === "inches") return "in";
  if (unit === "cm" || unit === "cms" || unit === "centimeter" || unit === "centimeters") return "cm";
  throw new Error("Select a valid size unit: inches or cm.");
}

function toInches(value, unit) {
  return unit === "cm" ? value / 2.54 : value;
}

function formatSizeLabel(width, height, unit) {
  if (unit === "cm") return `${width}x${height} cm`;
  return `${width}x${height} in`;
}

function parseSize(input, resolution, sizeUnit) {
  const raw = String(input || "").trim().toLowerCase();
  const unit = parseSizeUnit(sizeUnit);
  const presets = {
    square: [12, 12],
    poster: [18, 24],
    story: [9, 16],
    reel: [9, 16],
    thumbnail: [16, 9],
    banner: [16, 9],
    a4: [8.27, 11.69],
  };
  const ppi = parseResolution(resolution);
  if (presets[raw]) {
    const [widthInches, heightInches] = presets[raw];
    return {
      width: Math.round(widthInches * ppi),
      height: Math.round(heightInches * ppi),
      widthInches,
      heightInches,
      ppi,
      label: `${raw.toUpperCase()} / ${widthInches}x${heightInches} in`
    };
  }

  const match = raw.match(/(\d+(?:\.\d+)?)\s*(?:x|by|\*)\s*(\d+(?:\.\d+)?)/);
  if (!match) throw new Error("Use a size like 12x12 in inches or 30x30 in cm. You can also use A4, story, poster, or thumbnail.");

  const widthValue = Number(match[1]);
  const heightValue = Number(match[2]);
  const widthInches = Math.min(Math.max(toInches(widthValue, unit), 0.25), 100);
  const heightInches = Math.min(Math.max(toInches(heightValue, unit), 0.25), 100);
  const width = Math.round(widthInches * ppi);
  const height = Math.round(heightInches * ppi);
  return { width, height, widthInches, heightInches, ppi, unit, label: formatSizeLabel(widthValue, heightValue, unit) };
}

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest();
}

function makePlan(prompt, size) {
  const hash = hashText(`${prompt}|${size.width}|${size.height}`);
  const palettes = [
    { name: "Ink Volt", bg: "101216", base: "f5f1e8", accent: "00d1a7", second: "ffba3b", deep: "20242b" },
    { name: "Gallery Signal", bg: "f2efe6", base: "141414", accent: "c53b2c", second: "28666e", deep: "ddd4c3" },
    { name: "Night Market", bg: "15120f", base: "fff7df", accent: "f45b69", second: "2ec4b6", deep: "2b2118" },
    { name: "Studio Chrome", bg: "e8edf0", base: "17191c", accent: "325dff", second: "f0b429", deep: "c9d2d9" },
    { name: "Editorial Moss", bg: "ebeadf", base: "182018", accent: "5d8a54", second: "d1495b", deep: "ccd0bd" }
  ];
  const styles = ["editorial", "premium", "bold", "minimal", "cinematic", "festival", "luxury", "tech"];
  const palette = palettes[hash[0] % palettes.length];
  const style = styles[hash[1] % styles.length];
  const title = prompt.split(/[,.]/)[0].trim().slice(0, 46) || "Custom Design";
  const subtitle = `Generated from: ${prompt}`.slice(0, 120);
  return {
    palette,
    style,
    title,
    subtitle,
    seed: hash.subarray(0, 4).toString("hex"),
    motifCount: 5 + (hash[2] % 5),
    diagonal: hash[3] % 2 === 0,
  };
}

function jsxString(value) {
  return JSON.stringify(String(value || ""));
}

function buildPhotoshopJsx({ prompt, size, plan, outputPng }) {
  const safeName = `Auto Photoshop ${plan.seed}`;
  const titleSize = Math.max(42, Math.round(Math.min(size.width, size.height) * 0.095));
  const subSize = Math.max(18, Math.round(Math.min(size.width, size.height) * 0.026));
  const margin = Math.round(Math.min(size.width, size.height) * 0.075);
  const blockW = Math.round(size.width * 0.72);
  const blockH = Math.round(size.height * 0.34);
  const blockX = plan.diagonal ? Math.round(size.width * 0.18) : margin;
  const blockY = Math.round(size.height * 0.18);

  return `
#target photoshop
app.displayDialogs = DialogModes.NO;

function color(hex) {
  var c = new SolidColor();
  c.rgb.hexValue = hex;
  return c;
}

function fillRect(doc, name, x, y, w, h, hex, opacity) {
  var layer = doc.artLayers.add();
  layer.name = name;
  layer.opacity = opacity;
  doc.selection.select([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  doc.selection.fill(color(hex));
  doc.selection.deselect();
  return layer;
}

function addText(doc, name, text, x, y, size, hex, fontName, width) {
  var layer = doc.artLayers.add();
  layer.kind = LayerKind.TEXT;
  layer.name = name;
  layer.textItem.contents = text;
  layer.textItem.position = [x, y];
  layer.textItem.size = size;
  layer.textItem.color = color(hex);
  layer.textItem.font = fontName;
  layer.textItem.width = width;
  return layer;
}

var doc = app.documents.add(${size.width}, ${size.height}, ${size.ppi}, ${jsxString(safeName)}, NewDocumentMode.RGB, DocumentFill.WHITE);
fillRect(doc, "Background - ${plan.palette.name}", 0, 0, ${size.width}, ${size.height}, "${plan.palette.bg}", 100);
fillRect(doc, "Editorial field", ${blockX}, ${blockY}, ${blockW}, ${blockH}, "${plan.palette.deep}", 92);
fillRect(doc, "Signal stripe", ${Math.round(size.width * 0.06)}, ${Math.round(size.height * 0.08)}, ${Math.max(18, Math.round(size.width * 0.025))}, ${Math.round(size.height * 0.84)}, "${plan.palette.accent}", 100);
fillRect(doc, "Secondary anchor", ${Math.round(size.width * 0.64)}, ${Math.round(size.height * 0.66)}, ${Math.round(size.width * 0.27)}, ${Math.round(size.height * 0.07)}, "${plan.palette.second}", 100);

for (var i = 0; i < ${plan.motifCount}; i++) {
  var x = (${margin} + i * ${Math.round(size.width * 0.13)}) % ${size.width};
  var y = (${Math.round(size.height * 0.58)} + i * ${Math.round(size.height * 0.047)}) % ${size.height};
  fillRect(doc, "Rhythm mark " + (i + 1), x, y, ${Math.max(28, Math.round(size.width * 0.05))}, ${Math.max(10, Math.round(size.height * 0.012))}, i % 2 ? "${plan.palette.base}" : "${plan.palette.accent}", 70);
}

addText(doc, "Title", ${jsxString(plan.title.toUpperCase())}, ${margin}, ${Math.round(size.height * 0.32)}, ${titleSize}, "${plan.palette.base}", "Arial-BoldMT", ${Math.round(size.width * 0.82)});
addText(doc, "Style Label", ${jsxString(`${plan.style.toUpperCase()} / ${size.label}`)}, ${margin}, ${Math.round(size.height * 0.16)}, ${subSize}, "${plan.palette.second}", "ArialMT", ${Math.round(size.width * 0.7)});
addText(doc, "Prompt Note", ${jsxString(plan.subtitle)}, ${margin}, ${Math.round(size.height * 0.78)}, ${subSize}, "${plan.palette.base}", "ArialMT", ${Math.round(size.width * 0.78)});

var outFile = new File(${jsxString(outputPng)});
var opts = new ExportOptionsSaveForWeb();
opts.format = SaveDocumentType.PNG;
opts.PNG8 = false;
opts.transparency = false;
doc.exportDocument(outFile, ExportType.SAVEFORWEB, opts);
`;
}

function photoshopComScript() {
  return `
function Get-PhotoshopExePaths {
  $paths = New-Object System.Collections.Generic.List[string]
  $appPathRoots = @(
    "Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Photoshop.exe",
    "Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Photoshop.exe",
    "Registry::HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Photoshop.exe"
  )

  foreach ($path in $appPathRoots) {
    try {
      $exe = (Get-Item -LiteralPath $path -ErrorAction Stop).GetValue("")
      if ($exe -and (Test-Path -LiteralPath $exe)) { $paths.Add([string]$exe) }
    } catch {}
  }

  $programRoots = @($env:ProgramFiles, [Environment]::GetEnvironmentVariable("ProgramFiles(x86)"))
  foreach ($root in $programRoots) {
    if (-not $root) { continue }
    try {
      Get-ChildItem -LiteralPath $root -Filter "Photoshop.exe" -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match "Adobe Photoshop" } |
        Sort-Object FullName -Descending |
        ForEach-Object { $paths.Add($_.FullName) }
    } catch {}
  }

  return $paths | Select-Object -Unique
}

function Get-PhotoshopApplication {
  $progIds = New-Object System.Collections.Generic.List[string]
  $progIds.Add("Photoshop.Application")

  $curVerPaths = @(
    "Registry::HKEY_CLASSES_ROOT\\Photoshop.Application\\CurVer",
    "Registry::HKEY_CLASSES_ROOT\\WOW6432Node\\Photoshop.Application\\CurVer"
  )
  foreach ($path in $curVerPaths) {
    try {
      $curVer = (Get-Item -LiteralPath $path -ErrorAction Stop).GetValue("")
      if ($curVer) { $progIds.Add([string]$curVer) }
    } catch {}
  }

  try {
    Get-ChildItem "Registry::HKEY_CLASSES_ROOT" -ErrorAction SilentlyContinue |
      Where-Object { $_.PSChildName -match "^Photoshop\\.Application(\\.\\d+)?$" } |
      Sort-Object PSChildName -Descending |
      ForEach-Object { $progIds.Add($_.PSChildName) }
  } catch {}

  $lastError = $null
  $uniqueProgIds = $progIds | Select-Object -Unique

  foreach ($progId in $uniqueProgIds) {
    try {
      return [Runtime.InteropServices.Marshal]::GetActiveObject($progId)
    } catch {}
  }

  foreach ($progId in $uniqueProgIds) {
    try {
      return New-Object -ComObject $progId
    } catch {
      $lastError = $_.Exception.Message
    }
  }

  $photoshopExe = Get-PhotoshopExePaths | Select-Object -First 1
  if ($photoshopExe) {
    Start-Process -FilePath $photoshopExe | Out-Null
    Start-Sleep -Seconds 8

    foreach ($progId in $uniqueProgIds) {
      try {
        return [Runtime.InteropServices.Marshal]::GetActiveObject($progId)
      } catch {}
      try {
        return New-Object -ComObject $progId
      } catch {
        $lastError = $_.Exception.Message
      }
    }
  }

  throw "Photoshop COM automation failed. Open Photoshop normally, close welcome/update popups, do not run Photoshop as Administrator, then try again. Tried COM IDs: $($uniqueProgIds -join ', '). Photoshop exe: $photoshopExe. Last error: $lastError"
}

$app = Get-PhotoshopApplication
`;
}

function runPowerShell(command, timeout) {
  const wrapped = [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    command,
    "} catch {",
    "  [Console]::Error.WriteLine($_.Exception.Message)",
    "  exit 1",
    "}"
  ].join("; ");

  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", wrapped], { timeout }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }
      resolve(stdout);
    });
  });
}

function runPhotoshopJsx(jsx) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsxPath = path.join(os.tmpdir(), `auto-photoshop-${Date.now()}.jsx`);
  fs.writeFileSync(jsxPath, jsx, "utf8");

  const psCommand = [
    photoshopComScript(),
    "$app.Visible = $true",
    `$code = Get-Content -LiteralPath '${jsxPath.replace(/'/g, "''")}' -Raw`,
    "$app.DoJavaScript($code)"
  ].join("; ");

  return runPowerShell(psCommand, 120000)
    .finally(() => {
      fs.rm(jsxPath, { force: true }, () => {});
    });
}

function openPhotoshop() {
  const psCommand = [
    photoshopComScript(),
    "$app.Visible = $true"
  ].join("; ");

  return runPowerShell(psCommand, 30000);
}

function openOutputFolder() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  return new Promise((resolve, reject) => {
    execFile("explorer.exe", [OUTPUT_DIR], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function createBridgeServer() {
  return http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === "OPTIONS") return sendJson(res, 204, {}, origin);

  try {
    if (req.url === "/api/login") {
      return loginHandler(req, res);
    }

    if (req.url === "/health" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, app: "Auto Photoshop Bridge", port: PORT }, origin);
    }

    if (req.url === "/pair" && req.method === "POST") {
      return sendJson(res, 200, { ok: true, token: bridgeToken, message: "This device approved Photoshop automation." }, origin);
    }

    if (req.url === "/open-photoshop" && req.method === "POST") {
      const token = req.headers["x-auto-photoshop-token"];
      if (token !== bridgeToken) return sendJson(res, 401, { ok: false, error: "Bridge permission is required." }, origin);

      await openPhotoshop();
      return sendJson(res, 200, { ok: true, message: "Photoshop opened." }, origin);
    }

    if (req.url === "/open-output-folder" && req.method === "POST") {
      const token = req.headers["x-auto-photoshop-token"];
      if (token !== bridgeToken) return sendJson(res, 401, { ok: false, error: "Bridge permission is required." }, origin);

      await openOutputFolder();
      return sendJson(res, 200, { ok: true, outputDir: OUTPUT_DIR }, origin);
    }

    if (req.url === "/design" && req.method === "POST") {
      const token = req.headers["x-auto-photoshop-token"];
      if (token !== bridgeToken) return sendJson(res, 401, { ok: false, error: "Bridge permission is required." }, origin);

      const body = await readJson(req);
      const prompt = String(body.prompt || "").trim();
      if (prompt.length < 8) throw new Error("Please provide a more detailed design prompt.");

      const size = parseSize(body.size, body.resolution, body.sizeUnit);
      const plan = makePlan(prompt, size);
      const fileName = `auto-photoshop-${plan.seed}-${size.width}x${size.height}.png`;
      const outputPng = path.join(OUTPUT_DIR, fileName);
      const jsx = buildPhotoshopJsx({ prompt, size, plan, outputPng });

      await runPhotoshopJsx(jsx);
      return sendJson(res, 200, { ok: true, outputPng, plan }, origin);
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message }, origin);
  }
  });
}

function startBridge(options = {}) {
  const port = Number(options.port || PORT);
  const host = options.host || "127.0.0.1";
  const server = createBridgeServer();

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      console.log(`Auto Photoshop bridge running at http://${host}:${port}`);
      console.log(`Output folder: ${OUTPUT_DIR}`);
      resolve({ server, port, host, outputDir: OUTPUT_DIR });
    });
  });
}

if (require.main === module) {
  startBridge().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  startBridge,
  createBridgeServer,
  parseResolution,
  parseSizeUnit,
  parseSize,
  makePlan,
  buildPhotoshopJsx,
};
