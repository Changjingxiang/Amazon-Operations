import { useState } from 'react';

const TRANSLATION_KEY = 'keyword-tracker:matrix:translation';

export function useMatrixTranslation() {
  const [showTranslation, setShowTranslation] = useState(() => {
    try {
      const saved = localStorage.getItem(TRANSLATION_KEY);
      if (saved) return saved !== 'hidden';
      return localStorage.getItem('keyword-tracker:comparison:translation') !== 'hidden';
    } catch { return true; }
  });
  const toggleTranslation = () => setShowTranslation((current) => {
    try { localStorage.setItem(TRANSLATION_KEY, current ? 'hidden' : 'visible'); } catch {}
    return !current;
  });
  return { showTranslation, toggleTranslation };
}
