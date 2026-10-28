// Reads everything the report shows from the db: one query per list, each in
// the order the report shows it, so the templates only group consecutive rows.
// Nothing is recomputed; the counts, scores and flags are the stored results
// and the views over them. Ported from d2-inventory-report's report/load.py;
// the SQL is the CLI's, word for word.
import { type Database, type SqlValue } from '@sqlite.org/sqlite-wasm'
import * as aegisRankings from '../analyze/aegis-rankings.ts'
import { WILDCARD_ITEM_HASH } from '../models.ts'

// Each armor class's place in every class switch: most pieces first.
export const CLASS_N = `
SELECT armor_class, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, armor_class) AS class_n
FROM v_armor
GROUP BY armor_class
`

// The armor classes with their piece counts, the exotics owned (by name,
// ignoring case) out of the class's exotic armor in the manifest, and how many
// of the 20 three-stat builds the kept armor takes to 100 in each stat.
export const CLASSES = `
WITH build AS (
    SELECT DISTINCT armor_class, stat_1, stat_2, stat_3, MIN(total_1, total_2, total_3) AS low
    FROM v_armor_reach
)
SELECT a.armor_class, COUNT(*) AS pieces, SUM(NOT a.is_exotic) AS legendary,
       SUM(a.is_exotic) AS exotic,
       COUNT(DISTINCT CASE WHEN a.is_exotic THEN lower(a.name) END) AS exotics_owned,
       (SELECT COUNT(DISTINCT lower(d.name)) FROM DestinyInventoryItemDefinition d
        JOIN DestinyClassDefinition k ON k.classType = d.classType
        WHERE d.itemType = 2 AND d.tierType = 6 AND k.name = a.armor_class) AS exotics_total,
       (SELECT COUNT(*) FROM build b WHERE b.armor_class = a.armor_class AND b.low >= 100)
           AS covered
FROM v_armor a
JOIN (${CLASS_N}) c ON c.armor_class = a.armor_class
GROUP BY a.armor_class
ORDER BY c.class_n
`

// The run's headline counts. to_review is Roll Quality's cards with more than
// one copy: the weapons to review.
export const TOTALS = `
SELECT (SELECT COUNT(*) FROM v_weapon) AS weapons, (SELECT COUNT(*) FROM v_armor) AS armor,
       (SELECT COUNT(*) FROM weapon_pruning WHERE reason = 'exact_duplicate') AS true_duplicates,
       (SELECT COUNT(*) FROM weapon_pruning WHERE reason = 'below_legendary') AS below_legendary,
       (SELECT COUNT(DISTINCT card) FROM v_weapon_card WHERE copies > 1) AS to_review,
       COUNT(*) FILTER (WHERE w.match_count > 0) AS matched,
       COUNT(*) FILTER (WHERE NOT w.has_wishlist) AS uncovered,
       (SELECT COUNT(*) FROM v_armor_pruning WHERE NOT rescued) AS armor_to_purge,
       (SELECT COUNT(*) FROM v_armor_pruning WHERE rescued) AS rescued,
       (SELECT checked_at FROM source_status WHERE source = 'profile') AS checked_at,
       (SELECT generated_at FROM perk_popularity_file) AS scores_at
FROM weapon_result w
`

// Every outside source with what it gives, a link ('' for d2-perk-popularity,
// whose repo is private) and how it fared this run; ok is 0 for a failed,
// stale or skipped source, and for one never checked.
export const SOURCES = `
WITH source (source, name, gives, url, n) AS (
    VALUES ('manifest', 'Bungie manifest', 'Item, perk and set definitions',
            'https://www.bungie.net/', 1),
           ('profile', 'Bungie profile', 'Every weapon and armor copy',
            'https://www.bungie.net/', 2),
           ('dim', 'DIM', 'Your tags and notes', 'https://app.destinyitemmanager.com/', 3),
           ('clarity', 'Clarity', 'Community perk insights',
            'https://github.com/Database-Clarity/Live-Clarity-Database', 4),
           ('aegis', 'The Aegis', 'Armor set bonus rankings',
            'https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY/',
            6),
           ('perk_popularity', 'd2-perk-popularity', 'The rolls players run, PvE and PvP', '', 7)
    UNION ALL
    SELECT 'wishlist:' || key, label, 'Weapon rolls to look for', url, 5 FROM wishlist_source
)
SELECT s.name, s.gives, s.url, st.checked_at,
       COALESCE(st.status IN ('fresh', 'cached'), 0) AS ok,
       CASE st.status
           WHEN 'fresh' THEN 'Up to date'
           WHEN 'cached' THEN 'Up to date'
           WHEN 'stale' THEN 'Download failed: the last good copy is used'
           WHEN 'failed' THEN 'Download failed, and no copy is stored'
           WHEN 'skipped' THEN 'Skipped'
           ELSE 'Not checked'
       END AS status
FROM source s
LEFT JOIN source_status st ON st.source = s.source
ORDER BY s.n, s.name
`

// Every armor piece to purge (rescued ones stay): the Summary's DIM query.
export const ARMOR_PURGE = `
SELECT instance_id FROM v_armor_pruning WHERE NOT rescued ORDER BY instance_id
`

