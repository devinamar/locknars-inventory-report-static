// A placeholder until the report is ported: it loads the database the data
// build made and says what's in it.
import { loadDb } from './db.ts'

// The database's bytes from its gzipped file: unzipped here, unless the
// server sent it with Content-Encoding: gzip and the browser already did
// (Vite's preview server does). A gzip file starts with the bytes 1f 8b.
async function fetchDb(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes
  const unzipped = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(unzipped).arrayBuffer())
}

const status = document.getElementById('status')!
try {
  const db = loadDb(await fetchDb('/static.db.gz'))
  const count = (table: string) => Number(db.selectValue(`SELECT count(*) FROM ${table}`)).toLocaleString()
  status.textContent =
    `Coming soon. The data is in: ${count('DestinyInventoryItemDefinition')} item definitions, ` +
    `${count('wishlist_roll')} wishlist rolls and ${count('perk_popularity_weapon')} weapons with perk scores.`
} catch (error) {
  status.textContent = `Coming soon. The data didn't load: ${error}`
}
