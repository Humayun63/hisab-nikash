# Hisab Nikash — Product & Technical Spec

Version 0.1 (draft) · 2026-11-02

## 1. Overview

Hisab Nikash is a multi-tenant web app for recording daily financial entries (income and expenses), sorting them into categories automatically, and seeing totals on a dashboard. Each organization is owned by one **super admin**. The super admin creates users, puts them in **spaces** with a role, and can hide sensitive categories from specific people (for example, bosses who only view).

### Goals
- Make adding an entry fast: amount, category, date (defaults to today), note.
- Calculate category totals automatically instead of by hand.
- Show totals for today, this week, month, year or a custom range, broken down by category.
- Let assistants add entries and let bosses view, with access controlled per space.

### Non-goals (v1)
- Currency conversion between spaces
- Budgets, recurring entries, receipt uploads, bank sync
- Mobile apps (the web app must be responsive, though)

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + JavaScript (no TypeScript), Vite |
| Styling | TailwindCSS |
| Routing | React Router |
| Server state | TanStack Query |
| Forms / validation | react-hook-form + zod |
| Charts | Recharts |
| Dates | date-fns (+ date-fns-tz) |
| Backend | Supabase: Postgres, Auth, Row Level Security (RLS), Edge Functions |
| Transactional email | Supabase Auth emails (verification and password reset). Invitations are sent from an Edge Function through Resend or SMTP. |
| Hosting | Static frontend on Vercel or Netlify, plus the Supabase project |

## 3. Concepts & Hierarchy

```
Organization (tenant, owned by 1 super admin)
└── Space            (has a currency and members with roles)
    ├── Categories   (defined per space; each is Income or Expense; can be restricted)
    └── Folder
        └── File     (a ledger, e.g. "November 2026 – Office")
            └── Entry (amount, category, date, note, added by)
```

- **Organization**: created when a super admin registers. All users, spaces and data belong to exactly one organization, and organizations are fully isolated from each other.
- **Space**: a workspace, e.g. "Office", "Personal" or "Project X". It has its own currency (e.g. BDT ৳, USD $) and its own member list.
- **Category**: belongs to a space and is shared by every file in that space. Its type (Income or Expense) decides the type of each entry in it, so the entry form doesn't need a separate type field.
- **Folder / File**: organize entries. Folders are one level deep. Every file lives in a folder.
- **Entry**: one financial record.

## 4. Roles & Permissions

The **super admin** role is organization-wide and applies to every space. Every other role is assigned **per space**, so a user can be an editor in "Office" and a viewer in "Project X". A user only sees the spaces they're a member of.

| Action | Viewer | Editor | Admin | Super admin |
|---|:-:|:-:|:-:|:-:|
| View dashboard, files and entries (visible categories only) | ✅ | ✅ | ✅ | ✅ (all) |
| Add / edit / delete entries | – | ✅ | ✅ | ✅ |
| Create / rename / delete folders and files | – | – | ✅ | ✅ |
| Create / edit / delete categories | – | – | ✅ | ✅ |
| Set category visibility (restrict to members) | – | – | – | ✅ |
| Create / edit / delete spaces | – | – | – | ✅ |
| Add members to a space / change their role | – | – | – | ✅ |
| Create users, edit their info, reset their passwords, disable them | – | – | – | ✅ |
| Organization settings | – | – | – | ✅ |

Assumptions:
- Editors can edit or delete **any** entry in their space, not only their own. The audit fields (§6) record who changed what.
- Admins can create categories, but only the super admin controls visibility.

## 5. Features

### 5.1 Registration (super admins only)
- Public `/register` page with fields: First name, Last name, Email, Password, Confirm password.
- Password rule: at least 8 characters, including at least one letter and one number.
- Registering creates an unverified auth user. Supabase sends a verification email, and the user can't log in until they click the link.
- After the first verified login, a one-step setup asks for the **organization name** (prefilled with "{First name}'s Organization"), **timezone** (defaults to the browser's timezone, or `Asia/Dhaka` if that isn't available), **week start** (default Saturday) and a **first space** with its name and currency. On completion the app creates the organization, sets the user as super admin, and creates the first space.
- Users created by a super admin never use this page.

