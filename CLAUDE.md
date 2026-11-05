# CLAUDE.md — мини-CRM «Объекты и задачи»

Тестовое задание. ТЗ: `Тестовое задание мини-CRM «Объекты и задачи».docx.md`.
Архитектура: `docs/ARCHITECTURE.md`. План: `docs/PLAN.md` — работать строго по фазам, отмечать чекбоксы.

## Стек
Vite + React 19.2 + TypeScript strict, Mantine 9, react-router, TanStack Query, supabase-js, Supabase CLI.

## Жёсткие правила
- Вся авторизация и проверка переходов — в Postgres (GRANT + RLS + RPC + триггеры). UI только скрывает недоступные кнопки.
- Статус задачи меняется ТОЛЬКО через `rpc('change_task_status')`. Никогда не делать `update tasks set status` с клиента.
- Источник правды о переходах — таблица `status_transitions`. Не хардкодить матрицу переходов во фронтенде.
- Supabase по умолчанию даёт полные права на таблицы `public` — всегда `revoke all` и точечные `grant`.
- security definer функции: всегда `set search_path = ''` и полные имена (`public.tasks`).
- Роль — из `profiles`/`app_metadata`, никогда из `user_metadata`.
- Во фронтенде только `VITE_SUPABASE_PUBLISHABLE_KEY`. `SUPABASE_SECRET_KEY` — только в `scripts/`, без префикса `VITE_`. Никаких ключей в коде и коммитах.
- Схема меняется только новыми файлами в `supabase/migrations/`; применённые миграции не редактировать.
- После изменения БД: `npm run db:push && npm run db:types && npm run security-check`.
- Тексты интерфейса и ошибок из БД — на русском.

## Команды
- `npm run dev` / `build` / `typecheck`
- `npm run db:push` — применить миграции к облачному проекту
- `npm run db:types` — сгенерировать `src/lib/database.types.ts`
- `npm run seed` — тестовые пользователи и данные
- `npm run security-check` — проверки доступа в обход UI (должно быть всё PASS)

## Стиль
Небольшие компоненты, хуки данных в `src/api/`, без лишних абстракций. Дизайн простой: стандартные компоненты Mantine.
