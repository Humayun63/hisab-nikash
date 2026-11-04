-- Test fixtures for e2e/rls.spec.js. IDs must match e2e/fixtures/ids.js.
-- Runs as the database owner, so RLS is bypassed and auth.uid() is null in triggers.
-- Password for every user: see TEST_PASSWORD in ids.js. Run cleanup.sql first.

-- ---------------------------------------------------------------------------
-- Auth users (email already confirmed)
-- ---------------------------------------------------------------------------
with u(id, email, first_name, last_name) as (
  values
    ('a0000000-0000-4000-8000-000000000001'::uuid, 'sa@e2e.hisab-nikash.test',       'Sara',   'Admin'),
    ('a0000000-0000-4000-8000-000000000002'::uuid, 'viewer@e2e.hisab-nikash.test',   'Vik',    'Viewer'),
    ('a0000000-0000-4000-8000-000000000003'::uuid, 'editor@e2e.hisab-nikash.test',   'Eda',    'Editor'),
    ('a0000000-0000-4000-8000-000000000004'::uuid, 'admin@e2e.hisab-nikash.test',    'Adi',    'Admin'),
    ('a0000000-0000-4000-8000-000000000005'::uuid, 'granted@e2e.hisab-nikash.test',  'Gina',   'Granted'),
    ('a0000000-0000-4000-8000-000000000006'::uuid, 'disabled@e2e.hisab-nikash.test', 'Dan',    'Disabled'),
    ('a0000000-0000-4000-8000-000000000007'::uuid, 'invited@e2e.hisab-nikash.test',  'Ivy',    'Invited'),
    ('a0000000-0000-4000-8000-000000000008'::uuid, 'newowner@e2e.hisab-nikash.test', 'Nora',   'Owner'),
    ('b0000000-0000-4000-8000-000000000001'::uuid, 'othersa@e2e.hisab-nikash.test',  'Omar',   'Other'),
    -- UI test users (e2e/ui): kept separate from the database tests so they can mutate freely.
    ('a0000000-0000-4000-8000-000000000101'::uuid, 'uiowner@e2e.hisab-nikash.test',    'Uma',  'Owner'),
    ('a0000000-0000-4000-8000-000000000102'::uuid, 'mustchange@e2e.hisab-nikash.test', 'Milo', 'Change'),
    ('a0000000-0000-4000-8000-000000000103'::uuid, 'resetter@e2e.hisab-nikash.test',   'Rita', 'Reset')
),
ins as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
    extensions.crypt('E2e-Test-Pass-1!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name),
    now(), now(), '', '', '', ''
  from u
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), ins.id, ins.id::text, 'email',
       jsonb_build_object('sub', ins.id::text, 'email', ins.email, 'email_verified', true),
       now(), now(), now()
from ins;

-- ---------------------------------------------------------------------------
-- Organization A (Sara) and organization B (Omar)
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, timezone, week_start, owner_id) values
  ('a1000000-0000-4000-8000-000000000001', 'E2E Org A', 'Asia/Dhaka', 6, 'a0000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001', 'E2E Org B', 'Asia/Dhaka', 6, 'b0000000-0000-4000-8000-000000000001');

