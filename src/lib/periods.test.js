import { describe, expect, it } from 'vitest'
import { addDays, dayCount, percentChange, periodRange, trendBucket } from './periods'

// 2026-11-04 is a Wednesday; 2026-10-31 is a Saturday; 2026-11-02 is a Monday.
const TODAY = '2026-11-04'

describe('periodRange', () => {
  it('today is a single day', () => {
    expect(periodRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY })
  })

  it('week starting Saturday (6) runs from the last Saturday', () => {
    expect(periodRange('week', TODAY, 6)).toEqual({ from: '2026-10-31', to: TODAY })
  })

  it('week starting Monday (1) runs from the last Monday', () => {
    expect(periodRange('week', TODAY, 1)).toEqual({ from: '2026-11-02', to: TODAY })
  })

  it('week starting Saturday when today is the week start is a single day', () => {
    expect(periodRange('week', '2026-10-31', 6)).toEqual({ from: '2026-10-31', to: '2026-10-31' })
  })

  it('custom swaps a reversed range', () => {
    expect(periodRange('custom', TODAY, 6, { from: '2026-01-20', to: '2026-01-10' })).toEqual({ from: '2026-01-10', to: '2026-01-20' })
  })
})

describe('trendBucket', () => {
  it('uses days for today, week and month', () => {
    expect(trendBucket('today', TODAY, TODAY)).toBe('day')
    expect(trendBucket('week', '2026-10-31', TODAY)).toBe('day')
    expect(trendBucket('month', '2026-11-01', TODAY)).toBe('day')
  })

  it('uses days for a custom range up to 62 days', () => {
    expect(trendBucket('custom', '2026-01-01', addDays('2026-01-01', 61))).toBe('day')
  })

  it('uses weeks for a custom range of 63 to 182 days', () => {
    expect(trendBucket('custom', '2026-01-01', addDays('2026-01-01', 62))).toBe('week')
    expect(trendBucket('custom', '2026-01-01', addDays('2026-01-01', 181))).toBe('week')
  })

  it('uses months for a custom range longer than 182 days', () => {
    expect(trendBucket('custom', '2026-01-01', addDays('2026-01-01', 182))).toBe('month')
  })
})

describe('percentChange', () => {
  it('computes the change against the previous value', () => {
    expect(percentChange(120, 100)).toBe(20)
    expect(percentChange(80, 100)).toBe(-20)
  })

  it('is null when the previous value is zero', () => {
    expect(percentChange(50, 0)).toBeNull()
  })
})

describe('addDays', () => {
  it('crosses a month end', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('crosses a year end', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })
})

describe('dayCount', () => {
  it('counts both ends', () => {
    expect(dayCount('2026-01-01', '2026-01-01')).toBe(1)
    expect(dayCount('2026-01-01', '2026-01-31')).toBe(31)
  })
})
