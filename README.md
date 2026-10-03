# app62.tech

The App62 marketing site: a single landing page led by AI transformation, with
development services, shipped work, and a contact form.

Built with Astro and Tailwind CSS, deployed to Cloudflare Workers. Every page is
prerendered; only `/api/contact` runs on the server.

## Develop

Requires Node 22 (see `.nvmrc`).

```sh
npm ci
npm run dev        # http://localhost:4321
```

## Check

```sh
npm run build          # static build into dist/
npm run check          # astro check + wrangler dry run
npm run check:eslint
npm run check:prettier
npm run test:a11y      # axe on every route in scripts/check-a11y.mjs (run after build)
```

Lighthouse budgets live in `.lighthouserc.json` (mobile: performance ≥ 0.95,
accessibility = 1, JS ≤ 10 KB, total ≤ 400 KB).

## Where things live

| What                     | Where                                                          |
| ------------------------ | -------------------------------------------------------------- |
| Home page (all sections) | `src/pages/index.astro`                                        |
| Service copy             | `src/data/services/*.md`                                       |
| Shipped apps             | `src/data/work/*.md`, screenshots in `src/assets/images/work/` |
| Nav and footer links     | `src/navigation.ts`                                            |
| Brand colours and fonts  | `src/components/CustomStyles.astro`                            |
| Contact form / API       | `src/components/ContactForm.astro`, `src/pages/api/contact.ts` |
| Old URL redirects        | `redirects` in `astro.config.ts`                               |

## Contact form

Submissions are sent by [Resend](https://resend.com) into the Zoho Mail inbox
(`hello@app62.tech`) with Reply-To set to the visitor, and protected by
Cloudflare Turnstile. Set these on the Worker:

- Secrets (`wrangler secret put <NAME>`): `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`
- Vars (in `wrangler.jsonc`): `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` (must be on the Resend-verified domain)
- Build-time: `PUBLIC_TURNSTILE_SITE_KEY` (see `.env.example`)

## Deploy

```sh
npm run deploy     # wrangler deploy
```
