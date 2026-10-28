// Which weapon copies to flag, and why: every true duplicate (an exact copy of
// one that stays), found here, and every copy below Legendary
// (inventory.ts's loadBelowLegendary). The flags go to weapon_pruning through
// results.ts. Ported from d2-inventory-report's analyze/weapon_pruning.py.
import { type Database } from '@sqlite.org/sqlite-wasm'

// Why a copy is flagged: the label on its tile, in report order.
export const PRUNE_REASONS: Record<string, string> = {
  below_legendary: 'Below Legendary',
  exact_duplicate: 'True duplicate',
}

// A copy's roll as one string, each perk socket in socket order with its perks
// by name (names, since a reissue has new perk hashes), then the copies that
// share family, element, archetype and roll, ranked best first.
const EXACT_DUPLICATES = `
WITH socket AS (
    SELECT instance_id, socket_idx, kind, group_concat(perk, ', ' ORDER BY perk) AS perks
    FROM v_weapon_roll
    GROUP BY instance_id, socket_idx
),
roll AS (
    SELECT instance_id, group_concat(kind || ': ' || perks, '; ' ORDER BY socket_idx) AS perks
    FROM socket
    GROUP BY instance_id
),
ranked AS (
    SELECT v.instance_id,
           FIRST_VALUE(v.instance_id) OVER copies AS keeper_id,
           ROW_NUMBER() OVER copies AS n
    FROM v_weapon v
    JOIN weapon_result w ON w.instance_id = v.instance_id
    JOIN roll ON roll.instance_id = v.instance_id
    WINDOW copies AS (
        PARTITION BY v.family_name, v.element, v.archetype, roll.perks
        ORDER BY COALESCE(v.gear_tier, 0) DESC, w.match_count DESC, v.instance_id
    )
)
SELECT instance_id, keeper_id FROM ranked WHERE n > 1 ORDER BY instance_id
`

// [[instanceId, keeperId]] for every scored copy that duplicates a kept
// one. Reads the scores, so it runs after saveWeaponResults.
export function findExactDuplicates(db: Database): [string, string][] {
  return db.selectArrays(EXACT_DUPLICATES) as [string, string][]
}
