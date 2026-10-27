-- DestinyEquipableItemSetDefinition: "Perks that are active only when you have
-- a certain number of set items equipped." An armor set with a set bonus.
-- Rows kept: all.
CREATE TABLE DestinyEquipableItemSetDefinition (
    -- "The unique identifier for this entity. Guaranteed to be unique for the
    -- type of entity, but not globally. When entities refer to each other in
    -- Destiny content, it is this hash that they are referring to."
    hash      INTEGER PRIMARY KEY,
    -- displayProperties.name: the set's name. Bungie's documentation gives no
    -- description.
    name      TEXT,
    -- setPerks: "The perks conferred by this set of armor pieces." A JSON
    -- array, its entries holding:
    --   requiredSetCount: "The number of set pieces required to activate the
    --     perk." 2 or 4.
    --   sandboxPerkHash: "The perk this set confers." Its name and text are
    --     in DestinySandboxPerkDefinition.
    -- Like [{"requiredSetCount": 2, "sandboxPerkHash": 17188252},
    -- {"requiredSetCount": 4, "sandboxPerkHash": 17188253}].
    setPerks  TEXT NOT NULL DEFAULT '[]'
);
