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
  // A pick is None, or a stat no earlier pick has; the 3rd is off while the
  // 2nd is None.
  expect(dropdowns(row(page, 'Test Set'))).toEqual([
    { label: 'Test Set: grade', value: 'F', off: false, taken: [] },
    { label: 'Test Set: 1st stat', value: 'health', off: false, taken: [] },
    { label: 'Test Set: 2nd stat', value: '', off: false, taken: ['health'] },
    { label: 'Test Set: 3rd stat', value: '', off: true, taken: ['health'] },
  ])
  expect(dropdowns(row(page, 'Late Set')).slice(1)).toEqual([
    { label: 'Late Set: 1st stat', value: 'melee', off: false, taken: [] },
    { label: 'Late Set: 2nd stat', value: 'grenade', off: false, taken: ['melee'] },
    { label: 'Late Set: 3rd stat', value: 'health', off: false, taken: ['melee', 'grenade'] },
  ])
  // The grades S to F, as the CLI's editor offered them; an unclassified
  // set shows Unclassified, which can't be chosen, and no stat picks.
  expect(row(page, 'Test Set')).toContain(
    '<option value="S">S · Best-in-class</option><option value="A">A · Excellent</option>' +
      '<option value="B">B · Good</option><option value="C">C · Situational</option>' +
      '<option value="D">D · Weak</option><option value="E">E · Marginal</option>' +
      '<option value="F" selected>F · No PvE value</option></select>',
  )
  expect(row(page, 'Loose Set')).toContain('<option value="" selected disabled>Unclassified</option>')
  expect(dropdowns(row(page, 'Loose Set')).map((d) => [d.value, d.off])).toEqual([
    ['', false],
    ['', false],
    ['', true],
    ['', true],
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
    { label: 'Test Exotic Helm: 2nd stat', value: 'melee', off: false, taken: ['weapons'] },
    { label: 'Test Exotic Helm: 3rd stat', value: '', off: false, taken: ['melee', 'weapons'] },
  ])
  expect(dropdowns(row(page, 'Unknown Exotic')).map((d) => [d.value, d.off])).toEqual([
    ['', false],
    ['', true],
    ['', true],
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
  // The stat dropdowns' order is the stats' priority.
  expect(page).toContain("A set's stats in priority order, left to right: each piece scores 3 × its 1st stat")
  expect(page).toContain('<label>Name <input name="label" required autocomplete="off"></label>')
  expect(page).toContain(
    '<label>URL of its .txt file <input name="url" type="url" required autocomplete="off"></label>',
  )
  expect(page).toContain("so the file's host has to allow cross-site requests")
  expect(page).toContain('<button type="button" class="act export">Export to a file</button>')
  expect(page).toContain(
    '<label>Import from a file <input type="file" class="import" accept=".json,application/json"></label>',
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
