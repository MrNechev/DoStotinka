import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { t } from '@/i18n';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass />}
      title={t('Page not found')}
      description={t('The page you are looking for does not exist.')}
      action={
        <Button asChild>
          <Link to="/">{t('Back to dashboard')}</Link>
        </Button>
      }
    />
  );
}
