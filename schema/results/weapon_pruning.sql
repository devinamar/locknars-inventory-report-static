-- One row per weapon copy to dismantle. reason is 'below_legendary' for a copy
-- below Legendary (tierType under 5: Common, Uncommon or Rare), or
-- 'exact_duplicate' for a copy whose family, element, archetype and every perk
-- socket match a copy kept in its place: keeper_id, the one with the highest
-- gear tier, then the best wishlist score, then the lowest itemInstanceId.
CREATE TABLE weapon_pruning (
    instance_id  TEXT PRIMARY KEY
        REFERENCES DestinyItemComponent(itemInstanceId) ON DELETE CASCADE,
    reason       TEXT NOT NULL,  -- 'below_legendary' | 'exact_duplicate'
    keeper_id    TEXT REFERENCES DestinyItemComponent(itemInstanceId) ON DELETE SET NULL
);
