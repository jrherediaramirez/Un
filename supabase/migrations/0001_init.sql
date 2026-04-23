-- Chat-style AI workout tracker — initial schema
-- All user-owned tables are RLS-enforced on user_id = auth.uid().
-- sets.user_id is denormalized from its parent workout (trigger-filled)
-- to keep RLS checks and trend queries on a single table.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ─────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  unit_system text not null default 'imperial' check (unit_system in ('imperial','metric')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create a profile when a new auth.users row is inserted.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- exercises — canonical library; rows with owner_id IS NULL are
-- global seed data, per-user rows let users add custom exercises.
-- ─────────────────────────────────────────────────────────────
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  canonical_name text not null,
  category text not null check (category in ('strength','cardio','bodyweight')),
  aliases text[] not null default '{}',
  default_unit text,
  created_at timestamptz not null default now()
);

-- Global exercises: canonical_name is unique (case-insensitive).
create unique index exercises_global_name_uniq
  on public.exercises (lower(canonical_name))
  where owner_id is null;

-- Per-user custom exercises: name unique within owner.
create unique index exercises_user_name_uniq
  on public.exercises (owner_id, lower(canonical_name))
  where owner_id is not null;

create index exercises_aliases_gin on public.exercises using gin (aliases);
create index exercises_canonical_trgm
  on public.exercises using gin (canonical_name gin_trgm_ops);

alter table public.exercises enable row level security;

create policy "exercises_select_visible"
  on public.exercises for select
  using (owner_id is null or owner_id = auth.uid());

create policy "exercises_insert_own"
  on public.exercises for insert
  with check (owner_id = auth.uid());

create policy "exercises_update_own"
  on public.exercises for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "exercises_delete_own"
  on public.exercises for delete
  using (owner_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- workouts — one session per (user, performed_on) usually, but
-- nothing prevents multiple sessions the same day.
-- ─────────────────────────────────────────────────────────────
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  performed_on date not null,
  notes text,
  created_at timestamptz not null default now()
);

create index workouts_user_date_idx
  on public.workouts (user_id, performed_on desc);

alter table public.workouts enable row level security;

create policy "workouts_select_own" on public.workouts for select using (user_id = auth.uid());
create policy "workouts_insert_own" on public.workouts for insert with check (user_id = auth.uid());
create policy "workouts_update_own" on public.workouts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "workouts_delete_own" on public.workouts for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- sets — one row per logged effort (strength set, cardio interval,
-- bodyweight set). kind-based CHECK keeps shape consistent.
-- ─────────────────────────────────────────────────────────────
create table public.sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  kind text not null check (kind in ('strength','cardio','bodyweight')),
  set_index int not null default 1,
  reps int,
  weight numeric(6,2),
  weight_unit text check (weight_unit in ('lb','kg')),
  distance numeric(7,3),
  distance_unit text check (distance_unit in ('mi','km','m')),
  duration_seconds int,
  rpe numeric(3,1) check (rpe is null or (rpe >= 0 and rpe <= 10)),
  created_at timestamptz not null default now(),
  constraint sets_kind_strength_shape check (
    kind <> 'strength' or reps is not null
  ),
  constraint sets_kind_cardio_shape check (
    kind <> 'cardio' or (distance is not null or duration_seconds is not null)
  ),
  constraint sets_kind_bodyweight_shape check (
    kind <> 'bodyweight' or (reps is not null or duration_seconds is not null)
  )
);

create index sets_workout_idx on public.sets (workout_id);
create index sets_user_exercise_idx
  on public.sets (user_id, exercise_id, created_at desc);

-- Fill user_id from the parent workout so clients (and the model) only
-- pass workout_id. Also guards against cross-user workout_id spoofing.
create or replace function public.sets_fill_user_id()
returns trigger
language plpgsql
as $$
declare
  w_user uuid;
begin
  select user_id into w_user from public.workouts where id = new.workout_id;
  if w_user is null then
    raise exception 'workout % not found', new.workout_id;
  end if;
  new.user_id := w_user;
  return new;
end;
$$;

create trigger sets_fill_user_id_trg
  before insert or update of workout_id on public.sets
  for each row execute function public.sets_fill_user_id();

alter table public.sets enable row level security;

create policy "sets_select_own" on public.sets for select using (user_id = auth.uid());
create policy "sets_insert_own" on public.sets for insert with check (user_id = auth.uid());
create policy "sets_update_own" on public.sets for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sets_delete_own" on public.sets for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- messages — chat transcript; content stores the full Anthropic
-- content-block array so we can replay any turn (tool_use, tool_result).
-- ─────────────────────────────────────────────────────────────
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index messages_user_created_idx
  on public.messages (user_id, created_at desc);

alter table public.messages enable row level security;

create policy "messages_select_own" on public.messages for select using (user_id = auth.uid());
create policy "messages_insert_own" on public.messages for insert with check (user_id = auth.uid());
create policy "messages_update_own" on public.messages for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "messages_delete_own" on public.messages for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- templates — quick-log payloads ready to feed log_workout.
-- ─────────────────────────────────────────────────────────────
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index templates_user_idx on public.templates (user_id, created_at desc);

alter table public.templates enable row level security;

create policy "templates_select_own" on public.templates for select using (user_id = auth.uid());
create policy "templates_insert_own" on public.templates for insert with check (user_id = auth.uid());
create policy "templates_update_own" on public.templates for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "templates_delete_own" on public.templates for delete using (user_id = auth.uid());
