import { Center, Loader } from '@mantine/core';
import { Navigate, Outlet } from 'react-router';
import { useAuth } from './useAuth';

export function RequireAuth() {
  const { session, profile, loading } = useAuth();
  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!session || !profile) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Стартовая страница по роли */
export function HomeRedirect() {
  const { profile } = useAuth();
  return <Navigate to={profile?.role === 'executor' ? '/my-tasks' : '/objects'} replace />;
}
