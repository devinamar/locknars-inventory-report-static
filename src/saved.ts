// What the player keeps in this browser besides their login and their last
// report: their settings, which every build of their report starts from and
// its Preferences tab edits. They live in localStorage, never on the site.
// Storage can be blocked (some private windows) or cleared: nothing is kept
// then, and a read gives what a first visit has. Type imports only: the page
// loads this without SQLite.
import type { WishlistSource } from './wishlists.ts'

// One armor_preference row, as the table holds it: a set's or an exotic's up
// to three stat picks, best first, then a set's grade and its rank there.
export type PreferenceRow = {
  name: string
  is_exotic: number // 1 for an exotic, 0 for a set
  stat_1: string | null
  stat_2: string | null
  stat_3: string | null
  grade: string // 'S'..'F'; '' for an exotic or a set not yet classified
  rank: number // 1 = first within the grade
}

// The player's settings: their armor preferences, every one the last build
// ended with ([] before the first), and their own wishlists, each keyed as the
// CLI keyed one from its label.
export type Saved = { preferences: PreferenceRow[]; wishlists: WishlistSource[] }

const SAVED = 'settings'

// The object kept under key; {} when there's none or it can't be read.
function read(key: string): Record<string, unknown> {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

// Keep value under key; false when storage is blocked or full.
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

const list = <T>(value: unknown): T[] => (Array.isArray(value) ? value : [])

export function loadSaved(): Saved {
  const saved = read(SAVED)
  return { preferences: list(saved.preferences), wishlists: list(saved.wishlists) }
}

export function keepSaved(saved: Saved): boolean {
  return write(SAVED, saved)
}
