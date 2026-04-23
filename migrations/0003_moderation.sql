-- Moderation: approved flag on visitors + reports table.
-- Existing visitors are grandfathered as approved. New visitors start unapproved.
ALTER TABLE visitors ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;

-- Approve all existing visitors.
UPDATE visitors SET approved = 1;

-- Reports table: one row per report (one visitor can report another once).
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL REFERENCES visitors(id),
  reporter_id TEXT NOT NULL REFERENCES visitors(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(card_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_card ON reports(card_id);
