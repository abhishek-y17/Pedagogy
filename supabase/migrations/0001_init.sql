-- Pedagogy Sharjah Expo — initial schema (run once in Supabase Dashboard ->
-- SQL Editor -> New query -> paste -> Run). Safe to re-run: every statement is
-- idempotent (create ... if not exists / create or replace / drop policy if exists).
--
-- Access model (see supabase/README.md):
--   * The public `anon` key can ONLY call submit_registration(). It has no
--     privileges on any table, so the visitor-facing key can never read PII.
--   * Staff sign in with Supabase Auth (email + password). Only emails listed in
--     staff_allowlist count as staff (is_staff()); they can SELECT registrations
--     and call resolve_duplicate(). Nothing else writes to the table.
--   * Duplicate detection runs here, against the full dataset, not per device.

-- ---------------------------------------------------------------- tables ---

create table if not exists public.registrations (
  id                      text primary key,                 -- client-generated "P-<uuid>"; makes retries idempotent
  created_at              timestamptz not null default now(), -- server receive time
  submitted_at            timestamptz,                      -- device's meta.createdAt
  device_id               text,
  mode                    text,                             -- 'full' | 'express'
  schema_version          text,                             -- draft schema, e.g. 'pedagogy.v11'

  -- registration
  name                    text not null,
  dob                     date,
  parent_mobile           text not null,
  student_mobile          text,
  school                  text,
  school_key              text,
  curriculum              text,
  grade                   text,
  stream                  text,
  section                 text,
  subjects                jsonb not null default '[]'::jsonb,
  tcs_accepted            boolean not null default false,
  tcs_accepted_at         timestamptz,
  consent_to_contact      boolean not null default false,
  consent_to_contact_at   timestamptz,
  marketing_opt_in        boolean not null default false,
  marketing_opt_in_at     timestamptz,

  -- preferences
  destinations            text[] not null default '{}',
  destinations_other      text[] not null default '{}',
  competitive_exam_prep   text,                             -- 'yes' | 'no' | null
  competitive_exams       jsonb not null default '{}'::jsonb,

  -- quiz (answers carry the internally-computed `correct`; never shown to visitors)
  quiz                    jsonb not null default '{}'::jsonb,

  -- duplicate handling
  duplicate_flag          boolean not null default false,
  duplicate_of_ids        text[] not null default '{}',
  duplicate_review_status text check (duplicate_review_status in ('pending','reviewed','merged','dismissed')),
  reviewed_by             text,
  reviewed_at             timestamptz,

  -- full record as sent by the device: lossless safety net + what the staff
  -- dashboard renders from, so new client fields never need a migration first
  raw                     jsonb not null,

  -- normalized match keys (mirror normalizeForMatch() in js/state.js)
  name_norm               text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  school_norm             text generated always as (lower(regexp_replace(btrim(coalesce(school, '')), '\s+', ' ', 'g'))) stored
);

create index if not exists registrations_parent_mobile_idx on public.registrations (parent_mobile);
create index if not exists registrations_name_dob_idx      on public.registrations (name_norm, dob);
create index if not exists registrations_created_at_idx    on public.registrations (created_at desc);
create index if not exists registrations_pending_dup_idx   on public.registrations (created_at desc)
  where duplicate_flag and duplicate_review_status = 'pending';

create table if not exists public.staff_allowlist (
  email text primary key
);

-- ------------------------------------------------------------- privileges ---
-- Supabase grants anon/authenticated broad default privileges on new public
-- tables; strip them so RLS + explicit grants below are the only way in.

alter table public.registrations enable row level security;
alter table public.staff_allowlist enable row level security;   -- no policies: only SECURITY DEFINER functions read it

revoke all on public.registrations  from public, anon, authenticated;
revoke all on public.staff_allowlist from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers ---

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_allowlist
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public._jsonb_text_array(j jsonb)
returns text[]
language sql
immutable
as $$
  select case when jsonb_typeof(j) = 'array'
              then array(select left(x, 200) from jsonb_array_elements_text(j) as t(x) limit 100)
              else '{}'::text[] end;
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;   -- RLS policy + dashboard login check

