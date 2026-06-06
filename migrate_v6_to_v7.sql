-- Migrate an EXISTING live v6 database to v7.
-- Run these in the Cloudflare dashboard: Workers & Pages > D1 > your database > Console.
-- (Or: npx wrangler d1 execute <DB_NAME> --remote --file=migrate_v6_to_v7.sql)
--
-- NOTE: SQLite has no "ADD COLUMN IF NOT EXISTS". Run the ALTER line ONCE.
-- If it errors with "duplicate column name: email", the column already exists - skip that line.

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
