-- Global counters (pet pokes, etc.)
CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- Seed pet pokes: ~3 pokes per existing approved visitor.
INSERT OR IGNORE INTO counters (key, value)
SELECT 'pet_pokes', COALESCE(COUNT(*) * 3, 0) FROM visitors WHERE approved = 1;
