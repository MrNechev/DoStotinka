/** Suggestions for the note field from notes written before. */

export interface NoteSuggestion {
  note: string;
  count: number;
}

const MAX_SHOWN = 6;
const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Where `query` starts a word in `text` (-1 = it does not). Both lower-cased. */
export function wordStart(text: string, query: string): number {
  for (let i = text.indexOf(query); i !== -1; i = text.indexOf(query, i + 1)) {
    if (!isWordChar(text[i - 1])) return i;
  }
  return -1;
}

/**
 * Notes that continue what was typed: first those that start with it, then those with a word
 * starting with it – each group most used first (the order of `notes`).
 */
export function matchNotes(notes: NoteSuggestion[], typed: string, max = MAX_SHOWN): string[] {
  const query = typed.trim().toLocaleLowerCase();
  if (query.length < 2) return [];
  const starts: string[] = [];
  const inside: string[] = [];
  for (const { note } of notes) {
    const text = note.toLocaleLowerCase();
    if (text === query) continue;
    if (text.startsWith(query)) {
      starts.push(note);
      if (starts.length >= max) break;
    } else if (inside.length < max && wordStart(text, query) > 0) {
      inside.push(note);
    }
  }
  return [...starts, ...inside].slice(0, max);
}
