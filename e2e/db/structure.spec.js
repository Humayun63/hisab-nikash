// Database tests for milestone 4: folders, files, categories and the two structure RPCs.
// Uses only the "E Data" space of Org E (the "E Office" space belongs to the UI tests).
import { test, expect } from '@playwright/test'
import { anonClient, signIn as rawSignIn, runSql } from '../support/db.js'
import { USERS, ORG_E } from '../fixtures/ids.js'

// Sign-ins are cached per user (this file only reads/writes through each client, never changes the session),
// because many separate sign-ins in a row hit Supabase's auth rate limit.
const clients = new Map()
const signIn = async (email) => {
  if (!clients.has(email)) clients.set(email, rawSignIn(email))
  return clients.get(email)
}

const D = ORG_E.data
const SPACE = D.id
const FOLDER = D.folder.id
const FILE_A = D.files.a.id
const FILE_B = D.files.b.id
const CAT = D.categories
const TAG = `T${Date.now().toString(36)}`

const totals = async (db, space = SPACE) => {
  const { data, error } = await db.rpc('space_file_totals', { p_space_id: space })
  return { rows: data, error, byFile: Object.fromEntries((data ?? []).map((r) => [r.file_id, r])) }
}
const usage = async (db, space = SPACE) => {
  const { data, error } = await db.rpc('space_category_usage', { p_space_id: space })
  return { rows: data, error, byCat: Object.fromEntries((data ?? []).map((r) => [r.category_id, Number(r.entry_count)])) }
}
const n = (v) => Number(v)

// Safety net: remove anything these tests created in E Data, even if a test failed midway.
test.afterAll(() => {
  runSql({
    sql: `delete from public.categories where space_id = '${SPACE}' and name like '${TAG}%';
          delete from public.files where space_id = '${SPACE}' and name like '${TAG}%';
          delete from public.folders where space_id = '${SPACE}' and name like '${TAG}%';`,
  })
})

test.describe('space_file_totals', () => {
  test('anon cannot call it', async () => {
    const { error } = await anonClient().rpc('space_file_totals', { p_space_id: SPACE })
    expect(error).not.toBeNull()
  })

  test('super admin sees all categories, including restricted and archived', async () => {
    const db = await signIn(ORG_E.superAdmin.email)
    const { byFile, error } = await totals(db)
    expect(error).toBeNull()
    const a = byFile[FILE_A]
    expect(n(a.income)).toBe(1000)
    expect(n(a.expense)).toBe(700) // 400 + 250 restricted + 50 archived
    expect(n(a.entry_count)).toBe(4)
    expect(byFile[FILE_B]).toBeUndefined() // no entries -> no row
  })

  for (const role of ['admin', 'editor', 'viewer']) {
    test(`${role} totals exclude the restricted category`, async () => {
      const db = await signIn(ORG_E[role].email)
      const { byFile, error } = await totals(db)
      expect(error).toBeNull()
      const a = byFile[FILE_A]
      expect(n(a.income)).toBe(1000)
      expect(n(a.expense)).toBe(450) // 400 + 50 archived (archived categories are still counted)
      expect(n(a.entry_count)).toBe(3)
      expect(byFile[FILE_B]).toBeUndefined()
    })
  }

  test('granted viewer totals include the restricted category', async () => {
    const db = await signIn(ORG_E.granted.email)
    const { byFile, error } = await totals(db)
    expect(error).toBeNull()
    expect(n(byFile[FILE_A].expense)).toBe(700)
    expect(n(byFile[FILE_A].entry_count)).toBe(4)
  })

  test('only returns rows for the requested space', async () => {
    const db = await signIn(ORG_E.superAdmin.email)
    const { byFile } = await totals(db)
    expect(Object.keys(byFile)).toEqual([FILE_A])
  })

  test('org member who is not in the space gets 42501', async () => {
    const db = await signIn(ORG_E.outsider.email)
    const { error, rows } = await totals(db)
    expect(error?.code).toBe('42501')
    expect(rows).toBeNull()
  })

  test('user from another org gets 42501', async () => {
    const db = await signIn(USERS.viewer.email)
    const { error } = await totals(db)
    expect(error?.code).toBe('42501')
  })

  test('unknown space gets 42501', async () => {
    const db = await signIn(ORG_E.admin.email)
    const { error } = await totals(db, '00000000-0000-4000-8000-00000000dead')
    expect(error?.code).toBe('42501')
  })
})

