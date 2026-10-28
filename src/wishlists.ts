// DIM wishlists: community lists of recommended (and "trash") weapon rolls in
// DIM's text format. Every run downloads each source in wishlist_preference,
// parses every roll line into a ParsedRoll and saves the rolls to the db; its
// status goes to source_status as 'wishlist:<key>'. The data build saves the
// default lists and the browser a player's own with the same code, so nothing
// here needs Node. A failed download throws: the data build starts from an
// empty database with no stored copy to fall back on, so the build fails and
// the last good deploy stays live. A player's own list that fails is only
// listed as failed (addWishlist), and their report still builds.
//
// File format, one entry per line:
//   dimwishlist:item=<hash>&perks=<p1>,<p2>,...#notes:<text>  a recommended roll
//   dimtrashlist:...                                           a trash roll
//   item=<hash>          with no perks (or perks=,): any roll of the weapon
//   item=-<hash>         DIM shorthand for "trash this whole weapon"
//   item=-69420          wildcard: the roll applies to any weapon
//   //notes:<text>       a note inherited by the rolls that follow it
//   title:<text>         starts a section (not stored) and clears the note
//   description:<text>   section description (not stored)
//   ...|tags:<a,b c>     tags at the end of any note, split on comma or space
import { type Database } from '@sqlite.org/sqlite-wasm'
import { sha256 } from './cache.ts'
import { insertMany } from './db.ts'
import { get } from './http.ts'
import { WILDCARD_ITEM_HASH } from './models.ts'
import { saveSourceStatus } from './source-status.ts'

// Defined in models.ts; still exported here for the code that imports it from
// this module.
export { WILDCARD_ITEM_HASH }