### 5.2 Login (all users)
- `/login` asks for email and password.
- "Forgot password" sends a reset email through Supabase. The reset page is `/reset-password`.
- An unverified super admin sees "Please verify your email" with a **Resend** button. Supabase doesn't reveal whether an email exists or is unverified (both return "invalid credentials"), so the login page offers Resend after any failed sign-in. Resends are limited to one per minute.
- The reset link signs the user in with a *recovery session*. Until they choose a new password, every page sends them back to `/reset-password`.
- A disabled user sees "Your account has been disabled. Contact your administrator."
- If `must_change_password` is set, the user is sent to `/change-password` before they can use the app (§5.3). The server clears the flag only when the password actually changes (a trigger on `auth.users`), so the client can't skip the step.
- **Email delivery:** Supabase's built-in email sender only delivers to the project's team members and allows about 2 emails an hour. Real users need custom SMTP, configured under Auth → SMTP (e.g. Resend), before launch.

### 5.3 User management (super admin)
`/settings/users`

- **List**: name, email, status (Invited / Active / Disabled), the spaces they belong to with their role in each, and the date they were created.
- **Create user**: First name, Last name, Email, Password, plus optional space assignments (space + role, can repeat).
  - The account is created immediately with the email marked confirmed, so **the user can log in even without accepting the invitation**.
  - An invitation email is sent. It contains the inviter's name, the organization name and a login link, but **no password**. The super admin gives the initial password to the user separately.
  - Status is `Invited` until the user's first login (or until they click the invitation link), then `Active`.
  - `must_change_password = true` by default. The super admin can turn this off when creating the user.
- **Edit user**: name, email, password (set a new one), status (enable/disable), space assignments and roles.
- **Resend invitation** while the status is `Invited`.
- **Delete user**: removes their login. Their entries remain, and their name shows as "Deleted user".
- A super admin can't disable or delete themselves.

All of these actions need Supabase admin privileges, so they run in an Edge Function (§8), never in the browser.

### 5.4 Spaces (super admin)
- Create, rename or delete a space with a name, currency (ISO code + symbol) and optional description.
- Deleting a space asks you to type its name to confirm, then removes all its folders, files, categories and entries.
- **Members tab**: add an existing user with a role (viewer, editor or admin), change a role, or remove a member.
- The space switcher in the top bar lists only the spaces the current user belongs to. Super admins see all spaces.

### 5.5 Folders & files (admin, super admin)
- The sidebar shows the current space's folders, with their files nested underneath.
- Create, rename and delete folders and files. Deleting asks for confirmation and removes everything inside.
- Each file shows its income total, expense total and net (counting visible categories only).

### 5.6 Categories (admin, super admin)
`/spaces/:spaceId/categories`

- Fields: name (unique within the space), type (Income / Expense) and color (used in charts).
- A category can't be deleted while it has entries. It can be **archived** instead: it stays in reports but can't be chosen for new entries.
- **Visibility (super admin only)**: either *Everyone in this space* (the default) or *Only selected members*, with a picker of space members.
  - Members who can't see a restricted category don't see it anywhere: not in category lists, not in entry lists, and not in dashboard totals. RLS enforces this on the server, not just the UI.
  - The super admin always sees every category.

### 5.7 Entries (editor, admin, super admin add; everyone views)
Shown on the file page at `/spaces/:spaceId/files/:fileId`.

