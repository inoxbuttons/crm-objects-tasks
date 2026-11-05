import { Anchor, Table, Text } from '@mantine/core';
import { Link } from 'react-router';
import { formatDate } from '../lib/status';
import type { Task } from '../lib/supabase';
import { StatusBadge } from './StatusBadge';

type Row = Task & { assignee: { full_name: string } | null; object: { id: string; name: string } | null };

export function TasksTable({ tasks, showObject }: { tasks: Row[]; showObject?: boolean }) {
  if (!tasks.length) return <Text c="dimmed">Задач нет</Text>;
  return (
    <Table striped highlightOnHover layout="fixed">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Задача</Table.Th>
          {showObject && <Table.Th>Объект</Table.Th>}
          <Table.Th>Исполнитель</Table.Th>
          <Table.Th>Статус</Table.Th>
          <Table.Th>Создана</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {tasks.map((t) => (
          <Table.Tr key={t.id}>
            <Table.Td>
              <Anchor component={Link} to={`/tasks/${t.id}`}>
                {t.title}
              </Anchor>
            </Table.Td>
            {showObject && (
              <Table.Td>
                {t.object && (
                  <Anchor component={Link} to={`/objects/${t.object.id}`} c="dimmed">
                    {t.object.name}
                  </Anchor>
                )}
              </Table.Td>
            )}
            <Table.Td>{t.assignee?.full_name ?? '—'}</Table.Td>
            <Table.Td>
              <StatusBadge status={t.status} />
            </Table.Td>
            <Table.Td>{formatDate(t.created_at)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