// Matches dimwishlist and dimtrashlist lines. Anchored at the start only, so
// stray text after the notes doesn't drop the whole line.
const ROLL_RE = /^dim(?<kind>wish|trash)list:item=(?<item>-?\d+)(?:&perks=(?<perks>[\d,]*))?(?:#notes:(?<notes>.*))?/

// The line breaks Python's str.splitlines() splits on, a lone \r and U+2028
// among them. Within a line, JS's trim() and \s then differ from Python's
// strip() and \s only on U+001F (Python's whitespace) and U+FEFF (JS's),
// which no list uses.
const LINE_BREAK = /\r\n|[\n\v\f\r\x1c-\x1e\x85\u2028\u2029]/

// One roll line. Perk hashes stay in file order: by DIM convention barrel,
// magazine, trait 1, trait 2, plus up to two extras on some weapon types
// (glaives, swords, grenade launchers). The scorer looks up each perk's
// category in the plug table.
export type ParsedRoll = {
  itemHash: number
  perks: number[]
  notes: string
  tags: Set<string>
  isTrash: boolean
}

// A wishlist source: its key, the name the report shows, and its file's URL.
export type WishlistSource = { key: string; label: string; url: string }

// The key a source's label makes: its letters and digits in lowercase, each
// run of anything else one '_', none at the ends ('My List!' is my_list).
export function sourceKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// Why a source of the player's can't join sources: a URL that isn't http(s),
// a label without a letter or digit, or a key or URL one of sources has; ''
// when it can. The Preferences tab checks a new source with it, before any db.
export function sourceProblem(sources: WishlistSource[], label: string, url: string): string {
  const key = sourceKey(label)
  const clash = sources.find((s) => s.key === key || s.url === url)
  if (!url.startsWith('https://') && !url.startsWith('http://')) return 'the URL must start with https:// or http://'
  if (!key) return 'the label needs a letter or digit'
  if (clash) return `${clash.label} already has that name or URL`
  return ''
}

// Save a wishlist source of the player's to wishlist_preference (the CLI's
// --add-wishlist), its key made from label. Returns why it saved nothing (see
// sourceProblem); '' when it saved the source.
export function addSource(db: Database, label: string, url: string): string {
  const sources = db.selectObjects('SELECT key, label, url FROM wishlist_preference ORDER BY rowid') as WishlistSource[]
  const problem = sourceProblem(sources, label, url)
  if (!problem) {
    db.exec('INSERT INTO wishlist_preference (key, label, url) VALUES (?, ?, ?)', {
      bind: [sourceKey(label), label, url],
    })
  }
  return problem
}

// [notes, tags] for one roll. The roll's own #notes: text wins over the
// inherited block note; a trailing |tags:a,b c part becomes a lowercase tag
// set.
function splitTags(inlineNotes: string | undefined, blockNotes: string): [string, Set<string>] {
  const source = inlineNotes?.trim() || blockNotes
  const at = source.lastIndexOf('|tags:')
  if (at < 0) return [source, new Set()]
  const tags = source.slice(at + 6).split(/[,\s]+/).filter(Boolean)
  return [source.slice(0, at).trim(), new Set(tags.map((t) => t.toLowerCase()))]
}

// [ParsedRoll] in file order. A //notes: line sets the note inherited by the
// rolls after it; any other non-roll line clears it.
export function parseWishlistText(text: string): ParsedRoll[] {
  const rolls: ParsedRoll[] = []
  let blockNotes = ''
  for (let line of text.split(LINE_BREAK)) {
    line = line.trim()
    if (!line) continue
    if (line.startsWith('//notes:')) {
      blockNotes = line.slice(8)
      continue
    }
    const match = ROLL_RE.exec(line)
    if (!match) {
      blockNotes = '' // any other line, a title: included, clears the note
      continue
    }
    const { kind, item, perks = '', notes } = match.groups!
    let itemHash = Number(item)
    let isTrash = kind === 'trash'
    // DIM shorthand: negative item hash means "trash this whole weapon" —
    // except the wildcard sentinel, which stays as-is.
    if (itemHash < 0 && itemHash !== WILDCARD_ITEM_HASH) [itemHash, isTrash] = [-itemHash, true]
    const [rollNotes, tags] = splitTags(notes, blockNotes)
    rolls.push({ itemHash, perks: perks.split(',').filter(Boolean).map(Number), notes: rollNotes, tags, isTrash })
  }
  return rolls
}

// Replace the source's rolls and store bodyHash, the SHA-256 of the file, as
// its content_hash. Rolls for items that aren't manifest weapons are dropped
// (except wildcards); unknown perk hashes become NULL in place so the other
// perks keep their positions. Each note is stored once (wishlist_note's text
// is UNIQUE) and numbered in the order the rolls first use it, as the CLI's
// insert per roll numbered them.
export function save(
  db: Database,
  key: string,
  label: string,
  url: string,
  rolls: ParsedRoll[],
  bodyHash: string,
): void {
  db.exec(
    'INSERT INTO wishlist_source (key, label, url, content_hash) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE ' +
      'SET label = excluded.label, url = excluded.url, content_hash = excluded.content_hash',
    { bind: [key, label, url, bodyHash] },
  )
  db.exec('DELETE FROM wishlist_roll WHERE source_key = ?', { bind: [key] })
  const weapons = new Set(db.selectValues('SELECT hash FROM DestinyInventoryItemDefinition WHERE itemType = 3'))
  const plugs = new Set(
    db.selectValues('SELECT hash FROM DestinyInventoryItemDefinition WHERE plugCategoryIdentifier IS NOT NULL'),
  )
  const kept = rolls.filter((r) => r.itemHash === WILDCARD_ITEM_HASH || weapons.has(r.itemHash))
  const notes = new Set(kept.map((r) => r.notes).filter(Boolean))
  insertMany(db, 'INSERT OR IGNORE INTO wishlist_note (text) VALUES (?)', [...notes].map((n) => [n]))
  const noteIds = new Map(db.selectArrays('SELECT text, note_id FROM wishlist_note') as [string, number][])
  insertMany(
    db,
    'INSERT INTO wishlist_roll (source_key, item_hash, note_id, tags, is_trash, perk1, perk2, perk3, perk4, perk5, ' +
      'perk6) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    kept.map((r) => {
      // Every column bound each row: a reset statement keeps the last
      // row's values in the columns a row leaves unbound.
      const slots = r.perks.map((h) => (plugs.has(h) ? h : null))
      while (slots.length < 6) slots.push(null)
      return [key, r.itemHash, noteIds.get(r.notes) ?? null, [...r.tags].sort().join(','), r.isTrash, ...slots]
    }),
  )
}

// Download one source, replace its rolls and record it fresh.
export async function extractWishlist(db: Database, key: string, label: string, url: string): Promise<void> {
  const text = await (await get(url)).text()
  save(db, key, label, url, parseWishlistText(text), await sha256(text))
  saveSourceStatus(db, `wishlist:${key}`, 'fresh')
}

// Every source in wishlist_preference: the defaults first, then those the
// player added, in that order.
export async function extractWishlists(db: Database): Promise<void> {
  const sources = db.selectArrays('SELECT key, label, url FROM wishlist_preference ORDER BY rowid') as string[][]
  for (const [key, label, url] of sources) await extractWishlist(db, key, label, url)
}

// One of the player's own wishlists, which the browser adds to the shared
// database's defaults and downloads on each build: '' once its rolls are
// saved, else why not. One addSource refuses is left out. One whose download
// fails doesn't fail the report: it's listed among the sources, with no
// rolls, as 'failed', with the error as the status's detail.
export async function addWishlist(db: Database, label: string, url: string): Promise<string> {
  const problem = addSource(db, label, url)
  if (problem) return problem
  const key = sourceKey(label)
  try {
    await extractWishlist(db, key, label, url)
    return ''
  } catch (error) {
    db.exec('INSERT OR IGNORE INTO wishlist_source (key, label, url) VALUES (?, ?, ?)', { bind: [key, label, url] })
    saveSourceStatus(db, `wishlist:${key}`, 'failed', String(error))
    return String(error)
  }
}
