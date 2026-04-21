-- Add signature storage. Each visitor's drawn signature is persisted as a
-- PNG data URL so returning visitors and the gallery can render the actual
-- ink, not a blank line. Nullable so existing rows remain valid and so
-- visitors who skip the drawing step still insert cleanly.
ALTER TABLE visitors ADD COLUMN signature_png TEXT;
