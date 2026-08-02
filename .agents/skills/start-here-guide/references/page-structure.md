# Page structure

The `/start-here` page has exactly these sections, in this order, separated by the project's existing divider style (hairline rule, blank space, or whatever the home page uses).

## 0. Header chrome

Reuse the project's site header component. Do not write a new one.

## 1. Eyebrow + H1

- Eyebrow: project's existing eyebrow style. Text: `// Template guide`
- H1: `Start here.` — using the project's display font, italic on the second word if the project does that elsewhere.

## 2. Section 01 — What this template does

Two to three short paragraphs. Each grounded in something that actually exists in the codebase:

- Paragraph 1: the core action (paste a URL → kit, fill a form → roadmap, upload a doc → summary). Name the inputs and the output.
- Paragraph 2: what's inside a typical result (sections, fields, exports). Reference real route names or component names without exposing implementation details.
- Paragraph 3 (optional): how output gets reused — exports, sharing, dropping into another tool.

No bullet lists in this section. Paragraphs only.

## 3. Section 02 — Connectors (conditional)

Include only if the project actually uses one or more third-party connectors. Skip entirely otherwise.

For each connector:

### Branded card
A small card showing the connector's name (display font), a short tag line (mono / uppercase tracked), and a single visual mark. Use the connector's brand color as a small accent only — do not flood the card.

### Pricing sub-section
Sub-heading `Pricing — mostly free` (or `Pricing` if the template uses heavy quota).

One paragraph: state the free tier in concrete numbers (credits, sends, requests), estimate how much a typical use of *this* template consumes, then mention the entry paid plan with price. End with whether casual use stays free.

Example: "Firecrawl gives every new account **500 free credits** on sign-up, no card required. One brand extraction typically uses 1–5 credits, so casual use rarely leaves the free tier. If you do run out, their Hobby plan starts at **$16/mo** for 3,000 credits — only needed for heavy or commercial use."

### Connecting it sub-section
Sub-heading `Connecting it`.

One short paragraph noting that Lovable may have already linked the connector via remix, then a copy-paste prompt block:

> Connect the {Connector} connector to this project so {feature} can use it.

Then a one-line note that Lovable will open the connector picker.

## 4. Section 03 — When you're done with this guide

Short paragraph: once they have their bearings, they can remove the button and page. Then the removal prompt block (see `removal-prompt.md`). Then one small muted line: "You can always ask Lovable to add it back later."

## 5. Footer

Two items on one row:
- Left: `← Back to {home page name}` link, mono, underlined
- Right: small mono `{Project name} / v1.0`

## What never appears

- A numbered "How to use it" step list (Step 1, Step 2, ...). Remixers explore faster than they read.
- A pricing comparison table.
- A list of every feature — that belongs on the template's marketing page, not here.
- Screenshots of the app — the app is one click away.
- A signup / login CTA — irrelevant for someone who just remixed.