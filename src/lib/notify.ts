import { notifications } from '@mantine/notifications';
import { errorText } from './errors';

export const notifyError = (e: unknown) => notifications.show({ color: 'red', title: 'Ошибка', message: errorText(e) });
export const notifyOk = (message: string) => notifications.show({ color: 'green', message });
