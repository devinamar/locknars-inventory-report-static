-- DestinyObjectiveDefinition: "Defines an "Objective". An objective is a
-- specific task you should accomplish in the game." A kill tracker's count is
-- one. Rows kept: the objectives the stored plugs name (their
-- objectives.objectiveHashes).
CREATE TABLE DestinyObjectiveDefinition (
    -- "The unique identifier for this entity. Guaranteed to be unique for the
    -- type of entity, but not globally. When entities refer to each other in
    -- Destiny content, it is this hash that they are referring to."
    hash                  INTEGER PRIMARY KEY,
    -- "Text to describe the progress bar.", such as 'Enemies Defeated'.
    progressDescription   TEXT,
    -- "The style to use when the objective is still in progress." A
    -- DestinyUnlockValueUIStyle: 6 is Integer ("Show the number as a straight-
    -- up integer"), 4 is DateTime, 3 is Percentage, and so on.
    inProgressValueStyle  INTEGER,
    -- "The style to use when the objective is completed." Same values.
    completedValueStyle   INTEGER,
    -- displayProperties.icon: "Note that "icon" is sometimes misleading, and
    -- should be interpreted in the context of the entity. For instance, in
    -- Destiny 1 the DestinyRecordBookDefinition's icon was a big picture of a
    -- book. But usually, it will be a small square image that you can use
    -- as... well, an icon. They are currently represented as 96px x 96px
    -- images." A path on www.bungie.net; a kill tracker's is the badge of what
    -- it counts.
    icon                  TEXT
);