// The armor pieces to purge, counted by reason, most first.
export const PURGE_COUNTS = `
SELECT reason, COUNT(*) AS n
FROM v_armor_pruning
WHERE NOT rescued
GROUP BY reason
ORDER BY n DESC, reason
`

// The weapon copies weapon_pruning flags (the true duplicates and any copy below
// Legendary), by reason, then name. A true duplicate's keeper is on a Roll
// Quality card: grid_id names the card, keeper_k the keeper's place on it.
export const WEAPON_FLAGS = `
SELECT p.instance_id, p.reason, p.keeper_id, v.name, v.wtype, c.grid_id, c.k AS keeper_k
FROM weapon_pruning p
JOIN v_weapon v ON v.instance_id = p.instance_id
LEFT JOIN v_weapon_card c ON c.instance_id = p.keeper_id
ORDER BY p.reason, v.name, p.instance_id
`

// Roll Quality: every weapon copy left after pruning, on its card (the weapon its
// version is scored as, so a family whose versions roll different trait pools
// is a card per pool, else its family; k is its place there), by slot, weapon
// type and card, each card's copies best PvE first. elements, archetypes, rpms
// and origins count the card's distinct elements, frames, rounds per minute and
// pairs of season and drop source. Per side (pve_, pvp_): the copy's popularity
// score, its heat (tenths), its rank on the card and its best trait pair with
// its share and rank (v_copy_popularity), and the card's weapon's rank,
// confidence and Endgame flag (v_popularity_weapon; NULL where it isn't
// scored), with pool, its trait pool's label. split gives the copy's completed
// wishlist rolls by list, like "2 Voltron, 1 Aegis Endgame"; matched and trash
// are the keys of the lists with a roll it completes or a trash roll it fits,
// and covered the card's lists whose rolls name perks for its copies'
// versions, each space-separated in list order. kills is the count of the
// tracker plugged into its tracker socket, as DIM shows it: kill_kind what it
// counts (PvE, PvP or Gambit), kill_tracker its name and kill_icon its badge;
// NULL when the plugged tracker counts none of those.
export const ROLL_COPIES = `
WITH copy AS MATERIALIZED (
    SELECT c.card, c.entry, c.family, c.grid_id, c.k, v.instance_id, v.item_hash, v.name,
           v.slot, v.slot_order, v.wtype, v.wtype_icon, v.icon, v.watermark, v.ammo,
           v.ammo_icon, v.element, v.element_icon, v.archetype, v.archetype_icon, v.gear_tier,
           v.is_locked, v.is_masterworked, v.tier_overlay, v.masterwork_overlay, v.rpm,
           v.season_num, v.season_name, v.season_date, v.source, d.tag, d.notes
    FROM v_weapon_card c
    JOIN v_weapon v ON v.instance_id = c.instance_id
    LEFT JOIN item_dim d ON d.instance_id = c.instance_id
),
card AS (
    SELECT card, COUNT(DISTINCT element) AS elements, COUNT(DISTINCT archetype) AS archetypes,
           COUNT(DISTINCT rpm) AS rpms,
           COUNT(DISTINCT season_num || ' ' || season_name || ' ' || source) AS origins
    FROM copy
    GROUP BY card
),
list AS (
    SELECT key, label, ROW_NUMBER() OVER (ORDER BY rowid) AS place FROM wishlist_preference
),
covered AS (
    SELECT card, group_concat(source_key, ' ' ORDER BY place) AS covered
    FROM (
        SELECT DISTINCT c.card, w.source_key, w.place
        FROM copy c
        JOIN v_wishlist_perk w ON w.item_hash IN (c.item_hash, ${WILDCARD_ITEM_HASH})
        WHERE NOT w.is_trash
    )
    GROUP BY card
),
completed AS (
    SELECT m.instance_id, w.source_key, w.is_trash, COUNT(*) AS n
    FROM instance_wishlist_match m
    JOIN wishlist_roll w ON w.roll_id = m.roll_id
    GROUP BY m.instance_id, w.source_key, w.is_trash
),
wish AS (
    SELECT p.instance_id,
           group_concat(CASE WHEN NOT p.is_trash THEN p.n || ' ' || l.label END, ', '
                        ORDER BY l.place) AS split,
           group_concat(CASE WHEN NOT p.is_trash THEN p.source_key END, ' ' ORDER BY l.place)
               AS matched,
           group_concat(CASE WHEN p.is_trash THEN p.source_key END, ' ' ORDER BY l.place)
               AS trash
    FROM completed p
    JOIN list l ON l.key = p.source_key
    GROUP BY p.instance_id
),
pop AS (
    SELECT instance_id,
           MAX(CASE WHEN side = 'pve' THEN score END) AS pve_score,
           MAX(CASE WHEN side = 'pve' THEN rank END) AS pve_rank,
           MAX(CASE WHEN side = 'pve' THEN pair END) AS pve_pair,
           MAX(CASE WHEN side = 'pve' THEN pair_share END) AS pve_pair_share,
           MAX(CASE WHEN side = 'pve' THEN pair_rank END) AS pve_pair_rank,
           MAX(CASE WHEN side = 'pvp' THEN score END) AS pvp_score,
           MAX(CASE WHEN side = 'pvp' THEN rank END) AS pvp_rank,
           MAX(CASE WHEN side = 'pvp' THEN pair END) AS pvp_pair,
           MAX(CASE WHEN side = 'pvp' THEN pair_share END) AS pvp_pair_share,
           MAX(CASE WHEN side = 'pvp' THEN pair_rank END) AS pvp_pair_rank
    FROM v_copy_popularity
    GROUP BY instance_id
),
weapon AS (
    SELECT name, MAX(pool) AS pool,
           MAX(CASE WHEN side = 'pve' THEN rank END) AS pve_weapon_rank,
           MAX(CASE WHEN side = 'pve' THEN confidence END) AS pve_confidence,
           MAX(CASE WHEN side = 'pve' THEN endgame END) AS pve_endgame,
           MAX(CASE WHEN side = 'pvp' THEN rank END) AS pvp_weapon_rank,
           MAX(CASE WHEN side = 'pvp' THEN confidence END) AS pvp_confidence,
           MAX(CASE WHEN side = 'pvp' THEN endgame END) AS pvp_endgame
    FROM v_popularity_weapon
    GROUP BY name
),
tracker AS (
    SELECT instance_id, tracker, kind, kills, icon
    FROM v_kill_tracker
    WHERE is_plugged AND kind IS NOT NULL
)
SELECT copy.*, card.elements, card.archetypes, card.rpms, card.origins,
       COALESCE(covered.covered, '') AS covered, wish.split,
       COALESCE(wish.matched, '') AS matched, COALESCE(wish.trash, '') AS trash,
       pop.pve_score, CAST(round(10 * pop.pve_score) AS INTEGER) AS pve_heat, pop.pve_rank,
       pop.pve_pair, pop.pve_pair_share, pop.pve_pair_rank,
       pop.pvp_score, CAST(round(10 * pop.pvp_score) AS INTEGER) AS pvp_heat, pop.pvp_rank,
       pop.pvp_pair, pop.pvp_pair_share, pop.pvp_pair_rank,
       weapon.pool, weapon.pve_weapon_rank, weapon.pve_confidence,
       COALESCE(weapon.pve_endgame, 0) AS pve_endgame,
       weapon.pvp_weapon_rank, weapon.pvp_confidence,
       COALESCE(weapon.pvp_endgame, 0) AS pvp_endgame,
       tracker.kills, tracker.kind AS kill_kind, tracker.tracker AS kill_tracker,
       tracker.icon AS kill_icon
FROM copy
JOIN card ON card.card = copy.card
JOIN pop ON pop.instance_id = copy.instance_id
LEFT JOIN covered ON covered.card = copy.card
LEFT JOIN wish ON wish.instance_id = copy.instance_id
LEFT JOIN weapon ON weapon.name = copy.entry
LEFT JOIN tracker ON tracker.instance_id = copy.instance_id
ORDER BY copy.slot_order, copy.wtype, copy.card, pop.pve_rank
`

