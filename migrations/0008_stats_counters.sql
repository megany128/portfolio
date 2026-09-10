-- Gallery stats counters.
-- getGalleryStats used to run five aggregate queries over every approved row
-- (COUNT, GROUP BY color, GROUP BY day, MIN/MAX issued_at, MAX number) on every
-- /visitor-gallery render — ~18k rows_read per page view against a 5M/day D1
-- free-tier budget. The totals are now maintained incrementally in `counters`
-- at write time (see galleryStatsDelta in src/lib/visitor-server.ts) and read
-- back as a handful of rows:
--   stats_total               approved + has_signature card count
--   stats_color_<color>       per-colour counts
--   stats_day_<YYYY-MM-DD>    per-UTC-day signup counts
-- Seed from the current data (idempotent — re-runnable via the admin
-- `resync-stats` action if the counters ever drift).
INSERT OR IGNORE INTO counters (key, value) VALUES
  ('stats_total', 0),
  ('stats_color_pink', 0),
  ('stats_color_teal', 0),
  ('stats_color_green', 0),
  ('stats_color_orange', 0),
  ('stats_color_neutral', 0);

DELETE FROM counters WHERE key LIKE 'stats_day_%';

INSERT OR REPLACE INTO counters (key, value)
SELECT 'stats_total', COUNT(*) FROM visitors WHERE approved = 1 AND has_signature = 1;

INSERT OR REPLACE INTO counters (key, value)
SELECT 'stats_color_' || color, COUNT(*) FROM visitors
WHERE approved = 1 AND has_signature = 1 GROUP BY color;

INSERT OR REPLACE INTO counters (key, value)
SELECT 'stats_day_' || substr(issued_at, 1, 10), COUNT(*) FROM visitors
WHERE approved = 1 AND has_signature = 1 GROUP BY substr(issued_at, 1, 10);
