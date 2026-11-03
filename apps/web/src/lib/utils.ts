import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export function storage<T>(key: string, fallback: T) {
  return {
    get(): T {
      try {
        const raw = localStorage.getItem(`slavotax.${key}`);
        return raw === null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    set(value: T) {
      try {
        localStorage.setItem(`slavotax.${key}`, JSON.stringify(value));
      } catch {
        /* storage unavailable */
      }
    },
  };
}

export function downloadUrl(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
