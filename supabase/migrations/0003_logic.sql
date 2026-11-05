-- 0003: триггеры и функция смены статуса

-- ---------- Профиль при создании пользователя ----------
-- Роль берётся из app_metadata (её меняет только админ), не из user_metadata.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), new.email),
    coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'executor')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- objects: системные поля ставит сервер ----------
create function private.objects_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

create trigger objects_before_insert
  before insert on public.objects
  for each row execute function private.objects_before_insert();

-- Понятная ошибка вместо нарушения внешнего ключа.
-- security definer: исполнитель/RLS тут ни при чём, проверяем все задачи.
create function private.objects_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.tasks where object_id = old.id) then
    raise exception 'Нельзя удалить объект, у которого есть задачи' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger objects_before_delete
  before delete on public.objects
  for each row execute function private.objects_before_delete();

-- ---------- tasks ----------
create function private.assert_executor(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = p_user and role = 'executor') then
    raise exception 'Исполнителем можно назначить только пользователя с ролью «Исполнитель»';
  end if;
end;
$$;

create function private.tasks_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.author_id  := auth.uid();
  new.status     := 'new';
  new.created_at := now();
  new.updated_at := now();
  perform private.assert_executor(new.assignee_id);
  return new;
end;
$$;

create trigger tasks_before_insert
  before insert on public.tasks
  for each row execute function private.tasks_before_insert();

-- Запись о создании задачи (— → Новая)
create function private.tasks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_status_history (task_id, from_status, to_status, changed_by)
  values (new.id, null, new.status, new.author_id);
  return null;
end;
$$;

create trigger tasks_after_insert
  after insert on public.tasks
  for each row execute function private.tasks_after_insert();

-- Второй рубеж поверх GRANT: статус меняется только из change_task_status,
-- системные поля неизменяемы, принятая задача закрыта.
create function private.tasks_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_via_rpc boolean := coalesce(current_setting('app.status_change', true), '') = 'on';
begin
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

  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_before_update
  before update on public.tasks
  for each row execute function private.tasks_before_update();

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_manager() to authenticated;

-- ---------- Смена статуса ----------
create function public.change_task_status(
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

  select * into v_task from public.tasks where id = p_task_id for update;
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

revoke execute on function public.change_task_status(uuid, public.task_status, text) from public, anon;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;
