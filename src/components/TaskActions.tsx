import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { useChangeStatus } from '../api/tasks';
import { availableTransitions, useTransitions } from '../api/transitions';
import { useMe } from '../auth/useAuth';
import { notifyError, notifyOk } from '../lib/notify';
import { ACTION_LABEL, STATUS_LABEL } from '../lib/status';
import type { Task, Transition } from '../lib/supabase';

/** Кнопки переходов из справочника status_transitions, доступные текущему пользователю */
export function TaskActions({ task }: { task: Task }) {
  const me = useMe();
  const transitions = useTransitions();
  const change = useChangeStatus();
  const [commentFor, setCommentFor] = useState<Transition | null>(null);
  const [comment, setComment] = useState('');

  const actions = availableTransitions(transitions.data ?? [], task, me);

  const run = (t: Transition, text?: string) =>
    change.mutate(
      { taskId: task.id, to: t.to_status, comment: text },
      {
        onSuccess: () => {
          notifyOk(`Статус: ${STATUS_LABEL[t.to_status]}`);
          setCommentFor(null);
          setComment('');
        },
        onError: notifyError,
      },
    );

  if (!actions.length) {
    return (
      <Text size="sm" c="dimmed">
        Нет доступных действий
      </Text>
    );
  }

  return (
    <>
      <Group>
        {actions.map((t) => (
          <Button
            key={t.to_status}
            color={t.to_status === 'rework' ? 'red' : t.to_status === 'accepted' ? 'green' : undefined}
            variant={t.to_status === 'rework' ? 'light' : 'filled'}
            loading={change.isPending && change.variables?.to === t.to_status}
            onClick={() => (t.requires_comment ? setCommentFor(t) : run(t))}
          >
            {ACTION_LABEL[t.to_status]}
          </Button>
        ))}
      </Group>

      <Modal opened={!!commentFor} onClose={() => setCommentFor(null)} title={commentFor ? ACTION_LABEL[commentFor.to_status] : ''} centered>
        <Stack>
          <Textarea
            label="Комментарий"
            description="Что нужно исправить"
            withAsterisk
            autosize
            minRows={3}
            data-autofocus
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCommentFor(null)}>
              Отмена
            </Button>
            <Button
              disabled={!comment.trim()}
              loading={change.isPending}
              onClick={() => commentFor && run(commentFor, comment.trim())}
            >
              Отправить
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
