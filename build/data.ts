// The data build: everything in the site's database that isn't a player's —
// Bungie's item definitions, Clarity's perk notes, The Aegis's armor
// rankings, the default wishlists and the perk popularity scores — written
// gzipped to <out>/static.db.gz, with <out>/version.json saying what went
// in. CI runs it after the site's build: node build/data.ts dist
// A source that fails fails the build, and the last good deploy stays live.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { type Database } from '@sqlite.org/sqlite-wasm'
import { sha256 } from '../src/cache.ts'
import { exportDb } from '../src/db.ts'
import { extractWishlists } from '../src/wishlists.ts'
import { extractAegis } from './aegis.ts'
import { extractClarity } from './clarity.ts'
import { createDb, materializeSharedViews, saveVocabulary } from './db.ts'
import { extractManifest } from './manifest.ts'
import { extractPerkScores } from './perk-scores.ts'

// Cloudflare serves no file over 25 MiB.
const MAX_BYTES = 25 * 1024 * 1024

// What went into the database, as a SHA-256: each source's version, as its
// status's detail records it (the manifest's version, Clarity's, the perk
// scores' generated_at, the Aegis sheet's SHA-256), and each wishlist's
// content_hash; not when they were checked, nor when the build ran. A
// player's kept report is keyed on it (src/cache.ts), so a scheduled build
// that finds every source as it was keeps the reports built from the last.
export function dataVersion(db: Database): Promise<string> {
  const sources = db.selectArrays('SELECT source, detail FROM source_status ORDER BY source')
  const wishlists = db.selectArrays('SELECT key, content_hash FROM wishlist_source ORDER BY key')
  return sha256(JSON.stringify({ sources, wishlists }))
}

export async function buildData(outDir: string, apiKey = ''): Promise<void> {
  const db = createDb()
  // The definitions go first: the other sources name items, and the
  // wishlists drop rolls for items the manifest lacks.
  await extractManifest(db, apiKey)
  saveVocabulary(db)
  await extractClarity(db)
  await extractAegis(db)
  await extractWishlists(db)
  await extractPerkScores(db)
  const stored = materializeSharedViews(db)
  console.log(`Stored ${stored.length} views as tables: ${stored.join(', ')}`)
  db.exec('VACUUM')
  const gz = gzipSync(exportDb(db), { level: 9 })
  if (gz.byteLength > MAX_BYTES) {
    throw new Error(`static.db.gz is ${gz.byteLength} bytes, over Cloudflare's 25 MiB a file`)
  }
  const sources = Object.fromEntries(db.selectArrays('SELECT source, detail FROM source_status ORDER BY source'))
  const version = { built_at: new Date().toISOString(), data_version: await dataVersion(db), sources }
  db.close()
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'static.db.gz'), gz)
  writeFileSync(join(outDir, 'version.json'), `${JSON.stringify(version, null, 2)}\n`)
  console.log(`static.db.gz: ${(gz.byteLength / 1e6).toFixed(1)} MB`)
}

if (import.meta.main) await buildData(process.argv[2] ?? 'dist', process.env.BUNGIE_API_KEY)
