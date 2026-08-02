# Removal prompt

The page ends with a single copy-to-clipboard code block. Paste this exact text (substituting your route + component paths if different):

```
Remove the "Start Here" button from the navbar and delete the /start-here route. Also delete src/components/start-here-button.tsx and src/routes/start-here.tsx. Keep everything else as-is.
```

## Block requirements

- Rendered as a `<pre>` with monospace, wrapped in a bordered card matching the project's input/card style.
- A small `Copy` button (top-right of the card) using `navigator.clipboard.writeText`. Swap to `Copied` for ~1.8s on success.
- Eyebrow label above the card: `Prompt — copy into Lovable chat` (mono, uppercase tracked).
- Below the card, one muted line: `You can always ask Lovable to add it back later.`

## Why not auto-remove

The button is the user's choice to remove. We never put the removal behind a button click — they paste a prompt into Lovable chat and let Lovable do the edit. This keeps the action explicit and recoverable.

## If the project uses different file paths

Adapt the prompt text to reference the actual files you created. The shape (a single sentence telling Lovable what to delete) stays the same.