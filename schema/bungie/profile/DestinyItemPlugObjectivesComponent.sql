-- DestinyItemPlugObjectivesComponent (component 309). Bungie gives the
-- component no description. "Sometimes, Plugs may have objectives: generally,
-- these are used for flavor and display purposes. For instance, a Plug might
-- be tracking the number of PVP kills you have made." Kill trackers, crafted
-- weapon levels and memento progress are here. One row per copy the profile
-- sends it for.
CREATE TABLE DestinyItemPlugObjectivesComponent (
    -- The copy these objectives belong to.
    itemInstanceId     TEXT PRIMARY KEY
        REFERENCES DestinyItemComponent(itemInstanceId) ON DELETE CASCADE,
    -- objectivesPerPlug: "keyed by the Item Hash
    -- (DestinyInventoryItemDefinition) of the plug whose objectives are being
    -- returned, with the value being the list of those objectives." A plug
    -- can be one the copy can switch to rather than the one plugged. A JSON
    -- object from plug hash (as text) to its objectives, each a
    -- DestinyObjectiveProgress ("Returns data about a character's status with
    -- a given Objective.") holding the fields the app reads, each when Bungie
    -- sends it:
    --   objectiveHash: "The unique identifier of the Objective being referred
    --     to. Use to look up the DestinyObjectiveDefinition in static data."
    --   progress: "If progress has been made, and the progress can be
    --     measured numerically, this will be the value of that progress." It
    --     "need not be a literal numeric progression. It could be one of a
    --     number of possible values, even a Timestamp. Always examine
    --     DestinyObjectiveDefinition.inProgressValueStyle or
    --     completedValueStyle before rendering progress."
    -- Hashes are kept as sent. Like {"41589556": [{"objectiveHash":
    -- 2899837482, "progress": 35}, ...], ...}.
    objectivesPerPlug  TEXT NOT NULL DEFAULT '{}'
);
