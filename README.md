# Мини-CRM «Объекты и задачи»

Тестовое задание: постановщик ставит задачи по объектам (стройкам), исполнители берут их в работу и отправляют на проверку. Все права доступа и правила смены статусов проверяются в базе данных (Postgres в Supabase), а не только в интерфейсе.

**Приложение:** https://inoxbuttons.github.io/crm-objects-tasks/

- Архитектура: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Объяснение для руководителя: [docs/EXPLANATION.md](docs/EXPLANATION.md)
- Решения и допущения: [docs/DECISIONS.md](docs/DECISIONS.md)

## Стек

Vite + React 19 + TypeScript (strict), Mantine 9, react-router, TanStack Query, supabase-js, Supabase CLI.

## Тестовые пользователи

| Роль | Email | Пароль |
|---|---|---|
| Постановщик | manager@crm.test | `Manager-2026!` |
| Постановщик | manager2@crm.test | `Manager2-2026!` |
| Исполнитель | executor1@crm.test | `Executor1-2026!` |
| Исполнитель | executor2@crm.test | `Executor2-2026!` |

В базе 3 объекта и 7 задач во всех пяти статусах (включая «На доработке» с комментарием).

## Запуск

Нужен Node.js 20+ и проект Supabase.

```bash
npm install
cp .env.example .env.local   # заполнить значения (см. ниже)
npm run db:push              # применить миграции supabase/migrations к облачной БД
npm run seed                 # тестовые пользователи и данные (идемпотентно)
npm run dev                  # http://localhost:5173
```

`.env.local`:

| Переменная | Где используется |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | фронтенд (публичные значения) |
| `SUPABASE_SECRET_KEY` | только `scripts/seed.ts` — создание пользователей. Без префикса `VITE_`, в бандл не попадает |
| `SUPABASE_DB_URL` | `db:push` / `db:types` — строка подключения (Session pooler) в одинарных кавычках |

В настройках Supabase Auth должны быть выключены регистрация новых пользователей и анонимный вход.

## Деплой (GitHub Pages)

Workflow `.github/workflows/deploy.yml` собирает сайт при каждом push в `main`.
Публичные `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` берутся из Settings → Secrets and variables → Actions → **Variables**.
Сайт живёт в подпапке `/<repo>/` (`BASE_PATH` при сборке), а прямые ссылки вида `/tasks/…` работают через копию `index.html` в `404.html`.

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev` / `build` / `typecheck` / `lint` | разработка и сборка |
| `npm run db:push` | применить новые миграции |
| `npm run db:types` | сгенерировать `src/lib/database.types.ts` |
| `npm run seed` | тестовые данные; статусы проводятся через ту же RPC от имени пользователей, поэтому история честная |
| `npm run security-check` | 42 «атаки» в обход интерфейса с publishable key; печатает таблицу PASS/FAIL |
| `npm run check:bundle` | убедиться, что secret key не попал в `dist/` |

## Как устроена защита (коротко)

1. **GRANT** — `anon` не имеет доступа ни к чему; `authenticated` может менять только разрешённые колонки (например, у `tasks` нельзя писать `status`, `author_id`, `created_at`).
2. **RLS** — постановщик видит всё; исполнитель — только свои задачи и объекты, где они есть. История видна, только если видна задача.
3. **Смена статуса** — только через функцию `change_task_status` (RPC). Она сверяется со справочником `status_transitions`, проверяет роль/исполнителя/комментарий и в той же транзакции пишет историю.
4. **Триггеры** проставляют автора, статус «Новая», даты; запрещают менять статус в обход RPC и редактировать принятую задачу.
5. **История** — у пользователей нет прав на insert/update/delete, пишет её только код внутри БД.

Миграции: `supabase/migrations/0001…0006`.

## Структура

```
supabase/migrations/   схема, права, логика
scripts/               seed, security-check, check-bundle
src/api/               хуки данных (TanStack Query)
src/auth/              сессия и профиль, защита роутов
src/components/        таблицы, формы, кнопки действий, история
src/pages/             экраны: вход, объекты, объект, задача, мои задачи
```