// Popular, and the perk grids it and the weapons page open.

// Every weapon d2-perk-popularity scores, per side in rank order, as the Popular
// page lists it: its popularity there (v_popularity_weapon), its representative
// version's looks (v_weapon_definition: icon, slot, ammo, season and source),
// its Endgame badge on each side, how many vault copies its versions have,
// card (1 when Roll Quality has a card for it: a copy left after pruning), and
// top_perks, each scored column's most picked perk (its v_perk plug hash) in
// socket order, space-separated.
export const POPULARITY = `
WITH owned AS (
    SELECT v.name, COUNT(*) AS owned
    FROM v_weapon w
    JOIN v_popularity_version v ON v.item_hash = w.item_hash
    GROUP BY v.name
),
card AS (
    SELECT DISTINCT grid_id FROM v_weapon_card
),
endgame AS (
    SELECT name, MAX(CASE WHEN side = 'pve' THEN endgame END) AS pve_endgame,
           MAX(CASE WHEN side = 'pvp' THEN endgame END) AS pvp_endgame
    FROM v_popularity_weapon
    GROUP BY name
),
top AS (
    SELECT p.side, p.name, group_concat(k.plug_hash, ' ' ORDER BY p.col_n) AS top_perks
    FROM v_popularity_perk p
    JOIN v_perk k ON k.perk = p.perk
    WHERE p.rank = 1
    GROUP BY p.side, p.name
)
SELECT w.*, d.icon, d.watermark, d.slot, d.slot_order, d.ammo, d.ammo_icon, d.season_num,
       d.season_name, d.source, COALESCE(o.owned, 0) AS owned, c.grid_id IS NOT NULL AS card,
       COALESCE(e.pve_endgame, 0) AS pve_endgame, COALESCE(e.pvp_endgame, 0) AS pvp_endgame,
       COALESCE(t.top_perks, '') AS top_perks
FROM v_popularity_weapon w
LEFT JOIN v_weapon_definition d ON d.item_hash = w.item_hash
LEFT JOIN owned o ON o.name = w.name
LEFT JOIN card c ON c.grid_id = w.grid_id
JOIN endgame e ON e.name = w.name
LEFT JOIN top t ON t.side = w.side AND t.name = w.name
ORDER BY w.side, w.rank, w.name
`

