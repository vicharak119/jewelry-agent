-- Jewelry Marketing Agent — D1 Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
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

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('brandName', 'GANESHA CREATION PVT LTD');
INSERT OR IGNORE INTO settings (key, value) VALUES ('tagline', 'Timeless Elegance, Crafted for You');
INSERT OR IGNORE INTO settings (key, value) VALUES ('logoPos', 'bottom-center');
INSERT OR IGNORE INTO settings (key, value) VALUES ('model', 'gpt-image-2');
INSERT OR IGNORE INTO settings (key, value) VALUES ('quality', 'medium');
INSERT OR IGNORE INTO settings (key, value) VALUES ('style', 'luxury');
INSERT OR IGNORE INTO settings (key, value) VALUES ('openaiKey', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('driveClientId', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('driveClientSecret', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('driveRefreshToken', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('driveFolderId', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('driveBackupHours', '2');
INSERT OR IGNORE INTO settings (key, value) VALUES ('driveLastBackup', '');
