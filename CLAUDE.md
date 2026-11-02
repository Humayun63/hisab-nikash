# Hisab Nikash: working notes for Claude

Product and technical spec: [SPEC.md](SPEC.md). The milestones are listed in §12.

## ⚠️ Next step: do this BEFORE starting milestone 4

Milestone 3 (user & space management) is merged into `main`, but its final verification was only **partial**:
- Build, lint, unit tests (274) and the full Playwright suite (98) all passed twice.
- The exploratory browser check (workflow step 4) was not done.

When work resumes, finish this check first. Only then start milestone 4.

1. Seed the test data: `npx supabase db query --remote --yes -f e2e/fixtures/cleanup.sql < /dev/null`, then the same with `e2e/fixtures/seed.sql`. This is allowed by the standing permission below.
2. Make sure the dev server is running (`npm run dev`). Use the Claude in Chrome extension if it's connected, otherwise a Playwright Chromium script. Check at **phone (390×844)** and **desktop (1280×800)** sizes, and look at the screenshots.
   - **As `uisa@e2e.hisab-nikash.test` (Org C super admin; password in `e2e/fixtures/ids.js`):**
     - Pages: Home, Users, Spaces, and a space's settings page.
     - Add user modal: fill it and use Generate password. Create at most one user, with an `@e2e.hisab-nikash.test` email.
     - That user's Edit modal.
     - The delete-space confirm dialog (Cancel it).
   - **As `uimember@e2e.hisab-nikash.test` (editor):** the Users and Spaces links are absent, and `/settings/users` redirects to `/`.
   - **Look for:**
     - Horizontal page scroll (`scrollWidth > innerWidth`), clipped or overlapping elements, and whether modals are usable on a phone.
     - Visible keyboard focus when tabbing through the Add user modal.
     - Focus returning to the "Add user" button after closing the modal with Escape.
     - Console or page errors. A 400 from a deliberately wrong password is expected.
3. Clean up: run `e2e/fixtures/cleanup.sql`, then confirm `select count(*) from auth.users where email like '%@e2e.hisab-nikash.test'` is 0.
4. If anything is broken, fix it on a `milestone-3-fixes` branch with tests, following the workflow below (subagent review, final verification, merge).
5. Report the result to the user, delete this "Next step" section, and only then start **milestone 4** (folders, files and categories, SPEC.md §12).

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
