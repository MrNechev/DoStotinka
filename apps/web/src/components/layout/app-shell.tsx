import {
  ArrowLeftRight,
  CalendarClock,
  CalendarDays,
  ChartPie,
  Flag,
  FolderTree,
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
import { useLogout, useUpcoming, useUpdateProfile, useUser } from '@/api/queries';
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
import { cn } from '@/lib/utils';
import { useRecordEditor } from '../records/record-editor';
import { Logo, LogoMark } from './logo';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/records', label: 'Records', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/statistics', label: 'Statistics', icon: ChartPie },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/planned', label: 'Planned payments', icon: CalendarClock },
  { to: '/budgets', label: 'Budgets', icon: Target },
  { to: '/goals', label: 'Goals', icon: Flag },
  { to: '/categories', label: 'Categories', icon: FolderTree },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const MOBILE_NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/records', label: 'Records', icon: ArrowLeftRight },
  null,
  { to: '/statistics', label: 'Stats', icon: ChartPie },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser();
  const { data: upcoming } = useUpcoming(0);
  const overdue = upcoming?.filter((o) => o.overdue).length ?? 0;
  const items = user.isAdmin
    ? [...NAV, { to: '/admin', label: 'Administration', icon: Shield, end: false }]
    : NAV;
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
          {item.to === '/planned' && overdue > 0 && (
            <span
              className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-expense px-1.5 text-[11px] font-semibold text-white"
              title={`${overdue} overdue`}
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
        <MenuLabel>Theme</MenuLabel>
        <MenuItem icon={<Sun />} onSelect={() => setTheme('light')}>
          Light
        </MenuItem>
        <MenuItem icon={<Moon />} onSelect={() => setTheme('dark')}>
          Dark
        </MenuItem>
        <MenuItem icon={<Monitor />} onSelect={() => setTheme('system')}>
          System
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Settings />} onSelect={() => navigate('/settings')}>
          Settings
        </MenuItem>
        <MenuItem
          icon={<LogOut />}
          onSelect={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}
        >
          Log out
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
            <Plus /> Add record
          </Button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-3">
          <NavItems />
        </div>
        {user.isDemo && (
          <div className="mx-3 mb-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">
            You are exploring the demo account. Data is reset regularly.
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
          aria-label="Open menu"
        >
          <MenuIcon className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="font-semibold">Slavotax</span>
        </div>
        <UserMenu compact />
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
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
                aria-label="Close menu"
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
            Demo account – data is reset regularly.
          </div>
        )}
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
                  aria-label="Add record"
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