insert into public.profiles (id, org_id, first_name, last_name, email, is_super_admin, status) values
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Sara', 'Admin',    'sa@e2e.hisab-nikash.test',       true,  'active'),
  ('a0000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'Vik',  'Viewer',   'viewer@e2e.hisab-nikash.test',   false, 'active'),
  ('a0000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'Eda',  'Editor',   'editor@e2e.hisab-nikash.test',   false, 'active'),
  ('a0000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'Adi',  'Admin',    'admin@e2e.hisab-nikash.test',    false, 'active'),
  ('a0000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', 'Gina', 'Granted',  'granted@e2e.hisab-nikash.test',  false, 'active'),
  ('a0000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 'Dan',  'Disabled', 'disabled@e2e.hisab-nikash.test', false, 'disabled'),
  ('a0000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000001', 'Ivy',  'Invited',  'invited@e2e.hisab-nikash.test',  false, 'invited'),
  ('b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Omar', 'Other',    'othersa@e2e.hisab-nikash.test',  true,  'active'),
  ('a0000000-0000-4000-8000-000000000102', 'a1000000-0000-4000-8000-000000000001', 'Milo', 'Change',   'mustchange@e2e.hisab-nikash.test', false, 'invited'),
  ('a0000000-0000-4000-8000-000000000103', 'a1000000-0000-4000-8000-000000000001', 'Rita', 'Reset',    'resetter@e2e.hisab-nikash.test',   false, 'active');

update public.profiles set must_change_password = true where id = 'a0000000-0000-4000-8000-000000000102';
-- newowner (…008) and uiowner (…101) intentionally have no profile: they test setup_organization().

-- ---------------------------------------------------------------------------
-- Spaces: Office (members), Secret (no members), and Org B's space
-- ---------------------------------------------------------------------------
insert into public.spaces (id, org_id, name, currency_code, currency_symbol, created_by) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Office', 'BDT', '৳', 'a0000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'Secret', 'USD', '$', 'a0000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'B Space', 'BDT', '৳', 'b0000000-0000-4000-8000-000000000001');

insert into public.space_members (space_id, user_id, role) values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'viewer'),
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'editor'),
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'admin'),
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'viewer'),
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'editor'),
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000007', 'viewer'),
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000102', 'viewer'),
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000103', 'editor');

insert into public.folders (id, space_id, name, created_by) values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Office Folder', 'a0000000-0000-4000-8000-000000000001'),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'Secret Folder', 'a0000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'B Folder',      'b0000000-0000-4000-8000-000000000001');

insert into public.files (id, folder_id, space_id, name, created_by) values
  ('a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Office File', 'a0000000-0000-4000-8000-000000000001'),
  ('a4000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'Secret File', 'a0000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'B File',      'b0000000-0000-4000-8000-000000000001');

