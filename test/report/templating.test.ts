// Tests for the report templates' filters (src/report/render.ts). The CLI's
// tests of writing the report's files (test_report.py) and of its console
// summary (test_summary.py) stay with the CLI: the site writes no files and
// prints no summary.
import { expect, test } from 'vitest'
import { pct, ringRule, ringSets, textWithIcons } from '../../src/report/render.ts'

test('text with icons draws known tokens and escapes the rest', () => {
  const text = '[Arc] final blows <heal> [Light Attack] [PVP: 10%]'
  expect(String(textWithIcons(text, { '[Arc]': 'https://x/arc.png' }))).toBe(
    '<img class="text-icon" src="https://x/arc.png" alt="[Arc]" title="Arc"> final blows ' +
      '&lt;heal&gt; [Light Attack] [PVP: 10%]',
  )
})

test("ring rule shares a ring between its lists' colours", () => {
  // Two lists take half the ring each, three give the first a half; the
  // fifth list comes round to the first colour.
  expect(ringRule('1-3')).toBe('.l1-3 { --tint: var(--wl1); --ring: var(--wl1) var(--wl1) var(--wl3) var(--wl3); }')
  expect(ringRule('2-3-4')).toBe(
    '.l2-3-4 { --tint: var(--wl2); --ring: var(--wl2) var(--wl2) var(--wl3) var(--wl4); }',
  )
  expect(ringRule('5')).toBe('.l5 { --tint: var(--wl1); --ring: var(--wl1) var(--wl1) var(--wl1) var(--wl1); }')
})

test('ring sets are every mix of the lists', () => {
  expect(ringSets(3)).toEqual(['1', '2', '3', '1-2', '1-3', '2-3', '1-2-3'])
})

test('a share shows whole from 10 percent and one decimal below', () => {
  // 0.0125 and 0.0025 are exactly halfway between two tenths (1.25%,
  // 0.25%): Python's format, and so the CLI's pct, takes the even one.
  const shares = [null, 0.0, 0.0004, 0.004, 0.0123, 0.05, 0.0995, 0.225, 0.835, 1.0, 0.0125, 0.0025]
  expect(shares.map(pct)).toEqual([
    '—',
    '0%',
    '<0.1%',
    '0.4%',
    '1.2%',
    '5%',
    '10%',
    '23%',
    '84%',
    '100%',
    '1.2%',
    '0.2%',
  ])
})
