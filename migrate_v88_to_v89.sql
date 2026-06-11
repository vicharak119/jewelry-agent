-- Jewelry Marketing Agent — migrate v8.8 -> v8.9
-- Run ONCE per instance in the D1 console (or via: npm run db:migrate -- --remote).
-- Adds per-generation logging columns + default-branding settings keys.
-- SQLite has no "ADD COLUMN IF NOT EXISTS"; if a column already exists the statement
-- errors harmlessly — it just means that part was already applied.

ALTER TABLE activity ADD COLUMN image_size TEXT;
ALTER TABLE activity ADD COLUMN branding_json TEXT;

-- Watermark sizing + default branding toggles (all elements OFF by default).
INSERT OR IGNORE INTO settings (key, value) VALUES ('watermarkPct', '60');
INSERT OR IGNORE INTO settings (key, value) VALUES ('watermarkOpacity', '12');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incLogo', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incName', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incTagline', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incWatermark', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incCode', '0');
