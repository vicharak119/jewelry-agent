# Jewelry Marketing Agent (v8.9)

Turns raw jewelry photos into branded marketing images. AI analyzes the piece, you review/edit the
scene, it generates a photorealistic shot and overlays your brand. On the Create page you pick
exactly which elements go on the image — **Logo, Brand name, Tagline, Watermark, Product code** —
each an independent checkbox (all off by default). Every generation's settings (scene, size and the
full branding choice) are logged in History.

**Stack:** Cloudflare Pages + Pages Functions + D1 (SQLite) + R2 storage. React via CDN (no build
step). OpenAI GPT-4o for analysis + an image model for generation.

## Files

- `functions/api/[[path]].js` — all backend routes (auth, analyze, generate, brand, logs, audit,
  users, settings, file download, Drive backup, exports).
- `public/index.html` — the full single-page app.
- `public/sw.js`, `public/manifest.json` — PWA (installable, offline shell).
- `schema.sql` — **consolidated, versioned** schema: the full FRESH schema **plus** every historical
  migration, bifurcated by version. Single source of truth — future schema changes get appended here.
- `migrate_v88_to_v89.sql` — the one-step delta to upgrade an existing v8.8 DB to v8.9 (used by
  `npm run db:migrate`).
- Bindings (`DB` = D1, `STORAGE` = R2) and the `JWT_SECRET` secret are configured per-instance in the
  Cloudflare dashboard (multi-instance setup — no `wrangler.toml` in the repo by design).

## First run

1. **Fresh DB:** run the **BASE** section of `schema.sql` in the D1 Console (or `npm run db:schema`,
   after editing the script to use your D1 database name). **Existing DB:** run only the version
   section(s) newer than your current version — e.g. upgrading from v8.8, apply `migrate_v88_to_v89.sql`
   (or `npm run db:migrate`).
2. Open the site → create the first admin → Settings → paste OpenAI API key, brand name, tagline,
   upload logo (and optionally a **watermark** image).
3. Create marketing images from the Create tab — tick the branding elements you want on each image.

## Applying the schema with wrangler

`wrangler` is a dev dependency (`npm install` first). It needs your Cloudflare login (`npx wrangler
login`) and your **D1 database name** (each instance has its own). The `db:*` scripts use the literal
`DB`; replace it with your database name, e.g.:

```
npx wrangler d1 execute <YOUR_DB_NAME> --remote --file=migrate_v88_to_v89.sql
```

See `V7_NOTES.md` for what changed in v7, the audit-event list, the migration, break-glass admin
recovery, and how to update the live site from a phone.
