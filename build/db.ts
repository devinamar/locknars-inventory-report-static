// The database the site downloads, as Node builds it for the CI data build
// and the tests. It starts the way d2-inventory-report's open_db started a
// new database: every table and view in schema/, then the default armor
// preferences and wishlist sources from the TOML files beside them.
import { readFileSync, readdirSync } from 'node:fs'
import { type Database } from '@sqlite.org/sqlite-wasm'
import { parse } from 'smol-toml'
import { openDb } from '../src/db.ts'

const SCHEMA = new URL('../schema/', import.meta.url)
const PREFERENCES = new URL('preferences/', SCHEMA)

// Stat hash -> the app's name for it: the six armor stats and a weapon's
// rounds per minute. Edge of Fate renamed the six armor stats but kept their
// hashes; the old names are noted for reference.
export const STAT_KEYS: Record<number, string> = {
  392767087: 'health', // was Resilience
  4244567218: 'melee', // was Strength
  1735777505: 'grenade', // was Discipline
  144602215: 'super_stat', // was Intellect
  1943323491: 'class_stat', // was Recovery
  2996146975: 'weapons', // was Mobility
  4284893193: 'rpm',
}

// The default armor preferences, a <subset>.toml beside armor_preference.sql
// each: [subset, is_exotic].
const DEFAULT_PREFERENCES = [
  ['sets', 0],
  ['warlock', 1],
  ['titan', 1],
  ['hunter', 1],
] as const

type Preference = { stats?: string[]; grade?: string; rank?: number }
type WishlistSource = { label: string; url: string }

// Every .sql file under schema/, in the order they run: sorted by path.
export function schemaFiles(): string[] {
  return readdirSync(SCHEMA, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

export function createDb(): Database {
  const db = openDb()
  for (const f of schemaFiles()) db.exec(readFileSync(new URL(f, SCHEMA), 'utf8'))
  addDefaultPreferences(db)
  addDefaultWishlists(db)
  return db
}

// The tables a player's visit writes in the browser: the profile, DIM's tags,
// the analysis results, the player's preferences and wishlists, and the
// sources' statuses. A view built on any of them has to be computed there.
export const PLAYER_TABLES = [
  'DestinyItemComponent',
  'DestinyItemInstanceComponent',
  'DestinyItemSocketsComponent',
  'DestinyItemReusablePlugsComponent',
  'DestinyItemStatsComponent',
  'DestinyItemPlugObjectivesComponent',
  'item_dim',
  'weapon_result',
  'weapon_pruning',
  'armor_score',
  'armor_rescue',
  'instance_wishlist_match',
  'armor_preference',
  'wishlist_preference',
  'source_status',
]

// Store every view that no player's data reaches as a table of its rows,
// under its own name, so the browser reads it instead of working it out: the
// weapons' perk pools, the popularity views and their helpers. The views over
// a player's data stay views, now reading those tables. This takes the
// report's queries from about 20 s to 8 s, for about 6.5 MB more of gzipped
// download (10.5 MB to 17 MB).
// A view counts as the player's when its SQL names a PLAYER_TABLES table or
// such a view, even in a comment: a wrong guess only leaves it a view.
// Returns the views stored, dependencies first.
export function materializeSharedViews(db: Database): string[] {
  const views = new Map(db.selectArrays("SELECT name, sql FROM sqlite_master WHERE type = 'view'") as [string, string][])
  const names = db.selectValues("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')") as string[]
  const reads = (view: string) => names.filter((n) => n !== view && new RegExp(`\\b${n}\\b`).test(views.get(view)!))
  const players = new Map<string, boolean>()
  const isPlayers = (view: string): boolean => {
    if (!players.has(view)) {
      players.set(view, false)
      players.set(view, reads(view).some((n) => PLAYER_TABLES.includes(n) || (views.has(n) && isPlayers(n))))
    }
    return players.get(view)!
  }
  const stored: string[] = []
  const store = (view: string) => {
    if (stored.includes(view)) return
    for (const n of reads(view)) if (views.has(n)) store(n)
    // Through a temporary table: renaming one would make SQLite recheck every
    // view, and the views reading this one would name a view just dropped.
    db.exec(
      `CREATE TEMP TABLE shared AS SELECT * FROM "${view}"; DROP VIEW "${view}"; ` +
        `CREATE TABLE "${view}" AS SELECT * FROM temp.shared; DROP TABLE temp.shared`,
    )
    stored.push(view)
  }
  for (const view of views.keys()) if (!isPlayers(view)) store(view)
  return stored
}

// Replace stat_key with STAT_KEYS, once the manifest's stats are in.
export function saveVocabulary(db: Database): void {
  db.exec('DELETE FROM stat_key')
  for (const [hash, key] of Object.entries(STAT_KEYS)) {
    db.exec('INSERT INTO stat_key VALUES (?, ?)', { bind: [Number(hash), key] })
  }
}

function toml<T>(name: string): Record<string, T> {
  return parse(readFileSync(new URL(name, PREFERENCES), 'utf8')) as Record<string, T>
}

// Each default armor preference in file order, a name only once (compared
// ignoring case): up to three priority stats, a grade and a rank.
function addDefaultPreferences(db: Database): void {
  const have = new Set<string>()
  for (const [subset, isExotic] of DEFAULT_PREFERENCES) {
    for (const [name, entry] of Object.entries(toml<Preference>(`${subset}.toml`))) {
      if (have.has(name.toLowerCase())) continue
      have.add(name.toLowerCase())
      const [stat1 = null, stat2 = null, stat3 = null] = entry.stats ?? []
      db.exec(
        'INSERT INTO armor_preference (name, is_exotic, stat_1, stat_2, stat_3, grade, rank) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
        { bind: [name, isExotic, stat1, stat2, stat3, entry.grade ?? '', entry.rank ?? 0] },
      )
    }
  }
}

function addDefaultWishlists(db: Database): void {
  for (const [key, source] of Object.entries(toml<WishlistSource>('wishlists.toml'))) {
    db.exec('INSERT INTO wishlist_preference (key, label, url) VALUES (?, ?, ?)', {
      bind: [key, source.label, source.url],
    })
  }
}
