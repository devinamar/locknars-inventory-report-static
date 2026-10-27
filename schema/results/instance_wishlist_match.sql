CREATE TABLE instance_wishlist_match (
    instance_id  TEXT NOT NULL REFERENCES DestinyItemComponent(itemInstanceId) ON DELETE CASCADE,
    roll_id      INTEGER NOT NULL REFERENCES wishlist_roll(roll_id) ON DELETE CASCADE,
    PRIMARY KEY (instance_id, roll_id)
);
CREATE INDEX instance_wishlist_match_roll ON instance_wishlist_match(roll_id);
