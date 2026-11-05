import { Anchor, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useObject } from '../api/objects';
import { useObjectTasks } from '../api/tasks';
import { useMe } from '../auth/useAuth';
import { TaskFormModal } from '../components/TaskFormModal';
import { TasksTable } from '../components/TasksTable';

export function ObjectPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const object = useObject(id);
  const tasks = useObjectTasks(id);
  const [formOpen, setFormOpen] = useState(false);

  if (object.isPending) return <Loader />;
  if (!object.data) return <Text>Объект не найден или нет доступа</Text>;

  return (
    <Stack>
      <Anchor component={Link} to="/objects" size="sm">
        ← Объекты
      </Anchor>
      <div>
        <Title order={2}>{object.data.name}</Title>
        <Text c="dimmed">{object.data.address}</Text>
      </div>
      <Group justify="space-between">
        <Title order={4}>{me.role === 'manager' ? 'Задачи' : 'Мои задачи на объекте'}</Title>
        {me.role === 'manager' && <Button onClick={() => setFormOpen(true)}>Новая задача</Button>}
      </Group>
      {tasks.isPending ? <Loader /> : <TasksTable tasks={tasks.data ?? []} />}
      <TaskFormModal opened={formOpen} onClose={() => setFormOpen(false)} objectId={id} />
    </Stack>
  );
}
