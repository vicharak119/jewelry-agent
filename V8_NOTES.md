# Jewelry Marketing Agent — v8 Notes

This is the **core v8 pass**. The server-side job + real progress bar (#1/#2) and the two help
docs are deliberately the *next* steps (see "Coming next") so the fidelity fix can be verified
first.

## What changed

### 1. Image fidelity — now an EDIT pipeline, not text-to-image (#10, #9)
The biggest change. Generation previously called OpenAI's text-to-image endpoint
(`images/generations`), which looked at your photo, *described* it, and painted a brand-new piece —
so the product always came out altered. v8 switches to the **image-edit endpoint**
(`images/edits`): your actual uploaded photo is sent as the subject, and the model is told to keep
the piece exactly as-is while only building the scene, lighting and sharpness around it. The current
GPT-Image models process input images at high fidelity and are designed for exactly this
product/marketing use.

- New **"Show jewelry"** dropdown (on the scene screen): **On mannequin / bust**, **On model (body
  part)** — auto-mapped from the jewelry type (necklace→neckline, bracelet→wrist, earrings→ear,
  ring→hand, etc.) — or **On themed props**. This feeds the placement line of the prompt.
- Honest caveat: this preserves the piece far better because the real photo is the input, but it is
  still a generative edit — not guaranteed pixel-identical on every piece. If a given item isn't
  faithful enough, the guaranteed-fidelity fallback is compositing (overlaying the real cut-out),
  which can be added later.

### 2. Editable, copyable prompt before Generate (#4)
On the scene screen, after analysis, the **exact prompt** that will be sent now shows in an editable
box, with **Copy** (to reuse in another AI tool) and **Rebuild** (regenerate from the fields). What
you see is exactly what's sent. If you edit it, your edits are used verbatim.

### 3. Share now sends the FILE (#3)
The share button shares the actual image file via the Web Share API. The old code could fall back to
sharing a title/URL (which some apps turned into a link); that fallback is removed. If a browser
can't share files, the image is downloaded instead so you always get the file — never a link. No
public/shareable links are created (by your decision).

### 4. Logo quality + independent sizes + no dark strip (#6, #7)
- The logo is drawn at full canvas resolution with high-quality smoothing (the old blur came from
  drawing it tiny). It's now much larger and sharper.
- New **Settings** controls set the size of the **logo**, **brand name**, and **tagline**
  *independently*, each as a % of the image (set once, used always): Logo size (% of width), Brand
  name size (% of height), Tagline size (% of height). Defaults 12 / 5 / 3.
- The solid dark gradient strip behind the branding is **gone**. Legibility now comes from a soft
  drop shadow on the text/logo, so it blends into the image instead of sitting on a band.

### 5. Product code / number overlay (#8)
Optional alphanumeric **Product code** field per image (e.g. `GC-1042`), with a configurable corner
(top-left / top-right / bottom-left / bottom-right) and a size set in Settings (% of height,
default 3). Drawn with the same soft-shadow style.

### 6. Quality-aware labels (#5)
The Generate button and the progress message now reflect the configured quality, e.g. "Generate —
premium, ~60–90s" / "standard, ~30–60s" / "draft, ~10–20s", so higher-quality (slower) runs don't
look stuck.

### 7. No more wrangler.toml
Per your move to running multiple instances, `wrangler.toml` is removed from the project. Each
instance configures its **own** D1 binding (`DB`), R2 binding (`STORAGE`) and `JWT_SECRET` Secret in
its Cloudflare dashboard — which is why a new instance must NOT share the file's bindings. You've
already done this for the cousin's instance.

## Settings keys added
`logoPct`, `namePct`, `taglinePct`, `codePos`, `codePct`. These are stored in the existing
key-value `settings` table, so **there is no database migration for v8.** (If you're coming straight
from v6, you still need the v6→v7 migration in `migrate_v6_to_v7.sql` for the audit log + email
column.)

## Updating the live site
Upload the changed files to each instance's repo (same paths, same names):
- `functions/api/[[path]].js`  (edit pipeline + public-settings keys)
- `public/index.html`  (all UI changes)
- `public/sw.js`  (cache bumped to `jw-v8a`)

There is **no `wrangler.toml`** in this package by design — don't add one back; keep bindings/secret
in the dashboard.

## Tested vs not tested
**Verified here:** backend + frontend syntax; full render of login and all admin tabs; the new
Settings size/code fields render; body-part mapping; share helper builds a real File; SQL unchanged.

**Not testable from here (needs your live keys/devices):**
- The live OpenAI **edits** call — the request is built correctly (multipart with your photo as
  `image`, your prompt, model/size/quality), but only your API key against the real endpoint can
  confirm the output. Please verify on a real piece.
- Canvas visual result (logo sharpness/size, shadow look, product-code placement) — render it on a
  real generated image and adjust the % sizes in Settings to taste.
- Whether file-sharing surfaces as a file on your specific phone/PWA (it should now, with the
  link fallback removed).

## Coming next
- **#1 + #2:** server-side generation **job** + polling so you can leave the page/app and return to
  a finished image, with a **real staged progress bar** (queued → generating → branding → done).
- **Docs:** the two HTML help guides (admin setup; user how-to), version-tagged, wired into a Help
  section before and after login, role-gated — built against the final v8 screens, text-based (no
  screenshots), once you've confirmed the v8 UI.

## v8.1 update

- **Control placement:** "Show jewelry on" (mannequin / model / props) and the Product code + position
  now appear **before** Analyze, alongside Style / Logo position / Extra instructions — so you set
  them up front. The editable prompt still appears in the scene step (it only exists after analysis).
- **Auto-cleanup / retention (new):** Settings has **"Auto-delete images after (days, 0 = never)"**
  (default 30). Old uploaded + generated images in R2 and their history rows are removed; the audit
  log is kept; `logo.png` is never deleted. Cloudflare Pages has no cron, so cleanup runs
  **opportunistically** — a background pass kicks off (via `waitUntil`) when an admin loads
  Settings/History/Audit, at most once every 12h — plus a manual **"Clean up now"** button in
  Settings. Backend: `runCleanup()` + `POST /api/cleanup` (admin), audited as `data.cleanup`.
- **Re-apply branding (new):** the generated (un-branded) image is kept in memory, and a **"Re-apply
  branding"** button on the result re-runs the logo/name/tagline/code overlay with the **current**
  Settings — no new AI call, no cost. Use this after changing the size %s. Note: branding is baked
  at generation time, so changing sizes only affects new generations or a re-apply — that's why
  earlier size changes looked "the same" on an already-generated image.
- SW cache bumped to `jw-v8b`; version 8.1.0.

## v8.2 update (the "v8b" feature set)

- **Leave-the-page generation (async jobs).** Generation no longer holds the browser open. The client
  starts a server-side job (`POST /api/generate-job` → returns a job id); the work runs in the
  background via `waitUntil` even if you switch apps, lock the phone, or close the tab. The client
  polls `GET /api/job?id=...` and finishes (downloads the result, applies branding) when you return.
  The active job id + branding choices are saved in `localStorage`, so a reload/reopen **resumes**
  automatically.
- **Real progress bar.** Staged status (queued → generating → adding branding → done) with an
  elapsed/quality-aware bar. Honest note: OpenAI gives no true progress signal, so the moving part
  during "generating" is a time estimate; the stage changes are real.
- **New `jobs` table.** Run `migrate_v8_to_v8b.sql` once in the D1 console on each instance
  (CREATE TABLE jobs). New installs get it from `schema.sql`. Old jobs are pruned by the same
  retention setting.
- **Two help docs** (`public/setup-guide.html`, `public/user-guide.html`), version-tagged, linked
  from a Help area: on the first-time setup screen (both guides), the login screen (user guide), and
  the header after login (User "Guide" for all; "Setup" for admins). Note: these are static pages, so
  the role-gating is on which links are *shown* — the files themselves are reachable by direct URL,
  which is fine for help content.
- SW cache bumped to `jw-v8c`; version 8.2.0.

### Honest limits on async jobs
- `waitUntil` keeps the worker alive after responding, which is enough for typical generations. Very
  long premium runs could in rare cases hit a worker time limit; if that happens the job shows
  `error` and you re-generate. For guaranteed durability at scale, Cloudflare Queues/Durable Objects
  would be the next step — not needed at current volumes.
- Branding still happens in the browser, so the *fully branded* image completes when you return in
  the **same browser** (the generated image is always saved server-side regardless, and is in History).
- Live OpenAI edit calls, the canvas visuals, and Drive OAuth still can't be tested here — verify on
  your deployment.

## v8.3 update — reverted to reliable synchronous generation

**Why:** the v8.2 async/`waitUntil` jobs froze at "generating" on both instances. The `jobs` table
showed status stuck at `generating` with `updated_at` only ~0.3s after `created_at` and no error —
i.e. Cloudflare tore the background worker down almost immediately after the response, so the 60–90s
OpenAI image-edit call never finished. `waitUntil` is not viable for a job this long on this plan.

**Change (frontend only):** `doGen()` now calls the synchronous `POST /api/generate` again (the route
was always present, unchanged). The request stays open while the worker does the OpenAI call and
returns the image, then the browser brands it on canvas — the same flow that worked in v6/v7. The
progress bar is now a pure client-side time estimate (no job polling, no `localStorage` job state).
Trade-off: the app must stay open during generation. Help-doc wording updated to match.

**No backend change, no new migration.** The `generate-job`/`job` endpoints and the `jobs` table are
left in place but unused by the app (harmless; pruned by the retention cleanup).

### Verified options for true "leave-the-page" later (researched Jun 2026, from Cloudflare docs)
- Cloudflare **Queues became free in Feb 2026** (10k ops/day), so a free background path exists — BUT
  Pages Functions can only **produce** to a queue, not consume. A **separate consumer Worker** is
  required, bound to the same D1 + R2 + queue. For this two-instance setup that's two extra Workers
  and two queues.
- Cloudflare documents **no consumer duration limit on the paid ($5/mo) plan**; on the **free** plan a
  consumer can hit a wall-clock limit, so a 60–90s image call may be cut off — i.e. free isn't
  guaranteed to finish long jobs. The $5 plan is the dependable way to do background image jobs.
- Net: synchronous (this version) is the free + reliable choice today; Queues + a consumer Worker
  (ideally on the $5 plan) is the upgrade path if leave-the-page becomes a priority.

## v8.3.2 — full code-review pass

Reviewed backend + frontend end to end. Fixes applied:

1. **Drive OAuth callback was unreachable (real bug).** `/api/drive/callback` sat below the
   "auth required" gate, but Google redirects the browser there with no token, so it always
   returned 401 — Drive connect could never finish. Moved it above the gate as a public route
   (like login). This is the only user-visible bug; Drive backup connect now works.
2. **OAuth token requests now URL-encode their params** (`code`, `client_id`, `client_secret`,
   `refresh_token`) in both the callback and refresh-token exchanges. Unencoded values containing
   "+", "&" or "/" could corrupt the request body.
3. **Uploaded filrenames are sanitized** before building the R2 key, so a name containing a slash
   can't create a nested key that breaks owner-scoping and retention cleanup.
4. **Drive backup CSV fields are now escaped** (quotes/commas/newlines), matching the local CSV export.

No frontend bugs found. Note: the unused async `generate-job`/`job` endpoints + `jobs` table from
the reverted v8.2 are left in place (inert, pruned by retention); they can be removed later if wanted.
Version 8.3.2; SW cache `jw-v8f`. No new migration.

## v8.4 — Create-page + History upgrades

- **(1) Regenerate** now rebuilds the prompt from the current field values (placement, scene, style,
  extra notes) before calling the API, instead of reusing the stale prompt. Scene-phase "Generate"
  still respects a manually edited prompt.
- **(2) Per-image branding sizes on Create** (Logo / Name / Tagline / Code %). They default to the
  Settings values and can be overridden per image; reset when you start a new piece.
- **(4) Share button** is now disabled (labelled "Share (use Chrome)" + tooltip) on browsers that
  can't share files, instead of a second "Save"-style button.
- **(6) Top Center** added to logo positions; Top/Bottom Center added to product-code positions
  (canvas now centres the code text).
- **(5b) History stores the exact prompt** used; a "Copy" button per row copies it so you can paste
  it into the editable prompt before generating. Requires migration (new `prompt` column).
- **(5c) History thumbnails** of the final image, lazy-loaded only when a row scrolls into view
  (authenticated fetch). Click a thumbnail to download.
- **History pagination** (25/page, Prev/Next) on both History and Audit tables.
- **"On" column** (Mannequin / Body / Props) so multi-image batches (coming in v8.5) are
  distinguishable. Requires migration (new `display_on` column).

**Migration:** run `migrate_v83_to_v84.sql` once in each instance's D1 console (adds `prompt` and
`display_on` to activity). SW cache `jw-v8g`; version 8.4.0.

