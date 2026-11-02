-- Core schema: organizations, users, spaces, folders/files, categories, entries.
-- See SPEC.md §3 and §6.

create extension if not exists pgcrypto with schema extensions;

-- Helpers that are used by policies and triggers live here; this schema is not exposed by the API.
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Organizations (one per super admin)
-- ---------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  timezone    text not null default 'Asia/Dhaka',
  week_start  smallint not null default 6 check (week_start between 0 and 6), -- 0 = Sunday … 6 = Saturday
  owner_id    uuid not null unique references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users, created by setup_organization or the admin Edge Functions)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  org_id                uuid not null references public.organizations (id) on delete cascade,
  first_name            text not null check (char_length(btrim(first_name)) between 1 and 50),
  last_name             text not null check (char_length(btrim(last_name)) between 1 and 50),
  email                 text not null,
  is_super_admin        boolean not null default false,
  status                text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  must_change_password  boolean not null default false,
  invited_at            timestamptz,
  accepted_at           timestamptz,
  last_login_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index profiles_org_id_idx on public.profiles (org_id);
-- Exactly one super admin per organization.
create unique index profiles_one_super_admin_per_org on public.profiles (org_id) where is_super_admin;

-- ---------------------------------------------------------------------------
-- Spaces and membership
-- ---------------------------------------------------------------------------
create table public.spaces (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 100),
  description      text check (char_length(description) <= 500),
  currency_code    text not null check (currency_code ~ '^[A-Z]{3}$'),
  currency_symbol  text not null check (char_length(currency_symbol) between 1 and 5),
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index spaces_org_name_key on public.spaces (org_id, lower(name));

create table public.space_members (
  space_id    uuid not null references public.spaces (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('viewer', 'editor', 'admin')),
  created_at  timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index space_members_user_id_idx on public.space_members (user_id);

-- ---------------------------------------------------------------------------
-- Folders and files
-- (id, space_id) uniques let child tables use composite foreign keys, which guarantees
-- that a file, category and entry always belong to the same space.
-- ---------------------------------------------------------------------------
create table public.folders (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, space_id)
);

create unique index folders_space_name_key on public.folders (space_id, lower(name));

create table public.files (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null,
  space_id    uuid not null references public.spaces (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, space_id),
  foreign key (folder_id, space_id) references public.folders (id, space_id) on delete cascade
);

create unique index files_folder_name_key on public.files (folder_id, lower(name));
create index files_space_id_idx on public.files (space_id);

-- ---------------------------------------------------------------------------
-- Categories and per-member visibility
-- ---------------------------------------------------------------------------
create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references public.spaces (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 60),
  type           text not null check (type in ('income', 'expense')),
  color          text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_restricted  boolean not null default false,
  archived_at    timestamptz,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, space_id)
);

create unique index categories_space_name_key on public.categories (space_id, lower(name));

-- Members allowed to see a restricted category (ignored when is_restricted = false).
create table public.category_access (
  category_id  uuid not null references public.categories (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (category_id, user_id)
);

create index category_access_user_id_idx on public.category_access (user_id);

-- ---------------------------------------------------------------------------
-- Entries
-- ---------------------------------------------------------------------------
create table public.entries (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces (id) on delete cascade,
  file_id      uuid not null,
  category_id  uuid not null,
  amount       numeric(14, 2) not null check (amount > 0),
  entry_date   date not null default current_date,
  note         text check (char_length(note) <= 500),
  created_by   uuid references public.profiles (id) on delete set null,
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (file_id, space_id) references public.files (id, space_id) on delete cascade,
  -- NO ACTION (not RESTRICT) so deleting a whole space can cascade through entries and categories
  -- in one statement, while deleting a single category that still has entries is refused.
  foreign key (category_id, space_id) references public.categories (id, space_id)
);

create index entries_space_date_idx on public.entries (space_id, entry_date);
create index entries_file_date_idx on public.entries (file_id, entry_date);
create index entries_category_id_idx on public.entries (category_id);
create index entries_created_by_idx on public.entries (created_by);
