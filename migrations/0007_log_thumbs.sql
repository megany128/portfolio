-- Uploaded hover-preview thumbnails for log links, stored as data URLs
-- (same approach as visitor signature PNGs) and served via /api/log-thumb/:id.
CREATE TABLE log_thumbs (
  id TEXT PRIMARY KEY,
  data_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
