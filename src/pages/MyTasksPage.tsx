import { Loader, Stack, Text, Title } from '@mantine/core';
import { useMyTasks } from '../api/tasks';
import { useMe } from '../auth/useAuth';
import { TasksTable } from '../components/TasksTable';
import { STATUS_LABEL } from '../lib/status';
import type { TaskStatus } from '../lib/supabase';

// Сначала то, что требует действий исполнителя
const ORDER: TaskStatus[] = ['rework', 'new', 'in_progress', 'review', 'accepted'];

export function MyTasksPage() {
  const me = useMe();
  const tasks = useMyTasks(me.id);

  if (tasks.isPending) return <Loader />;
  if (tasks.error) return <Text c="red">Не удалось загрузить задачи</Text>;

  return (
    <Stack>
      <Title order={2}>Мои задачи</Title>
      {!tasks.data.length && <Text c="dimmed">Вам пока не назначено задач</Text>}
      {ORDER.map((status) => {
        const group = tasks.data.filter((t) => t.status === status);
        if (!group.length) return null;
        return (
          <div key={status}>
            <Title order={4} mb="xs">
              {STATUS_LABEL[status]} ({group.length})
            </Title>
            <TasksTable tasks={group} showObject />
          </div>
        );
      })}
    </Stack>
  );
}