// Each scored column of each weapon per side (v_popularity_column) with the
// weapon's grid, in socket order, the weapons in Popular's order: each
// column's most picked perk for the Markdown.
export const POPULAR_COLUMNS = `
SELECT c.*, w.grid_id
FROM v_popularity_column c
JOIN v_popularity_weapon w ON w.side = c.side AND w.name = c.name
ORDER BY c.side, w.rank, c.name, c.col_n
`

// Each weapon's three most picked trait pairs per side, in Popular's order: the
// Markdown's top pairs.
export const POPULAR_PAIRS = `
SELECT p.side, p.name, p.rank, p.trait1, p.trait2, p.share
FROM v_popularity_pair p
JOIN v_popularity_weapon w ON w.side = p.side AND w.name = p.name
WHERE p.rank <= 3
ORDER BY p.side, w.rank, p.name, p.rank
`

// Every grid's rows (v_weapon_grid) with each perk's plug (v_perk), which names
// its tooltip and icon, by grid, column and PvE place. owners gives the places
// on the grid's card (v_weapon_card's k) of the copies with the perk, and hits
// each of those whose completed wishlist rolls name it, as k:places (the
// lists' places, like 2:1-3), each space-separated.
export const GRID = `
WITH owner AS (
    SELECT c.grid_id, k.col, k.perk, group_concat(c.k, ' ' ORDER BY c.k) AS owners
    FROM v_weapon_card c
    JOIN v_copy_perk k ON k.instance_id = c.instance_id
    GROUP BY c.grid_id, k.col, k.perk
),
hit AS (
    SELECT grid_id, col, perk, group_concat(k || ':' || places, ' ' ORDER BY k) AS hits
    FROM (
        SELECT c.grid_id, k.col, k.perk, c.k,
               replace(group_concat(DISTINCT w.place ORDER BY w.place), ',', '-') AS places
        FROM v_weapon_card c
        JOIN v_copy_perk k ON k.instance_id = c.instance_id
        JOIN instance_wishlist_match m ON m.instance_id = c.instance_id
        JOIN v_wishlist_perk w ON w.roll_id = m.roll_id AND w.perk = k.perk AND NOT w.is_trash
        GROUP BY c.grid_id, k.col, k.perk, c.k
    )
    GROUP BY grid_id, col, perk
)
SELECT g.*, p.plug_hash, COALESCE(o.owners, '') AS owners, COALESCE(h.hits, '') AS hits
FROM v_weapon_grid g
JOIN v_perk p ON p.perk = g.perk
LEFT JOIN owner o ON o.grid_id = g.grid_id AND o.col = g.col AND o.perk = g.perk
LEFT JOIN hit h ON h.grid_id = g.grid_id AND h.col = g.col AND h.perk = g.perk
ORDER BY g.grid_id, g.col_order, g.col, g.pve_pos
`

