# v6 — Change log, issue map, and test results

## The 15 issues and how each was handled

1. **Logo upload missing** — Added `POST /api/settings/logo` (stores `logo.png` in R2 with real content-type) and a logo upload UI in Settings.
2. **Messages didn't dismiss** — Banners now auto-clear after 5s and have a close (×) button.
3. **Cost showed "-"** — Backend response was snake_case (`cost_estimate`) but the UI read `costEstimate`. Backend now maps logs to camelCase.
4. **"Invalid Date" in users** — Same cause (`created_at` vs `createdAt`). Fixed via mapping + IST formatting.
5. **Timestamps not IST** — All timestamps are formatted to Asia/Kolkata as `DD-MMM-YYYY HH:MM:SS AM/PM`, both in API responses and the UI.
6. **Jewelry type "-"** — `jewelry_type` vs `jewelryType` mapping fixed.
7. **Scene screen** — Restored the explanatory editable layout (display / background / props / color mood), with style buttons that carry short descriptions.
8. **No "Create New"** — Added; clears the workspace for a fresh image.
9. **"Redo" wording** — Renamed to "Regenerate with same input".
10. **Mobile** — Responsive CSS: grids collapse to one column under 640px; tab bar scrolls.
11. **Share** — Uses the Web Share API when available (mobile); otherwise hidden.
12. **Devanagari font** — Noto Sans Devanagari loaded and used in UI and on the canvas overlay (fonts awaited before drawing).
13. **CSV/ZIP export** — `GET /api/export/csv` (activity log) and `GET /api/export/images` (ZIP, pure-JS STORE method, no dependency). Buttons under the Backup tab.
14. **AI design drift** — Informational; mitigated by the detailed, fidelity-focused prompt and the editable scene. Not a code "fix".
15. **Logo not drawn on image** — Logo is now drawn (circular, with brand name + tagline) at any of the 6 positions, depending on #1.

Extra fix: Drive settings read nested keys (`drive.clientId`) while the backend stores flat keys (`driveClientId`). Rewrote the frontend to flat keys; the redirect URI now reflects the live origin.

## Files
- `functions/api/[[path]].js` — backend (all API routes)
- `public/index.html` — frontend (React via CDN)
- `public/manifest.json`, `public/sw.js` — PWA bits (SW cache bumped to `jw-v6`)
- `schema.sql` — D1 schema + default settings (adds `size`)
- `wrangler.toml` — bindings + config

## Tests run in the build environment
- Backend: `node --check` syntax → OK.
- Backend pure logic, 10/10 passed: SHA-256 known vector; JWT round-trip; JWT rejects wrong secret; JWT rejects tampered payload; IST formatter (incl. `2026-06-06T09:00:45Z` → `06-Jun-2026 02:30:45 PM`); CRC-32 known vector (0xCBF43926); ZIP builds.
- ZIP validated with the system `unzip`: integrity OK, nested paths preserved, byte contents match.
- `manifest.json` parses; `schema.sql` executes in SQLite (3 tables, 14 settings, `size` present).
- Frontend: inline JS `node --check` → OK.
- Frontend rendered in a headless DOM:
  - Logged-out: shows login, calls `/api/auth/needs-setup`. PASS.
  - Logged-in admin, all six tabs clicked, 13/13 checks passed — including Settings model/size/logo-upload, Backup CSV+ZIP buttons, origin-based redirect URI, and IST date / jewelry type / cost rendering in Users and Logs.

## Not tested here (verify on first live run)
- Live Cloudflare D1/R2 binding behaviour and real OpenAI analyze/generate calls (no bindings or API key available in the build environment).
- Canvas branding visual output (headless DOM has no real canvas rendering) — confirm the overlay looks right on a real generated image.
- Real Google Drive OAuth round-trip.
- The exact OpenAI image model name and accepted size/quality values (see README caveat).
