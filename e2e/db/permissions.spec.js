// Permission tests for the database layer (RLS, triggers, RPCs) — SPEC.md §4 and §7.
// Each block signs in as a seeded user through the real Supabase API, exactly like the browser app.
import { test, expect } from '@playwright/test'
import { anonClient, signIn, runSql, today, addDays } from '../support/db.js'
import { USERS, ORG_A, SPACES, FOLDERS, FILES, CATEGORIES } from '../fixtures/ids.js'

const TODAY = today()
const YESTERDAY = addDays(TODAY, -1)

const names = (rows) => rows.map((r) => r.name).sort()

function entry(overrides = {}) {
  return {
    space_id: SPACES.office,
    file_id: FILES.office,
    category_id: CATEGORIES.rent,
    amount: 10,
    entry_date: TODAY,
    note: 'e2e',
    ...overrides,
  }
}

async function summary(client, spaceId = SPACES.office, from = TODAY, to = TODAY) {
  const { data, error } = await client.rpc('dashboard_summary', { p_space_id: spaceId, p_from: from, p_to: to })
  return { row: data?.[0], error }
}

test.describe('anonymous visitor', () => {
  test('cannot read any table', async () => {
    const anon = anonClient()
    for (const table of ['organizations', 'profiles', 'spaces', 'categories', 'entries']) {
      const { data, error } = await anon.from(table).select('*')
      expect(error, `${table} should be denied`).not.toBeNull()
      expect(data).toBeNull()
    }
  })

  test('cannot call RPCs', async () => {
    const anon = anonClient()
    const { error } = await anon.rpc('dashboard_summary', { p_space_id: SPACES.office, p_from: TODAY, p_to: TODAY })
    expect(error).not.toBeNull()
    const setup = await anon.rpc('setup_organization', {
      p_org_name: 'x', p_timezone: 'Asia/Dhaka', p_space_name: 'x', p_currency_code: 'BDT', p_currency_symbol: '৳',
    })
    expect(setup.error).not.toBeNull()
  })
})

test.describe('viewer', () => {
  let db
  test.beforeAll(async () => { db = await signIn(USERS.viewer.email) })

  test('sees only spaces they are a member of', async () => {
    const { data } = await db.from('spaces').select('name')
    expect(names(data)).toEqual(['Office'])
  })

  test('does not see restricted or foreign categories', async () => {
    const { data } = await db.from('categories').select('name')
    expect(names(data)).toEqual(['Old', 'Rent', 'Salary'])
  })

  test('does not see entries in restricted categories', async () => {
    const { data } = await db.from('entries').select('note')
    expect(data.map((e) => e.note).sort()).toEqual(['old today', 'rent today', 'rent yesterday', 'salary today'])
  })

  test('dashboard totals exclude restricted categories', async () => {
    const { row, error } = await summary(db)
    expect(error).toBeNull()
    expect(Number(row.income)).toBe(5000)
    expect(Number(row.expense)).toBe(1025)
    expect(Number(row.net)).toBe(3975)
    expect(Number(row.entry_count)).toBe(3)
    expect(Number(row.prev_expense)).toBe(50)

    const byCat = await db.rpc('dashboard_by_category', { p_space_id: SPACES.office, p_from: YESTERDAY, p_to: TODAY })
    expect(byCat.error).toBeNull()
    expect(byCat.data.map((c) => c.name).sort()).toEqual(['Old', 'Rent', 'Salary'])
  })

  test('cannot use the dashboard of a space they are not in', async () => {
    const { error } = await summary(db, SPACES.secret)
    expect(error?.message).toMatch(/do not have access/)
  })

  test('cannot add, edit or delete entries', async () => {
    const insert = await db.from('entries').insert(entry())
    expect(insert.error).not.toBeNull()

    const update = await db.from('entries').update({ amount: 1 }).eq('space_id', SPACES.office).select()
    expect(update.data).toEqual([])

    const del = await db.from('entries').delete().eq('space_id', SPACES.office).select()
    expect(del.data).toEqual([])
  })

  test('cannot create folders', async () => {
    const { error } = await db.from('folders').insert({ space_id: SPACES.office, name: 'Nope' })
    expect(error).not.toBeNull()
  })

  test('sees profiles of their own organization only', async () => {
    const { data } = await db.from('profiles').select('email')
    const emails = data.map((p) => p.email)
    expect(emails).toContain(USERS.superAdmin.email)
    expect(emails).not.toContain(USERS.otherSuperAdmin.email)
  })

  test('can rename themselves but cannot promote themselves', async () => {
    const rename = await db.from('profiles').update({ first_name: 'Viktor' }).eq('id', USERS.viewer.id).select('first_name')
    expect(rename.error).toBeNull()
    expect(rename.data).toEqual([{ first_name: 'Viktor' }])

    for (const patch of [{ is_super_admin: true }, { status: 'active' }, { org_id: ORG_A }]) {
      const { error } = await db.from('profiles').update(patch).eq('id', USERS.viewer.id)
      expect(error, JSON.stringify(patch)).not.toBeNull()
    }
  })

  test('cannot add themselves to a space or to a restricted category', async () => {
    const member = await db.from('space_members').insert({ space_id: SPACES.secret, user_id: USERS.viewer.id, role: 'admin' })
    expect(member.error).not.toBeNull()
    const access = await db.from('category_access').insert({ category_id: CATEGORIES.personal, user_id: USERS.viewer.id })
    expect(access.error).not.toBeNull()
  })
})

