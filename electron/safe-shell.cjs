// Real-filesystem side of the Safe Shell page. No shell is ever spawned:
// every command is one explicit Node fs call, re-validated here.
// Deletions and overwritten files go to the system Trash, so they can be recovered.

const fs = require("fs");
const os = require("os");
const path = require("path");

const ALLOWED = new Set(["ls", "pwd", "cd", "cat", "mkdir", "touch", "rm", "mv", "cp"]);

function checkPath(p) {
  if (typeof p !== "string" || !path.isAbsolute(p) || p.includes("\0")) throw new Error("Invalid path.");
  return path.normalize(p);
}
function isProtected(p) {
  const home = os.homedir();
  return p === "/" || p === home || home.startsWith(p + path.sep) || p.split(path.sep).filter(Boolean).length < 2;
}
function kind(p) {
  try {
    return fs.statSync(p).isDirectory() ? "dir" : "file";
  } catch {
    return null;
  }
}

function register(ipcMain, shell) {
  ipcMain.handle("shell-home", () => os.homedir());

  ipcMain.handle("shell-stat", (_e, paths) => {
    const out = {};
    for (const p of Array.isArray(paths) ? paths.slice(0, 50) : []) out[p] = kind(checkPath(p));
    return out;
  });

  ipcMain.handle("shell-list", (_e, dir) => {
    try {
      return fs
        .readdirSync(checkPath(dir), { withFileTypes: true })
        .slice(0, 200)
        .map((d) => ({ name: d.name, kind: d.isDirectory() ? "dir" : "file" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  });

  ipcMain.handle("shell-exec", async (_e, op) => {
    if (!op || !ALLOWED.has(op.cmd) || !Array.isArray(op.paths)) throw new Error("Unsupported command.");
    const paths = op.paths.map(checkPath);
    const [a, b] = paths;
    switch (op.cmd) {
      case "pwd":
      case "cd":
        return a;
      case "ls":
        return kind(a) === "file"
          ? path.basename(a)
          : fs.readdirSync(a, { withFileTypes: true }).map((d) => (d.isDirectory() ? d.name + "/" : d.name)).join("  ") || "(empty)";
      case "cat": {
        const fd = fs.openSync(a, "r");
        const buf = Buffer.alloc(64 * 1024);
        const n = fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        return buf.subarray(0, n).toString("utf8") + (n === buf.length ? "\n… (truncated at 64 KB)" : "");
      }
      case "mkdir":
        for (const p of paths) fs.mkdirSync(p, { recursive: Boolean(op.parents) });
        return "";
      case "touch":
        for (const p of paths) {
          const now = new Date();
          if (kind(p)) fs.utimesSync(p, now, now);
          else fs.writeFileSync(p, "", { flag: "wx" });
        }
        return "";
      case "rm":
        for (const p of paths) {
          if (isProtected(p)) throw new Error(`Refusing to delete ${p}.`);
          const k = kind(p);
          if (!k) throw new Error(`${p} doesn't exist.`);
          if (k === "dir" && !op.recursive) throw new Error(`${p} is a folder.`);
        }
        for (const p of paths) await shell.trashItem(p);
        return `Moved ${paths.length} item(s) to the Trash.`;
      case "mv":
      case "cp": {
        if (op.cmd === "mv" && isProtected(a)) throw new Error(`Refusing to move ${a}.`);
        if (!kind(a)) throw new Error(`${a} doesn't exist.`);
        if (!kind(path.dirname(b))) throw new Error(`${path.dirname(b)} doesn't exist.`);
        const existing = kind(b);
        if (existing === "dir") throw new Error(`${b} already exists as a folder.`);
        if (existing === "file") await shell.trashItem(b);
        if (op.cmd === "mv") fs.renameSync(a, b);
        else fs.cpSync(a, b, { recursive: Boolean(op.recursive), errorOnExist: true, force: false });
        return existing ? "Previous file moved to the Trash." : "";
      }
    }
    return "";
  });
}

module.exports = { register };
