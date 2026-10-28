// A placeholder until the report is ported: it shows the page, sqlite-wasm
// and the deploy working together.
import { openDb } from './db'

const db = openDb()
document.getElementById('status')!.textContent =
  `Coming soon. SQLite ${db.selectValue('SELECT sqlite_version()')} is running in this page.`
