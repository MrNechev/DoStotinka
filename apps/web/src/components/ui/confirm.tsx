import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { t } from '@/i18n';
import { Button } from './button';
import { Dialog, DialogContent, DialogFooter } from './dialog';

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onOpenChange={(o) => !o && close(false)}>
        {opts && (
          <DialogContent size="sm" title={opts.title} description={opts.description}>
            <DialogFooter className="mt-2">
              <Button variant="outline" onClick={() => close(false)}>
                {t('Cancel')}
              </Button>
              <Button
                variant={opts.destructive ? 'destructive' : 'default'}
                onClick={() => close(true)}
                autoFocus
              >
                {opts.confirmLabel ?? t('Confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
