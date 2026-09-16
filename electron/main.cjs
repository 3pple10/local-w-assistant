// Desktop shell. Runs the local download service in-process, so the user never
// has to start anything from a terminal.

const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const downloader = require("./downloader.cjs");

const APP_URL = process.env.APP_URL || "http://localhost:8080";
let server = null;
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    backgroundColor: "#F4EFE6",
    title: "Writing Diagnostic",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  win.loadURL(APP_URL);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

ipcMain.handle("pick-directory", async () => {
  const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

app.whenReady().then(() => {
  server = downloader.start(3000);
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