Deferred to v8.5: (5a) reference-background image, (7) multi-image batch with cost/time warning.
Parked: (3) multiple AI providers.

## v8.5 — Reference background + multi-image batch

- **(5a) Background reference image.** Optional upload on the Create page. When set, the product photo
  AND the reference are both sent to the edit endpoint as an `image[]` array, and the prompt switches
  to "reproduce this background exactly." When empty, behaviour is unchanged (tool builds its own scene).
  Verified against OpenAI docs: gpt-image models accept multiple input images for edits.
- **(7) Multi-image batch.** "Show jewelry on" is now a multi-select (pick 1\u20133). Picking more than one
  shows a confirm dialog spelling out the ~N\u00d7 time and cost, then generates each option **sequentially**
  (the app must stay open). Each result is its own card on the right with its own Save/Share, and each
  becomes its own History row (distinguished by the "On" column added in v8.4).
- Branding refactored into `brandToDataURL()` (promise) so batch images are branded one at a time on
  the shared canvas; single-image flow unchanged.

**No migration for v8.5** (backend only changed how images are attached; `display_on`/`prompt` columns
already exist from v8.4). SW cache `jw-v8h`; version 8.5.0. User guide updated for both features.

Known/By design: multi-image is sequential (Cloudflare can't reliably run them in the background), so
3 premium images can take a few minutes with the app open. Reference fidelity depends on the model and
can't be verified here \u2014 test on real pieces.

## v8.6 — Shape-aware logo

- The logo is no longer forced into a small circle. drawText now **detects the logo's true shape** by
  trimming transparent padding (alpha bounding box), keeps its real aspect ratio, and lays out the
  brand text accordingly: **beside** a square/round logo, **below** a wide/rectangular one. Falls back
  to the image's natural dimensions if pixels can't be read.
- Help docs updated (setup guide logo advice) + version labels bumped. SW cache jw-v8i; version 8.6.0.
- No migration. Visual result can't be verified here \u2014 check a real generation after deploy.

## v8.7 — No missed pieces + reference stored per row

- **Multi-piece detection (the missed-earrings fix).** Analysis now returns an `items[]` list of every
  distinct piece in the photo (necklace, matching earrings, ring, etc.). The Create screen shows it as
  an editable list \u2014 confirm / fix names / remove / add a missed piece. The prompt then **enumerates
  every piece** with "all of these MUST appear, preserved exactly," which structurally stops the model
  from dropping small items.
- **Reference image stored per row.** When a generation uses a background reference, the reference is
  saved to R2 (`refs/<user>/...`) and its key recorded on the activity row (`ref_file`). History shows
  a lazy "Ref" thumbnail you can tap to download.
- Help docs + version labels updated.

**Migration:** run `migrate_v86_to_v87.sql` once per instance (adds `ref_file`). SW cache jw-v8j; 8.7.0.

Deferred to v8.8: "let AI decide" auto-placement (client-side heuristic). Parked: (3) multiple providers.

## v8.8 — "Let AI decide" placement + anti-substitution prompt

- **Stronger preservation prompt (from reviewing real outputs).** Real generations were dropping one of
  a pair of earrings and even swapping the pink-clover earrings for plain gold studs. buildPrompt now
  explicitly: enforces pairs ("show BOTH, identical"), and forbids substitution ("NEVER substitute,
  swap or invent a piece; e.g. do not replace clover earrings with plain studs"). This is prompt-level,
  so it reduces but can't 100% guarantee model fidelity \u2014 the editable pieces list remains the backstop.
- **"Let AI decide branding placement & size"** toggle on Create. When on, a client-side heuristic scans
  the finished image and drops the logo+text into the calmest (lowest-variance) region, puts the code in
  the calmest opposite corner, and uses default sizes \u2014 then locks the manual position/size controls.
  Free (no extra API call). Falls back to bottom-center if pixels can't be read.
- Help docs + version labels updated. **No migration.** SW cache jw-v8k; 8.8.0.

Honest limits: the auto-placement is a heuristic (variance-based), not true scene understanding, so it
can occasionally pick an imperfect spot \u2014 users can switch back to manual anytime. Canvas output and
model fidelity can't be verified here.

## v8.9.1 \u2014 Theme reliably drives props/scene (fixes "Props: none" \u2192 bare shots)

Not a v8.9 regression \u2014 the props pipeline (`a.props` \u2192 `sc.p` \u2192 prompt) is unchanged from v8.8. But
when GPT-4o's analysis returns `props:"none"` (common for plain catalog photos), the old prompt sent
`Props: none` and, combined with the "clean, neutral bust" placement line and the edit model's
tendency to keep backgrounds, produced a bare image. Fixes:

- **`themeProps(id)` fallback** \u2014 when props are empty/"none", the **selected theme's** props are used
  (luxury \u2192 chrysanthemums/brass key/silk, etc.; minimal stays bare by design).
- **`doAnalyze` normalises** an AI `none`/blank to empty so it falls back to the theme instead of
  literally printing "Props: none".
- **Prompt reworded to BUILD the scene**: placement no longer asks for a "clean, neutral" backdrop;
  the SCENE line is now imperative ("BUILD a rich, styled setting AROUND the piece; do NOT leave a
  bare background"); and the preserve-exactly paragraph is scoped to **the jewelry only**, explicitly
  allowing (encouraging) a fresh styled background/props.

Branding being off is separate and intended (v8.9 default) \u2014 tick the elements on Create or set
defaults in Settings to bring logo/name/tagline/code back. SW cache `jw-v891`; version 8.9.1. No
migration.

## v8.9.2 \u2014 Selected theme is now authoritative for the scene (root cause)

Diagnosed from the live D1 `activity` rows. The scene background was built as
`a.background || sf(theme)`: when GPT-4o returned an **empty** background the selected theme filled in
(rich props), but when it returned a **non-empty but plain** value like `"plain white"` (clean catalog
photos), that string **silently overrode the theme** \u2192 bare image. Stored `scene_json` confirmed it \u2014
good shots had the theme background; bare shots had `{"b":"plain white","p":"none"}`. v8.9.1's `none`
handling didn't catch `"plain white"`.

Fix: `doAnalyze` now sets the background to the **selected theme** (`sf(sty)`) outright, instead of
letting the AI's description of the input override it. Piece-specific props/mood from the AI are still
kept when present (else theme fallback). Picking Luxury/Ethnic/etc. now reliably produces that scene
regardless of the input photo. The Background field stays editable. SW cache `jw-v892`; version 8.9.2.
No migration.

Optional next step (not done): make `/api/analyze` theme-aware (pass the chosen Style to GPT-4o) so its
suggested props/mood match the theme from the start.

## v8.9.3 — Theme-aware, colour-coordinated analysis (the right fix)

Replaces v8.9.2's blind theme override. Rather than the client forcing the theme's hardcoded props
(which ignore the product's actual colours), the **analysis** is now theme-aware: the Create page sends
the selected style (`style` / `themeName` / `themeDesc`) into `/api/analyze`, and the GPT-4o brief now
requires the `background`/`props`/`color_mood` to **match the chosen style AND complement the product's
real metal/gemstone colours** (warm staging for gold, cooler for silver, accent props echoing the gem
colour), and forbids `none`/`plain`/empty (except for the minimal style, which stays clean). Because
GPT-4o can *see* the piece, props are now colour-coordinated to the product instead of a generic
template. `doAnalyze` reverts to using the AI's (now reliable) background, falling back to the theme
only if it still returns blank. SW cache `jw-v893`; version 8.9.3. No migration.

## v8.9 \u2014 Per-element branding toggles, watermark, full per-generation logging

- **Independent branding checkboxes (Create page).** Logo, Brand name, Tagline, Watermark and Product
  code are now each their own on/off checkbox \u2014 **all off by default**. Previously logo+name+tagline
  were one unit and "No Branding" was a logo-position option (removed). `drawText()` was refactored to
  render any subset (logo alone, text alone, logo+name without tagline, etc.). Admins can set the
  default tick-state for each element in Settings; typing a product code auto-ticks its box.
- **Watermark (new).** A separate watermark image is uploaded in Settings (stored in R2 as
  `watermark.png`, never auto-deleted, like the logo). When the Watermark box is ticked it's drawn
  **single, centered, large & faint** over the photo (under the logo/text/code). Size (% of width) and
  opacity (%) are Settings. New route `POST /api/watermark-asset`; `settings/public` returns
  `watermarkBase64` + the size/opacity + the default toggles.
- **Full per-generation logging (History).** `/api/generate` now records the **image size** and a
  **branding snapshot** (`branding_json`: which elements, positions, sizes, code value, aiPlace) on the
  activity row. History gained columns: Size, Logo, Name, Tagline, W.mark, Code, and a Scene "Copy"
  button \u2014 so every field used to build an image is captured and filterable. Old rows (no snapshot)
  show blanks/"off" gracefully.
- **Consolidated schema (item 5).** `schema.sql` is now the single source of truth: the full FRESH
  schema **plus** every historical migration, bifurcated by version. The separate `migrate_v6_to_v7`,
  `migrate_v8_to_v8b`, `migrate_v83_to_v84`, `migrate_v86_to_v87` files were merged in and removed.
  Future schema changes are appended as a new version section here.
- **wrangler** added as a dev dependency with `db:schema` / `db:migrate` npm scripts, for applying the
  schema to live D1 (needs `wrangler login` + your D1 database name).

**Migration:** run `migrate_v88_to_v89.sql` once per instance (adds `image_size` + `branding_json` to
`activity`, and the watermark/default-toggle settings keys). SW cache `jw-v89`; version 8.9.0.

Honest limits: canvas output (watermark look, independent-element layout) and model fidelity still
can't be verified here \u2014 check a real generation after deploy and tune the watermark size/opacity.
