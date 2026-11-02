import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENCIES,
  DEFAULT_TIMEZONE,
  currencyByCode,
  defaultOrgName,
  defaultTimezone,
  timezoneOptions,
} from './options'

afterEach(() => vi.restoreAllMocks())

describe('defaultOrgName', () => {
  it("builds from first name", () => expect(defaultOrgName('Ada')).toBe("Ada's Organization"))
  it('trims', () => expect(defaultOrgName('  Ada ')).toBe("Ada's Organization"))
  it.each([undefined, null, '', '   '])('falls back for %j', (v) => {
    expect(defaultOrgName(v)).toBe('My Organization')
  })
})

describe('currencyByCode', () => {
  it('finds a currency', () => expect(currencyByCode('BDT')).toMatchObject({ symbol: '৳' }))
  it('returns undefined for unknown', () => expect(currencyByCode('XXX')).toBeUndefined())
  it('has unique codes', () => {
    expect(new Set(CURRENCIES.map((c) => c.code)).size).toBe(CURRENCIES.length)
  })
})

describe('timezoneOptions', () => {
  it('contains Asia/Dhaka', () => expect(timezoneOptions()).toContain('Asia/Dhaka'))
  it('adds Asia/Dhaka first when the runtime list lacks it', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Europe/London'])
    expect(timezoneOptions()).toEqual(['Asia/Dhaka', 'Europe/London'])
  })
})

describe('defaultTimezone', () => {
  const mockZone = (timeZone) =>
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({ resolvedOptions: () => ({ timeZone }) }))

  it('uses the browser zone when it is in the list', () => {
    mockZone('Europe/London')
    expect(defaultTimezone(['Europe/London', 'Asia/Dhaka'])).toBe('Europe/London')
  })
  it('falls back to Asia/Dhaka when the browser zone is unknown', () => {
    mockZone('Mars/Olympus')
    expect(defaultTimezone(['Europe/London'])).toBe(DEFAULT_TIMEZONE)
  })
})