test.describe('viewer granted a restricted category', () => {
  test('sees the category, its entries and its totals', async () => {
    const db = await signIn(USERS.granted.email)
    const { data } = await db.from('categories').select('name')
    expect(names(data)).toEqual(['Old', 'Personal', 'Rent', 'Salary'])

    const { row } = await summary(db)
    expect(Number(row.expense)).toBe(1325)
    expect(Number(row.prev_expense)).toBe(120)
  })
})

test.describe('editor', () => {
  let db
  test.beforeAll(async () => { db = await signIn(USERS.editor.email) })

  test('can add, edit and delete entries, and authorship is enforced', async () => {
    const insert = await db.from('entries')
      .insert(entry({ amount: 123.45, created_by: USERS.superAdmin.id }))
      .select().single()
    expect(insert.error).toBeNull()
    expect(insert.data.created_by).toBe(USERS.editor.id)
    expect(insert.data.updated_by).toBe(USERS.editor.id)

    const update = await db.from('entries')
      .update({ amount: 200, created_by: USERS.superAdmin.id })
      .eq('id', insert.data.id).select().single()
    expect(update.error).toBeNull()
    expect(Number(update.data.amount)).toBe(200)
    expect(update.data.created_by).toBe(USERS.editor.id)

    const del = await db.from('entries').delete().eq('id', insert.data.id).select()
    expect(del.data).toHaveLength(1)
  })

  test('can edit entries added by someone else', async () => {
    const { data } = await db.from('entries').select('id, created_by').eq('note', 'rent today').single()
    expect(data.created_by).toBe(USERS.superAdmin.id)
    const update = await db.from('entries').update({ note: 'rent today' }).eq('id', data.id).select('updated_by').single()
    expect(update.error).toBeNull()
    expect(update.data.updated_by).toBe(USERS.editor.id)
  })

  test('cannot use a restricted category', async () => {
    const { error } = await db.from('entries').insert(entry({ category_id: CATEGORIES.personal }))
    expect(error).not.toBeNull()
  })

  test('cannot add a future-dated entry', async () => {
    const { error } = await db.from('entries').insert(entry({ entry_date: addDays(TODAY, 1) }))
    expect(error?.message).toMatch(/future/)
  })

  test('cannot use an archived category', async () => {
    const { error } = await db.from('entries').insert(entry({ category_id: CATEGORIES.old }))
    expect(error?.message).toMatch(/archived/)
  })

  test('cannot add entries to another space, or mix spaces', async () => {
    const other = await db.from('entries').insert(entry({ space_id: SPACES.secret, file_id: FILES.secret, category_id: CATEGORIES.hidden }))
    expect(other.error).not.toBeNull()
    const mixed = await db.from('entries').insert(entry({ category_id: CATEGORIES.hidden }))
    expect(mixed.error).not.toBeNull()
  })

  test('cannot create folders, files or categories', async () => {
    expect((await db.from('folders').insert({ space_id: SPACES.office, name: 'X' })).error).not.toBeNull()
    expect((await db.from('files').insert({ space_id: SPACES.office, folder_id: FOLDERS.office, name: 'X' })).error).not.toBeNull()
    expect((await db.from('categories').insert({ space_id: SPACES.office, name: 'X', type: 'expense' })).error).not.toBeNull()
  })

  test('cannot add members', async () => {
    const { error } = await db.from('space_members').insert({ space_id: SPACES.office, user_id: USERS.newOwner.id, role: 'viewer' })
    expect(error).not.toBeNull()
  })
})

