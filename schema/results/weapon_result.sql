-- Per weapon copy: match_count is how many non-trash wishlist rolls it can
-- equip, and instance_wishlist_match lists the rolls it matched, trash
-- included. has_wishlist is 0 when no source covers the weapon at all.
CREATE TABLE weapon_result (
    instance_id   TEXT PRIMARY KEY
        REFERENCES DestinyItemComponent(itemInstanceId) ON DELETE CASCADE,
    match_count   INTEGER NOT NULL DEFAULT 0,
    has_wishlist  INTEGER NOT NULL DEFAULT 0
);
