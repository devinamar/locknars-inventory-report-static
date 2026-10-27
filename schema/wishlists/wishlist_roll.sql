-- One row per roll line. item_hash is not a foreign key because wildcard
-- rolls (item=-69420, "any weapon") name no stored weapon; the save step
-- drops other unknown hashes. perk1..perk6 follow DIM's column order (barrel,
-- magazine, trait 1, trait 2, two extras); NULL means the line didn't list
-- that column or the plug wasn't in the manifest.
CREATE TABLE wishlist_roll (
    roll_id    INTEGER PRIMARY KEY,
    source_key TEXT NOT NULL REFERENCES wishlist_source(key) ON DELETE CASCADE,
    item_hash  INTEGER NOT NULL,
    perk1      INTEGER REFERENCES DestinyInventoryItemDefinition(hash),
    perk2      INTEGER REFERENCES DestinyInventoryItemDefinition(hash),
    perk3      INTEGER REFERENCES DestinyInventoryItemDefinition(hash),
    perk4      INTEGER REFERENCES DestinyInventoryItemDefinition(hash),
    perk5      INTEGER REFERENCES DestinyInventoryItemDefinition(hash),
    perk6      INTEGER REFERENCES DestinyInventoryItemDefinition(hash),
    note_id    INTEGER REFERENCES wishlist_note(note_id),
    tags       TEXT NOT NULL DEFAULT '',
    is_trash   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX wishlist_roll_source ON wishlist_roll(source_key);
CREATE INDEX wishlist_roll_item ON wishlist_roll(item_hash);