test.describe('space_category_usage', () => {
  test('anon cannot call it', async () => {
    const { error } = await anonClient().rpc('space_category_usage', { p_space_id: SPACE })
    expect(error).not.toBeNull()
  })

  test('super admin sees every category', async () => {
    const { byCat, error } = await usage(await signIn(ORG_E.superAdmin.email))
    expect(error).toBeNull()
    expect(byCat).toEqual({ [CAT.income.id]: 1, [CAT.expense.id]: 1, [CAT.restricted.id]: 1, [CAT.archived.id]: 1 })
  })

  for (const role of ['admin', 'editor', 'viewer']) {
    test(`${role} does not see the restricted category`, async () => {
      const { byCat, error } = await usage(await signIn(ORG_E[role].email))
      expect(error).toBeNull()
      expect(byCat).toEqual({ [CAT.income.id]: 1, [CAT.expense.id]: 1, [CAT.archived.id]: 1 })
    })
  }

  test('granted viewer sees the restricted category', async () => {
    const { byCat } = await usage(await signIn(ORG_E.granted.email))
    expect(byCat[CAT.restricted.id]).toBe(1)
    expect(Object.keys(byCat)).toHaveLength(4)
  })

  test('outsider and other-org users get no rows', async () => {
    for (const email of [ORG_E.outsider.email, USERS.viewer.email]) {
      const { rows, error } = await usage(await signIn(email))
      expect(error).toBeNull()
      expect(rows).toEqual([])
    }
  })
})

