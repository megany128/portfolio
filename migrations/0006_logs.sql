-- Log entries for the "Latest Log" card on /home and the /logs archive.
-- Body is plain text with markdown-style links: [text](https://url)
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_logs_created ON logs (created_at DESC);

-- Seed with the log previously hardcoded in src/pages/home.astro.
INSERT INTO logs (body, created_at) VALUES (
  '[@Simon Ilincev](https://simonilincev.com/) and I have just launched [Lingofable](https://lingofable.com), a language learning app based on comprehensible input! Currently, I''m also building [Skloňuj](https://sklonuj.com), a tool for Czech learners to practice noun declension — it''s being piloted by four universities.',
  '2026-04-12T12:00:00Z'
);
