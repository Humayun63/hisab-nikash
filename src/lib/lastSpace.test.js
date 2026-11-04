import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readLastSpace, rememberLastSpace } from './lastSpace'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('lastSpace', () => {
  it('remembers and reads back the last space', () => {
    rememberLastSpace('space-1')
    rememberLastSpace('space-2')
    expect(readLastSpace()).toBe('space-2')
  })

  it('does not throw when storage refuses to write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => rememberLastSpace('space-1')).not.toThrow()
  })

  it('returns null when storage refuses to read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readLastSpace()).toBeNull()
  })
})
