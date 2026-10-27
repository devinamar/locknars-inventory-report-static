-- DestinyInventoryItemConstantsDefinition: constants for items. Bungie gives
-- it no description. Rows kept: the one row.
CREATE TABLE DestinyInventoryItemConstantsDefinition (
    -- "The unique identifier for this entity. Guaranteed to be unique for the
    -- type of entity, but not globally. When entities refer to each other in
    -- Destiny content, it is this hash that they are referring to."
    hash                       INTEGER PRIMARY KEY,
    -- "Gear tier overlay images" A JSON array of image paths on
    -- www.bungie.net, the pip for gear tier 1 first.
    gearTierOverlayImagePaths            TEXT,
    -- "Gold masterwork glow for non-Exotic Items, with a gold border" A path
    -- on www.bungie.net.
    masterworkBorderedOverlayPath        TEXT,
    -- "Gold masterwork glow for Exotic items, with a gold border" A path on
    -- www.bungie.net.
    masterworkExoticBorderedOverlayPath  TEXT
);
