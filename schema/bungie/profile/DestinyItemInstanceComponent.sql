-- DestinyItemInstanceComponent (component 300): "If an item is "instanced",
-- this will contain information about the item's instance that doesn't fit
-- easily into other components. One might say this is the "essential" instance
-- data for the item." Rows: one per copy in DestinyItemComponent that the
-- profile sends this component for.
CREATE TABLE DestinyItemInstanceComponent (
    -- The copy this component belongs to.
    itemInstanceId  TEXT PRIMARY KEY
        REFERENCES DestinyItemComponent(itemInstanceId) ON DELETE CASCADE,
    -- "Is the item currently equipped on the given character?" 1 or 0.
    isEquipped      INTEGER,
    -- primaryStat.value: "The current value of the Stat." primaryStat is "The
    -- item stat that we consider to be "primary" for the item. For instance,
    -- this would be "Attack" for Weapons or "Defense" for armor." For weapons
    -- and armor, power.
    value           INTEGER,
    -- "Gear Tier, if applicable, fished up from the unlock value
    -- items.gear_tier"
    gearTier        INTEGER,
    -- "The current damage type's hash, so you can look up localized info and
    -- icons for it." NULL when the copy has none.
    damageTypeHash  INTEGER REFERENCES DestinyDamageTypeDefinition(hash)
);
