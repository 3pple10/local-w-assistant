// Desktop downloads per platform: newest first, only the last 3 builds are kept.
import macArm3 from "@/assets/desktop-bundle-mac-arm64.zip.asset.json";
import macArm2 from "@/assets/desktop-versions/mac-arm64-v2.asset.json";
import macArm1 from "@/assets/desktop-versions/mac-arm64-v1.asset.json";
import macX3 from "@/assets/desktop-bundle-mac-x64.zip.asset.json";
import macX2 from "@/assets/desktop-versions/mac-x64-v2.asset.json";
import macX1 from "@/assets/desktop-versions/mac-x64-v1.asset.json";
import linux2 from "@/assets/desktop-bundle.tar.gz.asset.json";
import linux1 from "@/assets/desktop-versions/linux-v1.asset.json";
import win1 from "@/assets/desktop-versions/windows-v1.asset.json";

export interface DesktopBuild {
  label: string;
  url: string;
  date: string;
  sizeMb: number;
}
export interface DesktopPlatform {
  name: string;
  hint: string;
  builds: DesktopBuild[];
}

const MAX_VERSIONS = 3;
const b = (a: { url: string; created_at: string; size: number }, label: string): DesktopBuild => ({
  label,
  url: a.url,
  date: a.created_at.slice(0, 10),
  sizeMb: Math.round(a.size / 1e6),
});

export const DESKTOP_PLATFORMS: DesktopPlatform[] = [
  {
    name: "Mac · Apple Silicon",
    hint: "First open: right-click → Open (not signed by Apple yet).",
    builds: [b(macArm3, "Latest — Safe Shell + Fetcher"), b(macArm2, "Previous — Fetcher fixes"), b(macArm1, "Original")],
  },
  {
    name: "Mac · Intel",
    hint: "First open: right-click → Open (not signed by Apple yet).",
    builds: [b(macX3, "Latest — Safe Shell + Fetcher"), b(macX2, "Previous — Fetcher fixes"), b(macX1, "Original")],
  },
  {
    name: "Windows",
    hint: "Unzip, then open Workbench.exe. Windows may warn once — More info → Run anyway. Safe Shell uses practice folders on Windows.",
    builds: [b(win1, "Latest — Safe Shell + Fetcher")],
  },
  {
    name: "Linux",
    hint: "Unpack, then run the Workbench file.",
    builds: [b(linux2, "Latest — Safe Shell + Fetcher"), b(linux1, "Original")],
  },
].map((p) => ({ ...p, builds: p.builds.slice(0, MAX_VERSIONS) }));
