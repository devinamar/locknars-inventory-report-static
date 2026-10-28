// The report's heavy lifting, off the page's thread so the page stays
// responsive and its boot log keeps updating: the shared database, the
// player's profile and settings written into it, the analysis, the report's
// queries and the render. It starts downloading the database as soon as it's
// created, while the page is still asking Bungie for the profile; the page
// then sends the profile and the player's settings ({ profile, bungieName,
// preferences, wishlists }, see src/saved.ts). It tells the page as each step
// starts ({ start: label }) and finishes ({ done: label }), or fails without
// failing the report ({ failed: label, reason }: one of the player's own
// wishlists), then sends the report's HTML with the preferences it ended with
// ({ html, preferences }), or what went wrong ({ error }). One worker builds
// one report.
import type { DimSync } from './dim.ts'
import type { Saved } from './saved.ts'

// The listener comes first, before any module that starts up with a top-level
// await (sqlite-wasm and minijinja-js wait for their wasm): a message that
// arrives before onmessage is set is lost. Those modules are imported below,
// once it's set. DIM's answer (dim) comes with the profile from the page.
const job = new Promise<Saved & { profile: any; bungieName: string; dim: DimSync }>((resolve) => {
  onmessage = ({ data }) => resolve(data)
})

async function step<T>(label: string, work: () => T | Promise<T>): Promise<T> {
  postMessage({ start: label })
  const result = await work()
  postMessage({ done: label })
  return result
}

try {
  const ready = step('Loading the shared database', async () => (await import('./db.ts')).downloadDb('/static.db.gz'))
  const [
    { profile, bungieName, dim, preferences, wishlists },
    db,
    { ingestProfile },
    { saveDimAnnotations },
    { analyzeArmor, analyzeWeapons },
    { loadReport },
    { renderBody },
    { applyPreferences, preferenceRows },
    { addWishlist },
  ] = await Promise.all([
    job,
    ready,
    import('./profile.ts'),
    import('./dim.ts'),
    import('./analyze/analyze.ts'),
    import('./report/load.ts'),
    import('./report/render.ts'),
    import('./preferences.ts'),
    import('./wishlists.ts'),
  ])
  const items = Object.keys(profile.itemComponents?.instances?.data ?? {}).length
  await step(`Saving your ${items.toLocaleString()} items`, () => ingestProfile(db, profile))
  // DIM's tags go on the copies just saved.
  saveDimAnnotations(db, dim)
  applyPreferences(db, preferences)
  // The wishlists every report uses, before the player's own.
  const defaults = new Set(db.selectValues('SELECT key FROM wishlist_preference'))
  for (const { label, url } of wishlists) {
    const line = `Downloading your wishlist ${label}`
    postMessage({ start: line })
    const reason = await addWishlist(db, label, url)
    postMessage(reason ? { failed: line, reason } : { done: line })
  }
  await step('Scoring your weapons against the wishlists', () => analyzeWeapons(db))
  await step('Scoring your armor', () => analyzeArmor(db))
  const data = await step("Gathering the report's data", () => loadReport(db))
  // The player's own wishlists, which the Preferences tab can remove.
  for (const w of data.wishlists) w.own = !defaults.has(w.key)
  const html = await step('Rendering the report', () => renderBody(data, bungieName))
  postMessage({ html, preferences: preferenceRows(db) })
} catch (error) {
  postMessage({ error: String(error) })
}
