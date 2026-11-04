# Hisab Nikash: working notes for Claude

Product and technical spec: [SPEC.md](SPEC.md). The milestones are listed in §12.

## ⚠️ Next step: merge milestone 4 after a PASS, then continue milestone 5

**Milestone 4** (folders, files, categories; SPEC.md §5.5–5.6) is built, tested and committed on `milestone-4`. It is **not yet merged**.
- Tests: 430 unit tests, plus `e2e/ui/structure.spec.js` (19) and `e2e/db/structure.spec.js` (40). The seeded Org E is described in `e2e/fixtures/ids.js`.
- Remaining: a final verification PASS (two full e2e runs plus the browser check). Then merge `milestone-4` into `main` with `--no-ff` and push.

**Sign-in rate limit:** the full e2e suite now makes about 200 sign-ins, the hosted limit per 5 minutes (`sign_in_sign_ups` in `supabase/config.toml`).
- Leave at least 6 idle minutes before each full run, or runs fail with "Request rate limit reached".
- Raising the limit needs the project owner's approval; it was blocked on 2026-11-04.

**Milestone 5** (entries) was started on branch `milestone-5`, branched from `milestone-4`, in the worktree `../hisab-nikash-m5`. Rebase or merge it onto `main` once milestone 4 is merged.

Watch out for these flaky tests:
- `e2e/ui/management.spec.js` "setting a new password requires a change at next sign-in" failed once under load and passed on rerun.
- Sign-in timeouts in UI tests are usually the rate limit.

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
