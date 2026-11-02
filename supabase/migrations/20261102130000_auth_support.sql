-- Milestone 2 (auth) support.

-- A user can always read their own profile, even when disabled, so the app can tell
-- "disabled" apart from "not set up yet" (no profile).
create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- Called by the client right after the user sets a new password (forced change on first
-- login, or a password reset). Only clears the user's own flag.
create function public.complete_password_change()
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles
  set must_change_password = false
  where id = auth.uid() and must_change_password
$$;

revoke all on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated;
