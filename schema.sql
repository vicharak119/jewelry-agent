-- Jewelry Marketing Agent - D1 Schema (v7)
-- For a FRESH database. If you already have a live v6 DB, run migrate_v6_to_v7.sql instead.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
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
  photo_style TEXT,
  model TEXT,
  quality TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  cost_estimate TEXT,
  error_msg TEXT
);

-- NEW in v7: security / admin audit trail
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
