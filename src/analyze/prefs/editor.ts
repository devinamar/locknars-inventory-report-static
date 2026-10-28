// The armor preference editor's run-time check, without the editor. The CLI
// asked a new set for its stat picks, grade and place, a set without a grade
// for its grade and place, and a new exotic for its stat picks, then opened
// its menu. The browser can't prompt, so each is filled in as if the player
// took what the editor offered:
//   stat picks: the stats suggestStats guesses from the text shown with the
//     prompt (a set's 2- and 4-piece bonuses and The Aegis's lines for it; an
//     exotic's intrinsic effect), up to three; none when no keyword matches,
//     as when the player picks None;
//   grade: the editor had no default, but showed The Aegis's grades for the
//     set's bonuses; the set takes its best-ranked bonus's. A set the sheet
//     doesn't list stays unclassified (grade ''), like a set with no
//     preference;
//   place: last in the grade, the position prompt's default;
//   menu: left at once.
// A web editor to change them comes later. Ported from the non-interactive
// parts of d2-inventory-report's analyze/prefs/editor.py.
import {
  type AegisBonus,
  type ArmorInstance,
  type ArmorPreference,
  type ArmorSetBonus,
  emptyPreference,
  type ExoticEffect,
} from '../../models.ts'
import { getAegisBonuses, getAegisRanking } from '../aegis-rankings.ts'
import { GRADE_ORDER } from '../armor-grades.ts'
import {
  buildExoticEffectMap,
  buildSetBonusMap,
  ciGet,
  gradeMembers,
  insertIntoGrade,
  oneLine,
  type Prefs,
  setBonusText,
} from './store.ts'
import { suggestStats } from './suggest.ts'

type Aegis = Map<string, AegisBonus[]>

// The Aegis sheet's trigger, effect and analysis lines for each bonus, in
// ASCII (the CLI's cp1252 Windows console couldn't print arbitrary Unicode,
// so each other character shows as '?'). [] when the set isn't in the sheet.
function aegisBonusLines(setName: string, aegis: Aegis): string[] {
  return getAegisBonuses(aegis, setName).map((b) => {
    const text =
      `  Aegis #${b.rank} [${b.grade}] ${b.pieces}pc ` + `${b.bonus_name}: ${b.trigger} -> ${b.effect} | ${b.analysis}`
    return '  ' + oneLine(text).replace(/[^\x00-\x7f]/gu, '?') // sheet cells embed newlines
  })
}

// Multi-line 2pc/4pc bonus block shown while prompting for a set,
// plus the Aegis sheet's trigger/effect/analysis per bonus (which also
// feeds the suggested-stat heuristic).
export function formatSetBonus(setName: string, aegis: Aegis, bonusMap?: Map<string, ArmorSetBonus>): string {
  const [two, four] = setBonusText(setName, bonusMap)
  const lines: string[] = []
  if (two || four) lines.push(`  2pc: ${two || '(unknown)'}\n  4pc: ${four || '(unknown)'}`)
  lines.push(...aegisBonusLines(setName, aegis))
  if (!lines.length) return '  (set bonus descriptions not available)'
  return lines.join('\n')
}

// Multi-line effect block shown while prompting for an exotic.
export function formatExoticEffect(name: string, effectMap?: Map<string, ExoticEffect>): string {
  const eff = effectMap?.get(name)
  if (!eff || !(eff.name || eff.description)) return '  (exotic effect description not available)'
  const head = eff.name ? `  Effect: ${eff.name}` : '  Effect:'
  if (eff.description) return `${head}\n  ${oneLine(eff.description)}`
  return head
}

// The three stat columns of the picks suggestStats guesses from text, null
// for each one it leaves empty.
function suggestedPicks(text: string): Pick<ArmorPreference, 'stat1' | 'stat2' | 'stat3'> {
  const [stat1 = null, stat2 = null, stat3 = null] = suggestStats(text)
  return { stat1, stat2, stat3 }
}

// Put the set in The Aegis's grade for it, last (the position prompt's
// default); a set the sheet doesn't list keeps its grade.
function classify(setName: string, prefs: Prefs, aegis: Aegis): void {
  const grade = getAegisRanking(aegis, setName)?.grade
  if (!grade) return
  insertIntoGrade(prefs, setName, grade, gradeMembers(prefs, grade, setName).length + 1)
}

// Make sure every set in setsNeeded has stat picks and a grade, and every
// exotic in exoticsNeeded has stat picks; returns [preferences, changed].
// A set with no entry gets the add flow (stats, grade and position), an
// entry without a valid grade gets the classify flow, and an exotic without
// an entry gets stat picks, each filled in as the header says. Saved entries
// change only through those flows, or take a set's new capitalization when
// the game renames it.
export function ensurePreferences(
  setsNeeded: Set<string>,
  exoticsNeeded: Set<string>,
  armorInstances: ArmorInstance[],
  existingPrefs: Prefs,
  aegis: Aegis,
): [Prefs, boolean] {
  const prefs: Prefs = new Map(existingPrefs)
  const bonusMap = buildSetBonusMap(armorInstances)
  const effectMap = buildExoticEffectMap(armorInstances)

  const mandatoryNew: string[] = []
  const mandatoryClassify: string[] = []
  let renamed = false
  for (const setName of [...setsNeeded].sort()) {
    const [canonKey, existing] = ciGet(prefs, setName)
    if (existing === null) {
      mandatoryNew.push(setName)
      continue
    }
    if (canonKey !== setName) {
      prefs.set(setName, existing)
      prefs.delete(canonKey!)
      renamed = true
    }
    if (!GRADE_ORDER.includes(existing.grade)) mandatoryClassify.push(setName)
  }
  const pendingExotics = [...exoticsNeeded].sort().filter((n) => ciGet(prefs, n)[1] === null)

  for (const setName of mandatoryNew) {
    prefs.set(setName, { ...emptyPreference(), ...suggestedPicks(formatSetBonus(setName, aegis, bonusMap)) })
    classify(setName, prefs, aegis)
  }
  for (const setName of mandatoryClassify) classify(setName, prefs, aegis)
  for (const name of pendingExotics) {
    prefs.set(name, { ...emptyPreference(), ...suggestedPicks(formatExoticEffect(name, effectMap)), isExotic: true })
  }

  const didWork = Boolean(mandatoryNew.length || mandatoryClassify.length || pendingExotics.length)
  return [prefs, didWork || renamed]
}
