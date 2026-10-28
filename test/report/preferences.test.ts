// Tests for the report's Preferences page (templates/preferences.html.j2):
// everything the app stores from the player, in collapsible sections, each
// preference's controls drawn as stored (src/preferences-tab.ts makes them
// work in the browser), the player's wishlists with a Remove, and the forms
// that add one, back up the settings and reset the armor preferences.
import { expect, test } from 'vitest'
import { loadReport } from '../../src/report/load.ts'
import { renderHtml } from '../../src/report/render.ts'
import * as c from '../helpers.ts'
import { count, renderReport, reportPage } from './helpers.ts'

// The table row of the preference called name.
function row(page: string, name: string): string {
  return page.split(`<tr data-name="${name}">`)[1].split('</tr>')[0]
}

// The preferences' rows, by name, in the page's order.
function names(page: string): string[] {
  return [...page.matchAll(/<tr data-name="([^"]*)">/g)].map((m) => m[1])
}

// Each dropdown in html: its label, the value it shows (its selected option's,
// else the first's, None), whether it's off, and its options that are, in
// the stats' order.
function dropdowns(html: string) {
  return [...html.matchAll(/<select [^>]*aria-label="([^"]*)"([^>]*)>(.*?)<\/select>/g)].map(
    ([, label, rest, options]) => ({
      label,
      value: /<option value="([^"]*)"[^>]* selected/.exec(options)?.[1] ?? '',
      off: rest.includes(' disabled'),
      taken: [...options.matchAll(/<option value="([^"]*)" disabled/g)].map((m) => m[1]),
    }),
  )
}

test('each set shows with its badge and the wishlists are listed', () => {
  // A set's badge is its helmet; its tooltip lists the set's bonuses.
  const db = c.testDb()
  c.addPreference(db, 'Test Set', 'F', 1, ['health'])
  c.addArmor(db, 'a1', { health: 30 }, { setName: 'Test Set', score: 90 })
  const setHash = db.selectValue("SELECT hash FROM DestinyEquipableItemSetDefinition WHERE name = 'Test Set'")
  db.exec("UPDATE DestinyInventoryItemDefinition SET icon = '/helm.png' WHERE equipableItemSetHash = ?", {
    bind: [setHash!],
  })
  db.exec("INSERT INTO DestinySandboxPerkDefinition VALUES (1, 'Two Up', 'Helps.', '')")
  db.exec("INSERT INTO wishlist_preference VALUES ('mine', 'Mine', 'https://example.com/w/mine.txt')")
  c.addSetPerks(db, setHash as number, [[2, 1]])
  const [html] = renderReport(db)
  const page = reportPage(html, 'preferences')
  expect(page).toContain('Test Set</span></th>')
  expect(page).toContain('<details class="fold">')
  expect(page).toContain(`data-tip="set-${setHash}"><img src="https://www.bungie.net/helm.png"`)
  expect(page).toContain(`<div id="tip-set-${setHash}"><b>2-piece: Two Up</b><p>Helps.</p></div>`)
  expect(page).toContain('href="https://example.com/w/mine.txt" title="https://example.com/w/mine.txt">mine.txt</a>')
  db.close()
})

