// The report as the site renders it, for the tests of its templates: ports of
// d2-inventory-report's tests/conftest.py write_report and report_page, and
// of the Python string methods the tests read the page with.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { loadReport } from '../../src/report/load.ts'
import { renderHtml, renderMarkdown } from '../../src/report/render.ts'

// [html, markdown]: the report for db, for the player Name#1234 (the CLI's
// write_report, which wrote them to files and read them back).
export function renderReport(db: Database): [string, string] {
  const data = loadReport(db)
  return [renderHtml(data, 'Name#1234'), renderMarkdown(data, 'Name#1234')]
}

// One page's part of the report's HTML: from its section to the next page's.
export function reportPage(html: string, name: string): string {
  return html.split(`id="page-${name}"`)[1].split('<section class="page"')[0]
}

// How many times text holds part (Python's str.count).
export function count(text: string, part: string): number {
  return text.split(part).length - 1
}

// Where text first holds part, failing when it doesn't (Python's str.index).
export function index(text: string, part: string): number {
  const at = text.indexOf(part)
  if (at < 0) throw new Error(`not found: ${part}`)
  return at
}
