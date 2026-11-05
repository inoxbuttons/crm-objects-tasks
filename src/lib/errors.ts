type DbError = { message?: string; code?: string } | null | undefined;

// Ошибки из нашего кода в БД (raise exception) уже на русском — показываем как есть.
// Системные ошибки Postgres/PostgREST переводим.
export function errorText(e: unknown): string {
  const err = e as DbError;
  const msg = err?.message ?? String(e);
  if (err?.code === '42501' || msg.includes('permission denied') || msg.includes('row-level security')) {
    return 'Недостаточно прав для этого действия';
  }
  if (err?.code === '23503') return 'Действие невозможно: есть связанные записи';
  if (err?.code === '23514') return 'Заполните обязательные поля';
  if (err?.code === 'PGRST116') return 'Запись не найдена или нет доступа';
  if (msg.includes('Invalid login credentials')) return 'Неверный email или пароль';
  if (msg.includes('Failed to fetch')) return 'Нет связи с сервером';
  return msg;
}
