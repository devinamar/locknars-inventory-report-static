-- One row per source in wishlists.toml. How its last download went is in
-- source_status.
CREATE TABLE wishlist_source (
    key           TEXT PRIMARY KEY,
    label         TEXT NOT NULL,
    url           TEXT NOT NULL,
    content_hash  TEXT NOT NULL DEFAULT ''  -- SHA-256 of the last downloaded body
);
