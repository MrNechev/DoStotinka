import { useEffect, useState } from 'react';

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = () => setMatches(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');

/**
 * True when the main input is a mouse/trackpad. Phones and tablets report a coarse pointer – there
 * focusing a text field opens the on-screen keyboard, so search fields should not grab focus.
 */
export const useHasFinePointer = () => useMediaQuery('(pointer: fine)');
