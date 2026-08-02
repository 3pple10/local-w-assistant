# Code structure

## Button component

`src/components/start-here-button.tsx` — single pill, accent color, links to `/start-here`. Inherit:
- `border-radius`: project's pill token (usually `rounded-full`)
- `font-family`: project's UI/button font (Courier Prime, Inter, etc.)
- `letter-spacing` and `text-transform`: match the project's other buttons
- Color: project's defined accent (e.g. `--hanko`, `--primary`, `--accent`). Never invent a new hex.

Label text: `Start Here` (or uppercase tracked if other nav items are).

## Route

TanStack Start: `src/routes/start-here.tsx` exporting `createFileRoute("/start-here")`. React Router: a `<Route path="/start-here" />`. Next: `app/start-here/page.tsx`. Adapt to whatever routing the project uses — never introduce a new router.

Re-use the project's existing site header / layout chrome inside the route so the page sits inside the same shell as the rest of the app.

## Nav placement

### Top header
Place the button absolutely centered in the header bar so it reads as the canonical entry point, not just another link. The header's left logo and right nav items stay where they are.

```tsx
<header className="relative ...">
  <Logo />
  <div className="absolute left-1/2 -translate-x-1/2">
    <StartHereButton />
  </div>
  <Nav />
</header>
```

If the home page renders its own custom header (separate from the shared header component), add the button to both.

### Sidebar
Mount as the first item, visually separated from the rest of the nav with a divider beneath it. Use the same pill treatment, full width of the sidebar's content area.

### No nav
Mount fixed `top-4 left-1/2 -translate-x-1/2 z-40` on the home route only.

## What NOT to do

- Don't create a new layout file or rewrite the header — extend the existing one.
- Don't add a new color token, font, or radius. Reuse what's in `src/styles.css`.
- Don't replace the home page's primary CTA with this button. Start Here is secondary.
- Don't add this button to the guide page itself (would link to itself).