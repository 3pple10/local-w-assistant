# Local w assistant

I want to build a Lovable template that others can use to identify, extract, and create brand guides and a full design system from their website and/or documents or photos of any format. 

Context: App that allows you to identify a brand’s design system. Key use case for prospect/customer/client facing roles to build slide decks or custom apps using their client and/or prospects branding

Ingestion Workflow: Input source (website URL) - extract assets - export brand kit

Feature Map:

Brand ingestion: Handles all the ways someone in a sales or CS role would actually encounter a prospect's brand — scraping a website URL is the zero-friction path, but uploading a PDF style guide or pasting a hex code also needs to work.

Color extraction goes beyond just listing hex values — it assigns semantic roles (primary, CTA, background, error state) and runs WCAG contrast checks, which matters when you're building a client-facing app or deck that needs to be accessible.

Typography identifies not just the fonts but the full hierarchy and scale, which is what you actually need when templating a slide deck or component library.

Logo & assets downloads all logo variants automatically — the most tedious part of starting any branded project.

Design tokens captures the subtler stuff: spacing, radius, shadow, and animation — critical for custom app builds that need to feel native to the client's brand.

Brand voice is the differentiator for sales roles specifically — extracting tone and vocabulary keywords so slide deck copy sounds like the client, not like a generic template.

Persona(s):

Sales/GTM

Marketing

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a0b57f2d-7e20-44dc-923e-389a4b89202d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
