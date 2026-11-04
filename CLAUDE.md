# Hisab Nikash: working notes for Claude

Product and technical spec: [SPEC.md](SPEC.md). The milestones are listed in §12.

## ⚠️ Next step: milestone 4 is IN PROGRESS on branch `milestone-4`

Milestone 3 is complete and merged, including its browser check and the `milestone-3-fixes` phone fix.

Milestone 4 (folders, files, categories; SPEC.md §5.5–5.6) is **partly built and not yet tested**. Continue on `git checkout milestone-4`.

**Done** (committed on `milestone-4` as work in progress; `npm run build`, `oxlint` and the existing 274 unit tests pass):
- **Migration** `supabase/migrations/20261104120000_structure_rpcs.sql`, already applied to the hosted DB:
  - `space_file_totals(space)`: income, expense and entry count per file, for visible categories only.
  - `space_category_usage(space)`: entries per category, under RLS.
- **Data hooks and helpers:**
  - `src/hooks/useSpaceData.js`: `useSpaceRole`, `useFolders`, `useFileTotals`, `useCategories`, `useCategoryUsage`, `useCategoryAccess`.
  - `src/lib/format.js` (`formatMoney`), `src/lib/structureErrors.js`, `hasRole()` in `src/lib/roles.js`.
  - `nameSchema` and `categorySchema` in `src/lib/validation.js`.
- **UI:**
  - `src/components/ui/NameModal.jsx`.
  - `src/auth/RequireSpaceRole.jsx` (admin-only pages inside a space).
  - `src/components/layout/SpaceLayout.jsx`: the space sidebar with Overview, Categories (admin+), Settings (super admin) and the folder/file tree with net totals. Admins can create, rename and delete folders and create files. On phones it's a collapsible "Space menu".
  - `src/pages/spaces/FilePage.jsx`: file totals (income, expense, net), rename and delete file. Entries come in milestone 5.
  - `src/pages/spaces/SpacePage.jsx`: now an overview with folder, file and category counts.
  - `src/pages/spaces/CategoriesPage.jsx` and `CategoryModals.jsx`: create and edit (name, type, color; the type is locked once a category has entries), archive/restore, delete (only with 0 entries), and visibility for the super admin only (everyone, or selected members via `category_access`).
- **Routes** in `src/router.jsx`: `/spaces/:spaceId` uses `SpaceLayout`, with children: index (overview), `files/:fileId`, `categories` (admin+) and `settings` (super admin).

**Remaining**, following the workflow below:
1. Quick manual browser check of the new pages, as a super admin, an admin and a viewer, at phone and desktop sizes.
2. Run the full existing e2e suite. Milestone 3 tests that visit `/spaces/:id` or `/spaces/:id/settings` may need locator updates now that those pages sit inside `SpaceLayout`.
3. Seed a new isolated **Org E** for milestone 4 tests: a super admin, an admin, an editor and a viewer; a space with folders, files, categories (one restricted) and some entries.
4. Sonnet subagents:
   - unit tests (hooks/helpers, NameModal, SpaceLayout, FilePage, CategoriesPage, the modals);
   - UI tests (`e2e/ui/structure.spec.js`);
   - DB/API tests for the two new RPCs, including restricted-category exclusion and the non-member error;
   - read-only review.

   Only one Playwright run at a time.
5. Update SPEC.md (§5.5, §5.6, §9 routes; mention the two RPCs). Then final verification (PASS), merge to `main`, push, and delete this section.

A known flaky test to watch: `e2e/ui/management.spec.js` "setting a new password requires a change at next sign-in" failed once under load and passed on rerun.

## Milestone workflow (follow it for every milestone without being asked)

