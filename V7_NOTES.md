# Jewelry Marketing Agent — v7 Notes

## What changed in v7

1. **Logo upload fixed.** The old route lived at `/api/settings/logo` and sent the file as
   multipart form data. Since your Analyze step (same multipart mechanism) worked, the failure was
   specific to that endpoint — most likely the word "logo" in the URL being matched by an ad
   blocker / tracking-protection filter. Two changes remove the problem:
   - The route is renamed to **`/api/brand-asset`** (no "logo" in the path).
   - It now uploads as **base64 JSON** (the same method `save-final` already uses successfully),
     so there's no multipart parsing involved.
   - `api()` now gives a clear message ("Could not reach server — a network issue, ad blocker, or
     tracking protection may be blocking this request") instead of a raw browser error.

2. **Share button fixed.** Root cause: the code did `await fetch(...)` *before* calling
   `navigator.share()`. That await consumed the browser's "user gesture", so the share silently
   rejected (and an empty `.catch` hid it — hence "nothing happened"). Now the image File is built
   **synchronously** from the data URL and `navigator.share()` is called within the tap. Added
   `navigator.canShare` checks and a **download fallback** when sharing isn't supported, and errors
   are surfaced instead of swallowed. The Share button now always renders.

3. **History + All Logs merged** into one **History** tab with smart rendering — the **User**
   column appears only for admins; a normal user sees just their own activity without it.

4. **Excel-like tables.** Both History and Audit use a reusable table: **click any column header to
   sort** (▲/▼), and **per-column filter inputs** to narrow rows.

5. **Image downloads on History.** Each row has **In / Out / Final** buttons (input photo,
   generated image, branded final). They download through an authenticated, ownership-scoped
   endpoint: **admins can download any user's images; a normal user only their own** (enforced
   server-side by parsing the owner from the file path, on top of the fact that their History only
   lists their own rows). Every download is recorded in the audit log.

6. **Audit log (new).** A dedicated `audit_log` table records security/admin events with actor,
   action, target, timestamp (IST), and **client IP** (Cloudflare's `CF-Connecting-IP`). A new
   admin-only **Audit** tab shows it. Logged events:
   - `auth.setup` (first admin created)
   - `auth.login`, `auth.login_fail`
   - `auth.password_change`
   - `user.create`, `user.delete`, `user.password_reset`
   - `settings.update` (records *which keys* changed — never the secret values)
   - `settings.brand_image` (logo upload)
   - `file.download`, `file.access_denied`
   - `export.csv`, `export.images`
   - `drive.connect`, `drive.backup_now`
   - `unauthorized.admin_attempt` (a non-admin hitting an admin-only route — useful for spotting
     privilege-escalation probing)
   Secrets (OpenAI key, Drive secret, refresh token) are never written to the log in plaintext.

7. **Forgot password.** Admin **Reset PW** button per user → generates a one-time temp password
   (meets the policy), forces a change at next login, and shows it in a **persistent banner** with a
   Copy button (it does not auto-dismiss, so it won't vanish before you copy it). The login screen
   now shows "Forgot password? Ask your admin to reset it." Break-glass recovery is below.

8. **Email field (optional).** Users now have an optional `email` (separate from the login
   username). Used for display now and ready for the email features in v8. Greeting still uses the
   username.

## Migration (existing live database)

Your live D1 already has data, so run the one-time migration (not the full schema):

In Cloudflare dashboard → **Workers & Pages → D1 → your database → Console**, paste the contents of
`migrate_v6_to_v7.sql`:

```sql
ALTER TABLE users ADD COLUMN email TEXT;
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, actor TEXT,
  action TEXT NOT NULL, target TEXT, detail TEXT, ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity (timestamp);
```

If the `ALTER` line errors with "duplicate column name: email", the column already exists — just
skip that line and run the rest. **The audit log only starts recording after this migration**, so
do it before relying on it.

## Break-glass: recover a locked-out sole admin

If the only admin can't log in (and there's no other admin to reset them), run this in the D1
Console. It sets the password to a known temporary value and forces a change at next login. No
typing of hashes needed — it's pre-computed.

```sql
UPDATE users
SET password_hash = 'a0beb3ee1cf754e9f86d39ba73a1f0cf1714c1120940b078af5d09f2bc003ed7',
    must_change_password = 1
WHERE username = 'YOUR_ADMIN_USERNAME';
```

Then log in with:

- **Temporary password:** `Reset@2026`

You'll be forced to set a new password immediately. After recovering, consider creating a second
admin so you never need this again. (The hash is plain SHA-256 of the temp password, matching how
the app stores passwords; if you want a different temp password, compute its SHA-256 and substitute
it.)

## Updating the live site (drag-and-drop on mobile)

Only these files change app behavior — upload them into the matching folder on github.com (open the
folder → Add file → Upload files → pick the file; same name replaces in place):

- `functions/api/[[path]].js`
- `public/index.html`
- `public/sw.js` (cache version bumped to `jw-v7` so phones pull the new build)

Optional/docs only — won't change behavior: `schema.sql`, `migrate_v6_to_v7.sql`, `README.md`,
`V7_NOTES.md`. **Do not upload `wrangler.toml`** (its placeholder `JWT_SECRET` would overwrite your
real one). After uploading, run the migration above.

## Tested vs not tested

**Verified here:**
- Backend syntax (`node --check`) and unit tests: SHA-256, JWT sign/verify, IST formatter, CRC32
  (0xCBF43926), temp-password policy (50 samples).
- Frontend syntax; full jsdom render: login view + forgot-password hint, admin landing, all six
  tabs (Create, History, Audit, Users, Settings, Backup), merged History with User column +
  In/Out/Final buttons + sort indicators + filter inputs, Audit columns/data, Users email column +
  Reset PW button, Settings logo upload, Backup redirect URI.
- Share helper (`dataURLtoFile`) produces a valid File; download scope logic (owner-from-path,
  prefix whitelist, admin-any / user-own).
- `schema.sql` and `migrate_v6_to_v7.sql` apply cleanly in SQLite; break-glass hash verified.

**Not testable from here (needs your live environment):**
- Live D1/R2/OpenAI calls, the canvas-rendered branded image, Google Drive OAuth.
- Whether the **logo upload error is fully gone** — I'm confident in the reasoning (rename +
  base64), but it can only be confirmed on your deployed site. If it somehow persists, the new
  error message will say whether it's a block vs an HTTP error, which tells us the next step.
- The image **model name** ("gpt-image-2") — kept as a free-text setting; verify the current name
  at platform.openai.com/docs.

## v8 (next): email — SMTP won't work, HTTP API will

Raw SMTP can't run on Cloudflare (no TCP sockets), so password-reset emails / email OTP 2FA / user
greetings go through a transactional email **HTTP API** (Resend, Postmark, SendGrid, Amazon SES,
etc.) called via `fetch()`. v8 scope: provider choice + API key as a Cloudflare secret, SPF/DKIM on
the sending domain, a reset-token table (expiry + rate-limit), the OTP flow, and wiring the email
field. Pick a provider and we'll scope it.

## v7 update: JWT_SECRET fails closed

`JWT_SECRET` is no longer in `wrangler.toml` and there is no insecure fallback in code.
If `JWT_SECRET` is unset, authentication is refused with a clear 503 ("Server not configured")
instead of signing/verifying tokens with a default value. Set `JWT_SECRET` as an encrypted Secret
in the Pages dashboard. The only route that works without it is `auth/needs-setup`.
