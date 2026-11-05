-- 0001: типы, таблицы, справочник переходов статусов

create type public.user_role as enum ('manager', 'executor');
-- Новая, В работе, На проверке, Принята, На доработке
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');
-- кто выполняет переход: любой постановщик или назначенный исполнитель задачи
create type public.transition_actor as enum ('manager', 'assignee');

-- Профиль пользователя. Строка создаётся триггером на auth.users (см. 0003).
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text not null,
  role       public.user_role not null default 'executor',
  created_at timestamptz not null default now()
);

-- Объект (стройка)
create table public.objects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  address    text not null check (btrim(address) <> ''),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  object_id   uuid not null references public.objects (id) on delete restrict,
  title       text not null check (btrim(title) <> ''),
  description text not null default '',
  assignee_id uuid not null references public.profiles (id),
  status      public.task_status not null default 'new',
  author_id   uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_object_id_idx on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);

-- История смены статусов. from_status = null — создание задачи.
create table public.task_status_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  from_status public.task_status,
  to_status   public.task_status not null,
  changed_by  uuid not null references public.profiles (id),
  comment     text,
  created_at  timestamptz not null default now()
);

create index task_status_history_task_idx on public.task_status_history (task_id, created_at);

-- Единственный источник правды о разрешённых переходах.
-- Его читают и функция change_task_status, и интерфейс (чтобы показать кнопки).
create table public.status_transitions (
  from_status      public.task_status not null,
  to_status        public.task_status not null,
  actor            public.transition_actor not null,
  requires_comment boolean not null default false,
  primary key (from_status, to_status)
);

insert into public.status_transitions (from_status, to_status, actor, requires_comment) values
  ('new',         'in_progress', 'assignee', false),
  ('in_progress', 'review',      'assignee', false),
  ('review',      'accepted',    'manager',  false),
  ('review',      'rework',      'manager',  true),
  ('rework',      'in_progress', 'assignee', false);