test("each set's row holds its grade, stat picks and moves, by grade and rank", () => {
  // Only the test's sets: two in F, out of rank order, and one unclassified,
  // which comes last.
  const db = c.testDb()
  db.exec('DELETE FROM armor_preference')
  c.addPreference(db, 'Late Set', 'F', 2, ['melee', 'grenade', 'health'])
  c.addPreference(db, 'Loose Set', '', 0)
  c.addPreference(db, 'Test Set', 'F', 1, ['health'])
  const page = reportPage(renderReport(db)[0], 'preferences')
  expect(names(page)).toEqual(['Test Set', 'Late Set', 'Loose Set'])
  // Nothing is off: any stat can be picked in any place, even after a None
  // (the store swaps a stat another pick has, and moves a pick after a None
  // up: withPick).
  expect(dropdowns(row(page, 'Test Set'))).toEqual([
    { label: 'Test Set: grade', value: 'F', off: false, taken: [] },
    { label: 'Test Set: 1st stat', value: 'health', off: false, taken: [] },
    { label: 'Test Set: 2nd stat', value: '', off: false, taken: [] },
    { label: 'Test Set: 3rd stat', value: '', off: false, taken: [] },
  ])
  expect(dropdowns(row(page, 'Late Set')).slice(1)).toEqual([
    { label: 'Late Set: 1st stat', value: 'melee', off: false, taken: [] },
    { label: 'Late Set: 2nd stat', value: 'grenade', off: false, taken: [] },
    { label: 'Late Set: 3rd stat', value: 'health', off: false, taken: [] },
  ])
  // Each stat's option has its icon, and the dropdown's button shows the
  // choice as its option does (customizable select).
  expect(row(page, 'Test Set')).toContain(
    '<select class="pick" data-pick="0" aria-label="Test Set: 1st stat"><button><selectedcontent>' +
      '</selectedcontent></button><option value="">None</option>',
  )
  expect(row(page, 'Test Set')).toContain(
    '<option value="health" selected><img src="https://www.bungie.net/img/health.png" alt="" width="20" ' +
      'height="20">health</option>',
  )
  // The grades S to F, by letter; an unclassified set shows Unclassified,
  // which can't be chosen, and no stat picks.
  expect(row(page, 'Test Set')).toContain(
    '<option value="S">S</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>' +
      '<option value="D">D</option><option value="E">E</option><option value="F" selected>F</option></select>',
  )
  expect(row(page, 'Loose Set')).toContain('<option value="" selected disabled>Unclassified</option>')
  expect(dropdowns(row(page, 'Loose Set')).map((d) => [d.value, d.off])).toEqual([
    ['', false],
    ['', false],
    ['', false],
    ['', false],
  ])
  // A move past its grade's end is off: Test Set is first in F, Late Set
  // last, Loose Set alone.
  const moves = (name: string) => [...row(page, name).matchAll(/aria-label="(Move [^"]*)" aria-disabled="(\w+)"/g)]
  expect(['Test Set', 'Late Set', 'Loose Set'].flatMap((n) => moves(n).map((m) => [m[1], m[2]]))).toEqual([
    ['Move Test Set up in its grade', 'true'],
    ['Move Test Set down in its grade', 'false'],
    ['Move Late Set up in its grade', 'false'],
    ['Move Late Set down in its grade', 'true'],
    ['Move Loose Set up in its grade', 'true'],
    ['Move Loose Set down in its grade', 'true'],
  ])
  db.close()
})

test("each exotic's row holds its stat picks, by class", () => {
  // An exotic the manifest lacks has no class and comes last; an exotic has
  // no grade and no moves.
  const db = c.testDb()
  db.exec('DELETE FROM armor_preference')
  c.addArmorDef(db, 900, { name: 'Test Exotic Helm', setName: '', tier: 6, armorClass: 'Hunter' })
  db.exec(
    'INSERT INTO armor_preference (name, is_exotic, stat_1, stat_2) ' +
      "VALUES ('Unknown Exotic', 1, NULL, NULL), ('Test Exotic Helm', 1, 'weapons', 'melee')",
  )
  const page = reportPage(renderReport(db)[0], 'preferences')
  expect(names(page)).toEqual(['Test Exotic Helm', 'Unknown Exotic'])
  expect(page.indexOf('<h3>Hunter <span class="num">1</span></h3>')).toBeLessThan(
    page.indexOf('<h3>Not in the manifest <span class="num">1</span></h3>'),
  )
  expect(dropdowns(row(page, 'Test Exotic Helm'))).toEqual([
    { label: 'Test Exotic Helm: 1st stat', value: 'weapons', off: false, taken: [] },
    { label: 'Test Exotic Helm: 2nd stat', value: 'melee', off: false, taken: [] },
    { label: 'Test Exotic Helm: 3rd stat', value: '', off: false, taken: [] },
  ])
  expect(dropdowns(row(page, 'Unknown Exotic')).map((d) => [d.value, d.off])).toEqual([
    ['', false],
    ['', false],
    ['', false],
  ])
  expect(row(page, 'Test Exotic Helm')).not.toContain('class="move"')
  db.close()
})