test.describe('folders and files: writes', () => {
  test('editor and viewer cannot create, rename or delete folders', async () => {
    for (const role of ['editor', 'viewer']) {
      const db = await signIn(ORG_E[role].email)
      const ins = await db.from('folders').insert({ space_id: SPACE, name: `${TAG} ${role}` })
      expect(ins.error?.code).toBe('42501')

      const upd = await db.from('folders').update({ name: `${TAG} renamed` }).eq('id', FOLDER).select()
      expect(upd.data ?? []).toEqual([])
      const del = await db.from('folders').delete().eq('id', FOLDER).select()
      expect(del.data ?? []).toEqual([])
      const after = await db.from('folders').select('name').eq('id', FOLDER)
      expect(after.data).toEqual([{ name: D.folder.name }])
    }
  })

  test('editor and viewer cannot create, rename or delete files', async () => {
    for (const role of ['editor', 'viewer']) {
      const db = await signIn(ORG_E[role].email)
      const ins = await db.from('files').insert({ space_id: SPACE, folder_id: FOLDER, name: `${TAG} ${role}` })
      expect(ins.error?.code).toBe('42501')
      const upd = await db.from('files').update({ name: `${TAG} renamed` }).eq('id', FILE_B).select()
      expect(upd.data ?? []).toEqual([])
      const del = await db.from('files').delete().eq('id', FILE_B).select()
      expect(del.data ?? []).toEqual([])
      const after = await db.from('files').select('name').eq('id', FILE_B)
      expect(after.data).toEqual([{ name: D.files.b.name }])
    }
  })

  test('admin can create, rename and delete a folder and a file', async () => {
    const db = await signIn(ORG_E.admin.email)
    const folder = await db.from('folders').insert({ space_id: SPACE, name: `${TAG} folder` }).select().single()
    expect(folder.error).toBeNull()
    expect(folder.data.created_by).toBe(ORG_E.admin.id)

    const file = await db.from('files').insert({ space_id: SPACE, folder_id: folder.data.id, name: `${TAG} file` }).select().single()
    expect(file.error).toBeNull()

    const renF = await db.from('folders').update({ name: `${TAG} folder 2` }).eq('id', folder.data.id).select().single()
    expect(renF.data.name).toBe(`${TAG} folder 2`)
    const renFile = await db.from('files').update({ name: `${TAG} file 2` }).eq('id', file.data.id).select().single()
    expect(renFile.data.name).toBe(`${TAG} file 2`)

    const delFile = await db.from('files').delete().eq('id', file.data.id).select()
    expect(delFile.data).toHaveLength(1)
    const delFolder = await db.from('folders').delete().eq('id', folder.data.id).select()
    expect(delFolder.data).toHaveLength(1)
  })

  test('deleting a folder removes its files', async () => {
    const db = await signIn(ORG_E.admin.email)
    const folder = await db.from('folders').insert({ space_id: SPACE, name: `${TAG} cascade` }).select().single()
    const file = await db.from('files').insert({ space_id: SPACE, folder_id: folder.data.id, name: `${TAG} child` }).select().single()
    expect(file.error).toBeNull()
    await db.from('folders').delete().eq('id', folder.data.id)
    const left = await db.from('files').select('id').eq('id', file.data.id)
    expect(left.data).toEqual([])
  })

  test('duplicate folder and file names fail (case-insensitive)', async () => {
    const db = await signIn(ORG_E.admin.email)
    const f = await db.from('folders').insert({ space_id: SPACE, name: D.folder.name.toUpperCase() })
    expect(f.error?.code).toBe('23505')
    const file = await db.from('files').insert({ space_id: SPACE, folder_id: FOLDER, name: D.files.a.name.toLowerCase() })
    expect(file.error?.code).toBe('23505')
    // Renaming onto an existing name also fails
    const ren = await db.from('files').update({ name: D.files.a.name }).eq('id', FILE_B)
    expect(ren.error?.code).toBe('23505')
  })

  test('blank and over-long names are rejected', async () => {
    const db = await signIn(ORG_E.admin.email)
    expect((await db.from('folders').insert({ space_id: SPACE, name: '   ' })).error?.code).toBe('23514')
    expect((await db.from('folders').insert({ space_id: SPACE, name: 'x'.repeat(101) })).error?.code).toBe('23514')
  })

  test('admin from another org cannot write folders in E Data', async () => {
    const db = await signIn(USERS.admin.email)
    const ins = await db.from('folders').insert({ space_id: SPACE, name: `${TAG} cross` })
    expect(ins.error?.code).toBe('42501')
    const upd = await db.from('folders').update({ name: `${TAG} cross` }).eq('id', FOLDER).select()
    expect(upd.data ?? []).toEqual([])
    const read = await db.from('folders').select('id').eq('space_id', SPACE)
    expect(read.data).toEqual([])
  })

  test('outsider sees no folders or files in E Data', async () => {
    const db = await signIn(ORG_E.outsider.email)
    expect((await db.from('folders').select('id').eq('space_id', SPACE)).data).toEqual([])
    expect((await db.from('files').select('id').eq('space_id', SPACE)).data).toEqual([])
  })
})

