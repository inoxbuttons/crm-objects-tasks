import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase, type TaskStatus } from '../lib/supabase';

const LIST_SELECT = '*, assignee:profiles!tasks_assignee_id_fkey(id, full_name), object:objects(id, name)';

const invalidateTasks = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: ['tasks'] }),
    qc.invalidateQueries({ queryKey: ['history'] }),
    qc.invalidateQueries({ queryKey: ['objects'] }),
  ]);

export function useObjectTasks(objectId: string) {
  return useQuery({
    queryKey: ['tasks', 'object', objectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(LIST_SELECT)
        .eq('object_id', objectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useMyTasks(userId: string) {
  return useQuery({
    queryKey: ['tasks', 'my', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(LIST_SELECT)
        .eq('assignee_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(
          '*, assignee:profiles!tasks_assignee_id_fkey(id, full_name), author:profiles!tasks_author_id_fkey(id, full_name), object:objects(id, name, address)',
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type TaskInput = { title: string; description: string; object_id: string; assignee_id: string };

// Автор, статус «Новая» и даты ставит триггер в БД
export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: TaskInput & { id?: string }) => {
      const q = id ? supabase.from('tasks').update(input).eq('id', id) : supabase.from('tasks').insert(input);
      const { data, error } = await q.select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateTasks(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Мягкое удаление: задача скрывается, история статусов остаётся в БД
      const { error } = await supabase.rpc('delete_task', { p_task_id: id });
      if (error) throw error;
    },
    onSuccess: () => invalidateTasks(qc),
  });
}

// Статус меняется ТОЛЬКО через RPC: проверки перехода/прав/комментария и запись истории — в БД
export function useChangeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { taskId: string; to: TaskStatus; comment?: string }) => {
      const { data, error } = await supabase.rpc('change_task_status', {
        p_task_id: args.taskId,
        p_to: args.to,
        p_comment: args.comment,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateTasks(qc),
  });
}
