import type { AdminSettings } from '@dostotinka/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  CalendarClock,
  CalendarDays,
  ChartPie,
  Flag,
  FolderTree,
  Handshake,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Plus,
  Settings,
  Shield,
  Sun,
  Target,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { api } from '@/api/client';
import {
  useInboxCount,
  useLogout,
  useServerConfig,
  useUpcoming,
  useUpdateProfile,
  useUser,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { applyTheme, type ThemePref } from '@/hooks/use-theme';
import { t, tn } from '@/i18n';
import { cn } from '@/lib/utils';
import { useRecordEditor } from '../records/record-editor';
import { Logo, LogoMark } from './logo';
import { PendingRecordsBanner } from './pending-records';

const NAV = [
  { to: '/', label: t('Dashboard'), icon: LayoutDashboard, end: true },
  { to: '/records', label: t('Records'), icon: ArrowLeftRight },
  { to: '/accounts', label: t('Accounts'), icon: Wallet },
  { to: '/statistics', label: t('Statistics'), icon: ChartPie },
  { to: '/calendar', label: t('Calendar'), icon: CalendarDays },
  { to: '/planned', label: t('Planned payments'), icon: CalendarClock },
  { to: '/budgets', label: t('Budgets'), icon: Target },
  { to: '/goals', label: t('Goals'), icon: Flag },
  { to: '/debts', label: t('Debts'), icon: Handshake },
  { to: '/categories', label: t('Categories'), icon: FolderTree },
  { to: '/settings', label: t('Settings'), icon: Settings },
];

const MOBILE_NAV = [
  { to: '/', label: t('Home'), icon: LayoutDashboard, end: true },
  { to: '/records', label: t('Records'), icon: ArrowLeftRight },
  null,
  { to: '/statistics', label: t('Stats'), icon: ChartPie },
  { to: '/accounts', label: t('Accounts'), icon: Wallet },
];

/** The inbox shows up once automatic import is used (or something waits in it). */
export function useInboxBadge() {
  const user = useUser();
  const { data: config } = useServerConfig();
  const on =
    config?.automaticImport !== false &&
    !user.isDemo &&
    (user.automaticImport.notifications || user.automaticImport.bank);
  const { data } = useInboxCount(!!on);
  const pending = data?.pending ?? 0;
  return { visible: !!on || pending > 0, pending };
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser();
  const { data: upcoming } = useUpcoming(0);
  const overdue = upcoming?.filter((o) => o.overdue).length ?? 0;
  const inbox = useInboxBadge();
  // Administrators see a dot when a new DoStotinka version is out.
  const adminSettings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api<AdminSettings>('/admin/settings'),
    enabled: user.isAdmin,
    staleTime: 60 * 60_000,
  });
  const updateAvailable = !!adminSettings.data?.update.available;
  const base = inbox.visible
    ? [
        ...NAV.slice(0, 2),
        { to: '/inbox', label: t('Inbox'), icon: Inbox, end: false },
        ...NAV.slice(2),
      ]
    : NAV;
  const items = user.isAdmin
    ? [...base, { to: '/admin', label: t('Administration'), icon: Shield, end: false }]
    : base;
  return (
    <nav className="grid gap-0.5">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              isActive && 'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary',
            )
          }
        >
          <item.icon className="size-[18px]" />
          {item.label}
          {item.to === '/inbox' && inbox.pending > 0 && (
            <span
              className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
              title={tn(inbox.pending, '{n} transaction to review', '{n} transactions to review')}
            >
              {inbox.pending}
            </span>
          )}
          {item.to === '/admin' && updateAvailable && (
            <span
              className="ml-auto size-2 rounded-full bg-primary"
              title={t('A new version is available')}
            />
          )}
          {item.to === '/planned' && overdue > 0 && (
            <span
              className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-expense px-1.5 text-[11px] font-semibold text-white"
              title={tn(overdue, '{n} payment overdue', '{n} payments overdue')}
            >
              {overdue}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function UserMenu({ compact }: { compact?: boolean }) {
  const user = useUser();
  const logout = useLogout();
  const updateProfile = useUpdateProfile();
  const navigate = useNavigate();
  const setTheme = (theme: ThemePref) => {
    applyTheme(theme);
    updateProfile.mutate({ theme });
  };
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full cursor-pointer items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted',
            compact && 'w-auto p-1',
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
            {initials}
          </span>
          {!compact && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          )}
        </button>
      </MenuTrigger>
      <MenuContent
        align={compact ? 'end' : 'start'}
        side={compact ? 'bottom' : 'top'}
        className="w-56"
      >
        <MenuLabel>{t('Theme')}</MenuLabel>
        <MenuItem icon={<Sun />} onSelect={() => setTheme('light')}>
          {t('Light')}
        </MenuItem>
        <MenuItem icon={<Moon />} onSelect={() => setTheme('dark')}>
          {t('Dark')}
        </MenuItem>
        <MenuItem icon={<Monitor />} onSelect={() => setTheme('system')}>
          {t('System')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Settings />} onSelect={() => navigate('/settings')}>
          {t('Settings')}
        </MenuItem>
        <MenuItem
          icon={<LogOut />}
          onSelect={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}
        >
          {t('Log out')}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function AppShell() {
  const user = useUser();
  const { openNew } = useRecordEditor();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Keyboard shortcut: "n" adds a new record.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (target.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      // Never replace an open dialog (e.g. a record being edited).
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openNew();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openNew]);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="px-5 pb-4 pt-5">
          <Logo />
        </div>
        <div className="px-3 pb-3">
          <Button className="w-full" onClick={() => openNew()}>
            <Plus /> {t('Add record')}
          </Button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-3">
          <NavItems />
        </div>
        {user.isDemo && (
          <div className="mx-3 mb-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">
            {t(
              'You are exploring the shared demo account – others can see what you enter. Data is reset regularly.',
            )}
          </div>
        )}
        <div className="border-t border-border p-2">
          <UserMenu />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/90 px-3 backdrop-blur lg:hidden">
        <button
          type="button"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
          onClick={() => setDrawerOpen(true)}
          aria-label={t('Open menu')}
        >
          <MenuIcon className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="font-semibold">{t('DoStotinka')}</span>
        </div>
        <UserMenu compact />
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('Close menu')}
            className="animate-overlay-in absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="animate-pop-in absolute inset-y-0 left-0 flex w-72 flex-col bg-card shadow-2xl">
            <div className="flex items-center justify-between px-4 py-4">
              <Logo />
              <button
                type="button"
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                onClick={() => setDrawerOpen(false)}
                aria-label={t('Close menu')}
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3">
              <NavItems onNavigate={() => setDrawerOpen(false)} />
            </div>
            <div className="border-t border-border p-2">
              <UserMenu />
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
        {user.isDemo && (
          <div className="mb-4 rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning lg:hidden">
            {t('Shared demo account – visible to others and reset regularly.')}
          </div>
        )}
        <PendingRecordsBanner />
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden">
        <div className="grid h-16 grid-cols-5 items-center">
          {MOBILE_NAV.map((item) =>
            item ? (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 text-[11px] font-medium text-muted-foreground',
                    isActive && 'text-primary',
                  )
                }
              >
                <item.icon className="size-5" />
                {item.label}
              </NavLink>
            ) : (
              <div key="fab" className="flex justify-center">
                <button
                  type="button"
                  onClick={() => openNew()}
                  aria-label={t('Add record')}
                  className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
                >
                  <Plus className="size-7" />
                </button>
              </div>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}
