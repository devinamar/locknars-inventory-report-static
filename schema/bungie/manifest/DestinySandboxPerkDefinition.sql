-- DestinySandboxPerkDefinition: "Perks are modifiers to a character or item
-- that can be applied situationally." Bungie's full description adds that
-- perks determine a weapon's damage type and bestow the benefits of mods, and
-- that only some are human readable. Rows kept: the perks the stored armor
-- sets confer.
CREATE TABLE DestinySandboxPerkDefinition (
    -- "The unique identifier for this entity. Guaranteed to be unique for the
    -- type of entity, but not globally. When entities refer to each other in
    -- Destiny content, it is this hash that they are referring to."
    hash         INTEGER PRIMARY KEY,
    -- displayProperties.name: The name shown in game. Bungie's documentation
    -- gives no description.
    name         TEXT,
    -- displayProperties.description: the perk's text, with any inline icon
    -- tokens (v_text_icon has their icons). Bungie's documentation gives no
    -- description.
    description  TEXT,
    -- displayProperties.icon: "Note that "icon" is sometimes misleading, and
    -- should be interpreted in the context of the entity. For instance, in
    -- Destiny 1 the DestinyRecordBookDefinition's icon was a big picture of a
    -- book. But usually, it will be a small square image that you can use
    -- as... well, an icon. They are currently represented as 96px x 96px
    -- images." A path on www.bungie.net.
    icon         TEXT
);
