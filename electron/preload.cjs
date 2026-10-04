const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  pickDirectory: () => ipcRenderer.invoke("pick-directory"),
  shell: {
    home: () => ipcRenderer.invoke("shell-home"),
    stat: (paths) => ipcRenderer.invoke("shell-stat", paths),
    list: (dir) => ipcRenderer.invoke("shell-list", dir),
    exec: (op) => ipcRenderer.invoke("shell-exec", op),
  },
});
