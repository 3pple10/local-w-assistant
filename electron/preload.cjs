const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  pickDirectory: () => ipcRenderer.invoke("pick-directory"),
});
