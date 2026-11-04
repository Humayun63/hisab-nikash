import { describe, expect, it } from 'vitest'
import { formatDate, todayIn } from './dates'

describe('todayIn', () => {
  it('gives the date in the organization timezone', () => {
    // 20:00 UTC on 3 Nov is already 4 Nov in Dhaka (UTC+6) but still 3 Nov in New York.
    const now = new Date('2026-11-03T20:00:00Z')
    expect(todayIn('Asia/Dhaka', now)).toBe('2026-11-04')
    expect(todayIn('America/New_York', now)).toBe('2026-11-03')
  })

  it('falls back to the local date for an invalid timezone', () => {
    const now = new Date(2026, 10, 4, 12, 0, 0)
    expect(todayIn('Not/A_Zone', now)).toBe('2026-11-04')
  })
})

describe('formatDate', () => {
  it('returns an empty string without a date', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
  })

  it('formats the date with year, month and day', () => {
    const text = formatDate('2026-11-04')
    expect(text).toContain('2026')
    expect(text).toMatch(/\b4\b/)
    expect(text).toMatch(/Nov/)
  })

  it('does not shift the day across timezones', () => {
    // Read as UTC, so the first of the month stays the first.
    expect(formatDate('2026-01-01')).toMatch(/\b1\b/)
    expect(formatDate('2026-01-01')).not.toMatch(/\b31\b/)
  })
})
