import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, type ReactNode, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from 'sonner';
import { t } from '@/i18n';
import { ApiError, setUnauthorizedHandler } from './api/client';
import { qk, useMe } from './api/queries';
import { AppShell } from './components/layout/app-shell';
import { LogoMark } from './components/layout/logo';
import { RecordEditorProvider } from './components/records/record-editor';
import { ConfirmProvider } from './components/ui/confirm';
import { Spinner } from './components/ui/misc';
import { useThemeSync } from './hooks/use-theme';
import { setNumberLocale } from './lib/format';
import { LoginPage } from './pages/auth/login-page';
import { RegisterPage } from './pages/auth/register-page';
import { NotFoundPage } from './pages/not-found-page';

const DashboardPage = lazy(() => import('./pages/dashboard-page'));
const RecordsPage = lazy(() => import('./pages/records-page'));
const AccountsPage = lazy(() => import('./pages/accounts-page'));
const AccountDetailPage = lazy(() => import('./pages/account-detail-page'));
const StatisticsPage = lazy(() => import('./pages/statistics-page'));
const CalendarPage = lazy(() => import('./pages/calendar-page'));
const PlannedPage = lazy(() => import('./pages/planned-page'));
const BudgetsPage = lazy(() => import('./pages/budgets-page'));
const CategoriesPage = lazy(() => import('./pages/categories-page'));
const SettingsPage = lazy(() => import('./pages/settings-page'));
const ImportPage = lazy(() => import('./pages/import-page'));
const GoalsPage = lazy(() => import('./pages/goals-page'));
const AdminPage = lazy(() => import('./pages/admin-page'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

setUnauthorizedHandler(() => {
  queryClient.setQueryData(qk.me, null);
});

function FullscreenLoader() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <LogoMark className="size-12" />
      <Spinner />
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

/** Renders children only for logged-in users. */
function RequireAuth() {
  const { data: user, isLoading, isError } = useMe();
  const location = useLocation();
  useThemeSync(user?.theme);
  useEffect(() => setNumberLocale(user?.locale), [user?.locale]);
  if (isLoading) return <FullscreenLoader />;
  if (isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {t('Cannot reach the Slavotax server. Please check your connection and reload the page.')}
      </div>
    );
  }
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return (
    <RecordEditorProvider>
      <AppShell />
    </RecordEditorProvider>
  );
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useMe();
  const location = useLocation();
  useThemeSync(undefined);
  if (isLoading) return <FullscreenLoader />;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }
  return <>{children}</>;
}

const page = (el: ReactNode) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    element: <Outlet />,
    children: [
      {
        path: '/login',
        element: (
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        ),
      },
      {
        path: '/register',
        element: (
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        ),
      },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: page(<DashboardPage />) },
          { path: 'records', element: page(<RecordsPage />) },
          { path: 'accounts', element: page(<AccountsPage />) },
          { path: 'accounts/:id', element: page(<AccountDetailPage />) },
          { path: 'statistics', element: page(<StatisticsPage />) },
          { path: 'calendar', element: page(<CalendarPage />) },
          { path: 'planned', element: page(<PlannedPage />) },
          { path: 'budgets', element: page(<BudgetsPage />) },
          { path: 'goals', element: page(<GoalsPage />) },
          { path: 'categories', element: page(<CategoriesPage />) },
          { path: 'settings', element: page(<SettingsPage />) },
          { path: 'import', element: page(<ImportPage />) },
          { path: 'admin', element: page(<AdminPage />) },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
      <Toaster richColors position="top-center" closeButton toastOptions={{ duration: 3000 }} />
    </QueryClientProvider>
  );
}