test.describe('admin', () => {
  let db
  test.beforeAll(async () => { db = await signIn(USERS.admin.email) })

  test('can create, rename and delete folders, files and categories', async () => {
    const folder = await db.from('folders').insert({ space_id: SPACES.office, name: 'Admin Folder' }).select().single()
    expect(folder.error).toBeNull()
    expect(folder.data.created_by).toBe(USERS.admin.id)

    const file = await db.from('files').insert({ space_id: SPACES.office, folder_id: folder.data.id, name: 'Admin File' }).select().single()
    expect(file.error).toBeNull()

    const category = await db.from('categories').insert({ space_id: SPACES.office, name: 'Admin Cat', type: 'expense' }).select().single()
    expect(category.error).toBeNull()

    const rename = await db.from('files').update({ name: 'Renamed File' }).eq('id', file.data.id).select().single()
    expect(rename.data.name).toBe('Renamed File')

    expect((await db.from('categories').delete().eq('id', category.data.id).select()).data).toHaveLength(1)
    expect((await db.from('folders').delete().eq('id', folder.data.id).select()).data).toHaveLength(1)
  })

  test('cannot create a restricted category or change visibility', async () => {
    const create = await db.from('categories').insert({ space_id: SPACES.office, name: 'Sneaky', type: 'expense', is_restricted: true })
    expect(create.error?.message).toMatch(/visibility/)
    const update = await db.from('categories').update({ is_restricted: true }).eq('id', CATEGORIES.rent)
    expect(update.error?.message).toMatch(/visibility/)
  })

  test('does not see restricted categories', async () => {
    const { data } = await db.from('categories').select('name')
    expect(names(data)).not.toContain('Personal')
  })

  test('cannot delete a file that holds entries in categories they cannot see', async () => {
    const { error } = await db.from('files').delete().eq('id', FILES.office)
    expect(error?.message).toMatch(/cannot see/)
    const { error: folderError } = await db.from('folders').delete().eq('id', FOLDERS.office)
    expect(folderError?.message).toMatch(/cannot see/)
  })

  test('cannot delete a category that still has entries', async () => {
    const { error } = await db.from('categories').delete().eq('id', CATEGORIES.rent)
    expect(error).not.toBeNull()
  })

  test('cannot create spaces or manage members', async () => {
    expect((await db.from('spaces').insert({ org_id: ORG_A, name: 'X', currency_code: 'BDT', currency_symbol: '৳' })).error).not.toBeNull()
    expect((await db.from('space_members').insert({ space_id: SPACES.office, user_id: USERS.newOwner.id, role: 'viewer' })).error).not.toBeNull()
    const promote = await db.from('space_members').update({ role: 'admin' }).eq('user_id', USERS.viewer.id).select()
    expect(promote.data ?? []).toEqual([])
  })
})

