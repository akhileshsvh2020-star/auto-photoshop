const path = require("path");
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  shell,
  ipcMain,
} = require("electron");

const CONNECTOR_PORT = Number(process.env.PORT || 4765);
let mainWindow;
let tray;
let bridgeInfo;
let startBridge;

function makeTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#121512"/>
      <rect x="6" y="5" width="7" height="22" fill="#d24b35"/>
      <rect x="15" y="5" width="11" height="22" fill="#1d6b70"/>
    </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 560,
    minWidth: 680,
    minHeight: 500,
    title: "Auto Photoshop Connector",
    backgroundColor: "#ece8dc",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip("Auto Photoshop Connector");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Connector", click: () => showWindow() },
    { label: "Open Web App", click: () => shell.openExternal("http://127.0.0.1:4765") },
    { type: "separator" },
    {
      label: "Start With Windows",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]));
  tray.on("double-click", () => showWindow());
}

function showWindow() {
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.focus();
}

app.setAsDefaultProtocolClient("autophotoshop");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());

  app.whenReady().then(async () => {
    process.env.AUTO_PHOTOSHOP_DATA_DIR = path.join(app.getPath("userData"), "bridge");
    process.env.AUTO_PHOTOSHOP_OUTPUT_DIR = path.join(app.getPath("pictures"), "Auto Photoshop");
    ({ startBridge } = require("../server"));
    bridgeInfo = await startBridge({ port: CONNECTOR_PORT });
    createTray();
    createWindow();
  });
}

app.on("activate", () => showWindow());

ipcMain.handle("connector:status", () => ({
  port: CONNECTOR_PORT,
  url: `http://127.0.0.1:${CONNECTOR_PORT}`,
  outputDir: bridgeInfo?.outputDir,
  startWithWindows: app.getLoginItemSettings().openAtLogin,
}));

ipcMain.handle("connector:set-startup", (_event, openAtLogin) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(openAtLogin) });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle("connector:open-url", (_event, url) => shell.openExternal(url));
