-- Milestone 4 (folders, files, categories): read helpers for the space sidebar and categories page.

-- Income / expense / net per file, counting only categories the caller can see
-- (same rule as private.visible_entries). Files without entries are not returned.
create function public.space_file_totals(p_space_id uuid)
returns table (file_id uuid, income numeric, expense numeric, entry_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_role text := private.space_role(p_space_id);
begin
  if v_role is null then
    raise exception 'You do not have access to this space' using errcode = '42501';
  end if;

  return query
    select e.file_id,
           coalesce(sum(e.amount) filter (where c.type = 'income'), 0),
           coalesce(sum(e.amount) filter (where c.type = 'expense'), 0),
           count(*)
    from public.entries e
    join public.categories c on c.id = e.category_id
    where e.space_id = p_space_id
      and (
        v_role = 'super_admin'
        or not c.is_restricted
        or exists (
          select 1 from public.category_access ca
          where ca.category_id = c.id and ca.user_id = auth.uid()
        )
      )
    group by e.file_id;
end;
$$;

-- Number of entries per category the caller can see. Runs with the caller's rights, so RLS
-- on entries and categories decides what is counted.
create function public.space_category_usage(p_space_id uuid)
returns table (category_id uuid, entry_count bigint)
language sql stable security invoker set search_path = ''
as $$
  select e.category_id, count(*)
  from public.entries e
  where e.space_id = p_space_id
  group by e.category_id
$$;

revoke all on function public.space_file_totals(uuid) from public, anon;
revoke all on function public.space_category_usage(uuid) from public, anon;
grant execute on function public.space_file_totals(uuid) to authenticated;
grant execute on function public.space_category_usage(uuid) to authenticated;
