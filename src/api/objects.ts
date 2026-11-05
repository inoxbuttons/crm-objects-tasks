import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Видимость строк (постановщик — всё, исполнитель — объекты со своими задачами) решает RLS
export function useObjects() {
  return useQuery({
    queryKey: ['objects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('objects')
        .select('*, tasks(count)')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data.map((o) => ({ ...o, taskCount: o.tasks[0]?.count ?? 0 }));
    },
  });
}

export function useObject(id: string) {
  return useQuery({
    queryKey: ['objects', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('objects').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type ObjectInput = { name: string; address: string };

export function useSaveObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ObjectInput & { id?: string }) => {
      const q = id
        ? supabase.from('objects').update(input).eq('id', id)
        : supabase.from('objects').insert(input);
      const { data, error } = await q.select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['objects'] }),
  });
}

export function useDeleteObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('objects').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['objects'] }),
  });
}
