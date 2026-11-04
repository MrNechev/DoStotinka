// Applies the saved theme before the app renders to avoid a flash of the wrong theme.
(() => {
  try {
    const pref = localStorage.getItem('dostotinka.theme') || 'system';
    const dark =
      pref === 'dark' ||
      (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch {
    /* ignore */
  }
})();
