---
name: start-here-guide
description: Add a brand-matched "Start Here" button + guide page to a Lovable template, explaining what the app does, how to use it, any connectors required (with pricing), and a copy-paste prompt to remove the button when the user is done. Trigger when the user asks for a Start Here button, template onboarding page, remix guide, getting-started overlay, or "explain this template to people who remix it."
---

# Start Here Guide

Adds a single discoverable entry point — a "Start Here" pill button in the project's primary navigation — that opens a calmly designed guide page tailored to *this* template. The guide tells someone who just remixed the project: what it does, how to use it, any connectors it needs (and what they cost), and gives them a one-paste prompt to remove the button and page when they're done.

This skill is for official Lovable templates. The goal: a remixer goes from "what is this?" to "I'm building" in under a minute.

## When to use

Trigger phrases: "add a Start Here button", "template onboarding", "remix guide", "explain this template", "getting started page for the template", "help new users figure out my template".

Do NOT use for in-product feature tours, multi-step product tutorials, or marketing landing pages. This is template orientation only.

## Process

1. **Scan the project thoroughly** before writing a single line:
   - `src/routes/` — map every page so the guide covers what actually exists
   - `src/components/` — note key features (forms, ingestion panels, libraries, dashboards)
   - `package.json` — stack and notable dependencies
   - `README.md`, `DESIGN.md`, any project knowledge files — voice + brand
   - `src/styles.css` and component primitives — exact tokens, fonts, radii, shadows, button shape
   - The home page (`src/routes/index.tsx`) — copy tone, eyebrow style, headline font
   - Any existing `start-here.tsx`, `getting-started.tsx`, or onboarding component — extend, don't duplicate

2. **Detect connectors and their cost:**
   - Grep server code for known connector env var patterns: `FIRECRAWL_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, `LOVABLE_API_KEY` (always-on, skip), `SLACK_API_KEY`, `GOOGLE_*_API_KEY`, `TWILIO_*`, etc. Also grep for `connector-gateway.lovable.dev/{id}/` paths.
   - For each detected connector, look up current pricing from the provider's public pricing page (use websearch if unsure). Report: free tier (credits / requests / sends), paid plan entry price, and a realistic estimate of whether typical use of *this* template stays free.
   - Skip `LOVABLE_API_KEY` — it ships with every project.
   - If no third-party connector is used, omit the connector section entirely. Do not invent one.

3. **Detect the navigation surface** so the button lands in the right place:
   - Top navbar: look for `site-header.tsx`, `header.tsx`, `navbar.tsx`, or a `<header>` in `__root.tsx` / `index.tsx`. Place the button absolutely centered in the header bar.
   - Sidebar: look for `sidebar.tsx`, `app-sidebar.tsx`, or `ui/sidebar.tsx` usage. Place the button as the first item in the primary nav group, visually separated.
   - If both exist, prefer the top header (more discoverable for first-time remixers).
   - If neither exists, mount it fixed top-center on the home route only.

4. **Build the route and button** (see `references/structure.md` for code shape):
   - Route file: `src/routes/start-here.tsx` (TanStack Start file-based routing) or the project's routing equivalent.
   - Button component: `src/components/start-here-button.tsx`.
   - Both must use the project's design tokens — never hardcode a color or font unless the project itself does. Read `src/styles.css` first and reuse its variables.
   - The button is a single pill in the project's accent color. One pill, one accent. No icon unless the rest of the nav uses icons. Label: `Start Here` (sentence case unless the project's nav is uppercase tracked, in which case match).

5. **Write the guide page content** following `references/page-structure.md`. Every section must be grounded in what the project actually does — no invented features.

6. **Match the brand precisely:**
   - Pull fonts, colors, radii, eyebrow style, and section dividers from the project's existing pages (usually the home route is the strongest reference).
   - Reuse the home page's `<header>` / nav component so the guide doesn't feel like a different app.
   - Match copy voice: read the home headline + CTA and mirror their cadence, capitalization, and punctuation rules.

7. **Always include the removal escape hatch** at the bottom of the page — a copy-to-clipboard prompt block the user can paste into Lovable chat to delete the button, the route, and this skill's traces. See `references/removal-prompt.md`.

8. **Verify after building:**
   - Button visible in the right nav surface on every route, including the home route.
   - `/start-here` renders without console errors.
   - Copy button on the removal prompt works.
   - No color, font, or radius hardcoded that violates the project's design system.

## Required page sections

See `references/page-structure.md`. Summary (in order):

1. Eyebrow + H1 (`Start here.`)
2. **01. What this template does** — 2–3 short paragraphs grounded in real features
3. **02. Connectors** (only if any exist) — branded card per connector + pricing note + copy-paste connection prompt
4. **03. When you're done with this guide** — removal prompt block
5. Back link to home + small version footer

No numbered "How to use it" steps. Remixers learn faster by clicking around than by reading procedure.

## Style rules

- Match the project's existing eyebrow style (e.g. `// 01 — section`) — don't impose a new one.
- Sentence case for headings unless the project uses tracked uppercase.
- No emoji on the page itself unless the project already uses them.
- No exclamation marks. No "powerful", "seamless", "intuitive", "game-changing".
- Connector pricing must cite real numbers (e.g. "500 free credits, $16/mo Hobby"), not vague phrases like "affordable plans".
- Prompt blocks are monospace, in a bordered card, with a working copy button.

## References

- `references/structure.md` — Code shape for the route, button, and nav placement
- `references/page-structure.md` — Exact section order, headings, and content rules
- `references/connector-pricing.md` — Known connector free tiers and paid entry prices (verify with web search if stale)
- `references/removal-prompt.md` — The canonical removal prompt block
- `references/brand-matching.md` — Checklist for inheriting the project's tokens, fonts, and nav

## Hand-off

After the page and button are live, reply with one short sentence. Do not narrate the scan. Mention the skill name.