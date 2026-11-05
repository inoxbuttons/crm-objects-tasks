import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useHistory(taskId: string) {
  return useQuery({
    queryKey: ['history', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_status_history')
        .select('*, author:profiles!task_status_history_changed_by_fkey(full_name)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
