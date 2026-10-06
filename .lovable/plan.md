# Local Desktop Agent ("mini Lovable") — plan

## Goal
A desktop-only agent in the Chat page that builds small web apps on your computer (a mini game, a schedule maker), saves their data in a local database, and runs them in a preview. It can use a local model or your own cloud AI key.

## What you will see
1. **Chat → Agent mode.** You describe an app. The agent plans it, writes the files, and shows a live preview beside the chat.
2. **My Apps.** Each built app sits in its own folder (e.g. `~/Workbench Apps/schedule-maker`), with Open, Edit again, and Delete (to the Trash).
3. **Model picker with three sources:**
   - On-device (the current Qwen models, free and offline, best for small edits)
   - A local runner like Ollama or LM Studio, if installed (bigger models, uses your machine's full memory, not the browser's limit)
   - Your own cloud key (OpenAI, Anthropic, Google, OpenRouter, or any OpenAI-compatible address). The key stays on your computer, in the system keychain.
4. **Approve before writing.** Every file change appears as a diff card with Apply / Skip, like the Safe Shell confirm step.

## How it works
```text
You ──> Planner (small model: splits the task into steps)
          └─> Builder (big model: writes each file, one step at a time)
                └─> Checker (runs a build/lint, reports errors back to the Builder)
                      └─> Preview window + local database
```
- **Chained models, one after another** (your earlier idea): a small model plans, a bigger one writes, and a checker loops on errors. Each step gets only the files it needs ("context-less"), so small models stay accurate.
- **Jcode repo:** used as the agent's tool layer (read file, write file, search, run build) if its license allows. I'll check the license and structure first; if it doesn't fit, we build the same tools ourselves.
- **Local database:** each app gets its own SQLite file through a small built-in helper, so a schedule maker can save entries with no setup.
- **Safety:** the agent can only touch its own apps folder. Commands go through the same allow-list idea as Safe Shell, and nothing runs without your approval.

## Steps
1. Model sources: local runner + your cloud key in the Chat page (works in today's chat too).
2. Agent tools inside the desktop app: sandboxed apps folder, file read/write, diff approval.
3. App templates (plain HTML/JS + SQLite helper) and the live preview window.
4. Planner → Builder → Checker chain with error looping.
5. My Apps gallery; then rebuild the Mac, Windows and Linux downloads.

## Technical details
- Electron main process hosts agent tools via IPC (like safe-shell.cjs); the renderer only gets approved results.
- Cloud keys are stored with Electron `safeStorage`; calls go from the main process directly to the provider.
- Local runners are detected at `localhost:11434` (Ollama) and `localhost:1234` (LM Studio), both OpenAI-compatible.
- SQLite via `better-sqlite3` rebuilt for each platform, or `sql.js` (WASM) to avoid native builds.
- Generated apps are served from a local static server on a random 127.0.0.1 port into a sandboxed preview window.

## Questions for you
- Which matters most first: cloud key support, or fully offline building?
- Is Jcode the repo at a specific link? Please send it.
