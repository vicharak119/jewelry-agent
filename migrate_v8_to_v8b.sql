-- Upgrade an existing v8 database to v8b (adds the async generation jobs table).
-- Run in Cloudflare dashboard: Workers & Pages > D1 > your database > Console.
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
