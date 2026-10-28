// Tests for the report's Preferences page (templates/preferences.html.j2):
// everything the app stores from the player, in collapsible sections.
import { expect, test } from 'vitest'
import * as c from '../helpers.ts'
import { renderReport, reportPage } from './helpers.ts'

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
