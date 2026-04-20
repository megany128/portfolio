-- Visitor cards table.
-- `id` is a stable per-visitor identifier we drop in a cookie so the same
-- person sees their card on return without logging in.
-- `number` is the user-facing "no. 213" badge.
CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color IN ('pink','teal','green','orange','neutral')),
  issued_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_visitors_number ON visitors(number);
CREATE INDEX IF NOT EXISTS idx_visitors_created ON visitors(created_at DESC);
