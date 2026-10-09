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
  agent: {
    getSettings: () => ipcRenderer.invoke("agent-settings-get"),
    setSettings: (s) => ipcRenderer.invoke("agent-settings-set", s),
    detect: () => ipcRenderer.invoke("agent-detect"),
    llm: (messages, role) => ipcRenderer.invoke("agent-llm", { messages, role }),
    listApps: () => ipcRenderer.invoke("agent-list-apps"),
    read: (slug, file) => ipcRenderer.invoke("agent-read", slug, file),
    write: (slug, files) => ipcRenderer.invoke("agent-write", slug, files),
    deleteApp: (slug) => ipcRenderer.invoke("agent-delete-app", slug),
    preview: (slug) => ipcRenderer.invoke("agent-preview", slug),
    reveal: (slug) => ipcRenderer.invoke("agent-reveal", slug),
    jcode: {
      status: () => ipcRenderer.invoke("jcode-status"),
      run: (slug, message) => ipcRenderer.invoke("jcode-run", { slug, message }),
      cancel: () => ipcRenderer.invoke("jcode-cancel"),
      onEvent: (cb) => {
        const h = (_e, ev) => cb(ev);
        ipcRenderer.on("jcode-event", h);
        return () => ipcRenderer.removeListener("jcode-event", h);
      },
    },
  },
});
