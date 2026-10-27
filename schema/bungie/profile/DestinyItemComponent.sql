-- DestinyItemComponent: "The base item component, filled with properties that
-- are generally useful to know in any item request or that don't feel
-- worthwhile to put in their own component." Rows: each weapon and armor copy
-- in the profile's item lists (components 102 vault, 201 character
-- inventories, 205 character equipment) whose definition is stored. A row is
-- updated in place each run, because DIM tags and notes point at it; a copy
-- gone from the profile is deleted with its rows.
CREATE TABLE DestinyItemComponent (
    -- "If the item is instanced, it will have an instance ID. Lack of an
    -- instance ID implies that the item has no distinct local qualities aside
    -- from stack size." A large number sent as text.
    itemInstanceId  TEXT PRIMARY KEY,
    -- "The identifier for the item's definition, which is where most of the
    -- useful static information for the item can be found."
    itemHash        INTEGER NOT NULL REFERENCES DestinyInventoryItemDefinition(hash),
    -- "A flags enumeration indicating the transient/custom states of the item
    -- that affect how it is rendered: whether it's tracked or locked for
    -- example, or whether it has a masterwork plug inserted."
    -- Destiny.ItemState: 1 Locked, 2 Tracked, 4 Masterwork, 8 Crafted, 16
    -- HighlightedObjective, 32 Enhanced.
    state           INTEGER NOT NULL DEFAULT 0
);
