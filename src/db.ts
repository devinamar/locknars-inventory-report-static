// The site's SQLite: sqlite-wasm in memory, set up the way d2-inventory-report
// set up its database. Foreign keys are enforced: deleting a copy cascades to
// its components. And numbers print as the CLI printed them: since 3.53,
// SQLite turns a REAL into text with 17 significant digits (2.0/3 reads
// 0.66666666666666663); the CLI ran 3.51, with 15, and the SQL and templates
// were written against that.
import sqlite3InitModule, { type BindableValue, type Database } from '@sqlite.org/sqlite-wasm'

const sqlite3 = await sqlite3InitModule()

export function openDb(): Database {
  const db = new sqlite3.oo1.DB(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  sqlite3.capi.sqlite3_db_config(db, sqlite3.capi.SQLITE_DBCONFIG_FP_DIGITS, 15, 0)
  return db
}

// The database as the bytes of a SQLite file: what the data build ships.
export function exportDb(db: Database): Uint8Array {
  return sqlite3.capi.sqlite3_js_db_export(db)
}

// The shared database the data build made, downloaded from url (its gzipped
// file) and opened. The file is unzipped here, unless the server sent it with
// Content-Encoding: gzip and the browser already did (Vite's preview server
// does); a gzip file starts with the bytes 1f 8b.
export async function downloadDb(url: string): Promise<Database> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  let bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const unzipped = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    bytes = new Uint8Array(await new Response(unzipped).arrayBuffer())
  }
  return loadDb(bytes)
}

// A database opened from the bytes exportDb gave, set up like openDb's.
export function loadDb(bytes: Uint8Array): Database {
  const db = openDb()
  const flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
  const p = sqlite3.wasm.allocFromTypedArray(bytes)
  db.checkRc(sqlite3.capi.sqlite3_deserialize(db, 'main', p, bytes.byteLength, bytes.byteLength, flags))
  return db
}

// Run sql once for each row of values, in one transaction through one
// prepared statement: the way to insert thousands of rows quickly.
export function insertMany(db: Database, sql: string, rows: Iterable<BindableValue[]>): void {
  db.transaction(() => {
    const stmt = db.prepare(sql)
    try {
      for (const row of rows) stmt.bind(row).stepReset()
    } finally {
      stmt.finalize()
    }
  })
}
