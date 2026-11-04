import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const state = { result: { data: [], error: null }, calls: [] }
function builder(kind, args) {
  const entry = { kind, args, chain: [] }
  state.calls.push(entry)
  const proxy = new Proxy(() => {}, {
    get(_, prop) {
      if (prop === 'then') return (resolve) => resolve(state.result)
      return (...a) => {
        entry.chain.push([prop, a])
        return proxy
      }
    },
  })
  return proxy
}
vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: (...a) => builder('from', a), rpc: (...a) => builder('rpc', a) },
}))
vi.mock('../auth/AuthProvider', () => ({ useAuth: vi.fn() }))
vi.mock('./useOrgData', () => ({ useSpaces: vi.fn() }))
import { useAuth } from '../auth/AuthProvider'
import { useSpaces } from './useOrgData'
import { useCategories, useCategoryAccess, useCategoryUsage, useFileTotals, useFolders, useSpaceRole } from './useSpaceData'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  state.calls.length = 0
  state.result = { data: [], error: null }
  vi.clearAllMocks()
})

describe('useSpaceRole', () => {
  const spaces = [{ id: 's1', space_members: [{ user_id: 'u1', role: 'editor' }] }]
  it('returns the member role', () => {
    useAuth.mockReturnValue({ profile: { id: 'u1', is_super_admin: false } })
    useSpaces.mockReturnValue({ data: spaces, isPending: false })
    const { result } = renderHook(() => useSpaceRole('s1'))
    expect(result.current).toMatchObject({ role: 'editor', isPending: false })
  })
  it('returns super_admin for the super admin', () => {
    useAuth.mockReturnValue({ profile: { id: 'boss', is_super_admin: true } })
    useSpaces.mockReturnValue({ data: spaces, isPending: false })
    expect(renderHook(() => useSpaceRole('s1')).result.current.role).toBe('super_admin')
  })
  it('returns null for an unknown space or non-member', () => {
    useAuth.mockReturnValue({ profile: { id: 'u2', is_super_admin: false } })
    useSpaces.mockReturnValue({ data: spaces, isPending: false })
    expect(renderHook(() => useSpaceRole('s1')).result.current.role).toBeNull()
    expect(renderHook(() => useSpaceRole('nope')).result.current.role).toBeNull()
  })
  it('reports pending while spaces load', () => {
    useAuth.mockReturnValue({ profile: { id: 'u1', is_super_admin: false } })
    useSpaces.mockReturnValue({ data: undefined, isPending: true })
    expect(renderHook(() => useSpaceRole('s1')).result.current).toMatchObject({ role: null, isPending: true })
  })
})

describe('useSpaceRole error', () => {
  it('passes through the spaces query error', () => {
    const error = new Error('x')
    useAuth.mockReturnValue({ profile: { id: 'u1', is_super_admin: false } })
    useSpaces.mockReturnValue({ data: undefined, isPending: false, error })
    expect(renderHook(() => useSpaceRole('s1')).result.current).toMatchObject({ role: null, error })
  })
})

describe('useFolders', () => {
  it('queries the space and sorts files by name', async () => {
    state.result = {
      data: [{ id: 'f1', name: 'A', files: [{ id: 'x', name: 'Zed' }, { id: 'y', name: 'Alpha' }] }],
      error: null,
    }
    const { result } = renderHook(() => useFolders('s1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data[0].files.map((f) => f.name)).toEqual(['Alpha', 'Zed'])
    expect(state.calls[0].args).toEqual(['folders'])
    expect(state.calls[0].chain).toContainEqual(['eq', ['space_id', 's1']])
    expect(state.calls[0].chain).toContainEqual(['order', ['name']])
  })
  it('surfaces errors', async () => {
    state.result = { data: null, error: new Error('nope') }
    const { result } = renderHook(() => useFolders('s1'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
  it('does not query without a space id', () => {
    renderHook(() => useFolders(undefined), { wrapper })
    expect(state.calls).toHaveLength(0)
  })
})

describe('useFileTotals', () => {
  it('maps rpc rows to numbers with net', async () => {
    state.result = { data: [{ file_id: 'a', income: '100.50', expense: '30', entry_count: '3' }], error: null }
    const { result } = renderHook(() => useFileTotals('s1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ a: { income: 100.5, expense: 30, net: 70.5, entryCount: 3 } })
    expect(state.calls[0]).toMatchObject({ kind: 'rpc', args: ['space_file_totals', { p_space_id: 's1' }] })
  })
  it('allows negative net', async () => {
    state.result = { data: [{ file_id: 'a', income: 0, expense: 5, entry_count: 1 }], error: null }
    const { result } = renderHook(() => useFileTotals('s1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data.a.net).toBe(-5)
  })
  it('rounds net to cents and normalizes negative zero', async () => {
    state.result = {
      data: [
        { file_id: 'a', income: '0.3', expense: String(0.1 + 0.2), entry_count: 2 },
        { file_id: 'b', income: 0, expense: 0, entry_count: 0 },
        { file_id: 'c', income: '10.10', expense: '0.07', entry_count: 2 },
      ],
      error: null,
    }
    const { result } = renderHook(() => useFileTotals('s1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(Object.is(result.current.data.a.net, 0)).toBe(true)
    expect(Object.is(result.current.data.b.net, 0)).toBe(true)
    expect(result.current.data.c.net).toBe(10.03)
  })
  it('surfaces rpc errors', async () => {
    state.result = { data: null, error: { code: '42501', message: 'not a member' } }
    const { result } = renderHook(() => useFileTotals('s1'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useCategories', () => {
  it('selects categories of the space ordered by name', async () => {
    state.result = { data: [{ id: 'c1', name: 'Food' }], error: null }
    const { result } = renderHook(() => useCategories('s1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: 'c1', name: 'Food' }])
    expect(state.calls[0].args).toEqual(['categories'])
    expect(state.calls[0].chain).toContainEqual(['eq', ['space_id', 's1']])
  })
})

describe('useCategoryUsage', () => {
  it('maps category id to a numeric count', async () => {
    state.result = { data: [{ category_id: 'c1', entry_count: '4' }], error: null }
    const { result } = renderHook(() => useCategoryUsage('s1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ c1: 4 })
    expect(state.calls[0]).toMatchObject({ kind: 'rpc', args: ['space_category_usage', { p_space_id: 's1' }] })
  })
})

describe('useCategoryAccess', () => {
  it('returns user ids', async () => {
    state.result = { data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null }
    const { result } = renderHook(() => useCategoryAccess('c1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(['u1', 'u2'])
    expect(state.calls[0].chain).toContainEqual(['eq', ['category_id', 'c1']])
  })
  it('is disabled when enabled is false or no category', () => {
    renderHook(() => useCategoryAccess('c1', false), { wrapper })
    renderHook(() => useCategoryAccess(undefined), { wrapper })
    expect(state.calls).toHaveLength(0)
  })
})
