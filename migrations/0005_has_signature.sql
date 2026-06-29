-- Gallery perf: index the "card has a real drawing" filter.
-- The gallery filtered on `signature_png IS NOT NULL AND LENGTH(signature_png) > 800`,
-- which forced a full scan reading the large base64 PNG column on every row for
-- every gallery query. Replace it with a cheap, indexed boolean maintained at
-- write time (see createVisitor/updateVisitor in src/lib/visitor-server.ts).
ALTER TABLE visitors ADD COLUMN has_signature INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows (idempotent).
UPDATE visitors SET has_signature =
  CASE WHEN signature_png IS NOT NULL AND LENGTH(signature_png) > 800 THEN 1 ELSE 0 END;

-- Covers the gallery list/count/stats filter + number ordering.
CREATE INDEX IF NOT EXISTS idx_visitors_gallery
  ON visitors(approved, has_signature, number DESC);
