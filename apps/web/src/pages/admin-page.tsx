import type { AdminSettings, AdminUser } from '@dostotinka/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, MoreHorizontal, Shield, ShieldOff, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/api/client';
import { qk, useUser } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import {
  Badge,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  PageHeader,
  Skeleton,
  Switch,
} from '@/components/ui/misc';
import { t } from '@/i18n';
import { ago } from '@/lib/date';
import { plural } from '@/lib/format';

const adminKeys = { users: ['admin', 'users'] as const, settings: ['admin', 'settings'] as const };

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', isAdmin: false });
  const create = useMutation({
    mutationFn: () => api('/admin/users', { method: 'POST', body: form }),
    onSuccess: () => {
      toast.success(t('User created – share the password with them'));
      void qc.invalidateQueries({ queryKey: adminKeys.users });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={t('Add user')}
        description={t('Create an account for a family member or friend.')}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label={t('Name')} htmlFor="nu-name">
            <Input
              id="nu-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </Field>
          <Field label={t('E-mail')} htmlFor="nu-email">
            <Input
              id="nu-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <Field
            label={t('Initial password')}
            htmlFor="nu-pw"
            hint={t('They can change it in Settings after logging in.')}
          >
            <Input
              id="nu-pw"
              type="text"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.isAdmin}
              onCheckedChange={(v) => setForm({ ...form, isAdmin: v === true })}
            />
            {t('Administrator')}
          </label>
          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={create.isPending}>
              {t('Create user')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => api(`/admin/users/${user.id}`, { method: 'PATCH', body: { password } }),
    onSuccess: () => {
      toast.success(t('Password of {name} changed', { name: user.name }));
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={t('Reset password of {name}', { name: user.name })}
        description={t('All their sessions will be signed out.')}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            reset.mutate();
          }}
        >
          <Field label={t('New password')} htmlFor="rp-pw">
            <Input
              id="rp-pw"
              type="text"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={reset.isPending}>
              {t('Set password')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPage() {
  const me = useUser();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const users = useQuery({
    queryKey: adminKeys.users,
    queryFn: () => api<AdminUser[]>('/admin/users'),
    enabled: me.isAdmin,
  });
  const settings = useQuery({
    queryKey: adminKeys.settings,
    queryFn: () => api<AdminSettings>('/admin/settings'),
    enabled: me.isAdmin,
  });
  const saveSettings = useMutation({
    mutationFn: (registrationEnabled: boolean) =>
      api<AdminSettings>('/admin/settings', { method: 'PATCH', body: { registrationEnabled } }),
    onSuccess: (data) => {
      qc.setQueryData(adminKeys.settings, data);
      void qc.invalidateQueries({ queryKey: qk.config });
      toast.success(data.registrationEnabled ? t('Sign-ups are open') : t('Sign-ups are closed'));
    },
  });
  const updateUser = useMutation({
    mutationFn: ({ id, ...body }: { id: string; isAdmin?: boolean; disableTwoFactor?: true }) =>
      api(`/admin/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.users }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const deleteUser = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('User deleted'));
      void qc.invalidateQueries({ queryKey: adminKeys.users });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!me.isAdmin) {
    return (
      <EmptyState
        icon={<Shield />}
        title={t('Administrators only')}
        description={t('Ask the administrator of this server for access.')}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t('Administration')}
        description={t('Manage the users and settings of this DoStotinka server.')}
      />
      <div className="grid gap-6">
        <Card>
          <CardHeader
            title={t('Server')}
            description={settings.data ? `DoStotinka ${settings.data.version}` : undefined}
          />
          <div className="grid gap-3 px-5 pb-5 pt-2">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3">
              <span>
                <span className="block text-sm font-medium">{t('Allow new sign-ups')}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(
                    'When off, only administrators can create accounts. Default from ALLOW_REGISTRATION: {value}.',
                    {
                      value: settings.data?.registrationDefault ? t('on') : t('off'),
                    },
                  )}
                </span>
              </span>
              <Switch
                checked={settings.data?.registrationEnabled ?? false}
                disabled={!settings.data || saveSettings.isPending}
                onCheckedChange={(v) => saveSettings.mutate(v)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {t('Demo account: {value} (change with DEMO_ENABLED).', {
                value: settings.data?.demoEnabled ? t('enabled') : t('disabled'),
              })}
            </p>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title={t('Users')}
            description={
              users.data ? plural(users.data.filter((u) => !u.isDemo).length, 'user') : undefined
            }
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <UserPlus /> {t('Add user')}
              </Button>
            }
          />
          {users.isLoading ? (
            <div className="grid gap-2 p-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(users.data ?? []).map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                    {u.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{u.name}</span>
                      {u.id === me.id && <Badge tone="success">{t('you')}</Badge>}
                      {u.isAdmin && <Badge tone="info">{t('admin')}</Badge>}
                      {u.isDemo && <Badge tone="warning">{t('demo')}</Badge>}
                      {u.twoFactorEnabled && <Badge tone="success">{t('2FA')}</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.email} · {plural(u.accountCount, 'account')} ·{' '}
                      {plural(u.recordCount, 'record')} ·{' '}
                      {u.lastActiveAt
                        ? t('active {time}', { time: ago(u.lastActiveAt) })
                        : t('never logged in')}
                    </p>
                  </div>
                  {!u.isDemo && u.id !== me.id && (
                    <Menu>
                      <MenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={t('Actions')}>
                          <MoreHorizontal />
                        </Button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={<KeyRound />} onSelect={() => setResetting(u)}>
                          {t('Reset password')}
                        </MenuItem>
                        {u.twoFactorEnabled && (
                          <MenuItem
                            icon={<ShieldOff />}
                            onSelect={async () => {
                              const ok = await confirm({
                                title: t('Turn off two-factor login for {name}?', {
                                  name: u.name,
                                }),
                                description: t(
                                  'Only do this when the user lost their phone and recovery codes. They can log in with the password alone afterwards.',
                                ),
                                confirmLabel: t('Turn off'),
                                destructive: true,
                              });
                              if (ok) updateUser.mutate({ id: u.id, disableTwoFactor: true });
                            }}
                          >
                            {t('Turn off two-factor login')}
                          </MenuItem>
                        )}
                        <MenuItem
                          icon={u.isAdmin ? <ShieldOff /> : <Shield />}
                          onSelect={() => updateUser.mutate({ id: u.id, isAdmin: !u.isAdmin })}
                        >
                          {u.isAdmin ? t('Remove admin rights') : t('Make administrator')}
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem
                          icon={<Trash2 />}
                          destructive
                          onSelect={async () => {
                            const ok = await confirm({
                              title: t('Delete {name}?', { name: u.name }),
                              description: t(
                                'All {n} records, accounts and settings of {email} will be deleted permanently.',
                                {
                                  n: u.recordCount,
                                  email: u.email,
                                },
                              ),
                              confirmLabel: t('Delete user'),
                              destructive: true,
                            });
                            if (ok) deleteUser.mutate(u.id);
                          }}
                        >
                          {t('Delete user')}
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {creating && <CreateUserDialog onClose={() => setCreating(false)} />}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}
