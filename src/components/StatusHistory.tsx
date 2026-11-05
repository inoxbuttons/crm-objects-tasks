import { Loader, Text, Timeline } from '@mantine/core';
import { useHistory } from '../api/history';
import { STATUS_COLOR, STATUS_LABEL, formatDate } from '../lib/status';

export function StatusHistory({ taskId }: { taskId: string }) {
  const history = useHistory(taskId);
  if (history.isPending) return <Loader size="sm" />;
  if (history.error) return <Text c="red">Не удалось загрузить историю</Text>;

  return (
    <Timeline active={history.data.length - 1} bulletSize={14} lineWidth={2}>
      {history.data.map((h) => (
        <Timeline.Item
          key={h.id}
          color={STATUS_COLOR[h.to_status]}
          title={h.from_status ? `${STATUS_LABEL[h.from_status]} → ${STATUS_LABEL[h.to_status]}` : `Создана (${STATUS_LABEL[h.to_status]})`}
        >
          <Text size="sm" c="dimmed">
            {h.author?.full_name ?? '—'} · {formatDate(h.created_at)}
          </Text>
          {h.comment && (
            <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
              «{h.comment}»
            </Text>
          )}
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
