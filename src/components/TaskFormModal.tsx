import { Button, Group, Modal, Select, Stack, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useObjects } from '../api/objects';
import { useExecutors } from '../api/profiles';
import { useSaveTask } from '../api/tasks';
import { notifyError, notifyOk } from '../lib/notify';
import type { Task } from '../lib/supabase';

type Props = {
  opened: boolean;
  onClose: () => void;
  objectId: string;
  task?: Task | null;
};

export function TaskFormModal({ opened, onClose, objectId, task }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={task ? 'Изменить задачу' : 'Новая задача'} centered size="lg">
      <TaskForm objectId={objectId} task={task} onClose={onClose} />
    </Modal>
  );
}

function TaskForm({ objectId, task, onClose }: Omit<Props, 'opened'>) {
  const save = useSaveTask();
  const executors = useExecutors();
  const objects = useObjects();
  const form = useForm({
    initialValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      assignee_id: task?.assignee_id ?? '',
      object_id: task?.object_id ?? objectId,
    },
    validate: {
      title: (v) => (v.trim() ? null : 'Укажите название'),
      assignee_id: (v) => (v ? null : 'Выберите исполнителя'),
      object_id: (v) => (v ? null : 'Выберите объект'),
    },
  });

  // Автора, статус «Новая» и дату создания ставит БД
  const submit = form.onSubmit((v) =>
    save.mutate(
      { id: task?.id, title: v.title.trim(), description: v.description.trim(), assignee_id: v.assignee_id, object_id: v.object_id },
      {
        onSuccess: () => {
          notifyOk(task ? 'Задача сохранена' : 'Задача создана');
          onClose();
        },
        onError: notifyError,
      },
    ),
  );

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Название" withAsterisk data-autofocus {...form.getInputProps('title')} />
        <Textarea label="Описание" autosize minRows={3} {...form.getInputProps('description')} />
        <Select
          label="Исполнитель"
          withAsterisk
          searchable
          data={(executors.data ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
          {...form.getInputProps('assignee_id')}
        />
        {task && (
          <Select
            label="Объект"
            withAsterisk
            data={(objects.data ?? []).map((o) => ({ value: o.id, label: o.name }))}
            {...form.getInputProps('object_id')}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={save.isPending}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