test.describe('categories: writes', () => {
  test('editor and viewer cannot create, edit or delete categories', async () => {
    for (const role of ['editor', 'viewer']) {
      const db = await signIn(ORG_E[role].email)
      const ins = await db.from('categories').insert({ space_id: SPACE, name: `${TAG} ${role}`, type: 'expense' })
      expect(ins.error?.code).toBe('42501')
      const upd = await db.from('categories').update({ name: `${TAG} renamed` }).eq('id', CAT.income.id).select()
      expect(upd.data ?? []).toEqual([])
      const arch = await db.from('categories').update({ archived_at: new Date().toISOString() }).eq('id', CAT.income.id).select()
      expect(arch.data ?? []).toEqual([])
      const del = await db.from('categories').delete().eq('id', CAT.income.id).select()
      expect(del.data ?? []).toEqual([])
      const after = await db.from('categories').select('name, archived_at').eq('id', CAT.income.id)
      expect(after.data).toEqual([{ name: CAT.income.name, archived_at: null }])
    }
  })

  test('admin can create, edit, archive, restore and delete a category', async () => {
    const db = await signIn(ORG_E.admin.email)
    const created = await db.from('categories')
      .insert({ space_id: SPACE, name: `${TAG} cat`, type: 'income', color: '#112233' }).select().single()
    expect(created.error).toBeNull()
    expect(created.data.is_restricted).toBe(false)
    const id = created.data.id

    const edit = await db.from('categories').update({ name: `${TAG} cat 2`, color: '#445566' }).eq('id', id).select().single()
    expect(edit.data).toMatchObject({ name: `${TAG} cat 2`, color: '#445566' })

    // type may change while there are no entries
    const typ = await db.from('categories').update({ type: 'expense' }).eq('id', id).select().single()
    expect(typ.error).toBeNull()
    expect(typ.data.type).toBe('expense')

    const arch = await db.from('categories').update({ archived_at: new Date().toISOString() }).eq('id', id).select().single()
    expect(arch.data.archived_at).not.toBeNull()
    const rest = await db.from('categories').update({ archived_at: null }).eq('id', id).select().single()
    expect(rest.data.archived_at).toBeNull()

    const del = await db.from('categories').delete().eq('id', id).select()
    expect(del.data).toHaveLength(1)
  })

  test('invalid color is rejected', async () => {
    const db = await signIn(ORG_E.admin.email)
    const { error } = await db.from('categories').insert({ space_id: SPACE, name: `${TAG} badcolor`, type: 'income', color: 'red' })
    expect(error?.code).toBe('23514')
  })

  test('type change is blocked once a category has entries', async () => {
    const db = await signIn(ORG_E.admin.email)
    const { data, error } = await db.from('categories').update({ type: 'income' }).eq('id', CAT.expense.id).select()
    expect(error?.code).toBe('23514')
    expect(data).toBeNull()
    const read = await db.from('categories').select('type').eq('id', CAT.expense.id).single()
    expect(read.data.type).toBe('expense')
  })

  test('deleting a category with entries fails and keeps the entries', async () => {
    const db = await signIn(ORG_E.admin.email)
    const del = await db.from('categories').delete().eq('id', CAT.expense.id).select()
    expect(del.error?.code).toBe('23503')
    const read = await db.from('categories').select('id').eq('id', CAT.expense.id)
    expect(read.data).toHaveLength(1)
    const { byCat } = await usage(db)
    expect(byCat[CAT.expense.id]).toBe(1)
  })

  test('duplicate category names fail (case-insensitive)', async () => {
    const db = await signIn(ORG_E.admin.email)
    const dup = await db.from('categories').insert({ space_id: SPACE, name: CAT.income.name.toLowerCase(), type: 'income' })
    expect(dup.error?.code).toBe('23505')
    const ren = await db.from('categories').update({ name: CAT.income.name }).eq('id', CAT.expense.id)
    expect(ren.error?.code).toBe('23505')
  })

  test('admin cannot create a restricted category or restrict an existing one', async () => {
    const db = await signIn(ORG_E.admin.email)
    const ins = await db.from('categories').insert({ space_id: SPACE, name: `${TAG} restricted`, type: 'expense', is_restricted: true })
    expect(ins.error?.code).toBe('42501')

    const upd = await db.from('categories').update({ is_restricted: true }).eq('id', CAT.expense.id).select()
    expect(upd.error?.code).toBe('42501')
    const read = await db.from('categories').select('is_restricted').eq('id', CAT.expense.id).single()
    expect(read.data.is_restricted).toBe(false)
  })

  test('admin cannot see, edit or delete a restricted category they have no grant for', async () => {
    const db = await signIn(ORG_E.admin.email)
    expect((await db.from('categories').select('id').eq('id', CAT.restricted.id)).data).toEqual([])
    const upd = await db.from('categories').update({ name: `${TAG} hijack` }).eq('id', CAT.restricted.id).select()
    expect(upd.data ?? []).toEqual([])
    const del = await db.from('categories').delete().eq('id', CAT.restricted.id).select()
    expect(del.data ?? []).toEqual([])
    const sa = await signIn(ORG_E.superAdmin.email)
    const read = await sa.from('categories').select('name, is_restricted').eq('id', CAT.restricted.id).single()
    expect(read.data).toEqual({ name: CAT.restricted.name, is_restricted: true })
  })

  test('super admin can create a restricted category, grant access and clean up', async () => {
    const sa = await signIn(ORG_E.superAdmin.email)
    const created = await sa.from('categories')
      .insert({ space_id: SPACE, name: `${TAG} secret`, type: 'expense', is_restricted: true }).select().single()
    expect(created.error).toBeNull()
    const id = created.data.id

    // admin and viewer cannot see it
    for (const role of ['admin', 'viewer']) {
      const db = await signIn(ORG_E[role].email)
      expect((await db.from('categories').select('id').eq('id', id)).data).toEqual([])
    }

    const grant = await sa.from('category_access').insert({ category_id: id, user_id: ORG_E.viewer.id }).select()
    expect(grant.error).toBeNull()
    const viewer = await signIn(ORG_E.viewer.email)
    expect((await viewer.from('categories').select('id').eq('id', id)).data).toHaveLength(1)

    // Granting to a user outside the space is rejected
    const bad = await sa.from('category_access').insert({ category_id: id, user_id: ORG_E.outsider.id })
    expect(bad.error?.code).toBe('23514')

    const revoke = await sa.from('category_access').delete().eq('category_id', id).eq('user_id', ORG_E.viewer.id).select()
    expect(revoke.data).toHaveLength(1)
    expect((await viewer.from('categories').select('id').eq('id', id)).data).toEqual([])

    const del = await sa.from('categories').delete().eq('id', id).select()
    expect(del.data).toHaveLength(1)
  })

  test('super admin can toggle visibility of a category they created', async () => {
    const sa = await signIn(ORG_E.superAdmin.email)
    const created = await sa.from('categories').insert({ space_id: SPACE, name: `${TAG} toggle`, type: 'income' }).select().single()
    const id = created.data.id
    const on = await sa.from('categories').update({ is_restricted: true }).eq('id', id).select().single()
    expect(on.data.is_restricted).toBe(true)
    const off = await sa.from('categories').update({ is_restricted: false }).eq('id', id).select().single()
    expect(off.data.is_restricted).toBe(false)
    await sa.from('categories').delete().eq('id', id)
  })

  test('a category cannot be moved to another space', async () => {
    const db = await signIn(ORG_E.admin.email)
    const created = await db.from('categories').insert({ space_id: SPACE, name: `${TAG} mover`, type: 'income' }).select().single()
    const move = await db.from('categories').update({ space_id: ORG_E.office.id }).eq('id', created.data.id).select()
    expect(move.error).not.toBeNull()
    await db.from('categories').delete().eq('id', created.data.id)
  })
})

