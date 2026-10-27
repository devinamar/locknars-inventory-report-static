-- DIM tag and notes per copy, written by extract/dim.py; no row means no DIM
-- annotation. A failed DIM sync leaves the table as it was.
CREATE TABLE item_dim (
    instance_id  TEXT PRIMARY KEY REFERENCES DestinyItemComponent(itemInstanceId) ON DELETE CASCADE,
    tag          TEXT,
    notes        TEXT
);
