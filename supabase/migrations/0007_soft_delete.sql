-- 0007: мягкое удаление задач и объектов.
-- ТЗ: «историю статусов нельзя удалить через API». Раньше DELETE задачи каскадно
-- удалял её историю. Теперь физического DELETE через API нет вообще:
-- задача/объект помечаются удалёнными (deleted_at) и скрываются RLS, история остаётся.

alter table public.objects
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles (id);

alter table public.tasks
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles (id);

-- история больше не удаляется вместе с задачей ни при каких условиях
alter table public.task_status_history
  drop constraint task_status_history_task_id_fkey,
  add constraint task_status_history_task_id_fkey
    foreign key (task_id) references public.tasks (id) on delete restrict;

-- ---------- права: DELETE через API запрещён ----------
revoke delete on public.tasks   from authenticated;
revoke delete on public.objects from authenticated;
drop policy tasks_delete   on public.tasks;
drop policy objects_delete on public.objects;
drop trigger objects_before_delete on public.objects;
drop function private.objects_before_delete();

-- ---------- RLS: удалённое не видно и не редактируется ----------
drop policy tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (deleted_at is null and ((select private.is_manager()) or assignee_id = (select auth.uid())));

drop policy tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (deleted_at is null and (select private.is_manager()))
  with check ((select private.is_manager()));

drop policy objects_select on public.objects;
create policy objects_select on public.objects
  for select to authenticated
  using (
    deleted_at is null and (
      (select private.is_manager())
      or exists (
        select 1 from public.tasks t
        where t.object_id = objects.id and t.assignee_id = (select auth.uid()) and t.deleted_at is null
      )
    )
  );

drop policy objects_update on public.objects;
create policy objects_update on public.objects
  for update to authenticated
  using (deleted_at is null and (select private.is_manager()))
  with check ((select private.is_manager()));

-- history_select наследует видимость задач: история удалённой задачи скрыта, но хранится.

-- ---------- нельзя создать/перенести задачу на удалённый объект ----------
-- security definer: RLS скрывает удалённые объекты, а проверить их нужно
create function private.assert_object_active(p_object uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.objects where id = p_object and deleted_at is null) then
    raise exception 'Объект не найден';
  end if;
end;
$$;

revoke all on function private.assert_object_active(uuid) from public, anon;
grant execute on function private.assert_object_active(uuid) to authenticated;

create or replace function private.tasks_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.author_id  := auth.uid();
  new.status     := 'new';
  new.created_at := now();
  new.updated_at := now();
  new.deleted_at := null;
  new.deleted_by := null;
  perform private.assert_executor(new.assignee_id);
  perform private.assert_object_active(new.object_id);
  return new;
end;
$$;

create or replace function private.tasks_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_via_rpc boolean := coalesce(current_setting('app.status_change', true), '') = 'on';
begin
  if old.deleted_at is not null then
    raise exception 'Задача удалена';
  end if;

  if new.status is distinct from old.status and not v_via_rpc then
    raise exception 'Статус задачи меняется только через действие «смена статуса»';
  end if;

  if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    raise exception 'Автора и дату создания задачи менять нельзя';
  end if;

  if old.status = 'accepted' then
    raise exception 'Принятую задачу изменять нельзя';
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    perform private.assert_executor(new.assignee_id);
  end if;

  if new.object_id is distinct from old.object_id then
    perform private.assert_object_active(new.object_id);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ---------- смена статуса: удалённые задачи не трогаем ----------
create or replace function public.change_task_status(
  p_task_id uuid,
  p_to      public.task_status,
  p_comment text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.user_role;
  v_task public.tasks;
  v_rule public.status_transitions;
begin
  if v_uid is null then
    raise exception 'Не авторизован';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then
    raise exception 'Не авторизован';
  end if;

  select * into v_task from public.tasks where id = p_task_id and deleted_at is null for update;
  if not found then
    raise exception 'Задача не найдена';
  end if;
  -- исполнитель не должен даже узнать о существовании чужой задачи
  if v_role = 'executor' and v_task.assignee_id is distinct from v_uid then
    raise exception 'Задача не найдена';
  end if;

  select * into v_rule from public.status_transitions
   where from_status = v_task.status and to_status = p_to;
  if not found then
    raise exception 'Переход запрещён';
  end if;

  if v_rule.actor = 'manager' and v_role is distinct from 'manager' then
    raise exception 'Недостаточно прав';
  end if;
  if v_rule.actor = 'assignee' and v_task.assignee_id is distinct from v_uid then
    raise exception 'Только назначенный исполнитель';
  end if;
  if v_rule.requires_comment and coalesce(btrim(p_comment), '') = '' then
    raise exception 'Комментарий обязателен';
  end if;

  perform set_config('app.status_change', 'on', true);
  update public.tasks set status = p_to where id = p_task_id returning * into v_task;
  perform set_config('app.status_change', 'off', true);

  insert into public.task_status_history (task_id, from_status, to_status, changed_by, comment)
  values (p_task_id, v_rule.from_status, p_to, v_uid, nullif(btrim(p_comment), ''));

  return v_task;
end;
$$;

-- ---------- удаление ----------
-- Задачу можно удалить только в статусе «Новая» (по ней ещё не шла работа).
create function public.delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_task public.tasks;
begin
  if not exists (select 1 from public.profiles where id = v_uid and role = 'manager') then
    raise exception 'Недостаточно прав';
  end if;

  select * into v_task from public.tasks where id = p_task_id and deleted_at is null for update;
  if not found then
    raise exception 'Задача не найдена';
  end if;
  if v_task.status <> 'new' then
    raise exception 'Удалить можно только задачу в статусе «Новая»';
  end if;

  update public.tasks set deleted_at = now(), deleted_by = v_uid where id = p_task_id;
end;
$$;

-- Объект можно удалить, только если в нём нет (неудалённых) задач.
create function public.delete_object(p_object_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles where id = v_uid and role = 'manager') then
    raise exception 'Недостаточно прав';
  end if;

  perform 1 from public.objects where id = p_object_id and deleted_at is null for update;
  if not found then
    raise exception 'Объект не найден';
  end if;
  if exists (select 1 from public.tasks where object_id = p_object_id and deleted_at is null) then
    raise exception 'Нельзя удалить объект, у которого есть задачи';
  end if;

  update public.objects set deleted_at = now(), deleted_by = v_uid where id = p_object_id;
end;
$$;

revoke all on function public.delete_task(uuid)   from public, anon;
revoke all on function public.delete_object(uuid) from public, anon;
grant execute on function public.delete_task(uuid)   to authenticated;
grant execute on function public.delete_object(uuid) to authenticated;
