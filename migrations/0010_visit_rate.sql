-- Per-IP daily cap on new visitor cards (POST /api/visit). A script created
-- ~6,000 noise-signature cards on 2026-10-17..20; nothing limited it.
--   day      UTC date (YYYY-MM-DD)
--   ip_hash  SHA-256 of "<day>:<ip>" — no raw IPs, and not linkable across days
-- Day leads the key so pruning old days is an index range delete.
CREATE TABLE IF NOT EXISTS visit_rate (
  day TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ip_hash)
);