-- Staff read access: allowlisted, authenticated users only.
drop policy if exists staff_select_registrations on public.registrations;
create policy staff_select_registrations on public.registrations
  for select to authenticated
  using (public.is_staff());
grant select on public.registrations to authenticated;

-- ------------------------------------------------------- submit (visitors) ---
-- Called by the anon key from js/sync.js. Idempotent on payload.meta.id, so the
-- device's retry outbox can safely resend. Returns only what the device needs.

create or replace function public.submit_registration(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reg        jsonb := coalesce(payload -> 'registration', '{}'::jsonb);
  pref       jsonb := coalesce(payload -> 'preferences', '{}'::jsonb);
  meta       jsonb := coalesce(payload -> 'meta', '{}'::jsonb);
  v_id       text  := meta ->> 'id';
  v_name     text  := left(btrim(coalesce(reg ->> 'name', '')), 200);
  v_parent   text  := nullif(btrim(coalesce(reg ->> 'parentMobile', '')), '');
  v_student  text  := nullif(btrim(coalesce(reg ->> 'studentMobile', '')), '');
  v_dob      date  := nullif(reg ->> 'dob', '')::date;
  v_school   text  := nullif(left(btrim(coalesce(reg ->> 'school', '')), 300), '');
  v_skey     text  := nullif(left(btrim(coalesce(reg ->> 'schoolKey', '')), 300), '');
  v_name_n   text;
  v_school_n text;
  v_matches  text[];
  v_flag     boolean;
  v_inserted int;
  v_existing public.registrations%rowtype;
begin
  -- Guardrails for a public endpoint: shape + size, not business logic.
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid_payload: expected an object' using errcode = '22023';
  end if;
  if octet_length(payload::text) > 65536 then
    raise exception 'invalid_payload: too large' using errcode = '22023';
  end if;
  if v_id is null or v_id !~ '^P-[A-Za-z0-9-]{8,64}$' then
    raise exception 'invalid_payload: bad id' using errcode = '22023';
  end if;
  if v_name = '' then
    raise exception 'invalid_payload: name required' using errcode = '22023';
  end if;
  if v_parent is null or v_parent !~ '^\+[0-9]{6,20}$' then
    raise exception 'invalid_payload: parent mobile required' using errcode = '22023';
  end if;
  if v_student is not null and v_student !~ '^\+[0-9]{6,20}$' then
    v_student := null;  -- optional field: drop rather than reject the whole registration
  end if;

  -- Serialize submissions (a few per minute at most) so two devices submitting
  -- the same person at the same instant can't both miss each other's row.
  perform pg_advisory_xact_lock(hashtext('pedagogy.submit_registration'));

  -- Retry of something already stored: return the stored result, change nothing.
  select * into v_existing from public.registrations where id = v_id;
  if found then
    return jsonb_build_object('id', v_id, 'duplicate_flag', v_existing.duplicate_flag,
                              'duplicate_of_ids', to_jsonb(v_existing.duplicate_of_ids), 'already_existed', true);
  end if;

  v_name_n   := lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g'));
  v_school_n := lower(regexp_replace(btrim(coalesce(v_school, '')), '\s+', ' ', 'g'));

  -- Same rule as isReasonableMatch() in js/state.js: same parent mobile, OR
  -- same name + DOB + school (school_key when both have one, else normalized text).
  select array_agg(r.id) into v_matches
  from public.registrations r
  where r.id <> v_id
    and (
      r.parent_mobile = v_parent
      or (
        v_name_n <> '' and r.name_norm = v_name_n
        and v_dob is not null and r.dob = v_dob
        and case
              when v_skey is not null and r.school_key is not null then r.school_key = v_skey
              else v_school_n <> '' and r.school_norm = v_school_n
            end
      )
    );
  v_flag := v_matches is not null;

  insert into public.registrations (
    id, submitted_at, device_id, mode, schema_version,
    name, dob, parent_mobile, student_mobile, school, school_key, curriculum, grade, stream, section, subjects,
    tcs_accepted, tcs_accepted_at, consent_to_contact, consent_to_contact_at, marketing_opt_in, marketing_opt_in_at,
    destinations, destinations_other, competitive_exam_prep, competitive_exams, quiz,
    duplicate_flag, duplicate_of_ids, duplicate_review_status, raw
  ) values (
    v_id,
    nullif(meta ->> 'createdAt', '')::timestamptz,
    left(meta ->> 'deviceId', 100),
    left(payload ->> 'mode', 20),
    left(payload ->> 'schema', 40),
    v_name, v_dob, v_parent, v_student, v_school, v_skey,
    left(reg ->> 'curriculum', 100), left(reg ->> 'grade', 40), left(reg ->> 'stream', 100), left(reg ->> 'section', 100),
    case when jsonb_typeof(reg -> 'subjects') = 'array' then reg -> 'subjects' else '[]'::jsonb end,
    coalesce((reg ->> 'tcsAccepted')::boolean, false),           nullif(reg ->> 'tcsAcceptedAt', '')::timestamptz,
    coalesce((reg ->> 'consentToContact')::boolean, false),      nullif(reg ->> 'consentToContactAt', '')::timestamptz,
    coalesce((reg ->> 'marketingOptIn')::boolean, false),        nullif(reg ->> 'marketingOptInAt', '')::timestamptz,
    public._jsonb_text_array(pref -> 'destinations'),
    public._jsonb_text_array(pref -> 'destinationsOther'),
    left(pref ->> 'competitiveExamPrep', 10),
    case when jsonb_typeof(pref -> 'competitiveExams') = 'object' then pref -> 'competitiveExams' else '{}'::jsonb end,
    case when jsonb_typeof(payload -> 'quiz') = 'object' then payload -> 'quiz' else '{}'::jsonb end,
    v_flag, coalesce(v_matches, '{}'), case when v_flag then 'pending' else null end,
    payload
  )
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;

  -- A new match re-opens every matched row for staff review, even one already
  -- reviewed/dismissed: a new incoming duplicate is new information.
  if v_inserted = 1 and v_flag then
    update public.registrations r
       set duplicate_flag = true,
           duplicate_of_ids = case when v_id = any (r.duplicate_of_ids) then r.duplicate_of_ids
                                   else array_append(r.duplicate_of_ids, v_id) end,
           duplicate_review_status = 'pending',
           reviewed_by = null,
           reviewed_at = null
     where r.id = any (v_matches);
  end if;

  return jsonb_build_object('id', v_id, 'duplicate_flag', v_flag,
                            'duplicate_of_ids', to_jsonb(coalesce(v_matches, '{}')), 'already_existed', v_inserted = 0);
exception
  when sqlstate '22023' then raise;                       -- our own validation errors pass through (HTTP 400)
  when others then
    raise exception 'invalid_payload: %', sqlerrm using errcode = '22023';  -- bad date/boolean/timestamp casts etc.
end;
$$;

revoke all on function public.submit_registration(jsonb) from public;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;

-- --------------------------------------------- duplicate resolution (staff) ---
-- Mirrors resolveDuplicatePair() in js/state.js: resolving one record resolves
-- it AND every record it links to, together, so a pair/group moves as a unit.

create or replace function public.resolve_duplicate(p_id text, p_status text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linked text[];
  v_count  integer;
begin
  if not public.is_staff() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status not in ('reviewed', 'merged', 'dismissed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select duplicate_of_ids into v_linked from public.registrations where id = p_id;
  if not found then
    return 0;
  end if;

  update public.registrations
     set duplicate_review_status = p_status,
         reviewed_by = auth.jwt() ->> 'email',
         reviewed_at = now()
   where id = p_id or id = any (coalesce(v_linked, '{}'));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.resolve_duplicate(text, text) from public;
grant execute on function public.resolve_duplicate(text, text) to authenticated;

-- ------------------------------------------------------------ staff seed ---
-- After creating the staff user(s) in Authentication -> Users, allowlist them:
--   insert into public.staff_allowlist (email) values ('staff@example.com')
--   on conflict do nothing;
