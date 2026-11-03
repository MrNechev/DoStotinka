import { CalendarClock, Check, FileUp, Plus, Target, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAccounts, useBudgets, usePlanned, useRecords } from '@/api/queries';
import { useRecordEditor } from '@/components/records/record-editor';
import { Card, CardHeader } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

function Step({
  done,
  icon,
  title,
  text,
  action,
}: {
  done: boolean;
  icon: ReactNode;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/60">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4',
          done ? 'bg-income text-white' : 'bg-muted text-muted-foreground',
        )}
      >
        {done ? <Check strokeWidth={3} /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn('block text-sm font-medium', done && 'text-muted-foreground line-through')}
        >
          {title}
        </span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
      {!done && <span className="shrink-0 text-sm font-medium text-primary">{action}</span>}
    </li>
  );
}

/** Onboarding checklist shown until the basics are set up. */
export function GettingStarted() {
  const { data: accounts } = useAccounts();
  const records = useRecords({}, 1);
  const { data: planned } = usePlanned();
  const { data: budgets } = useBudgets();
  const { openNew } = useRecordEditor();
  if (!accounts || records.isLoading || !planned || !budgets) return null;
  const hasRecords = (records.data?.pages[0]?.items.length ?? 0) > 0;
  const steps = [accounts.length > 0, hasRecords, planned.length > 0, budgets.length > 0];
  if (steps.every(Boolean)) return null;
  return (
    <Card>
      <CardHeader
        title="Getting started"
        description={`${steps.filter(Boolean).length} of ${steps.length} done – a few minutes to set up your budget`}
      />
      <ul className="grid gap-0.5 px-2 pb-3">
        <Step
          done={steps[0]!}
          icon={<Wallet />}
          title="Create your accounts"
          text="Cash, bank account, savings … with their current balance."
          action={<Link to="/accounts?new=1">Add account</Link>}
        />
        <Step
          done={steps[1]!}
          icon={<Plus />}
          title="Log your first expense"
          text="Press “Add record” (or N on the keyboard) whenever you spend money."
          action={
            <button type="button" onClick={() => openNew()} className="cursor-pointer">
              Add record
            </button>
          }
        />
        <Step
          done={steps[2]!}
          icon={<CalendarClock />}
          title="Plan regular payments"
          text="Rent, bills and subscriptions – never miss one again."
          action={<Link to="/planned">Plan payment</Link>}
        />
        <Step
          done={steps[3]!}
          icon={<Target />}
          title="Set a budget"
          text="For example 400 € a month for groceries."
          action={<Link to="/budgets">Create budget</Link>}
        />
        {!hasRecords && (
          <Step
            done={false}
            icon={<FileUp />}
            title="Coming from another app?"
            text="Import your history from a CSV export, e.g. from Wallet by BudgetBakers."
            action={<Link to="/import">Import</Link>}
          />
        )}
      </ul>
    </Card>
  );
}
