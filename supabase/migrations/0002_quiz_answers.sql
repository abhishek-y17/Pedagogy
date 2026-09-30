-- Quiz answers as queryable rows (run once in SQL Editor, after 0001; safe to re-run).
--
-- registrations.quiz already holds the answers as JSON. This adds one row per
-- question the visitor was served, filled automatically by a trigger when a
-- registration is inserted, so staff can run SQL like "% correct by subject" or
-- "who skipped what" without unpacking JSON. Each row is a snapshot of what was
-- actually asked (question text, options, correct answer, subject, difficulty)
-- so later edits to the question bank never change what a stored record means.
-- Questions the visitor never reached appear with status 'unanswered'.

create table if not exists public.registration_answers (
  registration_id text not null references public.registrations (id) on delete cascade,
  position        integer not null,               -- 1-based order the question was served
  question_id     text not null,
  curriculum      text,
  subject         text,
  difficulty      text,
  topic           text,
  question        text,
  options         jsonb,
  correct_answer  text,
  selected        text,                           -- the option text the visitor picked (null if none)
  is_correct      boolean,                        -- null when nothing was selected
  status          text not null check (status in ('answered', 'skipped', 'timed_out', 'unanswered')),
  primary key (registration_id, position)
);

create index if not exists registration_answers_question_idx on public.registration_answers (question_id);
create index if not exists registration_answers_subject_idx  on public.registration_answers (subject, difficulty);

alter table public.registration_answers enable row level security;
revoke all on public.registration_answers from public, anon, authenticated;
drop policy if exists staff_select_answers on public.registration_answers;
create policy staff_select_answers on public.registration_answers
  for select to authenticated using (public.is_staff());
grant select on public.registration_answers to authenticated;

create or replace function public._store_registration_answers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sel     jsonb := case when jsonb_typeof(new.raw -> 'quiz' -> 'selectedQuestionIds') = 'array'
                        then new.raw -> 'quiz' -> 'selectedQuestionIds' else '[]'::jsonb end;
  answers jsonb := case when jsonb_typeof(new.raw -> 'quiz' -> 'answers') = 'array'
                        then new.raw -> 'quiz' -> 'answers' else '[]'::jsonb end;
begin
  insert into public.registration_answers
    (registration_id, position, question_id, curriculum, subject, difficulty, topic,
     question, options, correct_answer, selected, is_correct, status)
  select new.id,
         t.ord::int,
         left(t.qid, 200),
         left(a.x ->> 'curriculum', 100),
         left(a.x ->> 'subject', 100),
         left(a.x ->> 'difficulty', 20),
         left(a.x ->> 'topic', 200),
         left(a.x ->> 'question', 2000),
         case when jsonb_typeof(a.x -> 'options') = 'array' then a.x -> 'options' end,
         left(a.x ->> 'correctAnswer', 1000),
         left(a.x ->> 'selected', 1000),
         case when a.x ->> 'correct' in ('true', 'false') then (a.x ->> 'correct')::boolean end,
         case
           when a.x is null                                   then 'unanswered'
           when a.x ->> 'selected' is not null                then 'answered'
           when coalesce((a.x ->> 'timedOut')::boolean, false) then 'timed_out'
           when coalesce((a.x ->> 'skipped')::boolean, false)  then 'skipped'
           else 'unanswered'
         end
  from jsonb_array_elements_text(sel) with ordinality as t(qid, ord)
  left join lateral (
    select x from jsonb_array_elements(answers) as e(x) where e.x ->> 'questionId' = t.qid limit 1
  ) a on true
  where t.ord <= 50;
  return new;
end;
$$;

revoke all on function public._store_registration_answers() from public;

drop trigger if exists registrations_store_answers on public.registrations;
create trigger registrations_store_answers
  after insert on public.registrations
  for each row execute function public._store_registration_answers();