test("the player's own wishlists have a Remove, the defaults none", () => {
  // The site marks the player's (own); the CLI's report has none.
  const db = c.testDb()
  db.exec("INSERT INTO wishlist_preference VALUES ('mine', 'Mine', 'https://example.com/w/mine.txt')")
  expect(reportPage(renderReport(db)[0], 'preferences')).not.toContain('class="act remove"')
  const data = loadReport(db)
  for (const w of data.wishlists) w.own = w.key === 'mine'
  const page = reportPage(renderHtml(data, 'Name#1234'), 'preferences')
  expect(count(page, '<tr class="own">')).toBe(1)
  expect(count(page, 'class="act remove"')).toBe(1)
  expect(page).toContain(
    '<tr class="own"><th scope="row">Mine</th><td class="num">mine</td><td><a href="https://example.com/w/mine.txt" ' +
      'title="https://example.com/w/mine.txt">mine.txt</a></td><td><button type="button" class="act remove" ' +
      'data-key="mine" aria-label="Remove Mine">Remove</button></td></tr>',
  )
  db.close()
})

test('the tab adds a wishlist, backs up, resets and offers the rebuild, every control labelled', () => {
  const db = c.testDb()
  const page = reportPage(renderReport(db)[0], 'preferences')
  // The armor note: the stat order's math, with an example, and each grade's
  // cap, from the grades.
  expect(page).toContain('<p class="formula">score = 3 × 1st stat + 2 × 2nd stat + 1 × 3rd stat</p>')
  expect(page).toContain('= <b>140</b> with Health picked 1st, but 3 × 20 + 2 × 30 + 1 × 10 = <b>130</b> with Weapons 1st.')
  expect(page).toContain(
    '<tr><th scope="col">Grade</th><th scope="col">Keeps</th></tr>\n<tr><td>S</td><td class="num">4</td></tr>\n' +
      '<tr><td>A, B</td><td class="num">2</td></tr>\n<tr><td>C, D, E, F, Unclassified</td><td class="num">1</td></tr>',
  )
  expect(page).toContain('<label>Name <input name="label" required autocomplete="off"></label>')
  expect(page).toContain(
    '<label>URL of its .txt file <input name="url" type="url" required autocomplete="off"></label>',
  )
  expect(page).toContain("so the file's host has to allow cross-site requests")
  expect(page).toContain('<button type="button" class="act export">Export to a file</button>')
  expect(page).toContain(
    '<label>Import from a file <input type="file" class="import" accept=".json,application/json"></label>',
  )
  // Beside them, the report itself as Markdown (src/preferences-tab.ts hides
  // both parts for a report kept without its copy).
  expect(page).toContain(
    '<p class="markdown">You can also download the report itself as a Markdown file.</p>\n' +
      '<button type="button" class="act markdown">Export the report as Markdown</button>',
  )
  expect(page).toContain('<button type="button" class="act purge reset">Reset armor preferences to defaults</button>')
  // The bar's status, empty until a change, and its rebuild, hidden until
  // the report shows other settings than those saved.
  expect(page).toContain(
    '<p class="pref-status" role="status"></p><p class="pref-stale" hidden>The report still shows your previous ' +
      'preferences. <button type="button" class="act rebuild">Rebuild the report</button></p>',
  )
  // Every dropdown and button has a label, its own or its text; every field
  // sits in its label.
  const selects = page.match(/<select [^>]*>/g)!
  expect(selects.length).toBeGreaterThan(100)
  expect(selects.filter((s) => !s.includes(' aria-label="'))).toEqual([])
  const buttons = [...page.matchAll(/<button [^>]*>([^<]*)</g)]
  expect(buttons.filter(([tag, text]) => !tag.includes(' aria-label="') && !text.trim())).toEqual([])
  expect(count(page, '<input ')).toBe(3)
  expect(page.match(/<label>[^<]*<input /g)).toHaveLength(3)
  db.close()
})
