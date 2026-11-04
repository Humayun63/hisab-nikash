-- Milestone 6 (dashboard): space_entries also filters by folder, so the dashboard's folder scope
-- can link to the matching entries.
drop function public.space_entries(uuid, uuid, date, date, uuid[], text, uuid, text, boolean, integer, integer);

create function public.space_entries(
  p_space_id uuid,
  p_file_id uuid default null,
  p_folder_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_category_ids uuid[] default null,
  p_type text default null,
  p_created_by uuid default null,
  p_sort text default 'date',
  p_desc boolean default true,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  file_id uuid,
  file_name text,
  category_id uuid,
  category_name text,
  category_color text,
  type text,
  amount numeric,
  entry_date date,
  note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  total_count bigint,
  total_income numeric,
  total_expense numeric
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_role text := private.space_role(p_space_id);
begin
  if v_role is null then
    raise exception 'You do not have access to this space' using errcode = '42501';
  end if;
  if p_sort not in ('date', 'category', 'amount', 'added_by') then
    raise exception 'Invalid sort' using errcode = '22023';
  end if;
  if p_type is not null and p_type not in ('income', 'expense') then
    raise exception 'Invalid type' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 or p_offset is null or p_offset < 0 then
    raise exception 'Invalid page' using errcode = '22023';
  end if;

  return query
    with filtered as (
      select e.id, e.file_id, f.name as file_name, e.category_id, c.name as category_name,
             c.color as category_color, c.type, e.amount, e.entry_date, e.note, e.created_by,
             case when p.id is null then null else p.first_name || ' ' || p.last_name end as created_by_name,
             e.created_at
      from public.entries e
      join public.categories c on c.id = e.category_id
      join public.files f on f.id = e.file_id
      left join public.profiles p on p.id = e.created_by
      where e.space_id = p_space_id
        and (p_file_id is null or e.file_id = p_file_id)
        and (p_folder_id is null or f.folder_id = p_folder_id)
        and (p_from is null or e.entry_date >= p_from)
        and (p_to is null or e.entry_date <= p_to)
        and (p_category_ids is null or cardinality(p_category_ids) = 0 or e.category_id = any (p_category_ids))
        and (p_type is null or c.type = p_type)
        and (p_created_by is null or e.created_by = p_created_by)
        and (
          v_role = 'super_admin'
          or not c.is_restricted
          or exists (
            select 1 from public.category_access ca
            where ca.category_id = c.id and ca.user_id = auth.uid()
          )
        )
    )
    select x.id, x.file_id, x.file_name, x.category_id, x.category_name, x.category_color, x.type,
           x.amount, x.entry_date, x.note, x.created_by, x.created_by_name, x.created_at,
           count(*) over (),
           coalesce(sum(x.amount) filter (where x.type = 'income') over (), 0),
           coalesce(sum(x.amount) filter (where x.type = 'expense') over (), 0)
    from filtered x
    order by
      case when p_sort = 'date' and not p_desc then x.entry_date end asc,
      case when p_sort = 'date' and p_desc then x.entry_date end desc,
      case when p_sort = 'category' and not p_desc then lower(x.category_name) end asc,
      case when p_sort = 'category' and p_desc then lower(x.category_name) end desc,
      case when p_sort = 'amount' and not p_desc then x.amount end asc,
      case when p_sort = 'amount' and p_desc then x.amount end desc,
      -- Deleted users (no name) sort last in either direction.
      case when p_sort = 'added_by' and not p_desc then lower(x.created_by_name) end asc nulls last,
      case when p_sort = 'added_by' and p_desc then lower(x.created_by_name) end desc nulls last,
      x.entry_date desc,
      x.created_at desc,
      x.id
    limit p_limit offset p_offset;
end;
$$;

revoke all on function public.space_entries(uuid, uuid, uuid, date, date, uuid[], text, uuid, text, boolean, integer, integer) from public, anon;
grant execute on function public.space_entries(uuid, uuid, uuid, date, date, uuid[], text, uuid, text, boolean, integer, integer) to authenticated;
