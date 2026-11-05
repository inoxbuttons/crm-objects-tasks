import { Button, Group, Modal, Text } from '@mantine/core';

type Props = {
  opened: boolean;
  title: string;
  text: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmModal({ opened, title, text, loading, onConfirm, onClose }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Text mb="md">{text}</Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Отмена
        </Button>
        <Button color="red" loading={loading} onClick={onConfirm}>
          Удалить
        </Button>
      </Group>
    </Modal>
  );
}
