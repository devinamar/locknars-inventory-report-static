-- How each external source fared this run, written by the extract step that
-- reads it. status is 'fresh' (downloaded), 'cached' (unchanged since the
-- last download), 'stale' (download failed; the stored copy is used),
-- 'failed' (download failed and nothing is stored) or 'skipped'. detail is
-- the stored copy's version where the source has one (manifest, Clarity, perk
-- popularity's generated_at, or a note on a copy pulled by hand).
CREATE TABLE source_status (
    source      TEXT PRIMARY KEY,           -- 'manifest', 'profile', 'dim', 'clarity', 'aegis', 'perk_popularity', 'wishlist:<key>'
    status      TEXT NOT NULL,
    checked_at  TEXT NOT NULL,              -- when this run checked it (ISO 8601)
    detail      TEXT NOT NULL DEFAULT ''
);
