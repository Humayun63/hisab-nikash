-- Permission helpers (used by RLS policies) and integrity triggers.
-- All helpers are SECURITY DEFINER so they can read membership tables without recursing
-- through RLS, and pin search_path to '' so every reference must be schema-qualified.

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

-- Organization of the current user (null if no profile or disabled).
create function private.auth_org_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.org_id
  from public.profiles p
  where p.id = auth.uid() and p.status <> 'disabled'
$$;

-- True if the current user is the (enabled) super admin of the given organization.
create function private.is_super_admin(p_org_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.org_id = p_org_id
      and p.is_super_admin
      and p.status <> 'disabled'
  )
$$;

-- True if the current user is an (enabled) member of the space. Does not read public.spaces,
-- so it is safe to use in the spaces policy itself.
create function private.is_space_member(p_space_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.space_members sm
    join public.profiles p on p.id = sm.user_id
    where sm.space_id = p_space_id
      and sm.user_id = auth.uid()
      and p.status <> 'disabled'
  )
$$;

-- Effective role of the current user in a space:
-- 'super_admin' | 'admin' | 'editor' | 'viewer' | null (no access).
create function private.space_role(p_space_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when p.is_super_admin then 'super_admin'
    else (
      select sm.role from public.space_members sm
      where sm.space_id = s.id and sm.user_id = p.id
    )
  end
  from public.spaces s
  join public.profiles p on p.org_id = s.org_id
  where s.id = p_space_id
    and p.id = auth.uid()
    and p.status <> 'disabled'
$$;

create function private.role_rank(p_role text)
returns int
language sql immutable set search_path = ''
as $$
  select case p_role
    when 'viewer' then 1
    when 'editor' then 2
    when 'admin' then 3
    when 'super_admin' then 4
    else 0
  end
$$;

-- True if the current user's role in the space is at least p_min_role.
create function private.has_space_role(p_space_id uuid, p_min_role text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.role_rank(private.space_role(p_space_id)) >= private.role_rank(p_min_role)
     and private.role_rank(p_min_role) > 0
$$;

create function private.space_org_id(p_space_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select s.org_id from public.spaces s where s.id = p_space_id
$$;

create function private.category_org_id(p_category_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select s.org_id
  from public.categories c
  join public.spaces s on s.id = c.space_id
  where c.id = p_category_id
$$;

create function private.has_category_access(p_category_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.category_access ca
    where ca.category_id = p_category_id and ca.user_id = auth.uid()
  )
$$;

-- Visibility rule for a category row, given its columns. Used directly by the categories
-- policy (where the row may be brand new) and by can_see_category().
create function private.can_see_category_row(p_space_id uuid, p_category_id uuid, p_is_restricted boolean)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_role text := private.space_role(p_space_id);
begin
  if v_role is null then
    return false;
  end if;
  if v_role = 'super_admin' or not p_is_restricted then
    return true;
  end if;
  return private.has_category_access(p_category_id);
end;
$$;

create function private.can_see_category(p_category_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select private.can_see_category_row(c.space_id, c.id, c.is_restricted)
     from public.categories c where c.id = p_category_id),
    false
  )
$$;

-- Today's date in the organization's timezone.
create function private.org_today(p_org_id uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select (now() at time zone o.timezone)::date
  from public.organizations o
  where o.id = p_org_id
$$;

revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Generic timestamp / audit triggers
-- ---------------------------------------------------------------------------

-- Keeps created_* immutable, stamps created_by on insert and updated_at on update.
-- Applies to tables with created_by + created_at + updated_at.
create function private.stamp_audit_fields()
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
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- For tables with only updated_at (organizations, profiles).
create function private.stamp_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.stamp_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.stamp_updated_at();

create trigger spaces_audit before insert or update on public.spaces
  for each row execute function private.stamp_audit_fields();
create trigger folders_audit before insert or update on public.folders
  for each row execute function private.stamp_audit_fields();
create trigger files_audit before insert or update on public.files
  for each row execute function private.stamp_audit_fields();
create trigger categories_audit before insert or update on public.categories
  for each row execute function private.stamp_audit_fields();

-- ---------------------------------------------------------------------------
-- Organizations: timezone must be a real IANA zone; owner can't change.
-- ---------------------------------------------------------------------------
create function private.validate_organization()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone: %', new.timezone using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception 'The organization owner cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizations_validate before insert or update on public.organizations
  for each row execute function private.validate_organization();

-- ---------------------------------------------------------------------------
-- Profiles: keep email in sync with auth.users.
-- ---------------------------------------------------------------------------
create function private.sync_profile_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sync_profile_email();

-- ---------------------------------------------------------------------------
-- Space members: must be in the same organization; the super admin is never a member
-- (they already have access to every space). Removing a member also removes their
-- access to restricted categories in that space.
-- ---------------------------------------------------------------------------
create function private.validate_space_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = new.user_id;

  if v_profile.org_id is distinct from private.space_org_id(new.space_id) then
    raise exception 'User does not belong to this organization' using errcode = '23514';
  end if;
  if v_profile.is_super_admin then
    raise exception 'The super admin already has access to every space' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.space_id <> old.space_id or new.user_id <> old.user_id) then
    raise exception 'Only the role of a membership can be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger space_members_validate before insert or update on public.space_members
  for each row execute function private.validate_space_member();

create function private.cleanup_member_category_access()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.category_access ca
  using public.categories c
  where ca.category_id = c.id
    and c.space_id = old.space_id
    and ca.user_id = old.user_id;
  return old;
end;
$$;

create trigger space_members_cleanup after delete on public.space_members
  for each row execute function private.cleanup_member_category_access();

-- ---------------------------------------------------------------------------
-- Categories: only the super admin may change visibility; type is fixed once entries exist.
-- auth.uid() is null for service-role / SQL-console access, which is trusted.
-- ---------------------------------------------------------------------------
create function private.validate_category()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null
     and not private.is_super_admin(private.space_org_id(new.space_id))
     and (
       (tg_op = 'INSERT' and new.is_restricted)
       or (tg_op = 'UPDATE' and new.is_restricted is distinct from old.is_restricted)
     ) then
    raise exception 'Only the super admin can change category visibility' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.space_id <> old.space_id then
      raise exception 'A category cannot be moved to another space' using errcode = '23514';
    end if;
    if new.type <> old.type and exists (select 1 from public.entries e where e.category_id = old.id) then
      raise exception 'Cannot change the type of a category that has entries' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger categories_validate before insert or update on public.categories
  for each row execute function private.validate_category();

-- Category access rows only make sense for members of the category's space.
create function private.validate_category_access()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.categories c
    join public.space_members sm on sm.space_id = c.space_id
    where c.id = new.category_id and sm.user_id = new.user_id
  ) then
    raise exception 'User is not a member of this category''s space' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger category_access_validate before insert or update on public.category_access
  for each row execute function private.validate_category_access();

-- ---------------------------------------------------------------------------
-- Folders / files: can't move between spaces.
-- ---------------------------------------------------------------------------
create function private.prevent_space_change()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.space_id <> old.space_id then
    raise exception 'Cannot move to another space' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger folders_space_fixed before update on public.folders
  for each row execute function private.prevent_space_change();
create trigger files_space_fixed before update on public.files
  for each row execute function private.prevent_space_change();
create trigger entries_space_fixed before update on public.entries
  for each row execute function private.prevent_space_change();

-- ---------------------------------------------------------------------------
-- Entries: audit stamps, no future dates (org timezone), no archived categories.
-- ---------------------------------------------------------------------------
create function private.validate_entry()
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
    new.created_by := old.created_by;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
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

create trigger entries_validate before insert or update on public.entries
  for each row execute function private.validate_entry();