test.describe('super admin', () => {
  let db
  test.beforeAll(async () => { db = await signIn(USERS.superAdmin.email) })

  test('sees every space in their organization and nothing outside it', async () => {
    const { data } = await db.from('spaces').select('name')
    expect(names(data)).toEqual(['Office', 'Secret'])
    const { data: entries } = await db.from('entries').select('note')
    expect(entries.map((e) => e.note)).not.toContain('org b')
  })

  test('sees restricted categories and their totals', async () => {
    const { row } = await summary(db)
    expect(Number(row.expense)).toBe(1325)
  })

  test('manages spaces and members', async () => {
    const space = await db.from('spaces').insert({ org_id: ORG_A, name: 'Temp Space', currency_code: 'USD', currency_symbol: '$' }).select().single()
    expect(space.error).toBeNull()

    const add = await db.from('space_members').insert({ space_id: space.data.id, user_id: USERS.viewer.id, role: 'viewer' })
    expect(add.error).toBeNull()
    const role = await db.from('space_members').update({ role: 'editor' }).eq('space_id', space.data.id).eq('user_id', USERS.viewer.id).select().single()
    expect(role.data.role).toBe('editor')

    const viewer = await signIn(USERS.viewer.email)
    expect(names((await viewer.from('spaces').select('name')).data)).toEqual(['Office', 'Temp Space'])

    expect((await db.from('space_members').delete().eq('space_id', space.data.id).select()).data).toHaveLength(1)
    expect(names((await viewer.from('spaces').select('name')).data)).toEqual(['Office'])
  })

  test('cannot add users from another organization, or themselves', async () => {
    const foreign = await db.from('space_members').insert({ space_id: SPACES.office, user_id: USERS.otherSuperAdmin.id, role: 'viewer' })
    expect(foreign.error).not.toBeNull()
    const self = await db.from('space_members').insert({ space_id: SPACES.office, user_id: USERS.superAdmin.id, role: 'viewer' })
    expect(self.error).not.toBeNull()
  })

  test('controls category visibility per member', async () => {
    const cat = await db.from('categories').insert({ space_id: SPACES.office, name: 'Bonus', type: 'income', is_restricted: true }).select().single()
    expect(cat.error).toBeNull()

    const viewer = await signIn(USERS.viewer.email)
    const visible = async () => names((await viewer.from('categories').select('name')).data)
    expect(await visible()).not.toContain('Bonus')

    expect((await db.from('category_access').insert({ category_id: cat.data.id, user_id: USERS.viewer.id })).error).toBeNull()
    expect(await visible()).toContain('Bonus')

    // Making it public clears the grant list; restricting again hides it from the viewer.
    await db.from('categories').update({ is_restricted: false }).eq('id', cat.data.id)
    await db.from('categories').update({ is_restricted: true }).eq('id', cat.data.id)
    expect(await visible()).not.toContain('Bonus')

    const nonMember = await db.from('category_access').insert({ category_id: cat.data.id, user_id: USERS.newOwner.id })
    expect(nonMember.error).not.toBeNull()
  })

  test('can delete a space with everything in it', async () => {
    const space = await db.from('spaces').insert({ org_id: ORG_A, name: 'Doomed', currency_code: 'BDT', currency_symbol: '৳' }).select().single()
    const folder = await db.from('folders').insert({ space_id: space.data.id, name: 'F' }).select().single()
    const file = await db.from('files').insert({ space_id: space.data.id, folder_id: folder.data.id, name: 'F' }).select().single()
    const cat = await db.from('categories').insert({ space_id: space.data.id, name: 'C', type: 'expense', is_restricted: true }).select().single()
    const e = await db.from('entries').insert({ space_id: space.data.id, file_id: file.data.id, category_id: cat.data.id, amount: 5 })
    expect(e.error).toBeNull()

    const del = await db.from('spaces').delete().eq('id', space.data.id).select()
    expect(del.error).toBeNull()
    expect(del.data).toHaveLength(1)
  })

  test('updates organization settings but not ownership', async () => {
    const ok = await db.from('organizations').update({ name: 'E2E Org A', week_start: 6 }).eq('id', ORG_A).select().single()
    expect(ok.error).toBeNull()
    const owner = await db.from('organizations').update({ owner_id: USERS.viewer.id }).eq('id', ORG_A)
    expect(owner.error).not.toBeNull()
    const badTz = await db.from('organizations').update({ timezone: 'Mars/Olympus' }).eq('id', ORG_A)
    expect(badTz.error?.message).toMatch(/timezone/)
  })

  test('dashboard trend buckets by day, week and month', async () => {
    const day = await db.rpc('dashboard_trend', { p_space_id: SPACES.office, p_from: YESTERDAY, p_to: TODAY, p_bucket: 'day' })
    expect(day.error).toBeNull()
    expect(day.data).toHaveLength(2)
    const todayRow = day.data.find((r) => r.bucket_start === TODAY)
    expect(Number(todayRow.income)).toBe(5000)
    expect(Number(todayRow.expense)).toBe(1325)

    const week = await db.rpc('dashboard_trend', { p_space_id: SPACES.office, p_from: TODAY, p_to: TODAY, p_bucket: 'week' })
    expect(week.data).toHaveLength(1)
    expect(new Date(`${week.data[0].bucket_start}T00:00:00Z`).getUTCDay()).toBe(6) // weeks start on Saturday

    const month = await db.rpc('dashboard_trend', { p_space_id: SPACES.office, p_from: TODAY, p_to: TODAY, p_bucket: 'month' })
    expect(month.data[0].bucket_start).toBe(`${TODAY.slice(0, 8)}01`)

    const huge = await db.rpc('dashboard_trend', { p_space_id: SPACES.office, p_from: '1000-01-01', p_to: TODAY, p_bucket: 'week' })
    expect(huge.error?.message).toMatch(/too large/)
  })
})

