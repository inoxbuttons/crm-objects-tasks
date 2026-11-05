import { AppShell, Badge, Button, Group, NavLink, Text, Title } from '@mantine/core';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth, useMe } from '../auth/useAuth';
import { ROLE_LABEL } from '../lib/status';

export function Layout() {
  const me = useMe();
  const { signOut } = useAuth();
  const { pathname } = useLocation();

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 220, breakpoint: 'xs' }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>Объекты и задачи</Title>
          <Group gap="sm">
            <Text size="sm">{me.full_name}</Text>
            <Badge variant="light">{ROLE_LABEL[me.role]}</Badge>
            <Button size="xs" variant="default" onClick={signOut}>
              Выйти
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        {me.role === 'executor' && (
          <NavLink component={Link} to="/my-tasks" label="Мои задачи" active={pathname.startsWith('/my-tasks')} />
        )}
        <NavLink component={Link} to="/objects" label="Объекты" active={pathname.startsWith('/objects')} />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
