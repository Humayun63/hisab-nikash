-- Deleting a space cascades to its folders and files after the space row is gone, so the
-- caller no longer has a role in it and every category looked hidden. Space deletion is
-- already limited to the super admin by RLS, so let that cascade through.
create or replace function private.prevent_hidden_entry_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.spaces s where s.id = old.space_id) then
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
