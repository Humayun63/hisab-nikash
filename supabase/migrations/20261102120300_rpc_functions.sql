-- Functions the frontend calls through supabase.rpc(). See SPEC.md §5.1, §5.8, §8.

-- ---------------------------------------------------------------------------
-- setup_organization: first-login setup for a newly registered, email-verified super admin.
-- Creates the organization, the super admin's profile and the first space in one transaction.
-- First/last name come from the sign-up metadata (supabase.auth.signUp options.data).
-- ---------------------------------------------------------------------------
create function public.setup_organization(
  p_org_name text,
  p_timezone text,
  p_space_name text,
  p_currency_code text,
  p_currency_symbol text,
  p_week_start smallint default 6
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_user auth.users%rowtype;
  v_first_name text;
  v_last_name text;
  v_org_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'This account is already set up' using errcode = '23505';
  end if;

  select * into v_user from auth.users where id = v_uid;
  if v_user.email_confirmed_at is null then
    raise exception 'Please verify your email first' using errcode = '42501';
  end if;

  v_first_name := btrim(v_user.raw_user_meta_data ->> 'first_name');
  v_last_name := btrim(v_user.raw_user_meta_data ->> 'last_name');
  if coalesce(v_first_name, '') = '' or coalesce(v_last_name, '') = '' then
    raise exception 'First and last name are missing from the account' using errcode = '23502';
  end if;

  insert into public.organizations (name, timezone, week_start, owner_id)
  values (btrim(p_org_name), p_timezone, p_week_start, v_uid)
  returning id into v_org_id;

  insert into public.profiles (id, org_id, first_name, last_name, email, is_super_admin, status, accepted_at, last_login_at)
  values (v_uid, v_org_id, v_first_name, v_last_name, v_user.email, true, 'active', now(), now());

  insert into public.spaces (org_id, name, currency_code, currency_symbol, created_by)
  values (v_org_id, btrim(p_space_name), upper(btrim(p_currency_code)), btrim(p_currency_symbol), v_uid);

  return v_org_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_login: called by the client after each successful sign-in.
-- The first login of an invited user marks the invitation as accepted.
-- ---------------------------------------------------------------------------
create function public.mark_login()
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles
  set last_login_at = now(),
      accepted_at = case when status = 'invited' then now() else accepted_at end,
      status = case when status = 'invited' then 'active' else status end
  where id = auth.uid() and status <> 'disabled'
$$;

-- ---------------------------------------------------------------------------
-- Dashboard.
-- These run as SECURITY DEFINER for speed (visibility is computed once per call instead of
-- per row through RLS), so private.visible_entries() re-implements the exact same rules:
-- caller must be a member of the space, and restricted categories are only included for
-- the super admin or members granted access.
-- ---------------------------------------------------------------------------
create function private.visible_entries(
  p_space_id uuid,
  p_from date,
  p_to date,
  p_folder_id uuid,
  p_file_id uuid
)
returns table (entry_date date, amount numeric, category_id uuid, type text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_role text := private.space_role(p_space_id);
begin
  if v_role is null then
    raise exception 'You do not have access to this space' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  return query
    select e.entry_date, e.amount, e.category_id, c.type
    from public.entries e
    join public.categories c on c.id = e.category_id
    join public.files f on f.id = e.file_id
    where e.space_id = p_space_id
      and e.entry_date between p_from and p_to
      and (p_folder_id is null or f.folder_id = p_folder_id)
      and (p_file_id is null or e.file_id = p_file_id)
      and (
        v_role = 'super_admin'
        or not c.is_restricted
        or exists (
          select 1 from public.category_access ca
          where ca.category_id = c.id and ca.user_id = auth.uid()
        )
      );
end;
$$;

revoke all on function private.visible_entries(uuid, date, date, uuid, uuid) from public, anon;
grant execute on function private.visible_entries(uuid, date, date, uuid, uuid) to authenticated;

-- Totals for [p_from, p_to] and for the previous period of the same length.
create function public.dashboard_summary(
  p_space_id uuid,
  p_from date,
  p_to date,
  p_folder_id uuid default null,
  p_file_id uuid default null
)
returns table (
  income numeric, expense numeric, net numeric, entry_count bigint,
  prev_income numeric, prev_expense numeric, prev_net numeric, prev_entry_count bigint
)
language sql stable security definer set search_path = ''
as $$
  with bounds as (
    select p_from - (p_to - p_from + 1) as prev_from, p_from - 1 as prev_to
  ),
  scoped as (
    select v.*, v.entry_date >= p_from as is_current
    from bounds b, private.visible_entries(p_space_id, b.prev_from, p_to, p_folder_id, p_file_id) v
  )
  select
    coalesce(sum(amount) filter (where is_current and type = 'income'), 0),
    coalesce(sum(amount) filter (where is_current and type = 'expense'), 0),
    coalesce(sum(case when type = 'income' then amount else -amount end) filter (where is_current), 0),
    count(*) filter (where is_current),
    coalesce(sum(amount) filter (where not is_current and type = 'income'), 0),
    coalesce(sum(amount) filter (where not is_current and type = 'expense'), 0),
    coalesce(sum(case when type = 'income' then amount else -amount end) filter (where not is_current), 0),
    count(*) filter (where not is_current)
  from scoped
$$;

-- Totals per category for [p_from, p_to]; only categories with entries in the range.
create function public.dashboard_by_category(
  p_space_id uuid,
  p_from date,
  p_to date,
  p_folder_id uuid default null,
  p_file_id uuid default null
)
returns table (category_id uuid, name text, color text, type text, total numeric, entry_count bigint)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.color, c.type, sum(v.amount), count(*)
  from private.visible_entries(p_space_id, p_from, p_to, p_folder_id, p_file_id) v
  join public.categories c on c.id = v.category_id
  group by c.id, c.name, c.color, c.type
  order by c.type, sum(v.amount) desc
$$;

create function private.bucket_start(p_date date, p_bucket text, p_week_start int)
returns date
language sql immutable set search_path = ''
as $$
  select case p_bucket
    when 'day' then p_date
    when 'week' then p_date - ((extract(dow from p_date)::int - p_week_start + 7) % 7)
    when 'month' then date_trunc('month', p_date)::date
  end
$$;

-- Income/expense per bucket ('day' | 'week' | 'month'), with empty buckets filled in.
-- Weeks start on the organization's week_start day.
create function public.dashboard_trend(
  p_space_id uuid,
  p_from date,
  p_to date,
  p_bucket text,
  p_folder_id uuid default null,
  p_file_id uuid default null
)
returns table (bucket_start date, income numeric, expense numeric)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_week_start int;
  v_step interval;
  v_first date;
  v_last date;
begin
  if p_bucket not in ('day', 'week', 'month') then
    raise exception 'Bucket must be day, week or month' using errcode = '22023';
  end if;

  select o.week_start into v_week_start
  from public.organizations o
  where o.id = private.space_org_id(p_space_id);

  v_first := private.bucket_start(p_from, p_bucket, v_week_start);
  v_last := private.bucket_start(p_to, p_bucket, v_week_start);
  v_step := case p_bucket when 'day' then interval '1 day' when 'week' then interval '7 days' else interval '1 month' end;

  if p_bucket = 'day' and v_last - v_first > 1000 then
    raise exception 'Range too large for daily buckets' using errcode = '22023';
  end if;

  -- visible_entries() performs the access check and raises if the caller is not a member.
  return query
    with totals as (
      select private.bucket_start(v.entry_date, p_bucket, v_week_start) as b,
             sum(v.amount) filter (where v.type = 'income') as inc,
             sum(v.amount) filter (where v.type = 'expense') as exp
      from private.visible_entries(p_space_id, p_from, p_to, p_folder_id, p_file_id) v
      group by 1
    )
    select s.b::date, coalesce(t.inc, 0), coalesce(t.exp, 0)
    from generate_series(v_first::timestamp, v_last::timestamp, v_step) as s(b)
    left join totals t on t.b = s.b::date
    order by 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Only signed-in users may call these.
-- ---------------------------------------------------------------------------
revoke all on function public.setup_organization(text, text, text, text, text, smallint) from public, anon;
revoke all on function public.mark_login() from public, anon;
revoke all on function public.dashboard_summary(uuid, date, date, uuid, uuid) from public, anon;
revoke all on function public.dashboard_by_category(uuid, date, date, uuid, uuid) from public, anon;
revoke all on function public.dashboard_trend(uuid, date, date, text, uuid, uuid) from public, anon;
revoke all on function private.bucket_start(date, text, int) from public, anon;

grant execute on function public.setup_organization(text, text, text, text, text, smallint) to authenticated;
grant execute on function public.mark_login() to authenticated;
grant execute on function public.dashboard_summary(uuid, date, date, uuid, uuid) to authenticated;
grant execute on function public.dashboard_by_category(uuid, date, date, uuid, uuid) to authenticated;
grant execute on function public.dashboard_trend(uuid, date, date, text, uuid, uuid) to authenticated;
grant execute on function private.bucket_start(date, text, int) to authenticated;
