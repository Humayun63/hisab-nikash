-- Fixes from the security review of the first four migrations.

-- ---------------------------------------------------------------------------
-- 1. created_by must only be locked for client requests. Deleting a user runs
--    ON DELETE SET NULL as an UPDATE (with auth.uid() null), which the old triggers reverted.
-- ---------------------------------------------------------------------------
create or replace function private.stamp_audit_fields()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    if auth.uid() is not null then
      new.created_by := old.created_by;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function private.validate_entry()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    if auth.uid() is not null then
      new.created_by := old.created_by;
      new.updated_by := auth.uid();
    end if;
  end if;
  new.updated_at := now();

  if new.entry_date > private.org_today(private.space_org_id(new.space_id)) then
    raise exception 'Entry date cannot be in the future' using errcode = '23514';
  end if;

  if (tg_op = 'INSERT' or new.category_id <> old.category_id)
     and exists (select 1 from public.categories c where c.id = new.category_id and c.archived_at is not null) then
    raise exception 'Cannot use an archived category' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Deleting a space cascades to categories and entries through separate RI queries;
--    defer the entries → categories check to commit so the order doesn't matter.
--    Deleting a single category that still has entries is still refused (at commit).
-- ---------------------------------------------------------------------------
alter table public.entries
  alter constraint entries_category_id_space_id_fkey deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- 3. Deleting a folder or file cascades to its entries, bypassing RLS. Don't let someone
--    delete entries in restricted categories they can't see.
-- ---------------------------------------------------------------------------
create function private.prevent_hidden_entry_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return old;
  end if;

  if exists (
    select 1
    from public.entries e
    join public.files f on f.id = e.file_id
    where (case tg_table_name when 'folders' then f.folder_id else f.id end) = old.id
      and not private.can_see_category(e.category_id)
  ) then
    raise exception 'This contains entries in categories you cannot see. Ask the super admin to delete it.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger folders_protect_hidden_entries before delete on public.folders
  for each row execute function private.prevent_hidden_entry_delete();
create trigger files_protect_hidden_entries before delete on public.files
  for each row execute function private.prevent_hidden_entry_delete();

-- ---------------------------------------------------------------------------
-- 5. Making a category public again drops its access list, so re-restricting it later
--    starts from an empty list instead of silently reviving old grants.
-- ---------------------------------------------------------------------------
create function private.clear_category_access_when_public()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.category_access where category_id = new.id;
  return new;
end;
$$;

create trigger categories_clear_access after update of is_restricted on public.categories
  for each row when (old.is_restricted and not new.is_restricted)
  execute function private.clear_category_access_when_public();

-- ---------------------------------------------------------------------------
-- 6. dashboard_trend: check access first and cap the number of buckets for every bucket size.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_trend(
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
  v_buckets int;
begin
  if private.space_role(p_space_id) is null then
    raise exception 'You do not have access to this space' using errcode = '42501';
  end if;
  if p_bucket is null or p_bucket not in ('day', 'week', 'month') then
    raise exception 'Bucket must be day, week or month' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  select o.week_start into v_week_start
  from public.organizations o
  where o.id = private.space_org_id(p_space_id);

  v_first := private.bucket_start(p_from, p_bucket, v_week_start);
  v_last := private.bucket_start(p_to, p_bucket, v_week_start);
  v_step := case p_bucket when 'day' then interval '1 day' when 'week' then interval '7 days' else interval '1 month' end;
  v_buckets := case p_bucket
    when 'day' then v_last - v_first
    when 'week' then (v_last - v_first) / 7
    else (extract(year from age(v_last, v_first)) * 12 + extract(month from age(v_last, v_first)))::int
  end + 1;

  if v_buckets > 1000 then
    raise exception 'Range too large for % buckets', p_bucket using errcode = '22023';
  end if;

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
-- Advisor (auth_rls_initplan): evaluate auth.uid() once per query, not per row.
-- ---------------------------------------------------------------------------
alter policy "Users can update their own name" on public.profiles
  using (id = (select auth.uid()) and status <> 'disabled')
  with check (id = (select auth.uid()));

alter policy "Users see their own grants; super admin sees all" on public.category_access
  using (user_id = (select auth.uid()) or private.is_super_admin(private.category_org_id(category_id)));
