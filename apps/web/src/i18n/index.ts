import { bg as bgLocale, enGB, type Locale } from 'date-fns/locale';

/**
 * Minimal gettext-style translations: the English text is the key. The language is chosen once per
 * page load (changing it reloads the page), so `t()` can be used anywhere – also outside React.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'bg', label: 'Български' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'slavotax.language';
/** Dictionaries are loaded on demand – English needs none. */
const loaders: Record<Language, () => Promise<Readonly<Record<string, string>>>> = {
  en: async () => ({}),
  bg: async () => (await import('./bg')).bg,
};
const dateLocales: Record<Language, Locale> = { en: enGB, bg: bgLocale };
let dictionary: Readonly<Record<string, string>> = {};

function detect(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in loaders) return saved as Language;
  } catch {
    /* storage unavailable */
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('bg'))
    return 'bg';
  return 'en';
}

export const language: Language = detect();
export const dateLocale: Locale = dateLocales[language];

if (typeof document !== 'undefined') document.documentElement.lang = language;

/**
 * Loads the dictionary of the current language. Must finish before modules that translate texts
 * at import time are loaded (see main.tsx).
 */
export async function loadTranslations(): Promise<void> {
  try {
    dictionary = await loaders[language]();
  } catch {
    dictionary = {};
  }
}

/** Translates `text` and fills `{placeholders}` from `vars`. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const translated = dictionary[text] ?? text;
  if (!vars) return translated;
  return translated.replace(/\{(\w+)\}/g, (m, key: string) =>
    key in vars ? String(vars[key]) : m,
  );
}

/** Plural-aware translation: `tn(3, '{n} record', '{n} records')`. */
export function tn(
  n: number,
  one: string,
  other: string,
  vars?: Record<string, string | number>,
): string {
  const rule = new Intl.PluralRules(language === 'bg' ? 'bg' : 'en').select(n);
  return t(rule === 'one' ? one : other, { n, ...vars });
}

export function setLanguage(next: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  window.location.reload();
}
