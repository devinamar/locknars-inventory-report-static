// Best-guess stat priorities from set-bonus and exotic-effect text, by
// keyword. The CLI's editor showed them while the player picked stats; the
// site, which can't ask, applies them to a set or exotic that has no
// preference yet (see editor.ts).
// Ported from d2-inventory-report's analyze/prefs/suggest.py.
import { ARMOR_STAT_NAMES } from '../../models.ts'

// Keywords per stat (Armor 3.0 stat names). A stat scores one point per
// keyword occurrence.
const SUGGEST_KEYWORDS: Record<string, string[]> = {
  health: [
    'heal',
    '\\bcure',
    'restorat',
    'recover',
    'shield',
    'overshield',
    'resist',
    'resilien',
    'flinch',
    'surviv',
    'frost armor',
    'woven mail',
    'devour',
    'damage reduction',
  ],
  melee: ['melee'],
  grenade: ['grenade(?!\\s+launcher)'],
  super_stat: ['\\bsuper', 'orb of power', 'orbs of power'],
  class_stat: ['class abilit', '\\brift', 'barricade', '\\bdodge', 'thruster', 'phoenix dive'],
  weapons: [
    'weapon',
    'reload',
    'handling',
    'stabilit',
    '\\brange',
    '\\baim',
    '\\bammo',
    'precision',
    '\\bdraw',
    '\\bstow',
    '\\bswap',
    '\\bbow\\b',
    'shotgun',
    'sword',
    'hand cannon',
    'auto rifle',
    'scout',
    'pulse',
    'sidearm',
    'fusion',
    'rocket',
    'machine gun',
    'submachine',
    'glaive',
    'sniper',
    'kinetic',
    'primary ammo',
    'special ammo',
  ],
}

// ponytail: JS's \b counts only ASCII letters and digits as word characters,
// Python's every letter, so the two part on a keyword right after a non-ASCII
// letter; no set or exotic text in the live vault has one. Lookarounds on
// [\p{L}\p{N}_] would match Python's if one ever does.
const SUGGEST_PATTERNS = Object.fromEntries(
  Object.entries(SUGGEST_KEYWORDS).map(([stat, pats]) => [stat, pats.map((p) => new RegExp(p, 'g'))]),
)

// Up to three stats, best first, scored by keyword hits across texts; []
// when nothing matches. A 2-piece that heals and a 4-piece about melee
// suggest ['health', 'melee'].
export function suggestStats(...texts: (string | null | undefined)[]): string[] {
  const blob = texts.filter(Boolean).join(' ').toLowerCase()
  if (!blob) return []
  const scored: [number, number, string][] = []
  ARMOR_STAT_NAMES.forEach((stat, idx) => {
    const score = SUGGEST_PATTERNS[stat].reduce((n, p) => n + (blob.match(p)?.length ?? 0), 0)
    if (score) scored.push([score, idx, stat])
  })
  scored.sort((a, b) => b[0] - a[0] || a[1] - b[1])
  return scored.slice(0, 3).map(([, , stat]) => stat)
}
