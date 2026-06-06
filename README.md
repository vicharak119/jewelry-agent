# Jewelry Marketing Agent (v8.2)

Turns raw jewelry photos into branded marketing images. AI analyzes the piece, you review/edit the
scene, it generates a photorealistic shot and overlays your brand (logo + name + tagline).

**Stack:** Cloudflare Pages + Pages Functions + D1 (SQLite) + R2 storage. React via CDN (no build
step). OpenAI GPT-4o for analysis + an image model for generation.

## Files

- `functions/api/[[path]].js` — all backend routes (auth, analyze, generate, brand, logs, audit,
  users, settings, file download, Drive backup, exports).
- `public/index.html` — the full single-page app.
- `public/sw.js`, `public/manifest.json` — PWA (installable, offline shell).
- `schema.sql` — full schema for a **fresh** database.
- `migrate_v6_to_v7.sql` — one-time migration for an **existing** v6 database.
- `wrangler.toml` — Pages config (bindings: `DB` = D1, `STORAGE` = R2). Set `JWT_SECRET` as a
  Cloudflare **secret**, not in this file.

## First run

1. Apply `schema.sql` (fresh) or `migrate_v6_to_v7.sql` (upgrade) in the D1 Console.
2. Open the site → create the first admin → Settings → paste OpenAI API key, brand name, tagline,
   upload logo.
3. Create marketing images from the Create tab.

See `V7_NOTES.md` for what changed in v7, the audit-event list, the migration, break-glass admin
recovery, and how to update the live site from a phone.
