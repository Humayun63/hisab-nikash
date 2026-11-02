-- Row Level Security. See SPEC.md §4 (permission matrix) and §7.
-- Users are created, edited and deleted only by Edge Functions using the service role,
-- which bypasses RLS; nothing here lets a browser client do that.

-- The anon role (logged-out visitors) gets no table access at all.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

alter table public.organizations   enable row level security;
alter table public.profiles        enable row level security;
alter table public.spaces          enable row level security;
alter table public.space_members   enable row level security;
alter table public.folders         enable row level security;
alter table public.files           enable row level security;
alter table public.categories      enable row level security;
alter table public.category_access enable row level security;
alter table public.entries         enable row level security;

-- ---------------------------------------------------------------------------
-- organizations: members read their own org; the super admin edits settings.
-- Created only by setup_organization(); never deleted from the client.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.organizations from authenticated;
grant update (name, timezone, week_start) on public.organizations to authenticated;

create policy "Members can view their organization"
  on public.organizations for select to authenticated
  using (id = private.auth_org_id());

create policy "Super admin can update their organization"
  on public.organizations for update to authenticated
  using (private.is_super_admin(id))
  with check (private.is_super_admin(id));

-- ---------------------------------------------------------------------------
-- profiles: everyone in the org can see each other (names for "Added by", member pickers).
-- A user may only change their own name; everything else goes through Edge Functions.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.profiles from authenticated;
grant update (first_name, last_name) on public.profiles to authenticated;

create policy "Users can view profiles in their organization"
  on public.profiles for select to authenticated
  using (org_id = private.auth_org_id());

create policy "Users can update their own name"
  on public.profiles for update to authenticated
  using (id = auth.uid() and status <> 'disabled')
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- spaces: visible to the super admin and to members; only the super admin writes.
-- (Written inline rather than via space_role() so INSERT … RETURNING can see the new row.)
-- ---------------------------------------------------------------------------
create policy "Members can view their spaces"
  on public.spaces for select to authenticated
  using (private.is_super_admin(org_id) or private.is_space_member(id));

create policy "Super admin can create spaces"
  on public.spaces for insert to authenticated
  with check (private.is_super_admin(org_id));

create policy "Super admin can update spaces"
  on public.spaces for update to authenticated
  using (private.is_super_admin(org_id))
  with check (private.is_super_admin(org_id));

create policy "Super admin can delete spaces"
  on public.spaces for delete to authenticated
  using (private.is_super_admin(org_id));

-- ---------------------------------------------------------------------------
-- space_members: members can see who is in their space; only the super admin manages.
-- ---------------------------------------------------------------------------
create policy "Members can view space membership"
  on public.space_members for select to authenticated
  using (private.has_space_role(space_id, 'viewer'));

create policy "Super admin can add members"
  on public.space_members for insert to authenticated
  with check (private.is_super_admin(private.space_org_id(space_id)));

create policy "Super admin can change member roles"
  on public.space_members for update to authenticated
  using (private.is_super_admin(private.space_org_id(space_id)))
  with check (private.is_super_admin(private.space_org_id(space_id)));

create policy "Super admin can remove members"
  on public.space_members for delete to authenticated
  using (private.is_super_admin(private.space_org_id(space_id)));

-- ---------------------------------------------------------------------------
-- folders / files: members read; admins and the super admin write.
-- ---------------------------------------------------------------------------
create policy "Members can view folders"
  on public.folders for select to authenticated
  using (private.has_space_role(space_id, 'viewer'));

create policy "Admins can create folders"
  on public.folders for insert to authenticated
  with check (private.has_space_role(space_id, 'admin'));

create policy "Admins can update folders"
  on public.folders for update to authenticated
  using (private.has_space_role(space_id, 'admin'))
  with check (private.has_space_role(space_id, 'admin'));

create policy "Admins can delete folders"
  on public.folders for delete to authenticated
  using (private.has_space_role(space_id, 'admin'));

create policy "Members can view files"
  on public.files for select to authenticated
  using (private.has_space_role(space_id, 'viewer'));

create policy "Admins can create files"
  on public.files for insert to authenticated
  with check (private.has_space_role(space_id, 'admin'));

create policy "Admins can update files"
  on public.files for update to authenticated
  using (private.has_space_role(space_id, 'admin'))
  with check (private.has_space_role(space_id, 'admin'));

create policy "Admins can delete files"
  on public.files for delete to authenticated
  using (private.has_space_role(space_id, 'admin'));

-- ---------------------------------------------------------------------------
-- categories: members see unrestricted ones plus restricted ones they were granted;
-- admins and the super admin write (visibility changes are limited to the super admin
-- by the categories_validate trigger).
-- ---------------------------------------------------------------------------
create policy "Members can view visible categories"
  on public.categories for select to authenticated
  using (private.can_see_category_row(space_id, id, is_restricted));

create policy "Admins can create categories"
  on public.categories for insert to authenticated
  with check (private.has_space_role(space_id, 'admin'));

create policy "Admins can update visible categories"
  on public.categories for update to authenticated
  using (private.has_space_role(space_id, 'admin') and private.can_see_category_row(space_id, id, is_restricted))
  with check (private.has_space_role(space_id, 'admin'));

create policy "Admins can delete visible categories"
  on public.categories for delete to authenticated
  using (private.has_space_role(space_id, 'admin') and private.can_see_category_row(space_id, id, is_restricted));

-- ---------------------------------------------------------------------------
-- category_access: users see their own grants; only the super admin manages them.
-- ---------------------------------------------------------------------------
create policy "Users see their own grants; super admin sees all"
  on public.category_access for select to authenticated
  using (user_id = auth.uid() or private.is_super_admin(private.category_org_id(category_id)));

create policy "Super admin can grant category access"
  on public.category_access for insert to authenticated
  with check (private.is_super_admin(private.category_org_id(category_id)));

create policy "Super admin can revoke category access"
  on public.category_access for delete to authenticated
  using (private.is_super_admin(private.category_org_id(category_id)));

-- ---------------------------------------------------------------------------
-- entries: visible when the category is visible; editors and above write, and only with
-- categories they can see.
-- ---------------------------------------------------------------------------
create policy "Members can view entries in visible categories"
  on public.entries for select to authenticated
  using (private.can_see_category(category_id));

create policy "Editors can add entries"
  on public.entries for insert to authenticated
  with check (private.has_space_role(space_id, 'editor') and private.can_see_category(category_id));

create policy "Editors can update entries"
  on public.entries for update to authenticated
  using (private.has_space_role(space_id, 'editor') and private.can_see_category(category_id))
  with check (private.has_space_role(space_id, 'editor') and private.can_see_category(category_id));

create policy "Editors can delete entries"
  on public.entries for delete to authenticated
  using (private.has_space_role(space_id, 'editor') and private.can_see_category(category_id));
