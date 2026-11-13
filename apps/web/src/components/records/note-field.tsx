import { type KeyboardEvent, type TextareaHTMLAttributes, useId, useMemo, useState } from 'react';
import { useNoteSuggestions } from '@/api/queries';
import { Textarea } from '@/components/ui/input';
import { t } from '@/i18n';
import { matchNotes, wordStart } from '@/lib/notes';
import { cn } from '@/lib/utils';

/** The note with the typed part in bold. */
function Highlighted({ note, typed }: { note: string; typed: string }) {
  const query = typed.trim().toLocaleLowerCase();
  const lower = note.toLocaleLowerCase();
  const at = lower.startsWith(query) ? 0 : wordStart(lower, query);
  if (at < 0) return <>{note}</>;
  return (
    <>
      {note.slice(0, at)}
      <strong className="font-semibold">{note.slice(at, at + query.length)}</strong>
      {note.slice(at + query.length)}
    </>
  );
}

/**
 * The note textarea. With `suggest` on, notes written before that continue the typed text appear
 * below it: tap one, or use ↓ / ↑ and Enter.
 */
export function NoteField({
  value,
  onValueChange,
  suggest,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  suggest: boolean;
}) {
  const { data: notes = [] } = useNoteSuggestions(suggest);
  // Suggestions only show after typing (not for a note filled in by a template or when editing).
  const [typing, setTyping] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const matches = useMemo(
    () => (suggest && typing ? matchNotes(notes, value) : []),
    [suggest, typing, notes, value],
  );

  const choose = (note: string) => {
    onValueChange(note);
    setTyping(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!matches.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      // Cycles through the suggestions and "none" (-1).
      setActive((i) => {
        const next = i + step;
        if (next >= matches.length) return -1;
        return next < -1 ? matches.length - 1 : next;
      });
    } else if (e.key === 'Enter' && active >= 0 && active < matches.length) {
      e.preventDefault();
      choose(matches[active]!);
    } else if (e.key === 'Escape') {
      // Close the suggestions, not the dialog.
      e.stopPropagation();
      setTyping(false);
      setActive(-1);
    }
  };

  return (
    <div className="relative">
      <Textarea
        {...props}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setTyping(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setActive(-1);
          setTyping(false);
        }}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={matches.length ? listId : undefined}
        aria-expanded={matches.length > 0}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      />
      {matches.length > 0 && (
        <div
          id={listId}
          role="listbox"
          aria-label={t('Notes you wrote before')}
          // Above the field: stays visible with the phone keyboard open and nothing moves.
          className="absolute inset-x-0 bottom-full z-20 mb-1 grid overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {matches.map((note, i) => (
            <button
              key={note}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              // Keep the focus (and the phone keyboard) in the textarea.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(note)}
              className={cn(
                'cursor-pointer truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-muted',
                i === active && 'bg-primary-soft text-primary hover:bg-primary-soft',
              )}
            >
              <Highlighted note={note} typed={value} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
