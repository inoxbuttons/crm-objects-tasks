# Мини-CRM «Объекты и задачи» — архитектура

Исходное ТЗ: `Тестовое задание мини-CRM «Объекты и задачи».docx.md` (в корне).
Главное в оценке: логика, защита данных на уровне БД, понимание решений. Дизайн не оценивается.

## 1. Стек

| Слой | Выбор | Зачем |
|---|---|---|
| Сборка | Vite 8 + React 19.2 + TypeScript (strict) | SPA, быстрый старт, деплой статикой |
| UI | **Mantine 9** (`@mantine/core`, `@mantine/hooks`, `@mantine/form`, `@mantine/notifications`) | см. §8 |
| Роутинг | react-router 7 (режим SPA, `createBrowserRouter`) | 5 экранов |
| Данные | `@supabase/supabase-js` 2 + TanStack Query 5 | кэш, инвалидация после мутаций |
| Типы БД | `supabase gen types typescript` → `src/lib/database.types.ts` | типобезопасные запросы |
| БД | Supabase (Postgres + Auth + RLS), миграции через Supabase CLI в `supabase/migrations` | |
| Деплой | Vercel (или Netlify), `vercel.json` с rewrite на `index.html` | |
| Скрипты | `tsx` для `scripts/seed.ts` и `scripts/security-check.ts` | сид и проверка защиты |

Ключи: во фронтенде только **publishable key** (`sb_publishable_...`, бывший anon). **Secret key** (`sb_secret_...`, бывший service_role) — только в локальном `.env.local` для сид-скрипта, без префикса `VITE_` (всё с `VITE_` попадает в бандл). `.env*` в `.gitignore`, в репо — `.env.example`.

## 2. Главный принцип безопасности

Фронтенд — просто удобная витрина. Все правила живут в Postgres:

1. **GRANT-ы** (какие таблицы/колонки вообще можно трогать) — Postgres проверяет их до RLS.
2. **RLS** (какие строки видны/изменяемы конкретному пользователю).
3. **Смена статуса — только через RPC-функцию** `change_task_status`, которая проверяет переход, роль, исполнителя и комментарий и в той же транзакции пишет историю.
4. **Триггеры** заполняют системные поля (автор, статус «Новая», даты) и не дают их подделать.

Важно: Supabase по умолчанию выдаёт `anon`/`authenticated` полные права на таблицы `public`. В миграции **явно делаем `revoke all`** и выдаём только нужное.

Роль пользователя хранится в `public.profiles.role`, а при создании пользователя берётся из `raw_app_meta_data` (её пользователь менять не может). **Не из `user_metadata`** — её пользователь может переписать сам через `auth.updateUser`.

## 3. Модель данных

```
auth.users ──1:1── profiles (id, full_name, role)
objects (id, name, address, created_by, created_at)
   └──1:N── tasks (id, object_id, title, description, assignee_id, status,
                   author_id, created_at, updated_at)
                └──1:N── task_status_history (id, task_id, from_status, to_status,
                                              changed_by, comment, created_at)
status_transitions (from_status, to_status, actor, requires_comment)  -- справочник, read-only
```

Типы:
```sql
create type public.user_role   as enum ('manager', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');
-- Новая, В работе, На проверке, Принята, На доработке
create type public.transition_actor as enum ('manager', 'assignee');
```

Ключевые ограничения:
- `tasks.object_id references objects on delete restrict` — объект с задачами удалить нельзя.
- `tasks.assignee_id references profiles` — триггер проверяет, что это пользователь с ролью `executor`.
- `task_status_history.task_id references tasks on delete cascade` (задачу можно удалить только в статусе «Новая», см. §6).
- `status_transitions` — единственный источник правды о переходах; его читают и RPC, и фронтенд (чтобы показывать кнопки).

Справочник переходов (данные миграции):

| from | to | actor | requires_comment |
|---|---|---|---|
| new | in_progress | assignee | false |
| in_progress | review | assignee | false |
| review | accepted | manager | false |
| review | rework | manager | **true** |
| rework | in_progress | assignee | false |

Создание («— → Новая») — не переход, а вставка задачи; запись в историю пишет AFTER INSERT триггер.

## 4. Хелперы (схема `private`, не видна через API)

```sql
create schema if not exists private;

create function private.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = (select auth.uid()) and role = 'manager');
$$;
```
Не называть функцию `current_role` — это зарезервированное слово SQL.

## 5. Права: GRANT + RLS

RLS включён на всех таблицах `public`.

