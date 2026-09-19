// Downloads the media helper binaries (yt-dlp, ffmpeg) into electron/bin so the
// packaged desktop app works with nothing installed by the user.
// These binaries are intentionally NOT committed — they are fetched at package time.

import { createWriteStream } from "node:fs";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(here, "..", "electron", "bin");

const platform = process.argv[2] || process.platform;
const arch = process.argv[3] || process.arch;

const YT_DLP = {
  linux: "yt-dlp_linux",
  darwin: "yt-dlp_macos",
  win32: "yt-dlp.exe",
};

// macOS gets a single-file static build matched to the chip; the other
// platforms take the archived gpl builds.
const FFMPEG_DIRECT = {
  "darwin-arm64":
    "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-darwin-arm64",
  "darwin-x64":
    "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-darwin-x64",
};

const FFMPEG_ARCHIVE = {
  linux:
    "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz",
  win32:
    "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
};

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

async function getYtDlp() {
  const name = platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const target = path.join(BIN, name);
  if (await exists(target)) return console.log(`yt-dlp already present`);
  const asset = YT_DLP[platform];
  if (!asset) throw new Error(`No yt-dlp build for ${platform}`);
  console.log(`Downloading yt-dlp (${asset})…`);
  await download(
    `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`,
    target,
  );
  await chmod(target, 0o755);
  console.log("yt-dlp ready");
}

async function getFfmpeg() {
  const name = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const target = path.join(BIN, name);
  if (await exists(target)) return console.log("ffmpeg already present");

  const direct = FFMPEG_DIRECT[`${platform}-${arch}`];
  if (direct) {
    console.log(`Downloading ffmpeg (${platform}-${arch})…`);
    await download(direct, target);
    await chmod(target, 0o755);
    return console.log("ffmpeg ready");
  }

  const url = FFMPEG_ARCHIVE[platform];
  if (!url) throw new Error(`No ffmpeg build for ${platform}-${arch}`);
  const staging = path.join(BIN, ".ffmpeg-tmp");
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  const archive = path.join(staging, url.endsWith(".zip") ? "ff.zip" : "ff.tar.xz");
  console.log("Downloading ffmpeg…");
  await download(url, archive);

  const run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit" }).status === 0;
  let unpacked = url.endsWith(".zip")
    ? run("unzip", ["-q", archive, "-d", staging]) ||
      run("nix", ["run", "nixpkgs#unzip", "--", "-q", archive, "-d", staging])
    : run("tar", ["xf", archive, "-C", staging]);
  if (!unpacked && !url.endsWith(".zip")) {
    // Some minimal environments ship tar without xz support.
    unpacked =
      (run("xz", ["-d", archive]) ||
        run("nix", ["run", "nixpkgs#xz", "--", "-d", archive])) &&
      run("tar", ["xf", archive.replace(/\.xz$/, ""), "-C", staging]);
  }
  if (!unpacked) throw new Error("Could not unpack the ffmpeg archive");

  const found = spawnSync("sh", ["-c", `find ${JSON.stringify(staging)} -type f -name ${name}`], {
    encoding: "utf8",
  }).stdout.trim().split("\n")[0];
  if (!found) throw new Error("ffmpeg binary not found inside the archive");
  await rename(found, target);
  await chmod(target, 0o755);
  await rm(staging, { recursive: true, force: true });
  console.log("ffmpeg ready");
}

await mkdir(BIN, { recursive: true });
await getYtDlp();
await getFfmpeg();
console.log(`Helpers ready in ${BIN}`);
