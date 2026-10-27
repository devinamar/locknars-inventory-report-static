-- DestinyActivityModeDefinition: "This definition represents an "Activity Mode"
-- as it exists in the Historical Stats endpoints. An individual Activity Mode
-- represents a collection of activities that are played in a certain way."
-- The report takes its side badges' icons from it: Raid for PvE, Trials of
-- Osiris for PvP. Rows kept: all.
CREATE TABLE DestinyActivityModeDefinition (
    -- "The unique identifier for this entity. Guaranteed to be unique for the
    -- type of entity, but not globally. When entities refer to each other in
    -- Destiny content, it is this hash that they are referring to."
    hash      INTEGER PRIMARY KEY,
    -- "The Enumeration value for this Activity Mode. Pass this identifier into
    -- Stats endpoints to get aggregate stats for this mode." A
    -- DestinyActivityModeType, such as 4 (Raid) or 84 (Trials of Osiris).
    modeType  INTEGER,
    -- displayProperties.name, such as 'Raid'. Bungie's documentation gives no
    -- description.
    name      TEXT,
    -- displayProperties.icon: "Note that "icon" is sometimes misleading, and
    -- should be interpreted in the context of the entity. For instance, in
    -- Destiny 1 the DestinyRecordBookDefinition's icon was a big picture of a
    -- book. But usually, it will be a small square image that you can use
    -- as... well, an icon. They are currently represented as 96px x 96px
    -- images." A path on www.bungie.net.
    icon      TEXT
);
