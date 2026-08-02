# Brand matching checklist

The Start Here page must feel like it shipped with the template, not bolted on. Before writing any styles:

## 1. Read the source of truth

- `src/styles.css` — every color, radius, shadow, blur, and font-family token
- `DESIGN.md` or `README.md` if present — voice + intent
- `src/routes/index.tsx` (or whatever the landing route is) — the strongest live brand reference
- The existing site header component — reuse it directly

## 2. Inherit, don't invent

| Property | Where to source from |
|---|---|
| Background color | Home page body / `--background` token |
| Body text color | `--foreground` token |
| Display font | Home page H1 font-family |
| Body font | Home page paragraph font-family |
| Mono / UI font | Home page eyebrow or button font-family |
| Accent color | Existing CTA color (e.g. `--primary`, `--hanko`) |
| Border radius | Existing button / input radius (pill, 8px, 16px, etc.) |
| Eyebrow style | Existing eyebrow markup verbatim (`// 01 — section`, `01.`, etc.) |
| Divider style | Hairline rule, blank space, or whatever sections use on home |

If a project doesn't define a token, leave the property unset rather than inventing one.

## 3. Voice

Read the home headline and primary CTA. Match:

- Sentence vs uppercase casing
- Punctuation (period at end of headline? no punctuation?)
- Cadence (short staccato or flowing serif?)
- Forbidden words noted in the project memory (e.g. "powerful", "seamless")

## 4. Connectors visual

Each connector card uses:
- The project's surface color (one shade off background)
- The project's hairline border
- The connector's brand color as a tiny accent only (mark background, ~36px square) — never as the card's main color

## 5. Don't break the never-list

If the project has a memory file listing rejected patterns (icons, gradients, certain words), read it first. The Start Here page must comply.

## 6. Verify visually

After building, open `/start-here` in the preview and compare side-by-side with the home page. The eyebrow, headline, button, and divider style must be visually identical to the home route's equivalents.