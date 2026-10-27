-- One row per weapon copy, with its definition (v_weapon_definition) and what
-- the copy changes. element is the copy's damage type, else the weapon's
-- default, and element_icon its icon; archetype is the intrinsic in the copy's
-- socket 0, else the one the weapon starts with; rpm is the copy's
-- rounds-per-minute stat. tier_overlay is the pip image for the copy's gear
-- tier, and masterwork_overlay the gold border of a masterworked copy (the
-- exotic one for an exotic), from the constants table's one row; each '' when
-- it has none.
CREATE VIEW v_weapon AS
SELECT i.itemInstanceId AS instance_id, i.itemHash AS item_hash, w.name, w.family_name,
       w.slot, w.slot_order, w.wtype, w.wtype_icon, w.tier, w.icon, w.watermark, w.is_exotic,
       w.source, w.season_num, w.season_name, w.season_date, w.ammo, w.ammo_icon,
       COALESCE(dt.name, w.element) AS element,
       CASE WHEN dt.icon IS NULL THEN w.element_icon
            WHEN dt.icon = '' THEN ''
            ELSE 'https://www.bungie.net' || dt.icon END AS element_icon,
       COALESCE(NULLIF(cp.name, ''), w.archetype) AS archetype,
       COALESCE(NULLIF(cp.icon, ''), w.archetype_icon) AS archetype_icon,
       COALESCE(st.stats ->> ('$."' || sk.statHash || '"'), 0) AS rpm,
       COALESCE(n.value, 0) AS power, n.gearTier AS gear_tier, i.state & 1 AS is_locked,
       (i.state & 4) > 0 AS is_masterworked, COALESCE(n.isEquipped, 0) AS is_equipped,
       COALESCE(gt.url, '') AS tier_overlay,
       CASE WHEN i.state & 4 THEN COALESCE('https://www.bungie.net' || NULLIF(
                CASE WHEN w.tier = 6 THEN k.masterworkExoticBorderedOverlayPath
                     ELSE k.masterworkBorderedOverlayPath END, ''), '')
            ELSE '' END AS masterwork_overlay
FROM DestinyItemComponent i
JOIN v_weapon_definition w ON w.item_hash = i.itemHash
LEFT JOIN DestinyItemInstanceComponent n ON n.itemInstanceId = i.itemInstanceId
LEFT JOIN DestinyDamageTypeDefinition dt ON dt.hash = n.damageTypeHash
LEFT JOIN DestinyItemSocketsComponent s ON s.itemInstanceId = i.itemInstanceId
LEFT JOIN v_plug cp ON cp.hash = s.sockets ->> '$[0].plugHash'
LEFT JOIN stat_key sk ON sk.key = 'rpm'
LEFT JOIN DestinyItemStatsComponent st ON st.itemInstanceId = i.itemInstanceId
LEFT JOIN v_gear_tier gt ON gt.tier = n.gearTier
LEFT JOIN DestinyInventoryItemConstantsDefinition k ON TRUE;
