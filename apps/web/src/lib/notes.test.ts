import { describe, expect, it } from 'vitest';
import { matchNotes } from './notes';

const notes = [
  { note: 'Kaufland', count: 40 },
  { note: 'Lidl', count: 30 },
  { note: 'Обяд с колеги', count: 12 },
  { note: 'Кафе', count: 9 },
  { note: 'Ремонт на колата', count: 3 },
  { note: 'Подарък за Kaufland карта', count: 2 },
  { note: 'Okaufland', count: 1 },
];

describe('matchNotes', () => {
  it('suggests notes that start with the typed text, case-insensitively', () => {
    expect(matchNotes(notes, 'kau')).toEqual(['Kaufland', 'Подарък за Kaufland карта']);
    expect(matchNotes(notes, 'КАФ')).toEqual(['Кафе']);
  });

  it('also matches the start of later words (Cyrillic too), after the prefix matches', () => {
    expect(matchNotes(notes, 'кол')).toEqual(['Обяд с колеги', 'Ремонт на колата']);
  });

  it('needs two letters and skips a note that is already complete', () => {
    expect(matchNotes(notes, 'k')).toEqual([]);
    expect(matchNotes(notes, ' Lidl ')).toEqual([]);
  });

  it('limits the number of suggestions', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ note: `Note ${i}`, count: 1 }));
    expect(matchNotes(many, 'no', 3)).toHaveLength(3);
  });
});
