-- DestinyClassDefinition: "Defines a Character Class in Destiny 2. These are
-- types of characters you can play, like Titan, Warlock, and Hunter." Rows
-- kept: all.
CREATE TABLE DestinyClassDefinition (
    -- "The unique identifier for this entity. Guaranteed to be unique for the
    -- type of entity, but not globally. When entities refer to each other in
    -- Destiny content, it is this hash that they are referring to."
    hash       INTEGER PRIMARY KEY,
    -- "In Destiny 1, we added a convenience Enumeration for referring to
    -- classes. We've kept it, though mostly for posterity. This is the enum
    -- value for this definition's class."
    -- DestinyInventoryItemDefinition.classType holds the same number.
    classType  INTEGER UNIQUE,
    -- displayProperties.name, such as 'Warlock'. Bungie's documentation gives
    -- no description.
    name       TEXT
);