insert into public.categories (id, space_id, name, type, color, is_restricted, created_by) values
  ('a5000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Rent',     'expense', '#ef4444', false, 'a0000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'Salary',   'income',  '#22c55e', false, 'a0000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'Personal', 'expense', '#a855f7', true,  'a0000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000001', 'Old',      'expense', '#64748b', false, 'a0000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000002', 'Hidden',   'expense', '#000000', false, 'a0000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'B Cat',    'expense', '#000000', false, 'b0000000-0000-4000-8000-000000000001');

-- Gina may see the restricted "Personal" category.
insert into public.category_access (category_id, user_id) values
  ('a5000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005');

-- ---------------------------------------------------------------------------
-- Entries. "today" = today in Asia/Dhaka.
--   Office today:     Rent 1000, Salary 5000, Personal 300 (restricted), Old 25 (archived below)
--   Office yesterday: Rent 50, Personal 70 (restricted)
-- ---------------------------------------------------------------------------
insert into public.entries (space_id, file_id, category_id, amount, entry_date, note, created_by)
select v.space_id::uuid, v.file_id::uuid, v.category_id::uuid, v.amount, (now() at time zone 'Asia/Dhaka')::date - v.days_ago, v.note,
       'a0000000-0000-4000-8000-000000000001'
from (values
  ('a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 1000.00, 0, 'rent today'),
  ('a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', 5000.00, 0, 'salary today'),
  ('a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000003',  300.00, 0, 'personal today'),
  ('a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004',   25.00, 0, 'old today'),
  ('a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001',   50.00, 1, 'rent yesterday'),
  ('a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000003',   70.00, 1, 'personal yesterday'),
  ('a2000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000005',  999.00, 0, 'secret'),
  ('b2000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001',  777.00, 0, 'org b')
) as v(space_id, file_id, category_id, amount, days_ago, note);

update public.categories set archived_at = now() where id = 'a5000000-0000-4000-8000-000000000004';

-- ---------------------------------------------------------------------------
-- Milestone 3: isolated organizations for user/space management tests
--   Org C — UI tests (e2e/ui/management.spec.js)
--   Org D — admin-users Edge Function API tests (e2e/db/admin-users.spec.js)
-- ---------------------------------------------------------------------------
with u(id, email, first_name, last_name) as (
  values
    ('c0000000-0000-4000-8000-000000000001'::uuid, 'uisa@e2e.hisab-nikash.test',      'Cara', 'Chief'),
    ('c0000000-0000-4000-8000-000000000002'::uuid, 'uimember@e2e.hisab-nikash.test',  'Max',  'Member'),
    ('c0000000-0000-4000-8000-000000000003'::uuid, 'uidisable@e2e.hisab-nikash.test', 'Dora', 'Toggle'),
    ('d0000000-0000-4000-8000-000000000001'::uuid, 'fnsa@e2e.hisab-nikash.test',      'Fern', 'Boss'),
    ('d0000000-0000-4000-8000-000000000002'::uuid, 'fnviewer@e2e.hisab-nikash.test',  'Finn', 'Viewer'),
    ('d0000000-0000-4000-8000-000000000003'::uuid, 'fntarget@e2e.hisab-nikash.test',  'Tess', 'Target'),
    ('d0000000-0000-4000-8000-000000000004'::uuid, 'fndelete@e2e.hisab-nikash.test',  'Dell', 'Gone')
),
ins as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
    extensions.crypt('E2e-Test-Pass-1!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name),
    now(), now(), '', '', '', ''
  from u
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), ins.id, ins.id::text, 'email',
       jsonb_build_object('sub', ins.id::text, 'email', ins.email, 'email_verified', true),
       now(), now(), now()
from ins;

insert into public.organizations (id, name, timezone, week_start, owner_id) values
  ('c1000000-0000-4000-8000-000000000001', 'E2E Org C', 'Asia/Dhaka', 6, 'c0000000-0000-4000-8000-000000000001'),
  ('d1000000-0000-4000-8000-000000000001', 'E2E Org D', 'Asia/Dhaka', 6, 'd0000000-0000-4000-8000-000000000001');

insert into public.profiles (id, org_id, first_name, last_name, email, is_super_admin, status, accepted_at) values
  ('c0000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Cara', 'Chief',  'uisa@e2e.hisab-nikash.test',      true,  'active', now()),
  ('c0000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'Max',  'Member', 'uimember@e2e.hisab-nikash.test',  false, 'active', now()),
  ('c0000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'Dora', 'Toggle', 'uidisable@e2e.hisab-nikash.test', false, 'active', now()),
  ('d0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Fern', 'Boss',   'fnsa@e2e.hisab-nikash.test',      true,  'active', now()),
  ('d0000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'Finn', 'Viewer', 'fnviewer@e2e.hisab-nikash.test',  false, 'active', now()),
  ('d0000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'Tess', 'Target', 'fntarget@e2e.hisab-nikash.test',  false, 'active', now()),
  ('d0000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', 'Dell', 'Gone',   'fndelete@e2e.hisab-nikash.test',  false, 'active', now());

insert into public.spaces (id, org_id, name, currency_code, currency_symbol, created_by) values
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'C Office',   'BDT', '৳', 'c0000000-0000-4000-8000-000000000001'),
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'C Projects', 'USD', '$', 'c0000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'D Space',    'BDT', '৳', 'd0000000-0000-4000-8000-000000000001');

insert into public.space_members (space_id, user_id, role) values
  ('c2000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'editor'),
  ('d2000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'viewer'),
  ('d2000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'viewer');

-- An entry by the user that the API tests delete, to check entries survive user deletion.
insert into public.folders (id, space_id, name, created_by) values
  ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'D Folder', 'd0000000-0000-4000-8000-000000000001');
insert into public.files (id, folder_id, space_id, name, created_by) values
  ('d4000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'D File', 'd0000000-0000-4000-8000-000000000001');
insert into public.categories (id, space_id, name, type, created_by) values
  ('d5000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'D Cat', 'expense', 'd0000000-0000-4000-8000-000000000001');
insert into public.entries (space_id, file_id, category_id, amount, entry_date, note, created_by) values
  ('d2000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 42, (now() at time zone 'Asia/Dhaka')::date, 'by dell', 'd0000000-0000-4000-8000-000000000004');

-- ---------------------------------------------------------------------------
-- Milestone 4: Org E for folder/file/category tests (see ORG_E in ids.js)
--   E Office — UI tests (e2e/ui/structure.spec.js)
--   E Data   — API tests (e2e/db/structure.spec.js)
-- ---------------------------------------------------------------------------
with u(id, email, first_name, last_name) as (
  values
    ('e0000000-0000-4000-8000-000000000001'::uuid, 'esa@e2e.hisab-nikash.test',       'Erin', 'Super'),
    ('e0000000-0000-4000-8000-000000000002'::uuid, 'eadmin@e2e.hisab-nikash.test',    'Abe',  'Admin'),
    ('e0000000-0000-4000-8000-000000000003'::uuid, 'eeditor@e2e.hisab-nikash.test',   'Ed',   'Editor'),
    ('e0000000-0000-4000-8000-000000000004'::uuid, 'eviewer@e2e.hisab-nikash.test',   'Vera', 'Viewer'),
    ('e0000000-0000-4000-8000-000000000005'::uuid, 'egranted@e2e.hisab-nikash.test',  'Gus',  'Granted'),
    ('e0000000-0000-4000-8000-000000000006'::uuid, 'eoutsider@e2e.hisab-nikash.test', 'Olly', 'Outside')
),
ins as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
    extensions.crypt('E2e-Test-Pass-1!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name),
    now(), now(), '', '', '', ''
  from u
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), ins.id, ins.id::text, 'email',
       jsonb_build_object('sub', ins.id::text, 'email', ins.email, 'email_verified', true),
       now(), now(), now()
from ins;

insert into public.organizations (id, name, timezone, week_start, owner_id) values
  ('e1000000-0000-4000-8000-000000000001', 'E2E Org E', 'Asia/Dhaka', 6, 'e0000000-0000-4000-8000-000000000001');

insert into public.profiles (id, org_id, first_name, last_name, email, is_super_admin, status, accepted_at) values
  ('e0000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Erin', 'Super',   'esa@e2e.hisab-nikash.test',       true,  'active', now()),
  ('e0000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'Abe',  'Admin',   'eadmin@e2e.hisab-nikash.test',    false, 'active', now()),
  ('e0000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', 'Ed',   'Editor',  'eeditor@e2e.hisab-nikash.test',   false, 'active', now()),
  ('e0000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000001', 'Vera', 'Viewer',  'eviewer@e2e.hisab-nikash.test',   false, 'active', now()),
  ('e0000000-0000-4000-8000-000000000005', 'e1000000-0000-4000-8000-000000000001', 'Gus',  'Granted', 'egranted@e2e.hisab-nikash.test',  false, 'active', now()),
  ('e0000000-0000-4000-8000-000000000006', 'e1000000-0000-4000-8000-000000000001', 'Olly', 'Outside', 'eoutsider@e2e.hisab-nikash.test', false, 'active', now());

insert into public.spaces (id, org_id, name, currency_code, currency_symbol, created_by) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'E Office', 'BDT', '৳', 'e0000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'E Data',   'USD', '$', 'e0000000-0000-4000-8000-000000000001');

insert into public.space_members (space_id, user_id, role)
select s.id::uuid, m.user_id::uuid, m.role
from (values ('e2000000-0000-4000-8000-000000000001'), ('e2000000-0000-4000-8000-000000000002')) as s(id)
cross join (values
  ('e0000000-0000-4000-8000-000000000002', 'admin'),
  ('e0000000-0000-4000-8000-000000000003', 'editor'),
  ('e0000000-0000-4000-8000-000000000004', 'viewer'),
  ('e0000000-0000-4000-8000-000000000005', 'viewer')
) as m(user_id, role);

insert into public.folders (id, space_id, name, created_by) values
  ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'Operations',   'e0000000-0000-4000-8000-000000000001'),
  ('e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'Projects',     'e0000000-0000-4000-8000-000000000001'),
  ('e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'Empty Folder', 'e0000000-0000-4000-8000-000000000001'),
  ('e3000000-0000-4000-8000-000000000011', 'e2000000-0000-4000-8000-000000000002', 'Data Folder',  'e0000000-0000-4000-8000-000000000001');

insert into public.files (id, folder_id, space_id, name, created_by) values
  ('e4000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'Daily Costs', 'e0000000-0000-4000-8000-000000000001'),
  ('e4000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'Payroll',     'e0000000-0000-4000-8000-000000000001'),
  ('e4000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'Website',     'e0000000-0000-4000-8000-000000000001'),
  ('e4000000-0000-4000-8000-000000000011', 'e3000000-0000-4000-8000-000000000011', 'e2000000-0000-4000-8000-000000000002', 'Data File A', 'e0000000-0000-4000-8000-000000000001'),
  ('e4000000-0000-4000-8000-000000000012', 'e3000000-0000-4000-8000-000000000011', 'e2000000-0000-4000-8000-000000000002', 'Data File B', 'e0000000-0000-4000-8000-000000000001');

insert into public.categories (id, space_id, name, type, color, is_restricted, created_by) values
  ('e5000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'Rent',         'expense', '#ef4444', false, 'e0000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'Sales',        'income',  '#22c55e', false, 'e0000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'Private',      'expense', '#a855f7', true,  'e0000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 'Legacy',       'expense', '#64748b', false, 'e0000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000001', 'Unused',       'income',  '#0ea5e9', false, 'e0000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000011', 'e2000000-0000-4000-8000-000000000002', 'D Income',     'income',  '#22c55e', false, 'e0000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000012', 'e2000000-0000-4000-8000-000000000002', 'D Expense',    'expense', '#ef4444', false, 'e0000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000013', 'e2000000-0000-4000-8000-000000000002', 'D Restricted', 'expense', '#a855f7', true,  'e0000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000014', 'e2000000-0000-4000-8000-000000000002', 'D Archived',   'expense', '#64748b', false, 'e0000000-0000-4000-8000-000000000001');

insert into public.category_access (category_id, user_id) values
  ('e5000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000005'),
  ('e5000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000005');

insert into public.entries (space_id, file_id, category_id, amount, entry_date, note, created_by)
select v.space_id::uuid, v.file_id::uuid, v.category_id::uuid, v.amount, (now() at time zone 'Asia/Dhaka')::date, v.note,
       'e0000000-0000-4000-8000-000000000001'
from (values
  ('e2000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', 5000.00, 'sales'),
  ('e2000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', 1200.00, 'rent'),
  ('e2000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000003',  300.00, 'private'),
  ('e2000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-000000000002', 1000.00, 'payroll sales'),
  ('e2000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000011', 'e5000000-0000-4000-8000-000000000011', 1000.00, 'd income'),
  ('e2000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000011', 'e5000000-0000-4000-8000-000000000012',  400.00, 'd expense'),
  ('e2000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000011', 'e5000000-0000-4000-8000-000000000013',  250.00, 'd restricted'),
  ('e2000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000011', 'e5000000-0000-4000-8000-000000000014',   50.00, 'd archived')
) as v(space_id, file_id, category_id, amount, note);

update public.categories set archived_at = now()
where id in ('e5000000-0000-4000-8000-000000000004', 'e5000000-0000-4000-8000-000000000014');
