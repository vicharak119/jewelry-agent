-- ============================================================================
-- JEWELRY MARKETING AGENT — CONSOLIDATED DATABASE SCHEMA (single source of truth)
-- ============================================================================
-- This one file replaces the old per-version migrate_*.sql files. It holds the
-- full FRESH schema plus every historical migration, bifurcated by version.
--
-- HOW TO USE
--   • FRESH database  -> run only the "BASE (FRESH INSTALL)" section below.
--   • EXISTING database -> run only the version section(s) NEWER than your
--     current version, in order (e.g. on v8.7 -> run just "v8.8 -> v8.9").
--   • Each version section is a delta. SQLite has no "ADD COLUMN IF NOT EXISTS",
--     so an ALTER that was already applied errors with "duplicate column name: …"
--     — that error is harmless, it just means the column already exists.
--     CREATE … IF NOT EXISTS and INSERT OR IGNORE are always safe to re-run.
--
-- WHEN THE SCHEMA CHANGES IN FUTURE
--   Append a NEW "-- vX.Y -> vX.Z" section at the BOTTOM and also extend the
--   BASE section so fresh installs get everything. Never edit old sections.
--   For applying a single delta to live D1 there is a matching one-step file
--   (e.g. migrate_v88_to_v89.sql) used by:  npm run db:migrate -- --remote
-- ============================================================================


-- ============================================================================
-- BASE (FRESH INSTALL) — current as of v8.9
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,                                  -- added v7
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  must_change_password INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  username TEXT NOT NULL,
  input_file TEXT,
  output_file TEXT,
  final_file TEXT,
  jewelry_type TEXT,
  scene_json TEXT,
  prompt TEXT,                                 -- added v8.4
  display_on TEXT,                             -- added v8.4
  ref_file TEXT,                               -- added v8.7
  image_size TEXT,                             -- added v8.9
  branding_json TEXT,                          -- added v8.9
  photo_style TEXT,
  model TEXT,
  quality TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  cost_estimate TEXT,
  error_msg TEXT
);

-- Security / admin audit trail (added v7)
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  ip TEXT
);

-- Async generation jobs (added v8b; endpoints inert since v8.3, table retained)
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL,
  updated_at TEXT,
  result_key TEXT,
  error_msg TEXT,
  params_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity (timestamp);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs (created_at);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('brandName', 'GANESHA CREATION PVT LTD');
INSERT OR IGNORE INTO settings (key, value) VALUES ('tagline', 'Timeless Elegance, Crafted for You');
INSERT OR IGNORE INTO settings (key, value) VALUES ('logoPos', 'bottom-center');
INSERT OR IGNORE INTO settings (key, value) VALUES ('model', 'gpt-image-2');
INSERT OR IGNORE INTO settings (key, value) VALUES ('quality', 'medium');
INSERT OR IGNORE INTO settings (key, value) VALUES ('size', '1024x1024');
INSERT OR IGNORE INTO settings (key, value) VALUES ('style', 'luxury');
INSERT OR IGNORE INTO settings (key, value) VALUES ('openaiKey', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('driveClientId', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('driveClientSecret', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('driveRefreshToken', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('driveFolderId', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('driveBackupHours', '2');
INSERT OR IGNORE INTO settings (key, value) VALUES ('driveLastBackup', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('retentionDays', '30');
-- Branding size/position defaults (added v8)
INSERT OR IGNORE INTO settings (key, value) VALUES ('logoPct', '12');
INSERT OR IGNORE INTO settings (key, value) VALUES ('namePct', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('taglinePct', '3');
INSERT OR IGNORE INTO settings (key, value) VALUES ('codePos', 'top-right');
INSERT OR IGNORE INTO settings (key, value) VALUES ('codePct', '3');
-- Watermark + per-element default toggles (added v8.9; all elements OFF by default)
INSERT OR IGNORE INTO settings (key, value) VALUES ('watermarkPct', '60');
INSERT OR IGNORE INTO settings (key, value) VALUES ('watermarkOpacity', '12');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incLogo', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incName', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incTagline', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incWatermark', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incCode', '0');


-- ============================================================================
-- MIGRATIONS BY VERSION (run only those newer than your current DB, in order)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- v6 -> v7  : optional user email + security audit log
-- ----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN email TEXT;
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity (timestamp);

-- ----------------------------------------------------------------------------
-- v8 -> v8b : async generation jobs table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL,
  updated_at TEXT,
  result_key TEXT,
  error_msg TEXT,
  params_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs (created_at);

-- ----------------------------------------------------------------------------
-- v8.3 -> v8.4 : store exact prompt + "show jewelry on" choice per image
-- ----------------------------------------------------------------------------
ALTER TABLE activity ADD COLUMN prompt TEXT;
ALTER TABLE activity ADD COLUMN display_on TEXT;

-- ----------------------------------------------------------------------------
-- v8.6 -> v8.7 : store the background reference image used (if any) per row
-- ----------------------------------------------------------------------------
ALTER TABLE activity ADD COLUMN ref_file TEXT;

-- ----------------------------------------------------------------------------
-- v8.8 -> v8.9 : per-generation logging (image size + full branding snapshot)
--                and watermark / default-branding settings
-- ----------------------------------------------------------------------------
ALTER TABLE activity ADD COLUMN image_size TEXT;
ALTER TABLE activity ADD COLUMN branding_json TEXT;
INSERT OR IGNORE INTO settings (key, value) VALUES ('watermarkPct', '60');
INSERT OR IGNORE INTO settings (key, value) VALUES ('watermarkOpacity', '12');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incLogo', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incName', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incTagline', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incWatermark', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('incCode', '0');
