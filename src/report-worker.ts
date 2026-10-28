// The report's heavy lifting, off the page's thread so the page stays
// responsive and its boot log keeps updating: the shared database, the
// player's profile written into it, the analysis, the report's queries and
// the render. It starts downloading the database as soon as it's created,
// while the page is still asking Bungie for the profile; the page then sends
// the profile ({ profile, bungieName }). It tells the page as each step starts
// ({ start: label }) and finishes ({ done: label }), then sends the report's
// HTML ({ html }) or what went wrong ({ error }). One worker builds one report.

// The listener comes first, before any module that starts up with a top-level
// await (sqlite-wasm and minijinja-js wait for their wasm): a message that
// arrives before onmessage is set is lost. Those modules are imported below,
// once it's set.
const job = new Promise<{ profile: any; bungieName: string }>((resolve) => {
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
  const [{ profile, bungieName }, db, { ingestProfile }, { analyzeArmor, analyzeWeapons }, { loadReport }, { renderBody }] =
    await Promise.all([
      job,
      ready,
      import('./profile.ts'),
      import('./analyze/analyze.ts'),
      import('./report/load.ts'),
      import('./report/render.ts'),
    ])
  const items = Object.keys(profile.itemComponents?.instances?.data ?? {}).length
  await step(`Saving your ${items.toLocaleString()} items`, () => ingestProfile(db, profile))
  await step('Scoring your weapons against the wishlists', () => analyzeWeapons(db))
  await step('Scoring your armor', () => analyzeArmor(db))
  const data = await step("Gathering the report's data", () => loadReport(db))
  const html = await step('Rendering the report', () => renderBody(data, bungieName))
  postMessage({ html })
} catch (error) {
  postMessage({ error: String(error) })
}

// A module, for its top-level await, though it imports nothing up front.
export {}