test.describe('category_access: writes', () => {
  test('admin, editor and viewer cannot grant or revoke access', async () => {
    for (const role of ['admin', 'editor', 'viewer']) {
      const db = await signIn(ORG_E[role].email)
      const grant = await db.from('category_access').insert({ category_id: CAT.restricted.id, user_id: ORG_E[role].id })
      expect(grant.error?.code).toBe('42501')
      const revoke = await db.from('category_access').delete().eq('category_id', CAT.restricted.id).select()
      expect(revoke.data ?? []).toEqual([])
    }
    // The grant for the granted user is intact
    const sa = await signIn(ORG_E.superAdmin.email)
    const { data } = await sa.from('category_access').select('user_id').eq('category_id', CAT.restricted.id)
    expect(data).toEqual([{ user_id: ORG_E.granted.id }])
  })

  test('users see only their own grants; super admin sees all', async () => {
    const granted = await signIn(ORG_E.granted.email)
    const own = await granted.from('category_access').select('category_id, user_id').eq('category_id', CAT.restricted.id)
    expect(own.data).toEqual([{ category_id: CAT.restricted.id, user_id: ORG_E.granted.id }])

    const viewer = await signIn(ORG_E.viewer.email)
    expect((await viewer.from('category_access').select('*')).data).toEqual([])
    const admin = await signIn(ORG_E.admin.email)
    expect((await admin.from('category_access').select('*')).data).toEqual([])

    const sa = await signIn(ORG_E.superAdmin.email)
    const all = await sa.from('category_access').select('category_id').in('category_id', [CAT.restricted.id])
    expect(all.data).toHaveLength(1)
  })
})
