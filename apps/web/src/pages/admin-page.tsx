import type { AdminSettings, AdminUser } from '@slavotax/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
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
import { plural } from '@/lib/format';

const adminKeys = { users: ['admin', 'users'] as const, settings: ['admin', 'settings'] as const };

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', isAdmin: false });
  const create = useMutation({
    mutationFn: () => api('/admin/users', { method: 'POST', body: form }),
    onSuccess: () => {
      toast.success('User created – share the password with them');
      void qc.invalidateQueries({ queryKey: adminKeys.users });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title="Add user"
        description="Create an account for a family member or friend."
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Name" htmlFor="nu-name">
            <Input
              id="nu-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </Field>
          <Field label="E-mail" htmlFor="nu-email">
            <Input
              id="nu-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <Field
            label="Initial password"
            htmlFor="nu-pw"
            hint="They can change it in Settings after logging in."
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
            Administrator
          </label>
          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create user
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
      toast.success(`Password of ${user.name} changed`);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={`Reset password of ${user.name}`}
        description="All their sessions will be signed out."
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            reset.mutate();
          }}
        >
          <Field label="New password" htmlFor="rp-pw">
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
              Cancel
            </Button>
            <Button type="submit" loading={reset.isPending}>
              Set password
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
      toast.success(data.registrationEnabled ? 'Sign-ups are open' : 'Sign-ups are closed');
    },
  });
  const updateUser = useMutation({
    mutationFn: ({ id, isAdmin }: { id: string; isAdmin: boolean }) =>
      api(`/admin/users/${id}`, { method: 'PATCH', body: { isAdmin } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.users }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const deleteUser = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('User deleted');
      void qc.invalidateQueries({ queryKey: adminKeys.users });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!me.isAdmin) {
    return (
      <EmptyState
        icon={<Shield />}
        title="Administrators only"
        description="Ask the administrator of this server for access."
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Administration"
        description="Manage the users and settings of this Slavotax server."
      />
      <div className="grid gap-6">
        <Card>
          <CardHeader
            title="Server"
            description={settings.data ? `Slavotax ${settings.data.version}` : undefined}
          />
          <div className="grid gap-3 px-5 pb-5 pt-2">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3">
              <span>
                <span className="block text-sm font-medium">Allow new sign-ups</span>
                <span className="block text-xs text-muted-foreground">
                  When off, only administrators can create accounts. Default from
                  ALLOW_REGISTRATION: {settings.data?.registrationDefault ? 'on' : 'off'}.
                </span>
              </span>
              <Switch
                checked={settings.data?.registrationEnabled ?? false}
                disabled={!settings.data || saveSettings.isPending}
                onCheckedChange={(v) => saveSettings.mutate(v)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Demo account: {settings.data?.demoEnabled ? 'enabled' : 'disabled'} (change with
              DEMO_ENABLED).
            </p>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Users"
            description={
              users.data ? plural(users.data.filter((u) => !u.isDemo).length, 'user') : undefined
            }
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <UserPlus /> Add user
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
                      {u.id === me.id && <Badge tone="success">you</Badge>}
                      {u.isAdmin && <Badge tone="info">admin</Badge>}
                      {u.isDemo && <Badge tone="warning">demo</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.email} · {plural(u.accountCount, 'account')} ·{' '}
                      {plural(u.recordCount, 'record')} ·{' '}
                      {u.lastActiveAt
                        ? `active ${formatDistanceToNow(parseISO(u.lastActiveAt), { addSuffix: true })}`
                        : 'never logged in'}
                    </p>
                  </div>
                  {!u.isDemo && u.id !== me.id && (
                    <Menu>
                      <MenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Actions">
                          <MoreHorizontal />
                        </Button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={<KeyRound />} onSelect={() => setResetting(u)}>
                          Reset password
                        </MenuItem>
                        <MenuItem
                          icon={u.isAdmin ? <ShieldOff /> : <Shield />}
                          onSelect={() => updateUser.mutate({ id: u.id, isAdmin: !u.isAdmin })}
                        >
                          {u.isAdmin ? 'Remove admin rights' : 'Make administrator'}
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem
                          icon={<Trash2 />}
                          destructive
                          onSelect={async () => {
                            const ok = await confirm({
                              title: `Delete ${u.name}?`,
                              description: `All ${u.recordCount} records, accounts and settings of ${u.email} will be deleted permanently.`,
                              confirmLabel: 'Delete user',
                              destructive: true,
                            });
                            if (ok) deleteUser.mutate(u.id);
                          }}
                        >
                          Delete user
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
