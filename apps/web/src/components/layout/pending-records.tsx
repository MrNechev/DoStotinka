import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  invalidateFinancialData,
  useAccounts,
  useNoteSuggestions,
  usePayees,
  useRecordSuggestions,
  useRules,
  useTemplates,
  useUser,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { t, tn } from '@/i18n';
import { money } from '@/lib/format';
import { discardPending, sendPending, usePendingRecords } from '@/lib/offline';

/**
 * Records saved on this device while the server was not reachable: shown above the page and sent
 * automatically (at start, when the connection comes back and every 30 seconds).
 */
export function PendingRecordsBanner() {
  const user = useUser();
  // Load what the record editor needs now, so it is on the device when the connection is lost.
  useTemplates();
  useRules();
  useRecordSuggestions();
  usePayees();
  useNoteSuggestions(user.noteSuggestions);
  const qc = useQueryClient();
  const pending = usePendingRecords(user.id);
  const { data: accounts = [] } = useAccounts();
  const [sending, setSending] = useState(false);
  const waiting = pending.filter((p) => !p.error);
  const failed = pending.filter((p) => p.error);

  const send = useCallback(
    async (manual = false) => {
      setSending(true);
      try {
        const sent = await sendPending(user.id);
        if (sent) {
          void invalidateFinancialData(qc);
          toast.success(tn(sent, '{n} saved record sent', '{n} saved records sent'));
        } else if (manual) {
          toast.error(t('The server still cannot be reached.'));
        }
      } finally {
        setSending(false);
      }
    },
    [user.id, qc],
  );

  const hasWaiting = waiting.length > 0;
  useEffect(() => {
    if (!hasWaiting) return;
    void send();
    const onOnline = () => void send();
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => void send(), 30_000);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [hasWaiting, send]);

  if (!pending.length) return null;
  return (
    <div className="mb-4 grid gap-2">
      {waiting.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <CloudOff className="size-5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">
            {tn(
              waiting.length,
              '{n} record is saved on this device and waits for the server.',
              '{n} records are saved on this device and wait for the server.',
            )}
          </span>
          <Button size="sm" variant="outline" loading={sending} onClick={() => void send(true)}>
            <RefreshCw /> {t('Send now')}
          </Button>
        </div>
      )}
      {failed.map((p) => (
        <div
          key={p.id}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-expense/40 bg-expense/10 px-4 py-3 text-sm"
        >
          <span className="min-w-0 flex-1">
            {t('A record saved on this device was refused by the server: {error}', {
              error: p.error ?? '',
            })}{' '}
            <span className="text-muted-foreground">
              (
              {money(
                p.input.amount,
                accounts.find((a) => a.id === p.input.accountId)?.currency ?? user.baseCurrency,
              )}
              {p.input.note ? ` · ${p.input.note}` : ''})
            </span>
          </span>
          <Button size="sm" variant="ghost" onClick={() => discardPending(p.id)}>
            <Trash2 /> {t('Discard')}
          </Button>
        </div>
      ))}
    </div>
  );
}
