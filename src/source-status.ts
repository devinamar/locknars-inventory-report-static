// How each outside source fared (the source_status table): every source
// records its status, and the report's data sources table reads the rows
// back. In the data build a source is 'fresh' or the build fails; the
// browser's sources (the profile, DIM, custom wishlists) can also be
// 'failed' or 'skipped'. See schema/app/source_status.sql.
import { type Database } from '@sqlite.org/sqlite-wasm'

// Record source's status, stamped with the current time (UTC, to the second).
export function saveSourceStatus(db: Database, source: string, status: string, detail = ''): void {
  db.exec(
    'INSERT INTO source_status VALUES (?, ?, ?, ?) ON CONFLICT(source) DO UPDATE SET ' +
      'status = excluded.status, checked_at = excluded.checked_at, detail = excluded.detail',
    { bind: [source, status, new Date().toISOString().slice(0, 19), detail] },
  )
}
