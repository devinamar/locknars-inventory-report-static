-- DestinyItemStatsComponent (component 304): "If you want the stats on an
-- item's instanced data, get this component. These are stats like Attack,
-- Defense etc... and *not* historical stats. Note that some stats have
-- additional computation in-game at runtime - for instance, Magazine Size -
-- and thus these stats might not be 100% accurate compared to what you see in-
-- game for some stats." One row per copy the profile sends it for.
CREATE TABLE DestinyItemStatsComponent (
    -- The copy these stats belong to.
    itemInstanceId  TEXT PRIMARY KEY
        REFERENCES DestinyItemComponent(itemInstanceId) ON DELETE CASCADE,
    -- stats: "If the item has stats that it provides (damage, defense,
    -- etc...), it will be given here." Bungie sends a dictionary from stat
    -- hash to a DestinyStat ({statHash, value}); this keeps each stat's value
    -- under its hash: a JSON object from stat hash (as text; the hash of a
    -- DestinyStatDefinition, and stat_key names the ones the app reads, such
    -- as 4284893193, rounds per minute) to "The current value of the Stat."
    -- Hashes are kept as sent. Like {"4284893193": 140, "155624089": 72, ...}.
    stats           TEXT NOT NULL DEFAULT '{}'
);
