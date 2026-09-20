// Desktop shell. Runs the local download service in-process, so the user never
// has to start anything from a terminal.

const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const downloader = require("./downloader.cjs");
const appServer = require("./app-server.cjs");

const DEV_URL = process.env.APP_URL || "http://localhost:8080";
let server = null;
let site = null;
let win = null;

if (!app.requestSingleInstanceLock()) app.quit();

async function loadApplication(window) {
  if (!app.isPackaged) return window.loadURL(DEV_URL);
  if (!site) {
    site = await appServer.start({ distDir: path.join(__dirname, "..", "dist"), port: 4173 });
  }
  return window.loadURL(site.url);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    backgroundColor: "#F4EFE6",
    title: "Writing Diagnostic",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  loadApplication(win).catch((error) => {
    dialog.showErrorBox("Unable to open Writing Diagnostic", error.message);
  });
  win.once("ready-to-show", () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

ipcMain.handle("pick-directory", async () => {
  const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

app.on("second-instance", () => {
  if (win?.isMinimized()) win.restore();
  win?.focus();
});

app.whenReady().then(async () => {
  try {
    server = await downloader.start(3000, {
      runtimeDir: path.join(app.getPath("userData"), "helpers"),
    });
  } catch (error) {
    dialog.showErrorBox(
      "Local downloader could not start",
      error?.code === "EADDRINUSE"
        ? "Port 3000 is already in use. Close the other downloader and reopen the app."
        : error.message,
    );
    app.quit();
    return;
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  downloader.killAll();
  server?.close();
  if (process.platform !== "darwin") app.quit();
});
