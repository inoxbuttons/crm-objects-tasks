import type { TaskStatus, UserRole } from './supabase';

// Только подписи и цвета. Какие переходы разрешены — читается из таблицы status_transitions.
export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
  new: 'blue',
  in_progress: 'yellow',
  review: 'grape',
  accepted: 'green',
  rework: 'red',
};

// Подпись кнопки — по целевому статусу
export const ACTION_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'Взять в работу',
  review: 'Отправить на проверку',
  accepted: 'Принять',
  rework: 'Вернуть на доработку',
};

export const ROLE_LABEL: Record<UserRole, string> = {
  manager: 'Постановщик',
  executor: 'Исполнитель',
};

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
