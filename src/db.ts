// The site's SQLite: sqlite-wasm in memory, set up the way d2-inventory-report
// set up its database. Foreign keys are enforced: deleting a copy cascades to
// its components. And numbers print as the CLI printed them: since 3.53,
// SQLite turns a REAL into text with 17 significant digits (2.0/3 reads
// 0.66666666666666663); the CLI ran 3.51, with 15, and the SQL and templates
// were written against that.
import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'

const sqlite3 = await sqlite3InitModule()

export function openDb(): Database {
  const db = new sqlite3.oo1.DB(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  sqlite3.capi.sqlite3_db_config(db, sqlite3.capi.SQLITE_DBCONFIG_FP_DIGITS, 15, 0)
  return db
}