// Each grid's trait pairs, the scored ones and those its card's copies can
// make, both sides' figures together for its lines and tooltips: per side the
// pair's rank, rel and share, NULL where players weren't seen with it, and its
// verdict: g (desired: a top three pair, or 10% of the side's
// pairs), b (undesirable: under 1% where the side's pairs have medium or high
// confidence) or m (neither), NULL on a side without pair scores. Each trait is
// named by its plug. copies gives the places on the card of the copies that
// can make the pair, wanted and trash the places of the lists with a roll, or a
// trash roll, naming both traits. By grid, then PvE rank.
export const GRID_PAIRS = `
WITH weapon AS (
    SELECT DISTINCT name, grid_id FROM v_popularity_version
),
made AS MATERIALIZED (
    SELECT c.grid_id, a.perk AS trait1, b.perk AS trait2,
           group_concat(c.k, ' ' ORDER BY c.k) AS copies
    FROM v_weapon_card c
    JOIN v_copy_perk a ON a.instance_id = c.instance_id AND a.col = 'trait1'
    JOIN v_copy_perk b ON b.instance_id = c.instance_id AND b.col = 'trait2'
    GROUP BY c.grid_id, a.perk, b.perk
),
voted AS MATERIALIZED (
    SELECT w.grid_id, p.*
    FROM v_popularity_pair p
    JOIN weapon w ON w.name = p.name
),
pair AS MATERIALIZED (
    SELECT grid_id, trait1, trait2 FROM voted
    UNION
    SELECT grid_id, trait1, trait2 FROM made
),
scored AS MATERIALIZED (
    SELECT w.grid_id, c.side, c.confidence IN ('medium', 'high') AS sure
    FROM weapon w
    JOIN v_popularity_column c ON c.name = w.name AND c.col = 'traits'
),
side AS MATERIALIZED (
    SELECT p.grid_id, p.trait1, p.trait2, s.side, v.rank, v.rel, v.share,
           CASE WHEN v.rank <= 3 OR v.share >= 0.1 THEN 'g'
                WHEN s.sure AND COALESCE(v.share, 0) < 0.01 THEN 'b'
                ELSE 'm' END AS verdict
    FROM pair p
    JOIN scored s ON s.grid_id = p.grid_id
    LEFT JOIN voted v
        ON v.grid_id = p.grid_id AND v.side = s.side AND v.trait1 = p.trait1
       AND v.trait2 = p.trait2
),
roll AS MATERIALIZED (
    SELECT DISTINCT c.grid_id, w.roll_id, w.place, w.is_trash, w.perk
    FROM v_weapon_card c
    JOIN v_wishlist_perk w ON w.item_hash IN (c.item_hash, ${WILDCARD_ITEM_HASH})
),
wish AS MATERIALIZED (
    SELECT m.grid_id, m.trait1, m.trait2,
           replace(group_concat(DISTINCT CASE WHEN NOT a.is_trash THEN a.place END
                                ORDER BY a.place), ',', ' ') AS wanted,
           replace(group_concat(DISTINCT CASE WHEN a.is_trash THEN a.place END
                                ORDER BY a.place), ',', ' ') AS trash
    FROM made m
    JOIN roll a ON a.grid_id = m.grid_id AND a.perk = m.trait1
    JOIN roll b ON b.grid_id = m.grid_id AND b.roll_id = a.roll_id AND b.perk = m.trait2
    GROUP BY m.grid_id, m.trait1, m.trait2
)
SELECT p.grid_id, a.plug_hash AS a, b.plug_hash AS b,
       e.rank AS pve_rank, e.rel AS pve_rel, e.share AS pve_share, e.verdict AS pve_verdict,
       v.rank AS pvp_rank, v.rel AS pvp_rel, v.share AS pvp_share, v.verdict AS pvp_verdict,
       COALESCE(m.copies, '') AS copies, COALESCE(w.wanted, '') AS wanted,
       COALESCE(w.trash, '') AS trash
FROM pair p
JOIN v_perk a ON a.perk = p.trait1
JOIN v_perk b ON b.perk = p.trait2
LEFT JOIN side e
    ON e.grid_id = p.grid_id AND e.trait1 = p.trait1 AND e.trait2 = p.trait2 AND e.side = 'pve'
LEFT JOIN side v
    ON v.grid_id = p.grid_id AND v.trait1 = p.trait1 AND v.trait2 = p.trait2 AND v.side = 'pvp'
LEFT JOIN made m ON m.grid_id = p.grid_id AND m.trait1 = p.trait1 AND m.trait2 = p.trait2
LEFT JOIN wish w ON w.grid_id = p.grid_id AND w.trait1 = p.trait1 AND w.trait2 = p.trait2
ORDER BY p.grid_id, pve_rank IS NULL, pve_rank, pvp_rank IS NULL, pvp_rank, p.trait1, p.trait2
`

// The choices of the Popular page's filters: each weapon type, slot (in bucket
// order) and ammo type among the scored weapons, with the ammo badges.
export const POPULAR_OPTIONS = `
SELECT DISTINCT 'ammo' AS kind, d.ammo AS value,
       upper(substr(d.ammo, 1, 1)) || substr(d.ammo, 2) AS label, d.ammo_icon AS icon,
       CASE d.ammo WHEN 'primary' THEN 1 WHEN 'special' THEN 2 ELSE 3 END AS n
FROM v_popularity_weapon w
JOIN v_weapon_definition d ON d.item_hash = w.item_hash
WHERE d.ammo != ''
UNION
SELECT DISTINCT 'slot', d.slot, replace(d.slot, ' Weapons', ''), '', d.slot_order
FROM v_popularity_weapon w
JOIN v_weapon_definition d ON d.item_hash = w.item_hash
UNION
SELECT DISTINCT 'type', type, type, '', 0
FROM v_popularity_weapon
ORDER BY kind, n, value
`

// The Armor 3.0 Legendary pieces, every gear tier, by class, set (grade, then
// rank within it) and slot, each slot's copies best score first: the set cards.
// tier_overlay is the gear tier's pip image ('' without one).
// tuning lists a piece's tuning stats (comma-separated stat keys), builds the
// builds it is kept for (stat keys, builds separated by ';'). purge counts the
// set's pieces to purge (rescued ones stay), flagged those to purge or kept
// for a build.
export const SET_PIECES = `
WITH tuning AS (
    SELECT instance_id, group_concat(stat, ',' ORDER BY stat) AS stats
    FROM v_armor_tuning
    GROUP BY instance_id
),
rescue AS (
    SELECT instance_id, group_concat(stat_1 || ',' || stat_2 || ',' || stat_3, ';') AS builds
    FROM armor_rescue
    GROUP BY instance_id
)
SELECT a.instance_id, a.armor_class, a.set_name, a.slot, a.name, a.icon, a.watermark,
       a.gear_tier, COALESCE(gt.url, '') AS tier_overlay,
       a.health, a.melee, a.grenade, a.super_stat, a.class_stat, a.weapons,
       s.preferred_score AS score, s.best_tuning, s.tuning_gain, t.stats AS tuning, r.builds,
       g.grade, g.label AS grade_label, g.slot_cap, p.rank, p.stat_1, p.stat_2, p.stat_3,
       pr.reason, pr.keeper_id, COALESCE(pr.rescued, 0) AS rescued,
       COUNT(*) OVER set_pieces AS copies,
       SUM(pr.reason IS NOT NULL AND NOT pr.rescued) OVER set_pieces AS purge,
       COUNT(pr.reason) OVER set_pieces AS flagged
FROM v_armor a
JOIN armor_score s ON s.instance_id = a.instance_id
JOIN (${CLASS_N}) c ON c.armor_class = a.armor_class
LEFT JOIN armor_preference p ON p.name = a.set_name COLLATE NOCASE
JOIN armor_grade g ON g.grade = COALESCE(p.grade, '')
LEFT JOIN v_armor_pruning pr ON pr.instance_id = a.instance_id
LEFT JOIN tuning t ON t.instance_id = a.instance_id
LEFT JOIN rescue r ON r.instance_id = a.instance_id
LEFT JOIN v_gear_tier gt ON gt.tier = a.gear_tier
WHERE NOT a.is_exotic
WINDOW set_pieces AS (PARTITION BY a.armor_class, a.set_name)
ORDER BY c.class_n, g.position, p.rank, a.set_name, a.slot_order, s.preferred_score DESC,
         a.instance_id
`

