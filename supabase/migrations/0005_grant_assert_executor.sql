-- 0005: триггеры tasks (invoker) вызывают private.assert_executor —
-- нужен execute для authenticated. Функция лишь проверяет роль назначаемого.
grant execute on function private.assert_executor(uuid) to authenticated;