test.describe('disabled user', () => {
  test('can authenticate but sees nothing', async () => {
    const db = await signIn(USERS.disabled.email)
    expect((await db.from('spaces').select('id')).data).toEqual([])
    expect((await db.from('entries').select('id')).data).toEqual([])
    expect((await db.from('profiles').select('id')).data).toEqual([])
    const { error } = await summary(db)
    expect(error).not.toBeNull()
  })
})

test.describe('invited user', () => {
  test('first login marks the invitation accepted', async () => {
    const db = await signIn(USERS.invited.email)
    expect((await db.rpc('mark_login')).error).toBeNull()
    const { data } = await db.from('profiles').select('status, accepted_at, last_login_at').eq('id', USERS.invited.id).single()
    expect(data.status).toBe('active')
    expect(data.accepted_at).not.toBeNull()
    expect(data.last_login_at).not.toBeNull()
  })
})

test.describe('new super admin', () => {
  test('sets up an organization once', async () => {
    const db = await signIn(USERS.newOwner.email)
    const args = {
      p_org_name: 'Nora Org', p_timezone: 'Asia/Dhaka', p_space_name: 'General', p_currency_code: 'bdt', p_currency_symbol: '৳',
    }
    const first = await db.rpc('setup_organization', args)
    expect(first.error).toBeNull()

    const { data: me } = await db.from('profiles').select('is_super_admin, first_name, org_id').eq('id', USERS.newOwner.id).single()
    expect(me).toEqual({ is_super_admin: true, first_name: 'Nora', org_id: first.data })

    const { data: spaces } = await db.from('spaces').select('name, currency_code')
    expect(spaces).toEqual([{ name: 'General', currency_code: 'BDT' }])

    const second = await db.rpc('setup_organization', args)
    expect(second.error?.message).toMatch(/already set up/)
  })

  test('existing users cannot create a second organization', async () => {
    const db = await signIn(USERS.viewer.email)
    const { error } = await db.rpc('setup_organization', {
      p_org_name: 'Hijack', p_timezone: 'Asia/Dhaka', p_space_name: 'X', p_currency_code: 'BDT', p_currency_symbol: '৳',
    })
    expect(error?.message).toMatch(/already set up/)
  })
})

test.describe('other organization', () => {
  test('is completely isolated', async () => {
    const db = await signIn(USERS.otherSuperAdmin.email)
    expect(names((await db.from('spaces').select('name')).data)).toEqual(['B Space'])
    expect((await db.from('entries').select('note')).data.map((e) => e.note)).toEqual(['org b'])
    expect((await db.from('profiles').select('email')).data.map((p) => p.email)).toEqual([USERS.otherSuperAdmin.email])

    const write = await db.from('entries').insert(entry())
    expect(write.error).not.toBeNull()
    const { error } = await summary(db, SPACES.office)
    expect(error?.message).toMatch(/do not have access/)
  })
})

test.describe('user deletion (service role)', () => {
  test('deleting a user keeps their entries and clears the author', async () => {
    test.setTimeout(120_000)
    // Runs inside a DO block that always raises at the end, so nothing is committed.
    const out = runSql({
      sql: `do $$
        declare v_count int;
        begin
          update public.entries set created_by = '${USERS.admin.id}' where note = 'rent yesterday';
          delete from auth.users where id = '${USERS.admin.id}';
          select count(*) into v_count from public.entries where note = 'rent yesterday' and created_by is null;
          if v_count <> 1 then raise exception 'E2E_FAIL entry not kept with null author'; end if;
          raise exception 'E2E_OK';
        end $$;`,
    })
    expect(out).toContain('E2E_OK')
  })
})
