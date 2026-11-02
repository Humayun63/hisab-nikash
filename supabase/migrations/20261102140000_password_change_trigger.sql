-- The forced password change must be enforced by the server: the client could call
-- complete_password_change() without changing the password. Instead, clear the flag whenever
-- the password in auth.users actually changes.
--
-- Note for the admin Edge Functions (milestone 3): when the super admin sets a new password for a
-- user, update auth.users first and THEN set profiles.must_change_password = true, because this
-- trigger clears it on every password change.
drop function public.complete_password_change();

create function private.clear_must_change_password()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles
  set must_change_password = false
  where id = new.id and must_change_password;
  return new;
end;
$$;

create trigger on_auth_user_password_changed
  after update of encrypted_password on auth.users
  for each row when (old.encrypted_password is distinct from new.encrypted_password)
  execute function private.clear_must_change_password();
