import { Landmark } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useFinishBank } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Spinner } from '@/components/ui/misc';
import { t } from '@/i18n';

/** The bank (via Enable Banking) sends the browser here after the user confirmed the access. */
export default function BankCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const finish = useFinishBank();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const state = params.get('state');
    if (!state) {
      setError(t('The bank did not return to DoStotinka correctly.'));
      return;
    }
    finish.mutate(
      {
        state,
        code: params.get('code') ?? undefined,
        error: params.get('error') ?? undefined,
        errorDescription: params.get('error_description') ?? undefined,
      },
      {
        onSuccess: (c) => {
          toast.success(t('{bank} connected', { bank: c.bankName }));
          navigate('/automatic-import', { replace: true });
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  }, [params, finish, navigate]);

  return (
    <div className="mx-auto max-w-lg pt-10">
      <Card>
        {error ? (
          <EmptyState
            icon={<Landmark />}
            title={t('The bank could not be connected')}
            description={error}
            action={
              <Button asChild>
                <Link to="/automatic-import">{t('Back to automatic import')}</Link>
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
            <Spinner />
            {t('Connecting your bank…')}
          </div>
        )}
      </Card>
    </div>
  );
}
