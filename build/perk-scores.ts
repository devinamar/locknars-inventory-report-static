// d2-perk-popularity: a companion project that scores the weapon rolls players
// actually use, per weapon, for PvE and PvP, from Bungie's post-game carnage
// reports, and publishes them weekly as perk_scores.json on the public
// d2-weapon-perk-scores repo's data branch. The data build saves the file as
// published: one row per weapon in perk_popularity_weapon (its scored columns
// and their perks kept as JSON) and the file's settings and categories in
// perk_popularity_file.
//
// The file is written by Python, so a whole-number float reads 50.0. In JSON,
// SQLite reads 50.0 as a REAL and 50 as an INTEGER, and the views divide these
// values, so SQLite itself copies the JSON columns from the file's text,
// keeping each number as written; JSON.parse and JSON.stringify would turn
// 50.0 into 50.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { get } from '../src/http.ts'
import { saveSourceStatus } from '../src/source-status.ts'

export const SCORES_URL = 'https://raw.githubusercontent.com/devinamar/d2-weapon-perk-scores/data/perk_scores.json'

// The schema_version this build reads. The repo raises it when a key is
// renamed, removed or changes meaning; new keys can appear without it.
const SCHEMA_VERSION = 1

// One side's weapons from the file's text (?1), the side (?2) and each of its
// weapons' values in perk_popularity_weapon's column order, which share their
// names.
const INSERT_WEAPONS =
  'INSERT INTO perk_popularity_weapon ' +
  "SELECT ?2, w.value ->> 'name', w.value ->> 'family', w.value ->> 'type', w.value ->> 'item_hash', " +
  "w.value -> 'item_hashes', w.value ->> 'rank', w.value ->> 'players', w.value ->> 'active_players', " +
  "w.value ->> 'hard', w.value ->> 'hard_weight', w.value ->> 'last_seen', w.value ->> 'stale', " +
  "w.value -> 'groups', w.value -> 'columns' " +
  "FROM json_each(?1, '$.' || ?2) w"

type Scores = { schema_version?: unknown; generated_at: string; pve: unknown[]; pvp: unknown[] }

// Replace the stored scores with perk_scores.json's text, and return its
// generated_at. Throws, saving nothing, unless the file is the schema_version
// this build reads and lists a weapon.
export function saveScores(db: Database, text: string): string {
  const scores: Scores = JSON.parse(text)
  if (scores.schema_version !== SCHEMA_VERSION) {
    const found = JSON.stringify(scores.schema_version) ?? 'none'
    throw new Error(`perk_scores.json: expected schema_version ${SCHEMA_VERSION}, found ${found}`)
  }
  if (scores.pve.length + scores.pvp.length === 0) throw new Error('perk_scores.json lists no weapons')
  db.transaction(() => {
    db.exec('DELETE FROM perk_popularity_weapon')
    db.exec('DELETE FROM perk_popularity_file')
    for (const side of ['pve', 'pvp']) db.exec(INSERT_WEAPONS, { bind: [text, side] })
    db.exec("INSERT INTO perk_popularity_file VALUES (?1 ->> 'generated_at', ?1 -> 'settings', ?1 -> 'categories')", {
      bind: [text],
    })
  })
  return scores.generated_at
}

// Download and save the scores, with the file's generated_at as the detail.
// Throws, saving nothing, when the download fails or saveScores does.
export async function extractPerkScores(db: Database): Promise<void> {
  const generatedAt = saveScores(db, await (await get(SCORES_URL)).text())
  saveSourceStatus(db, 'perk_popularity', 'fresh', generatedAt)
}
