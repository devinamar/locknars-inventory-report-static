-- DestinyStatDefinition: "This represents a stat that's applied to a character
-- or an item (such as a weapon, piece of armor, or a vehicle). An example of a
-- stat might be Attack Power on a weapon. Stats go through a complex set of
-- transformations before they end up being shown to the user as a number or a
-- progress bar, and those transformations are fundamentally intertwined with
-- the concept of a "Stat Group" (DestinyStatGroupDefinition)." Bungie's full
-- description goes on to the four transformations a stat goes through. Rows
-- kept: all; the six armor stats, weapon stats such as Rounds Per Minute, and
-- the rest.
CREATE TABLE DestinyStatDefinition (
    -- "The unique identifier for this entity. Guaranteed to be unique for the
    -- type of entity, but not globally. When entities refer to each other in
    -- Destiny content, it is this hash that they are referring to."
    hash  INTEGER PRIMARY KEY,
    -- displayProperties.name: The name shown in game. Bungie's documentation
    -- gives no description.
    name  TEXT,
    -- displayProperties.icon: "Note that "icon" is sometimes misleading, and
    -- should be interpreted in the context of the entity. For instance, in
    -- Destiny 1 the DestinyRecordBookDefinition's icon was a big picture of a
    -- book. But usually, it will be a small square image that you can use
    -- as... well, an icon. They are currently represented as 96px x 96px
    -- images." A path on www.bungie.net.
    icon  TEXT
);
