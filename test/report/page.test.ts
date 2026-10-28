// Tests for the report's page shell (templates/page.html.j2): a tab and a
// section for each page, and the body the site shows them in.
import { expect, test } from 'vitest'
import { loadReport } from '../../src/report/load.ts'
import { renderBody } from '../../src/report/render.ts'
import * as c from '../helpers.ts'
import { renderReport } from './helpers.ts'

const PAGES = ['summary', 'weapons', 'popular', 'armor', 'builds', 'exotics', 'preferences']

test('every page has its tab and its section', () => {
  const db = c.testDb()
  c.addWeaponDef(db, 100)
  c.addCopy(db, 'w1', 100, c.WEAPON_SOCKETS)
  const [html] = renderReport(db)
  for (const page of PAGES) {
    expect(html).toContain(`id="page-${page}"`)
    expect(html).toContain(`href="#${page}"`)
  }
  db.close()
})

test("the site's body is the page's, without its head and inline script", () => {
  // The site links styles.css and loads report.js as files: its
  // Content-Security-Policy runs no inline script.
  const db = c.testDb()
  c.addWeaponDef(db, 100)
  c.addCopy(db, 'w1', 100, c.WEAPON_SOCKETS)
  const [html] = renderReport(db)
  const body = renderBody(loadReport(db), 'Name#1234')
  expect(body.startsWith('\n<div class="wrap">\n<header class="top">')).toBe(true)
  expect(body.endsWith('<div id="tip" class="tip" role="tooltip" hidden></div>\n')).toBe(true)
  expect(html).toContain(`<body>${body}<script>`)
  expect(body).not.toContain('<script')
  expect(body).not.toContain('<head>')
  expect(body).not.toContain('<link')
  db.close()
})
