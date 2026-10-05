import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM = `You explain why a command was blocked by "Safe Shell", a safety-first file tool.
Safe Shell only supports these commands: ls, pwd, cd, cat, mkdir, touch, rm, mv, cp.
Allowed flags: ls -a -l, mkdir -p, rm -r -f, cp -r. It never allows sudo, pipes, chaining (; & |), redirection (< >), variables ($), backticks, or wildcards (* ? [ ] { }).
It refuses to delete or move "/", the home folder, or very shallow system paths. Names with spaces must be quoted.
You never execute anything. Reply ONLY with JSON: {"why": string, "alternative": string, "note": string}.
"why": 1-3 plain sentences for a beginner. "alternative": ONE single supported command that achieves the safe intent, or "" if none is safe. "note": one short sentence about what the alternative does.`;

export const explainBlocked = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ command: z.string().min(1).max(500), cwd: z.string().max(500), issues: z.array(z.string().max(400)).max(10) }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { error: "AI is not configured." };
    const user = `Command: ${data.command}\nCurrent folder: ${data.cwd}\nSafe Shell findings:\n- ${data.issues.join("\n- ") || "(none)"}\nExplain why it is blocked and suggest a safe supported alternative.`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: SYSTEM,
        input: user,
        reasoning: { effort: "low" },
        store: false,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      let msg = t.slice(0, 300);
      try { msg = JSON.parse(t)?.error?.message ?? JSON.parse(t)?.message ?? msg; } catch { /* keep */ }
      if (res.status === 402) msg = msg || "AI credits are used up.";
      if (res.status === 429) msg = "Too many requests — wait a moment and try again.";
      return { error: msg || `AI request failed (${res.status}).`, status: res.status };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
          if (ev.type === "response.failed" || ev.type === "error") return { error: ev.response?.error?.message ?? ev.message ?? "AI failed." };
        } catch { /* ignore partial */ }
      }
    }
    const m = text.match(/\{[\s\S]*\}/);
    try {
      const j = JSON.parse(m?.[0] ?? "");
      return { why: String(j.why ?? ""), alternative: String(j.alternative ?? "").trim(), note: String(j.note ?? "") };
    } catch {
      return text.trim() ? { why: text.trim(), alternative: "", note: "" } : { error: "The AI returned no answer." };
    }
  });
