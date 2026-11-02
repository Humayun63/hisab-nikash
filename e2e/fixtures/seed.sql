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
