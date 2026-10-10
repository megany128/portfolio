-- Czech study dashboard (/czech, served at czech.meganyap.me).
-- One row per completed daily task. Unchecking deletes the row, so a day's
-- progress is just the set of task ids present for that date.
--   day   local calendar date (YYYY-MM-DD) as seen by the browser that checked it
--   task  id from CZECH_TASKS in src/lib/czech.ts
CREATE TABLE IF NOT EXISTS czech_checks (
  day TEXT NOT NULL,
  task TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, task)
);
