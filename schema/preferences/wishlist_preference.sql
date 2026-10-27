-- The DIM wishlists weapon rolls are scored against, one row each: the
-- defaults in wishlists.toml and any added with --add-wishlist. Every run
-- downloads each one (extract/wishlists.py).
CREATE TABLE wishlist_preference (
    key    TEXT PRIMARY KEY,  -- short id; its status is source_status 'wishlist:<key>'
    label  TEXT NOT NULL,     -- the name the report shows
    url    TEXT NOT NULL      -- a raw DIM wishlist .txt file
);
