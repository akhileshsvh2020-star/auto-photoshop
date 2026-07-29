const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("connector", {
  status: () => ipcRenderer.invoke("connector:status"),
  setStartup: (openAtLogin) => ipcRenderer.invoke("connector:set-startup", openAtLogin),
  openUrl: (url) => ipcRenderer.invoke("connector:open-url", url),
});
