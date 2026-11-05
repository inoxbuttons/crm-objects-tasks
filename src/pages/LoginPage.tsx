import { Alert, Button, Center, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';

import { HomeRedirect } from '../auth/RequireAuth';
import { useAuth } from '../auth/useAuth';
import { errorText } from '../lib/errors';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const { session, profile, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Введите email'),
      password: (v) => (v ? null : 'Введите пароль'),
    },
  });

  if (!loading && session && profile) return <HomeRedirect />;
  

  const submit = form.onSubmit(async (v) => {
    setError(null);
    setPending(true);
    const { error } = await supabase.auth.signInWithPassword({ email: v.email.trim(), password: v.password });
    setPending(false);
    if (error) setError(errorText(error));
  });

  return (
    <Center h="100vh" bg="gray.0">
      <Paper withBorder shadow="sm" p="xl" w={380}>
        <form onSubmit={submit}>
          <Stack>
            <Title order={3}>Вход</Title>
            {error && <Alert color="red">{error}</Alert>}
            <TextInput label="Email" autoComplete="username" {...form.getInputProps('email')} />
            <PasswordInput label="Пароль" autoComplete="current-password" {...form.getInputProps('password')} />
            <Button type="submit" loading={pending}>
              Войти
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
