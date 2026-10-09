import { findModel, type LlmModel } from "./llm-models";

export type DeviceReport = {
  webgpu: boolean;
  webgpuAdapter: string | null;
  maxBufferMB: number | null;
  ramGB: number | null;
  cores: number | null;
  storageQuotaMB: number | null;
  storageUsedMB: number | null;
  wasmThreads: boolean;
};

export type Verdict = {
  pass: boolean;
  level: "pass" | "warn" | "fail";
  device: "webgpu" | "wasm";
  reasons: string[];
};

export async function inspectDevice(): Promise<DeviceReport> {
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: any };
  let webgpu = false;
  let webgpuAdapter: string | null = null;
  let maxBufferMB: number | null = null;

  try {
    if (nav.gpu?.requestAdapter) {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) {
        webgpu = true;
        const info = adapter.info ?? (await adapter.requestAdapterInfo?.());
        webgpuAdapter =
          [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(" ") ||
          "WebGPU adapter";
        maxBufferMB = adapter.limits?.maxBufferSize
          ? Math.round(adapter.limits.maxBufferSize / 1024 / 1024)
          : null;
      }
    }
  } catch {
    webgpu = false;
  }

  let storageQuotaMB: number | null = null;
  let storageUsedMB: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) storageQuotaMB = Math.round(est.quota / 1024 / 1024);
    if (est?.usage != null) storageUsedMB = Math.round(est.usage / 1024 / 1024);
  } catch {
    /* not available */
  }

  return {
    webgpu,
    webgpuAdapter,
    maxBufferMB,
    ramGB: nav.deviceMemory ?? null,
    cores: navigator.hardwareConcurrency ?? null,
    storageQuotaMB,
    storageUsedMB,
    wasmThreads: typeof SharedArrayBuffer !== "undefined",
  };
}

/** Decides whether this device should be allowed to download and run a model. */
export function verifyModel(model: LlmModel, report: DeviceReport): Verdict {
  const reasons: string[] = [];
  let level: Verdict["level"] = "pass";

  const device: Verdict["device"] = report.webgpu ? "webgpu" : "wasm";

  if (report.webgpu) {
    reasons.push(`WebGPU available${report.webgpuAdapter ? ` — ${report.webgpuAdapter}` : ""}.`);
  } else if (model.requiresWebGPU) {
    reasons.push("WebGPU is unavailable — this model is too slow to run on WASM.");
    level = "fail";
  } else {
    reasons.push("No WebGPU: falling back to WASM. Expect slow generation.");
    level = "warn";
  }

  if (report.ramGB != null) {
    // Browsers and Electron never report more than 8GB (privacy cap), so 8 means
    // "8GB or more" — with WebGPU we can't prove a shortfall, only warn.
    const capped = report.ramGB >= 8 && report.webgpu;
    if (report.ramGB >= model.minRamGB) {
      reasons.push(`Device memory ${report.ramGB}GB ≥ ${model.minRamGB}GB required.`);
    } else if (capped) {
      reasons.push(
        `Memory reads as 8GB — the most a browser will ever report. This model suggests ${model.minRamGB}GB; it may run slowly if your machine really has 8GB.`,
      );
      if (level === "pass") level = "warn";
    } else {
      reasons.push(`Reported device memory ${report.ramGB}GB is below the ${model.minRamGB}GB this model needs.`);
      level = "fail";
    }
  } else {
    reasons.push("Browser does not report device memory — proceeding on best effort.");
    if (level === "pass") level = "warn";
  }

  if (report.cores != null) {
    if (report.cores < 4 && !report.webgpu) {
      reasons.push(`${report.cores} CPU threads is under the 4 recommended for WASM inference.`);
      level = "fail";
    } else {
      reasons.push(`${report.cores} CPU threads detected.`);
    }
  }

  if (report.storageQuotaMB != null) {
    const free = report.storageQuotaMB - (report.storageUsedMB ?? 0);
    if (free < model.sizeMB * 1.15) {
      reasons.push(
        `Only ~${free}MB of browser storage free — the model needs ~${model.sizeMB}MB cached.`,
      );
      level = "fail";
    } else {
      reasons.push(`~${free}MB browser storage free for a ~${model.sizeMB}MB download.`);
    }
  }

  if (report.maxBufferMB != null && report.maxBufferMB < 256 && report.webgpu) {
    reasons.push(`GPU max buffer ${report.maxBufferMB}MB is small — generation may fail mid-run.`);
    if (level === "pass") level = "warn";
  }

  return { pass: level !== "fail", level, device, reasons };
}

export async function verifyById(modelId: string) {
  const report = await inspectDevice();
  return { report, verdict: verifyModel(findModel(modelId), report) };
}
