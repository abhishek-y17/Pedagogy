-- Destination pick order (run once in SQL Editor, after 0001 and 0002; safe to re-run).
--
-- The app records the order in which a visitor picked their study destinations
-- (across the chip grid and the "Other" search overlay): first choice, second
-- choice, third choice. This exposes it as plain columns for SQL/CSV export:
--   destination_1 = first pick, destination_2 = second, destination_3 = third,
--   destination_order = the whole ordered list.
-- Filled by a trigger from the record's own JSON, so the submit function is unchanged.
-- Records without an explicit order (older devices) fall back to: chip-grid picks
-- first, then overlay picks.

alter table public.registrations
  add column if not exists destination_order text[] not null default '{}',
  add column if not exists destination_1 text,
  add column if not exists destination_2 text,
  add column if not exists destination_3 text;

create or replace function public._derive_destination_order(raw jsonb, dests text[], other text[])
returns text[]
language sql
immutable
as $$
  select case
    when jsonb_typeof(raw -> 'preferences' -> 'destinationOrder') = 'array'
         and jsonb_array_length(raw -> 'preferences' -> 'destinationOrder') > 0
      then public._jsonb_text_array(raw -> 'preferences' -> 'destinationOrder')
    else coalesce(
           array(select d from unnest(dests) with ordinality as t(d, n) where d <> 'Other' order by n),
           '{}'::text[]
         ) || coalesce(other, '{}'::text[])
  end;
$$;

create or replace function public._set_destination_order()
returns trigger
language plpgsql
as $$
declare
  ord text[];
begin
  ord := public._derive_destination_order(new.raw, new.destinations, new.destinations_other);
  new.destination_order := ord;
  new.destination_1 := ord[1];
  new.destination_2 := ord[2];
  new.destination_3 := ord[3];
  return new;
end;
$$;

drop trigger if exists registrations_destination_order on public.registrations;
create trigger registrations_destination_order
  before insert on public.registrations
  for each row execute function public._set_destination_order();

-- Backfill rows stored before this migration (derives from each row's own data).
update public.registrations r
   set destination_order = public._derive_destination_order(r.raw, r.destinations, r.destinations_other),
       destination_1 = (public._derive_destination_order(r.raw, r.destinations, r.destinations_other))[1],
       destination_2 = (public._derive_destination_order(r.raw, r.destinations, r.destinations_other))[2],
       destination_3 = (public._derive_destination_order(r.raw, r.destinations, r.destinations_other))[3]
 where r.destination_order = '{}';