1. **Branch:** start from an up-to-date `main` and create `milestone-N`.
2. **Build** the milestone from SPEC.md. Update SPEC.md wherever the implementation differs or adds rules.
3. **Testing and review use subagents running the Sonnet model** (`model: "sonnet"`), launched in parallel:
   - **Unit tests:** Vitest + React Testing Library, colocated as `src/**/*.test.{js,jsx}`. Edge Function logic (`supabase/functions/*/logic.js`, written without Deno APIs) is tested from `src/lib/*.test.js`, because Vitest only collects tests from `src/`. Supabase is always mocked.
   - **UI tests:** Playwright browser tests in `e2e/ui/`. They sign in as seeded users and cover the milestone's flows end to end in Chromium.
   - **Database / API tests:** Playwright tests in `e2e/db/`. They test RLS, RPCs and Edge Functions per role, through the real Supabase API.
   - **Code review:** read-only, covering correctness, security (RLS, privilege escalation, data leaks) and accessibility.

   Test subagents only add test files. They report suspected app bugs instead of "fixing" app code. I fix the findings, then re-run everything.

   **Only one Playwright run at a time.** Every e2e run reseeds and cleans up the same hosted Supabase project, so parallel runs wipe each other's data.
   - The unit test and review subagents can run in parallel with anything.
   - The UI and DB/API test subagents may *write* tests in parallel, but they must not run `npx playwright test` at the same time as each other. Tell them to run only their own project or file, and to rerun before reporting anything as flaky.
   - Each milestone's e2e tests should use their own seeded organization (Org A/B: permissions, Org C: management UI, Org D: admin-users API), so test files don't interfere.
   **Standing permission from the project owner (given 2026-11-02).** Claude and its subagents may do the following without asking each time:
   - Test in the browser (Playwright Chromium, and the Claude in Chrome extension when it is connected) against the local dev server.
   - Seed and clean up e2e test data in the hosted Supabase project (`npx supabase db query --remote --yes -f e2e/fixtures/cleanup.sql` and `… seed.sql`), and create or delete `*@e2e.hisab-nikash.test` test users there.

   This covers test data only. It does not cover deleting or changing real (non-test) data, schemas or settings outside the milestone's own migrations and config changes. If a permission check still blocks a subagent, the main session runs the step itself and says so in the report.
4. **Final verification:** a separate Sonnet subagent runs `npm run build`, `npx oxlint src`, `npm test` (twice) and `npm run test:e2e` (twice). It also does an exploratory browser check at phone (390px) and desktop widths with screenshots, and confirms the e2e test data was cleaned up. It must report **PASS**.
5. **Only after a PASS:** commit on the branch, push it, merge into `main` with `--no-ff`, and push `main`. Commit messages end with the Co-Authored-By line.
6. **Report** to the user: what was built, the test numbers, review fixes, and anything they need to do.

## Environment

- **Supabase is a hosted project only.** There's no Docker or local stack. The CLI is a dev dependency: `npx supabase …`.
  - Migrations: add a new file in `supabase/migrations/`. Never edit an applied migration. Apply with `npx supabase db push --remote --yes`.
  - SQL: `npx supabase db query --remote --yes "…"`. Use `--read-only` for reads.
  - Auth config: edit `supabase/config.toml`. Run `npx supabase config diff` and make sure only the intended keys change, then `npx supabase config push --yes`.
  - Edge Functions: `npx supabase functions deploy <name> --use-api`.
- **The `.env` file** holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (a publishable key). It is never committed. Secret keys never go in `.env`.
- **The e2e suite** seeds `*@e2e.hisab-nikash.test` users (`e2e/fixtures/seed.sql`, with ids in `e2e/fixtures/ids.js`) and removes them afterwards.
  - Supabase rejects sign-up and emails for `.test` addresses, so UI tests intercept those network calls.
  - Each mutating test user is used by exactly one test.
- **Scripts:**
  - `npm run dev`: the app at http://localhost:5173
  - `npm test`: unit tests
  - `npm run test:e2e`: all Playwright projects (`chromium` smoke, `db`, `ui`)

## Conventions

- **Code:** React 19 with plain JavaScript (no TypeScript) and Tailwind v4. Data fetching uses TanStack Query, forms use react-hook-form + zod, and routing uses React Router.
- **Shared UI** lives in `src/components/ui/`. Accessible labels are required, because tests use `getByLabel` and `getByRole`.
- **Security:** RLS is the source of truth. The UI hides actions only for convenience. Anything that needs the service role goes in an Edge Function that checks the caller itself.