- **Quick add form** at the top of the file page, built for speed:
  - Amount (required, > 0, 2 decimals)
  - Category (required, searchable dropdown grouped by Income / Expense, excluding archived categories)
  - Date (defaults to today in the org timezone; can't be a future date)
  - Note (optional, max 500 characters)
  - Press Enter to save, and the form stays open with the category kept for the next entry.
- **Entry table** with columns: Date, Category (color chip), Type, Amount, Note, Added by, and Actions (edit/delete, for editors and above).
  - **Sort** by date, category, amount or added by.
  - **Filter** by date range, categories (multi-select), type and added by.
  - A totals bar shows income, expense and net for the filtered rows.
  - Rows are paginated, 50 per page.
- **Space-wide entries view** at `/spaces/:spaceId/entries`: the same table across all files in the space, with an extra File column and a File filter.
- Editing and deleting happen in a modal. Delete asks for confirmation.

### 5.8 Dashboard
`/spaces/:spaceId/dashboard` (the landing page after login opens the last-used space)

- **Period selector**: Today (default), This week, This month, This year, or Custom range. Weeks start on the day set in organization settings, default Saturday.
- **Scope filter**: the whole space (default), one folder or one file.
- **Summary cards**: total expense, total income and net for the selected period, each compared with the previous period of the same length (↑/↓ %).
- **Expense by category**: a donut chart plus a table showing category, amount, % of total and number of entries. Clicking a row opens the space-wide entries view filtered to that category and period.
- **Income by category**: the same layout as expense.
- **Trend chart**: income and expense bars per day (for a week or month), per month (for a year), or bucketed automatically for a custom range.
- **Recent entries**: the latest 10, each linking to its file.
- Every figure only counts categories the viewer can see, and amounts are shown in the space's currency.

### 5.9 Organization settings (super admin)
- Organization name, timezone, week start day
- Profile: name, email, password (available to every user for their own account)

## 6. Data Model (Postgres / Supabase)

All tables have `id uuid pk default gen_random_uuid()` and `created_at timestamptz default now()` unless stated otherwise. Amounts are `numeric(14,2)`.

```
organizations
  name text, timezone text default 'Asia/Dhaka', week_start smallint default 6  -- 0=Sun … 6=Sat
  owner_id uuid → auth.users

profiles                      -- 1:1 with auth.users
  id uuid pk → auth.users
  org_id uuid → organizations
  first_name text, last_name text, email text
  is_super_admin boolean default false
  status text check in ('invited','active','disabled')
  must_change_password boolean default false
  invited_at timestamptz, accepted_at timestamptz, last_login_at timestamptz

spaces
  org_id → organizations, name text, description text
  currency_code text, currency_symbol text
  created_by → profiles

space_members                 -- pk (space_id, user_id)
  space_id → spaces on delete cascade
  user_id → profiles on delete cascade
  role text check in ('viewer','editor','admin')

folders
  space_id → spaces on delete cascade, name text, created_by → profiles

files
  folder_id → folders on delete cascade
  space_id → spaces          -- denormalized for RLS and queries
  name text, created_by → profiles

categories
  space_id → spaces on delete cascade
  name text, type text check in ('income','expense'), color text
  is_restricted boolean default false
  archived_at timestamptz null
  unique (space_id, lower(name))

category_access               -- used only when categories.is_restricted
  category_id → categories on delete cascade
  user_id → profiles on delete cascade
  pk (category_id, user_id)

entries
  space_id → spaces          -- denormalized
  file_id → files on delete cascade
  category_id → categories on delete restrict
  amount numeric(14,2) check (amount > 0)
  entry_date date
  note text
  created_by → profiles on delete set null
  updated_by → profiles on delete set null
  updated_at timestamptz
```

Indexes: `entries (space_id, entry_date)`, `entries (file_id, entry_date)`, `entries (category_id)`, `space_members (user_id)`.

An entry's type is taken from its category: `categories.type`.

## 7. Security (Row Level Security)

Helper SQL functions (`security definer`, `stable`):
- `is_super_admin(org_id)`: true if the current user is that organization's super admin.
- `space_role(space_id)`: returns `'super_admin'` / `'admin'` / `'editor'` / `'viewer'` / null.
- `can_see_category(category_id)`: true if the user is the super admin, or the category isn't restricted, or the user is in `category_access`.

Policies, summarized:
- **profiles**: users read profiles in their own organization and update only their own name. All other changes go through the Edge Function.
- **spaces**: readable if `space_role` isn't null. Only the super admin can write.
- **space_members, category_access**: readable by space members. Only the super admin can write.
- **folders, files**: readable by space members. Admins and the super admin can write.
- **categories**: readable if the user is a member and `can_see_category`. Admins and the super admin can write. Only the super admin can change `is_restricted` (enforced with a trigger).
- **entries**: readable if the user is a member and `can_see_category(category_id)`. Editors and above can insert, update and delete, but only with a category they can see. A trigger sets `created_by`, `updated_by` and `updated_at`.

Dashboard numbers come from Postgres functions (`rpc`). For speed they run as `security definer` and apply the same visibility rules once per call (in `private.visible_entries`) instead of per row through RLS. The permission tests check that hidden categories never reach the totals:
- `dashboard_summary(space_id, from, to, folder_id?, file_id?)` returns income, expense, net and the previous period's values.
- `dashboard_by_category(space_id, from, to, folder_id?, file_id?)`
- `dashboard_trend(space_id, from, to, bucket, folder_id?, file_id?)`

## 8. Edge Functions

There is one function, `admin-users` (`supabase/functions/admin-users/`), deployed with `verify_jwt = false`. It checks the caller itself with `auth.getUser(token)`: the caller must be an enabled super admin, and every target user must be in the caller's organization. The validation and permission rules are in `logic.js`, which Vitest unit-tests.

| Action | What it does |
|---|---|
| `create` | Creates the auth user (email confirmed, with the super admin's password), the profile (`status='invited'`, `must_change_password` defaults to true) and the space memberships, then sends the invitation. If any step after creating the auth user fails, the auth user is deleted, so no orphan account can call `setup_organization`. |
| `update` | Changes name, email, password, `must_change_password`, enabled/disabled and the full list of space roles (`memberships`), all in one request. |
| `delete` | Deletes the auth user. The profile and memberships cascade. Entries remain, with `created_by = null`. |
| `resend_invitation` | Sends the invitation again (refused for disabled users). |

**Ordering rules inside `update`:**
- **Disable:** the profile is set to `disabled` first, then the Auth ban is applied, so RLS cuts access even if the ban fails.
- **Enable:** the ban is lifted first, then the profile goes back to `active`, or to `invited` if the user never signed in.
- **Password:** a password change clears `must_change_password` via the `auth.users` trigger, so any explicit `must_change_password` value is written afterwards.
- **Self-protection:** the super admin can't disable or delete themselves, and is never given space memberships.

**Invitations** are Supabase magic-link emails, sent with `signInWithOtp` and `shouldCreateUser: false`.
- The link signs the user in through `/auth/callback`, which records the login and marks the invitation accepted.
- If sending fails, the user is still created. The UI tells the super admin to share the sign-in details directly.
- The link goes to the request's origin only if it is listed in `APP_URL` / `ALLOWED_ORIGINS` (function secrets; defaults are `http://localhost:5173` and `http://127.0.0.1:5173`).
- A branded template (`supabase/templates/invitation.html`) shows the organization and inviter, read from the user's metadata. Supabase only allows custom templates with custom SMTP, so the template stays commented out in `config.toml` until SMTP is set up. Until then, the default "magic link" email is sent.

Spaces, their settings and space members are managed straight from the browser under RLS (super admin only, §7). User accounts and their space roles go through `admin-users`.

First-login setup doesn't need an Edge Function. `setup_organization(...)` is a Postgres RPC that creates the organization, the super admin profile and the first space in one transaction. It refuses users who already have a profile or whose email isn't verified.

On a user's first successful login (password or email link), the client calls the RPC `mark_login()`. It sets `last_login_at`, and if the status is `invited` it changes it to `active` and sets `accepted_at`.

## 9. Pages & Routes

| Route | Access |
|---|---|
| `/register`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email` | Public |
| `/setup` | Newly verified super admin with no organization yet |
| `/change-password` | Users with `must_change_password` |
| `/spaces/:spaceId/dashboard` | Members |
| `/spaces/:spaceId/entries` | Members |
| `/spaces/:spaceId/files/:fileId` | Members |
| `/spaces/:spaceId/categories` | Admin and super admin (viewers and editors don't see this link) |
| `/spaces/:spaceId/settings` (general, members) | Super admin |
| `/settings/users` | Super admin |
| `/settings/organization` | Super admin |
| `/settings/profile` | Everyone |

Layout: a top bar with the space switcher and user menu, a left sidebar with Dashboard, All entries, Categories and the folder/file tree, and a main content area. On mobile the sidebar collapses into a drawer.

## 10. Non-functional Requirements
- **Responsive** down to 360px wide, because entries will often be added from a phone.
- **Performance**: the dashboard loads in under 1.5s with 50k entries in a space. Aggregation happens in SQL, never in the browser.
- **Dates**: `entry_date` is a plain date. "Today" and period boundaries use the organization's timezone.
- **Money**: never use floating point for stored values. Display with `Intl.NumberFormat` and the space's currency.
- **Validation** on both the client (zod) and the database (constraints and RLS).
- **Accessibility**: labelled form fields, keyboard-usable dialogs, and chart colors that are also shown as text in tables.
- **Secrets**: only the Supabase anon key is in the frontend. The service-role and email API keys live only in Edge Functions.

## 11. Project Structure (proposed)

```
hisab-nikash/
├── src/
│   ├── main.jsx, App.jsx, router.jsx
│   ├── lib/            supabaseClient.js, queryClient.js, format.js, dates.js
│   ├── auth/           AuthProvider.jsx, RequireAuth.jsx, RequireRole.jsx
│   ├── hooks/          useSpaceRole.js, useEntries.js, useDashboard.js …
│   ├── components/     ui/ (Button, Input, Modal, Select, Table…), layout/, charts/
│   └── pages/          auth/, setup/, dashboard/, entries/, files/, categories/, settings/
├── supabase/
│   ├── migrations/     schema, RLS, functions, triggers
│   ├── functions/      admin-create-user/, admin-update-user/, …
│   └── seed.sql
├── index.html, tailwind.config.js, vite.config.js, package.json
└── SPEC.md
```

## 12. Milestones

1. **Foundation**: Vite + Tailwind + Router setup, Supabase project, schema and RLS migrations.
2. **Auth**: register, email verification, login, forgot/reset password, organization setup.
3. **User & space management**: Edge Functions, users page, invitation email, spaces and members.
4. **Structure**: folders, files, categories with visibility.
5. **Entries**: quick add, table with sorting, filtering and totals, plus the space-wide view.
6. **Dashboard**: summary, category breakdowns, trend chart, custom range.
7. **Polish**: responsive pass, empty states, error handling, and RLS tests (one test user per role, checking that hidden categories never leak).

## 12a. Database rules added in milestone 1

The database also enforces these, beyond §7:
- **Entries:** can't be future-dated (checked against the organization's timezone) and can't use an archived category. `created_by` and `updated_by` are always set from the logged-in user.
- **Categories:** a category's type can't change once it has entries. Making a restricted category public again clears its access list.
- **Folders and files:** only someone who can see every entry inside one can delete it. In practice an admin can't delete a folder or file containing entries in restricted categories, but the super admin can.
- **Space members:** must belong to the same organization. The super admin is never added as a member, since they already see every space.
- **Known limitation:** an admin who creates or renames a category to the same name as a restricted category they can't see gets a "duplicate name" error. That tells them a hidden category with that name exists, but nothing else about it.

**Auth configuration** lives in `supabase/config.toml` and is applied with `npx supabase config push`. Run `config diff` first.
- Site URL `http://localhost:5173`, with redirects allowed to `http://localhost:5173/**`. Add the production URL at deploy time.
- Passwords: at least 8 characters, with letters and digits.
- **Sign-in rate limit:** raised to 200 per 5 minutes (from 30) so the e2e suite doesn't hit `429`s. Lower it again for production.

Tests: run `npm test` for the Vitest unit tests and `npm run test:e2e` for the Playwright tests. The `db` project seeds test users for every role (`*@e2e.hisab-nikash.test`) into the linked Supabase project, tests all of the above through the real API, and then removes them.

## 13. Open Questions / Assumptions to Confirm
1. **Week start**: defaults to Saturday (common in Bangladesh). Should it be Sunday or Monday instead?
2. **Initial password delivery**: the invitation email does **not** include the password, for security. The super admin shares it separately, and the user must change it on first login. Is that OK?
3. **Editors** can edit or delete other people's entries. Should they be limited to their own?
4. **Future-dated entries** are blocked. Do you ever need to record planned or upcoming entries?
5. **Export** (CSV/Excel/PDF) of entries and dashboard data isn't in v1. Should it be added?
6. **Audit history** (a log of every edit and delete): v1 only stores who created or last updated each entry. Do you need full history?
7. **One organization per user**: an email belongs to one organization only. Is that fine?