// The Legendary pieces from before Armor 3.0 (always purged), by class and
// slot.
export const LEGACY = `
SELECT a.instance_id, a.armor_class, a.name, a.slot, a.set_name,
       a.health, a.melee, a.grenade, a.super_stat, a.class_stat, a.weapons
FROM v_armor_pruning p
JOIN v_armor a ON a.instance_id = p.instance_id
JOIN (${CLASS_N}) c ON c.armor_class = a.armor_class
WHERE p.reason = 'legacy'
ORDER BY c.class_n, a.slot_order, a.set_name, a.name, a.instance_id
`

// The three-stat builds the kept armor leaves short of 100 in some stat, by
// class, shortest first.
export const SHORT_BUILDS = `
SELECT DISTINCT r.armor_class, r.stat_1, r.stat_2, r.stat_3, r.total_1, r.total_2, r.total_3,
       MIN(r.total_1, r.total_2, r.total_3) AS low
FROM v_armor_reach r
JOIN (${CLASS_N}) c ON c.armor_class = r.armor_class
WHERE MIN(r.total_1, r.total_2, r.total_3) < 100
ORDER BY c.class_n, low, r.stat_1, r.stat_2, r.stat_3
`

// The pieces kept past their set's cap for a build, by class and build.
export const RESCUES = `
SELECT r.stat_1, r.stat_2, r.stat_3, r.new_min, a.instance_id, a.armor_class, a.name,
       a.slot, a.set_name, COALESCE(p.grade, '') AS grade
FROM armor_rescue r
JOIN v_armor a ON a.instance_id = r.instance_id
JOIN (${CLASS_N}) c ON c.armor_class = a.armor_class
LEFT JOIN armor_preference p ON p.name = a.set_name COLLATE NOCASE
ORDER BY c.class_n, r.stat_1, r.stat_2, r.stat_3, a.slot_order, a.instance_id
`

// The exotics with copies to purge: each kept copy (keeper) with the copies it
// beat, by class, slot and name, then best score first. tie marks a purged
// copy that scores the same as its keeper.
export const EXOTIC_DUPES = `
WITH perks AS (
    SELECT instance_id, group_concat(perk, ' + ' ORDER BY perk) AS names
    FROM v_armor_perk
    GROUP BY instance_id
)
SELECT a.instance_id, a.armor_class, a.name, a.slot, a.icon, a.watermark, a.gear_tier,
       a.health, a.melee, a.grenade, a.super_stat, a.class_stat, a.weapons,
       s.preferred_score AS score,
       CASE WHEN a.slot = 'Class Armor' THEN k.names END AS perks,
       p.stat_1, p.stat_2, p.stat_3, pr.reason,
       COALESCE(pr.keeper_id, a.instance_id) AS keeper_id,
       COALESCE(ks.preferred_score = s.preferred_score, 0) AS tie
FROM v_armor a
JOIN armor_score s ON s.instance_id = a.instance_id
JOIN (${CLASS_N}) c ON c.armor_class = a.armor_class
LEFT JOIN v_armor_pruning pr ON pr.instance_id = a.instance_id
LEFT JOIN armor_score ks ON ks.instance_id = pr.keeper_id
LEFT JOIN armor_preference p ON p.name = a.name COLLATE NOCASE
LEFT JOIN perks k ON k.instance_id = a.instance_id
WHERE a.is_exotic AND (pr.reason = 'exotic_dupe' OR a.instance_id IN (
    SELECT keeper_id FROM v_armor_pruning WHERE reason = 'exotic_dupe'))
ORDER BY c.class_n, a.slot_order, lower(a.name), COALESCE(pr.keeper_id, a.instance_id),
         s.preferred_score DESC, a.instance_id
`

