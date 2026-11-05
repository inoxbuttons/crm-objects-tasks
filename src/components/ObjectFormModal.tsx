import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useSaveObject } from '../api/objects';
import { notifyError, notifyOk } from '../lib/notify';
import type { ObjectRow } from '../lib/supabase';

type Props = { opened: boolean; onClose: () => void; object?: ObjectRow | null };

export function ObjectFormModal({ opened, onClose, object }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={object ? 'Изменить объект' : 'Новый объект'} centered>
      {/* содержимое модалки монтируется заново при каждом открытии — форма с актуальными значениями */}
      <ObjectForm object={object} onClose={onClose} />
    </Modal>
  );
}

function ObjectForm({ object, onClose }: { object?: ObjectRow | null; onClose: () => void }) {
  const save = useSaveObject();
  const form = useForm({
    initialValues: { name: object?.name ?? '', address: object?.address ?? '' },
    validate: {
      name: (v) => (v.trim() ? null : 'Укажите название'),
      address: (v) => (v.trim() ? null : 'Укажите адрес'),
    },
  });

  const submit = form.onSubmit((values) =>
    save.mutate(
      { id: object?.id, name: values.name.trim(), address: values.address.trim() },
      {
        onSuccess: () => {
          notifyOk(object ? 'Объект сохранён' : 'Объект создан');
          onClose();
        },
        onError: notifyError,
      },
    ),
  );

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Название" withAsterisk data-autofocus {...form.getInputProps('name')} />
        <TextInput label="Адрес" withAsterisk {...form.getInputProps('address')} />
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
