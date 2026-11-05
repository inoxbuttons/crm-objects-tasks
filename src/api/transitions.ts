import { useQuery } from '@tanstack/react-query';
import { supabase, type Profile, type Task, type Transition } from '../lib/supabase';

// Справочник переходов из БД — единый источник правды для сервера и интерфейса
export function useTransitions() {
  return useQuery({
    queryKey: ['status_transitions'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('status_transitions').select('*');
      if (error) throw error;
      return data;
    },
  });
}

/** Какие переходы показать кнопками. Это лишь удобство: проверку всё равно делает БД. */
export function availableTransitions(
  transitions: Transition[],
  task: Pick<Task, 'status' | 'assignee_id'>,
  me: Profile,
) {
  return transitions.filter(
    (t) =>
      t.from_status === task.status &&
      (t.actor === 'manager' ? me.role === 'manager' : task.assignee_id === me.id),
  );
}