| Таблица | GRANT для `authenticated` | RLS |
|---|---|---|
| profiles | `select` | select: все авторизованные (нужны имена в истории и выбор исполнителя). Изменять нельзя никому через API |
| objects | `select, insert, update, delete` | select: `is_manager() or exists(задача этого объекта, где assignee_id = auth.uid())`; insert/update/delete: `is_manager()` |
| tasks | `select`, `insert(title, description, object_id, assignee_id)`, `update(title, description, object_id, assignee_id)`, `delete` | select: `is_manager() or assignee_id = auth.uid()`; insert/update: `is_manager()`; delete: `is_manager() and status = 'new'` |
| task_status_history | только `select` | select: `exists(select 1 from tasks t where t.id = task_id)` — видимость наследуется от RLS задач |
| status_transitions | только `select` | select: все авторизованные |

`anon` — `revoke all` везде. Колонки `status`, `author_id`, `created_at` в `tasks` вне GRANT, поэтому прямой `PATCH ... status=accepted` даёт `permission denied` ещё до RLS.

## 6. Логика статусов (RPC)

```sql
create function public.change_task_status(p_task_id uuid, p_to public.task_status, p_comment text default null)
returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.user_role;
  v_task public.tasks;
  v_rule public.status_transitions;
begin
  if v_uid is null then raise exception 'Не авторизован'; end if;
  select role into v_role from public.profiles where id = v_uid;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Задача не найдена'; end if;
  -- исполнитель не должен даже узнать о существовании чужой задачи
  if v_role = 'executor' and v_task.assignee_id is distinct from v_uid then
    raise exception 'Задача не найдена';
  end if;

  select * into v_rule from public.status_transitions
   where from_status = v_task.status and to_status = p_to;
  if not found then raise exception 'Переход запрещён'; end if;

  if v_rule.actor = 'manager'  and v_role <> 'manager'               then raise exception 'Недостаточно прав'; end if;
  if v_rule.actor = 'assignee' and v_task.assignee_id <> v_uid       then raise exception 'Только назначенный исполнитель'; end if;
  if v_rule.requires_comment and coalesce(btrim(p_comment), '') = '' then raise exception 'Комментарий обязателен'; end if;

  perform set_config('app.status_change', 'on', true);
  update public.tasks set status = p_to, updated_at = now() where id = p_task_id returning * into v_task;
  insert into public.task_status_history(task_id, from_status, to_status, changed_by, comment)
  values (p_task_id, v_rule.from_status, p_to, v_uid, nullif(btrim(p_comment), ''));
  return v_task;
end $$;

revoke execute on function public.change_task_status from public, anon;
grant  execute on function public.change_task_status to authenticated;
```

Триггеры на `tasks`:
- **BEFORE INSERT**: `author_id := auth.uid()`, `status := 'new'`, `created_at := now()`; проверка, что assignee — executor.
- **AFTER INSERT** (security definer): запись в историю `null → new`.
- **BEFORE UPDATE**: если `status` меняется и `current_setting('app.status_change', true) is distinct from 'on'` → исключение (второй рубеж поверх GRANT); запрет менять `author_id`, `created_at`; запрет редактировать принятую задачу; проверка роли assignee.

Подделать историю нельзя: у пользователей нет `insert/update/delete` на `task_status_history`, пишет её только код внутри БД, `changed_by` и `created_at` ставит сервер.

## 7. Auth

- Вход: `signInWithPassword`. Открытая регистрация выключена в настройках Auth проекта (и анонимный вход тоже).
- Пользователи создаются `scripts/seed.ts` через `auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role }, user_metadata: { full_name } })` с secret key из `.env.local`.
- Триггер `on_auth_user_created` на `auth.users` (security definer) создаёт строку в `profiles` с ролью из `raw_app_meta_data->>'role'` (по умолчанию `executor`).

## 8. UI-библиотека: почему Mantine

ТЗ: «дизайн не оцениваем, нужен аккуратный понятный интерфейс», 2–3 часа. Нужна библиотека, которая даёт готовые компоненты без настройки дизайн-системы.

**Mantine 9** — основной выбор:
- одна установка, без Tailwind и без копирования исходников компонентов в репо — в репозитории остаётся только логика, проверяющим проще читать;
- есть всё нужное из коробки: `AppShell`, `Table`, `Badge` (статусы), `Modal`, `Select` (исполнитель), `Textarea`, **`Timeline` (история задачи — ровно под этот экран)**, `@mantine/form`, `@mantine/notifications` (ошибки из БД);
- MIT, TypeScript-first, хорошо знаком Claude Code;
- лёгкость: подключать стили покомпонентно (`@mantine/core/styles/Button.css` и т.п.) или целиком `styles.css` — для тестового допустимо целиком.
- требует React 19.2+ и PostCSS (`postcss-preset-mantine`, `postcss-simple-vars`, файл `postcss.config.cjs`).

