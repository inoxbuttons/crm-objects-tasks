-- 0006: автор/создатель по умолчанию — текущий пользователь.
-- Триггеры всё равно перезаписывают эти поля, а колонки вне GRANT;
-- default нужен, чтобы в типах API поля были необязательными при вставке.
alter table public.objects alter column created_by set default auth.uid();
alter table public.tasks   alter column author_id  set default auth.uid();
