## Plan

Add a small readiness state to the homepage extraction panel so the sandbox does not accept extraction until the client and server-function layer are actually ready.

## What will change

1. **Gate the extract control**
   - Replace the active extract button with `INITIALIZING · PLEASE WAIT` until readiness is confirmed.
   - Keep the URL/file inputs visible, but disable submit while initializing.
   - If the user clicks/presses submit early, show a direct message instead of trying a server call.

2. **Use a real readiness probe**
   - Call the existing lightweight `warmServer` server function from `kits.functions.ts` after hydration.
   - Mark the panel ready only after that call succeeds.
   - Add a short retry loop for sandbox cold starts rather than failing immediately.

3. **Make readiness visible and honest**
   - Show a compact status line under the input while initializing.
   - Remove any implication that extraction is ready before the server function round-trip succeeds.

4. **Decouple readiness from recent kits**
   - Recent kits showing up is currently just an accidental signal that client-side code has hydrated/cache loaded.
   - The extraction panel should own its own readiness check instead of relying on the recent kits section.

5. **Verify in preview**
   - Load `/` in the Lovable sandbox.
   - Confirm the button starts as initializing.
   - Confirm it switches to extract after the warm server call.
   - Submit a URL immediately after it becomes ready and verify the create + extract server requests run from the sandbox.

## Technical details

- Update `src/components/ingestion-panel.tsx` only unless verification exposes a separate import/cache issue.
- Import `warmServer` and call it through `useServerFn` inside `useEffect`.
- Track readiness as `"initializing" | "ready" | "error"`.
- Disable the submit button when `busy || readiness !== "ready"`.
- Keep current behavior of staying on the homepage during extraction and navigating only after success.

## Honest limitation

This will not make Lovable sandbox infrastructure instantly ready. It will prevent users from submitting during the fragile startup window, which is the reliable fix for the preview-only behavior you’re seeing.