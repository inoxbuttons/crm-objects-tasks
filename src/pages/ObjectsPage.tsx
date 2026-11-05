import { ActionIcon, Anchor, Button, Group, Loader, Table, Text, Title, Tooltip } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
import { useDeleteObject, useObjects } from '../api/objects';
import { useMe } from '../auth/useAuth';
import { ConfirmModal } from '../components/ConfirmModal';
import { ObjectFormModal } from '../components/ObjectFormModal';
import { notifyError, notifyOk } from '../lib/notify';
import type { ObjectRow } from '../lib/supabase';

export function ObjectsPage() {
  const me = useMe();
  const isManager = me.role === 'manager';
  const objects = useObjects();
  const del = useDeleteObject();
  const [editing, setEditing] = useState<ObjectRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<ObjectRow | null>(null);

  const openForm = (o: ObjectRow | null) => {
    setEditing(o);
    setFormOpen(true);
  };

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Объекты</Title>
        {isManager && <Button onClick={() => openForm(null)}>Новый объект</Button>}
      </Group>

      {objects.isPending ? (
        <Loader />
      ) : objects.error ? (
        <Text c="red">Не удалось загрузить объекты</Text>
      ) : !objects.data.length ? (
        <Text c="dimmed">{isManager ? 'Объектов пока нет' : 'У вас нет задач ни в одном объекте'}</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Название</Table.Th>
              <Table.Th>Адрес</Table.Th>
              <Table.Th>{isManager ? 'Задач' : 'Моих задач'}</Table.Th>
              {isManager && <Table.Th w={110} />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {objects.data.map((o) => (
              <Table.Tr key={o.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/objects/${o.id}`}>
                    {o.name}
                  </Anchor>
                </Table.Td>
                <Table.Td>{o.address}</Table.Td>
                <Table.Td>{o.taskCount}</Table.Td>
                {isManager && (
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Tooltip label="Изменить">
                        <ActionIcon variant="subtle" onClick={() => openForm(o)} aria-label="Изменить">
                          ✎
                        </ActionIcon>
                      </Tooltip>
                      {/* ТЗ: показываем только доступные действия. Объект с задачами БД удалить не даст */}
                      {o.taskCount === 0 && (
                        <Tooltip label="Удалить">
                          <ActionIcon variant="subtle" color="red" onClick={() => setDeleting(o)} aria-label="Удалить">
                            ✕
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <ObjectFormModal opened={formOpen} onClose={() => setFormOpen(false)} object={editing} />
      <ConfirmModal
        opened={!!deleting}
        title="Удалить объект?"
        text={`«${deleting?.name}» будет удалён.`}
        loading={del.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => notifyOk('Объект удалён'),
            onError: notifyError,
            onSettled: () => setDeleting(null),
          })
        }
      />
    </>
  );
}
