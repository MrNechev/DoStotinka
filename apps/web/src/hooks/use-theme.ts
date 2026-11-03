import { useEffect } from 'react';
import { storage } from '@/lib/utils';

export type ThemePref = 'system' | 'light' | 'dark';
const themeStore = storage<ThemePref>('theme', 'system');

export function applyTheme(pref: ThemePref) {
  themeStore.set(pref);
  const dark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0a0e13' : '#059669');
}

/** Keeps the document theme in sync with the preference (and the OS when "system"). */
export function useThemeSync(pref: ThemePref | undefined) {
  useEffect(() => {
    const p = pref ?? themeStore.get();
    applyTheme(p);
    if (p !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [pref]);
}

export function currentThemePref(): ThemePref {
  return themeStore.get();
}
