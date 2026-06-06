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
