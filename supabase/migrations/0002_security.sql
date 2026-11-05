-- 0002: права доступа. GRANT (какие таблицы/колонки) + RLS (какие строки).

-- Схема private не публикуется через API (PostgREST видит только public).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'manager'
  );
$$;

revoke all on function private.is_manager() from public, anon;
grant execute on function private.is_manager() to authenticated;

-- RLS на всех таблицах
alter table public.profiles            enable row level security;
alter table public.objects             enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_status_history enable row level security;
alter table public.status_transitions  enable row level security;

-- Supabase по умолчанию выдаёт anon/authenticated полные права на public.
-- Забираем всё и выдаём точечно.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

-- И для будущих объектов: ничего не выдаётся автоматически.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- profiles: только чтение (имена нужны в истории и при выборе исполнителя).
grant select on public.profiles to authenticated;

-- objects
grant select, delete on public.objects to authenticated;
grant insert (name, address), update (name, address) on public.objects to authenticated;

-- tasks: status, author_id, created_at, updated_at вне GRANT —
-- прямой PATCH status=... получит permission denied ещё до RLS.
grant select, delete on public.tasks to authenticated;
grant insert (title, description, object_id, assignee_id),
      update (title, description, object_id, assignee_id)
  on public.tasks to authenticated;

-- история и справочник: только чтение
grant select on public.task_status_history to authenticated;
grant select on public.status_transitions to authenticated;

-- ---------- RLS-политики ----------

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

-- objects: постановщик видит всё; исполнитель — объекты, где у него есть задачи
create policy objects_select on public.objects
  for select to authenticated
  using (
    (select private.is_manager())
    or exists (
      select 1 from public.tasks t
      where t.object_id = objects.id and t.assignee_id = (select auth.uid())
    )
  );

create policy objects_insert on public.objects
  for insert to authenticated
  with check ((select private.is_manager()));

create policy objects_update on public.objects
  for update to authenticated
  using ((select private.is_manager()))
  with check ((select private.is_manager()));

create policy objects_delete on public.objects
  for delete to authenticated
  using ((select private.is_manager()));

-- tasks: постановщик видит всё; исполнитель — только свои
create policy tasks_select on public.tasks
  for select to authenticated
  using ((select private.is_manager()) or assignee_id = (select auth.uid()));

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check ((select private.is_manager()));

create policy tasks_update on public.tasks
  for update to authenticated
  using ((select private.is_manager()))
  with check ((select private.is_manager()));

-- удалять можно только новую задачу (дальше у неё есть история работы)
create policy tasks_delete on public.tasks
  for delete to authenticated
  using ((select private.is_manager()) and status = 'new');

-- история: видимость наследуется от RLS задач
create policy history_select on public.task_status_history
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

-- справочник переходов
create policy transitions_select on public.status_transitions
  for select to authenticated
  using (true);
