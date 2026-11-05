import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
// Во фронтенде — только publishable key. Все права проверяет БД (RLS + RPC).
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error('Не заданы VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY');
}
if (!publishableKey.startsWith('sb_publishable_')) {
  throw new Error('Во фронтенде допускается только publishable key');
}

export const supabase = createClient<Database>(url, publishableKey);

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TaskStatus = Database['public']['Enums']['task_status'];
export type UserRole = Database['public']['Enums']['user_role'];
export type Profile = Tables<'profiles'>;
export type Task = Tables<'tasks'>;
export type ObjectRow = Tables<'objects'>;
export type Transition = Tables<'status_transitions'>;
