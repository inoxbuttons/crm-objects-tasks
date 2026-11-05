import { Anchor, Button, Card, Grid, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useDeleteTask, useTask } from '../api/tasks';
import { useMe } from '../auth/useAuth';
import { ConfirmModal } from '../components/ConfirmModal';
import { StatusBadge } from '../components/StatusBadge';
import { StatusHistory } from '../components/StatusHistory';
import { TaskActions } from '../components/TaskActions';
import { TaskFormModal } from '../components/TaskFormModal';
import { notifyError, notifyOk } from '../lib/notify';
import { formatDate } from '../lib/status';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <div>{children}</div>
    </div>
  );
}

export function TaskPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const task = useTask(id);
  const del = useDeleteTask();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (task.isPending) return <Loader />;
  const t = task.data;
  if (!t) return <Text>Задача не найдена или нет доступа</Text>;

  const isManager = me.role === 'manager';
  // Только скрываем кнопки; запреты — в БД (триггер и RLS)
  const canEdit = isManager && t.status !== 'accepted';
  const canDelete = isManager && t.status === 'new';

  return (
    <Stack>
      {t.object && (
        <Anchor component={Link} to={`/objects/${t.object.id}`} size="sm">
          ← {t.object.name}
        </Anchor>
      )}
      <Group justify="space-between" align="flex-start">
        <Group>
          <Title order={2}>{t.title}</Title>
          <StatusBadge status={t.status} />
        </Group>
        <Group>
          {canEdit && (
            <Button variant="default" onClick={() => setEditOpen(true)}>
              Изменить
            </Button>
          )}
          {canDelete && (
            <Button variant="light" color="red" onClick={() => setDeleteOpen(true)}>
              Удалить
            </Button>
          )}
        </Group>
      </Group>

      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder>
            <Stack>
              <Field label="Описание">
                <Text style={{ whiteSpace: 'pre-wrap' }}>{t.description || '—'}</Text>
              </Field>
              <Group grow align="flex-start">
                <Field label="Объект">
                  {t.object ? `${t.object.name}, ${t.object.address}` : '—'}
                </Field>
                <Field label="Исполнитель">{t.assignee?.full_name ?? '—'}</Field>
              </Group>
              <Group grow align="flex-start">
                <Field label="Автор">{t.author?.full_name ?? '—'}</Field>
                <Field label="Создана">{formatDate(t.created_at)}</Field>
              </Group>
              <Field label="Действия">
                <TaskActions task={t} />
              </Field>
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card withBorder>
            <Title order={4} mb="md">
              История
            </Title>
            <StatusHistory taskId={t.id} />
          </Card>
        </Grid.Col>
      </Grid>

      <TaskFormModal opened={editOpen} onClose={() => setEditOpen(false)} objectId={t.object_id} task={t} />
      <ConfirmModal
        opened={deleteOpen}
        title="Удалить задачу?"
        text={`«${t.title}» будет удалена из списков. История статусов сохранится в базе.`}
        loading={del.isPending}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() =>
          del.mutate(t.id, {
            onSuccess: () => {
              notifyOk('Задача удалена');
              navigate(`/objects/${t.object_id}`, { replace: true });
            },
            onError: notifyError,
            onSettled: () => setDeleteOpen(false),
          })
        }
      />
    </Stack>
  );
}
