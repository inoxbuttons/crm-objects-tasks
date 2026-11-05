import { createBrowserRouter, Navigate } from 'react-router';
import { HomeRedirect, RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { MyTasksPage } from './pages/MyTasksPage';
import { ObjectPage } from './pages/ObjectPage';
import { ObjectsPage } from './pages/ObjectsPage';
import { TaskPage } from './pages/TaskPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <HomeRedirect /> },
          { path: 'objects', element: <ObjectsPage /> },
          { path: 'objects/:id', element: <ObjectPage /> },
          { path: 'tasks/:id', element: <TaskPage /> },
          { path: 'my-tasks', element: <MyTasksPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
], {
  // на GitHub Pages приложение живёт в подпапке /<repo>/
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
});