Альтернативы:
- **shadcn/ui + Tailwind v4** — легче по бандлу и гибче, но больше настройки, а код компонентов ложится в репо; хорош, если хочется современного вида.
- **Pico CSS** — почти без JS и классов, минимальный вес, но модалки/селекты/таймлайн придётся делать руками.

## 9. Структура репозитория

```
.
├─ CLAUDE.md                     # правила для Claude Code
├─ docs/ARCHITECTURE.md, docs/PLAN.md
├─ docs/EXPLANATION.md           # объяснение для руководителя-непрограммиста
├─ docs/DECISIONS.md             # решения и допущения
├─ supabase/
│  ├─ config.toml
│  └─ migrations/
│     ├─ 0001_schema.sql         # типы, таблицы, справочник переходов
│     ├─ 0002_security.sql       # private-хелперы, revoke/grant, RLS
│     └─ 0003_logic.sql          # триггеры, change_task_status, триггер на auth.users
├─ scripts/
│  ├─ seed.ts                    # пользователи + объекты + задачи в разных статусах
│  └─ security-check.ts          # «атаки» в обход UI, ожидаемо падают
├─ src/
│  ├─ main.tsx, App.tsx, router.tsx
│  ├─ lib/ supabase.ts, database.types.ts, status.ts (подписи/цвета), errors.ts
│  ├─ auth/ AuthProvider.tsx (session + profile), RequireAuth.tsx, RequireRole.tsx
│  ├─ api/ objects.ts, tasks.ts, history.ts, profiles.ts, transitions.ts  (хуки TanStack Query)
│  ├─ components/ Layout, StatusBadge, TaskActions, StatusHistory, ObjectFormModal,
│  │              TaskFormModal, CommentModal, ConfirmDelete
│  └─ pages/ LoginPage, ObjectsPage, ObjectPage, TaskPage, MyTasksPage
├─ .env.example, vercel.json, README.md
```

## 10. Экраны и роуты

| Роут | Экран | Кто | Действия |
|---|---|---|---|
| `/login` | вход | все | email + пароль |
| `/objects` | список объектов | оба (RLS фильтрует) | постановщик: создать/изменить/удалить |
| `/objects/:id` | карточка объекта + задачи со статусами | оба | постановщик: создать задачу |
| `/tasks/:id` | данные задачи, кнопки переходов, история (Timeline) | оба | кнопки из `status_transitions` |
| `/my-tasks` | мои задачи, группировка по статусу | исполнитель | |

После входа: постановщик → `/objects`, исполнитель → `/my-tasks`.

Кнопки действий: `transitions.filter(t => t.from_status === task.status && (t.actor === 'manager' ? me.role === 'manager' : task.assignee_id === me.id))`. Для `requires_comment` — модалка с обязательным комментарием. Это только удобство: проверку всё равно делает БД, ошибки RPC показываются уведомлением.

## 11. Проверка защиты (`scripts/security-check.ts`)

Логинится через publishable key под разными пользователями и пытается обойти UI. Каждая проверка ожидает отказ:

1. `signUp` нового email → ошибка (регистрация выключена).
2. Исполнитель-1 читает задачу исполнителя-2 по id → 0 строк.
3. Исполнитель-1 читает объект, где у него нет задач → 0 строк.
4. Исполнитель `update tasks set status='accepted'` напрямую → ошибка прав.
5. Исполнитель `rpc change_task_status` на «Принята» → «Недостаточно прав».
6. Исполнитель-2 двигает задачу исполнителя-1 → «Задача не найдена».
7. Запрещённый переход (new → accepted) от постановщика → «Переход запрещён».
8. На доработку без комментария → «Комментарий обязателен».
9. `insert / update / delete` в `task_status_history` от любого → ошибка/0 строк.
10. Исполнитель меняет себе роль в `profiles` → ошибка.
11. Исполнитель создаёт объект/задачу → ошибка.
12. Постановщик меняет `author_id`/`created_at` задачи → ошибка.
13. Запрос без входа (anon) к любой таблице → пусто/ошибка.

Скрипт печатает таблицу PASS/FAIL — удобно показать на созвоне.
