// Тестовые пользователи (это тестовые данные, пароли публикуются в README).
export const USERS = {
  manager: { email: 'manager@crm.test', password: 'Manager-2026!', full_name: 'Анна Петрова', role: 'manager' },
  manager2: { email: 'manager2@crm.test', password: 'Manager2-2026!', full_name: 'Олег Смирнов', role: 'manager' },
  executor1: { email: 'executor1@crm.test', password: 'Executor1-2026!', full_name: 'Иван Кузнецов', role: 'executor' },
  executor2: { email: 'executor2@crm.test', password: 'Executor2-2026!', full_name: 'Пётр Сидоров', role: 'executor' },
} as const;

export type UserKey = keyof typeof USERS;

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Не задана переменная окружения ${name} (см. .env.example)`);
  return v;
}
