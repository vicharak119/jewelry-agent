# Jewelry Marketing Agent — v6

AI tool that turns a raw jewelry photo into a branded marketing image. Built for **Ganesha Creation Pvt Ltd**.

Stack: Cloudflare Pages + Pages Functions + D1 (SQLite) + R2. React via CDN, no build step.

---

## How to update your live site (drag-and-drop)

You already have the repo `vicharak119/jewelry-agent` connected to Cloudflare Pages with auto-deploy. To ship v6:

1. Unzip this archive. You'll get a folder with `functions/`, `public/`, `schema.sql`, `wrangler.toml`.
2. Open your repo on github.com → **Add file → Upload files**.
3. Drag the **`functions`** folder and the **`public`** folder (and `wrangler.toml` if you keep it in the repo) into the upload area. GitHub keeps the folder paths, so it overwrites the matching files in one commit.
   - The paths must match what's already in the repo: `functions/api/[[path]].js`, `public/index.html`, etc.
4. Add a commit message (e.g. "v6") and **Commit changes**.
5. Cloudflare Pages auto-builds and deploys. No build command is needed (output dir = `public`).

No database migration is required — v6 adds one new setting (`size`) that the code also defaults internally, so existing deployments keep working. If you want it seeded explicitly, run the one new line from `schema.sql` in the D1 console:
`INSERT OR IGNORE INTO settings (key, value) VALUES ('size', '1024x1024');`

---

## What changed in v6

15 reported issues addressed (see `V6_NOTES.md` for the full list). Highlights:

- **Logo upload** added in Settings, and the logo is now drawn onto generated images at the chosen position (6 positions).
- **History / Users tables fixed:** jewelry type, cost, and dates now display correctly (were showing "-" / "Invalid Date"); all timestamps shown in **IST** as `DD-MMM-YYYY HH:MM:SS AM/PM`.
- **Scene screen** restored to the more explanatory editable layout (display, background, props, color mood — all editable before generating).
- **Buttons:** "Create New", "Regenerate with same input", "Save", "Share".
- **Messages** auto-dismiss after 5s and have a close (×) button.
- **Mobile responsive** layout.
- **Devanagari** font support in UI and on the image overlay.
- **Configurable image model + size** (free-text, admin Settings) so a model rename needs no code change.
- **Local export:** download the activity log as **CSV** and all images as a **ZIP**, with no Google account.
- Fixed the Drive settings bug (flat keys) and the redirect URI now shows your live domain.

---

## Important caveats (please read)

- **Image model name is not verifiable from here.** The default is `gpt-image-2`, set as free text in Settings. The actual current model name and the image API's accepted `size`/`quality` values may differ — verify at platform.openai.com/docs and update the Settings field if needed. No code change is required to switch models.
- **What was tested vs not:** the code was syntax-checked, the pure logic was unit-tested (auth/JWT, password hashing, IST formatting, the CSV/ZIP generator — the ZIP was validated with a real unzip), the schema was validated against SQLite, and the full frontend was rendered and click-tested in a headless DOM. It was **not** possible to run a live end-to-end test against Cloudflare D1/R2 or the OpenAI API from the build environment, and the canvas branding output could not be visually rendered headlessly. First live run should be a quick smoke test: log in → upload a photo → analyze → generate → confirm the branded image and a History row.
- **Image ZIP export** is capped at 500 objects per download to stay within Worker limits. For larger libraries use the Google Drive backup or the R2 dashboard.

---

## Config reference

- `wrangler.toml` has the real D1 `database_id`. Set a strong `JWT_SECRET` (currently a placeholder) — in production, prefer setting it as a Pages environment variable/secret rather than committing it.
- R2 bucket binding: `STORAGE` → `jewelry-agent-storage`.
- D1 binding: `DB` → `jewelry-agent-db`.