// Every armor set's bonuses, 2-piece first: Bungie's name, text and icon for
// each, by set name.
export const SET_BONUSES = `
SELECT DISTINCT s.name AS set_name, sp.value ->> 'requiredSetCount' AS pieces, sb.name,
       COALESCE(sb.description, '') AS description,
       CASE WHEN COALESCE(sb.icon, '') = '' THEN ''
            ELSE 'https://www.bungie.net' || sb.icon END AS icon
FROM DestinyEquipableItemSetDefinition s
CROSS JOIN json_each(s.setPerks) sp
CROSS JOIN DestinySandboxPerkDefinition sb ON sb.hash = sp.value ->> 'sandboxPerkHash'
ORDER BY s.name, pieces
`

// Every armor set preference as stored: by grade (S first, unclassified last),
// rank within the grade, then name. set_name and set_hash are the armor set of
// that name, NULL when the manifest has none.
export const SET_PREFERENCES = `
WITH armor_set AS (
    SELECT lower(name) AS name, MIN(name) AS set_name, MIN(hash) AS set_hash
    FROM DestinyEquipableItemSetDefinition
    GROUP BY lower(name)
)
SELECT p.name, p.stat_1, p.stat_2, p.stat_3, p.grade, g.label AS grade_label,
       a.set_name, a.set_hash
FROM armor_preference p
LEFT JOIN armor_grade g ON g.grade = p.grade
LEFT JOIN armor_set a ON a.name = lower(p.name)
WHERE NOT p.is_exotic
ORDER BY g.position NULLS LAST, p.rank, p.name COLLATE NOCASE
`

// Each armor set's badges, one per class in the class switches' order: the
// icon and watermark of its helmet, else of its first piece by slot.
export const SET_BADGES = `
WITH piece AS (
    SELECT d.equipableItemSetHash AS set_hash, k.name AS armor_class, c.class_n, d.icon,
           d.iconWatermark,
           ROW_NUMBER() OVER (
               PARTITION BY d.equipableItemSetHash, d.classType ORDER BY b.bucketOrder, d.hash
           ) AS n
    FROM DestinyInventoryItemDefinition d
    JOIN DestinyInventoryBucketDefinition b ON b.hash = d.bucketTypeHash
    JOIN DestinyClassDefinition k ON k.classType = d.classType
    LEFT JOIN (${CLASS_N}) c ON c.armor_class = k.name
    WHERE d.itemType = 2 AND d.equipableItemSetHash IS NOT NULL AND COALESCE(d.icon, '') <> ''
)
SELECT set_hash, armor_class, 'https://www.bungie.net' || icon AS icon,
       CASE WHEN COALESCE(iconWatermark, '') = '' THEN ''
            ELSE 'https://www.bungie.net' || iconWatermark END AS watermark
FROM piece
WHERE n = 1
ORDER BY set_hash, class_n NULLS LAST, armor_class
`

// Every exotic preference as stored, by class (in the class switches' order)
// and name. The rest comes from the exotic armor of that name in the manifest,
// its Armor 3.0 version (the one with a tuning socket) when it has one:
// armor_class, item_hash, icon and watermark for its badge, and its exotic perk
// (the first named plug in an intrinsic or exotic socket) with Clarity's text,
// else Bungie's. Each is NULL when the manifest has no exotic of that name.
export const EXOTIC_PREFERENCES = `
WITH version AS (
    SELECT lower(d.name) AS name, k.name AS armor_class, d.hash, d.icon, d.iconWatermark,
           ROW_NUMBER() OVER (
               PARTITION BY lower(d.name)
               ORDER BY EXISTS (
                   SELECT 1 FROM json_each(d.socketEntries) e
                   CROSS JOIN DestinyInventoryItemDefinition t
                       ON t.hash = e.value ->> 'singleInitialItemHash'
                   WHERE t.plugCategoryIdentifier
                         = 'core.gear_systems.armor_tiering.plugs.tuning.mods'
               ) DESC, d.hash
           ) AS n
    FROM DestinyInventoryItemDefinition d
    JOIN DestinyClassDefinition k ON k.classType = d.classType
    WHERE d.itemType = 2 AND d.tierType = 6
),
perk AS (
    SELECT d.hash AS itemHash, t.hash, t.name, t.description,
           ROW_NUMBER() OVER (PARTITION BY d.hash ORDER BY e.key) AS n
    FROM DestinyInventoryItemDefinition d
    CROSS JOIN json_each(d.socketEntries) e
    CROSS JOIN DestinyInventoryItemDefinition t ON t.hash = e.value ->> 'singleInitialItemHash'
    WHERE t.name <> '' AND (t.plugCategoryIdentifier = 'intrinsics'
                            OR t.plugCategoryIdentifier LIKE 'enhancements.exotic%')
)
SELECT p.name, p.stat_1, p.stat_2, p.stat_3, v.armor_class, v.hash AS item_hash,
       CASE WHEN COALESCE(v.icon, '') = '' THEN ''
            ELSE 'https://www.bungie.net' || v.icon END AS icon,
       CASE WHEN COALESCE(v.iconWatermark, '') = '' THEN ''
            ELSE 'https://www.bungie.net' || v.iconWatermark END AS watermark,
       pk.name AS perk, COALESCE(cn.text, pk.description, '') AS perk_text
FROM armor_preference p
LEFT JOIN version v ON v.name = lower(p.name) AND v.n = 1
LEFT JOIN perk pk ON pk.itemHash = v.hash AND pk.n = 1
LEFT JOIN clarity_note cn ON cn.plug_hash = pk.hash
LEFT JOIN (${CLASS_N}) c ON c.armor_class = v.armor_class
WHERE p.is_exotic
ORDER BY c.class_n NULLS LAST, v.armor_class NULLS LAST, p.name COLLATE NOCASE
`

