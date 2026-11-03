import { CalendarClock, ChartPie, Coins, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/layout/logo';

const FEATURES = [
  {
    icon: Coins,
    title: 'All your accounts in one place',
    text: 'Cash, bank, savings or cards – in any currency.',
  },
  {
    icon: ChartPie,
    title: 'Clear statistics',
    text: 'See exactly where your money goes, day by day.',
  },
  {
    icon: CalendarClock,
    title: 'Never miss a payment',
    text: 'Plan rent, bills and subscriptions ahead.',
  },
  {
    icon: ShieldCheck,
    title: 'Your data, your server',
    text: 'Self-hosted and open source. No tracking.',
  },
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(480px,560px)]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 size-[28rem] rounded-full bg-teal-300/10 blur-3xl" />
        <Logo className="relative [&_span]:text-white" />
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Know where your money goes.
          </h1>
          <p className="mt-3 text-lg text-emerald-50/80">
            A simple, private budget & money manager for everyday life.
          </p>
          <div className="mt-10 grid gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <f.icon className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-sm text-emerald-50/75">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-sm text-emerald-50/60">
          Open source · Self-hosted · Made for humans
        </p>
      </div>
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
