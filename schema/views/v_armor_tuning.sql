-- The stats each armor copy's tuning socket can raise, one row per stat: a Tier
-- 5 Legendary piece raises its one tuning stat, a Tier 5 exotic any of the six.
-- Each tuning mod raises one stat by 5 and lowers another by 5; Balanced Tuning,
-- whose stats are +1s, is left out. A copy without a tuning socket has no rows.
CREATE VIEW v_armor_tuning AS
SELECT DISTINCT r.itemInstanceId AS instance_id, k.key AS stat
FROM DestinyItemReusablePlugsComponent r
CROSS JOIN json_each(r.plugs) sk
CROSS JOIN json_each(sk.value) rp
CROSS JOIN DestinyInventoryItemDefinition p ON p.hash = rp.value ->> 'plugItemHash'
CROSS JOIN json_each(p.investmentStats) inv
CROSS JOIN stat_key k ON k.statHash = inv.value ->> 'statTypeHash'
WHERE p.plugCategoryIdentifier = 'core.gear_systems.armor_tiering.plugs.tuning.mods'
  AND inv.value ->> 'value' >= 5;