// The wishlist sources every run downloads, in the order they were added: the
// defaults first.
export const WISHLISTS = 'SELECT key, label, url FROM wishlist_preference ORDER BY rowid'

// One row of a query, by column name, as the templates read it.
export type Row = Record<string, any>

// Everything loadReport gives the templates.
export type ReportData = ReturnType<typeof loadReport>

// The REAL columns a template prints as Python prints a float, 1.0 for a
// whole one: the pair lines' rel and share, rounded to 4 places.
const FLOAT_COLUMNS = ['pve_rel', 'pve_share', 'pvp_rel', 'pvp_share']

// The rows of sql, each whole REAL in columns kept a float. A JS number can't
// tell 1.0 from 1, and MiniJinja takes a whole number for an integer, which
// prints as 1; so the REAL arrives a hair above itself (1 + 2^-52 for 1, the
// least double above 0 for 0), which rounding to 4 places takes back, and
// prints as 1.0. An INTEGER stays as it is (a pair's rel is the integer 0
// where every share is 0). A value's text tells its storage class: SQLite
// writes a REAL with a point (1.0), an INTEGER without.
function rowsWithFloats(db: Database, sql: string, columns: string[]): Row[] {
  const stmt = db.prepare(sql)
  try {
    const names = stmt.getColumnNames()
    const rows: Row[] = []
    while (stmt.step()) {
      const row: Row = stmt.get({})
      for (const column of columns) {
        const value = row[column]
        if (Number.isInteger(value) && stmt.getString(names.indexOf(column))!.includes('.')) {
          row[column] = value === 0 ? Number.MIN_VALUE : value + value * Number.EPSILON
        }
      }
      rows.push(row)
    }
    return rows
  } finally {
    stmt.finalize()
  }
}

// {set name: [bonus]}, each bonus SET_BONUSES' columns plus aegis, The
// Aegis's AegisBonus for the set and piece count, or null. Set names are
// matched as aegis-rankings matches them, since the sheet spells some
// differently ('Iron Battalion' for 'Iron Battalion Set').
export function loadSetBonuses(db: Database): Map<string, Row[]> {
  const aegis = aegisRankings.load(db)
  const bonuses = new Map<string, Row[]>()
  for (const r of db.selectObjects(SET_BONUSES)) {
    const setName = r.set_name as string
    const match = aegisRankings.getAegisBonuses(aegis, setName).find((b) => b.pieces === r.pieces) ?? null
    if (!bonuses.has(setName)) bonuses.set(setName, [])
    bonuses.get(setName)!.push({ ...r, aegis: match })
  }
  return bonuses
}

// Everything the report shows, by the names the templates use. A query that
// returns no row gives null, as Python's fetchone() gave None.
export function loadReport(db: Database) {
  const rows = (sql: string): Row[] => db.selectObjects(sql)
  const row = (sql: string): Row | null => db.selectObject(sql) ?? null
  const dict = (sql: string): Record<string, SqlValue> => Object.fromEntries(db.selectArrays(sql))
  return {
    totals: row(TOTALS)!,
    sources: rows(SOURCES),
    classes: rows(CLASSES),
    grades: rows('SELECT grade, label, slot_cap FROM armor_grade ORDER BY position'),
    armor_purge: rows(ARMOR_PURGE),
    purge_counts: rows(PURGE_COUNTS),
    weapon_flags: rows(WEAPON_FLAGS),
    roll_copies: rows(ROLL_COPIES),
    popularity: rows(POPULARITY),
    popular_columns: rows(POPULAR_COLUMNS),
    popular_pairs: rows(POPULAR_PAIRS),
    popular_options: rows(POPULAR_OPTIONS),
    popularity_sides: rows('SELECT * FROM v_popularity_side ORDER BY side'),
    popularity_rule: row('SELECT * FROM popularity_rule'),
    grid: rows(GRID),
    grid_pairs: rowsWithFloats(db, GRID_PAIRS, FLOAT_COLUMNS),
    perks: rows('SELECT * FROM v_perk ORDER BY plug_hash'),
    set_pieces: rows(SET_PIECES),
    legacy: rows(LEGACY),
    short_builds: rows(SHORT_BUILDS),
    rescues: rows(RESCUES),
    exotic_dupes: rows(EXOTIC_DUPES),
    set_bonuses: loadSetBonuses(db),
    set_preferences: rows(SET_PREFERENCES),
    set_badges: rows(SET_BADGES),
    exotic_preferences: rows(EXOTIC_PREFERENCES),
    wishlists: rows(WISHLISTS),
    stat_icons: dict('SELECT key, icon FROM v_stat_icon'),
    stat_names: dict('SELECT k.key, d.name FROM stat_key k JOIN DestinyStatDefinition d ON d.hash = k.statHash'),
    text_icons: dict('SELECT token, icon FROM v_text_icon'),
  }
}
