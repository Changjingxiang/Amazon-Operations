import { useCallback, useEffect, useRef, useState } from 'react';

export const COLUMN_WIDTH_RESET_EVENT = 'keyword-tracker:reset-column-widths';

function safeRead(storageKey, defaults) {
  if (typeof window === 'undefined') return { ...defaults };
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
      const candidate = Number(value[key]);
      return [key, Number.isFinite(candidate) && candidate > 0 ? candidate : fallback];
    }));
  } catch {
    return { ...defaults };
  }
}

export function useColumnWidths(storageKey, defaults) {
  const defaultsRef = useRef(defaults);
  const [widths, setWidths] = useState(() => safeRead(storageKey, defaults));
  const widthsRef = useRef(widths);

  useEffect(() => { defaultsRef.current = defaults; }, [defaults]);
  useEffect(() => {
    const onReset = (event) => {
      if (event.detail && event.detail !== storageKey) return;
      const next = { ...defaultsRef.current };
      widthsRef.current = next;
      setWidths(next);
    };
    window.addEventListener(COLUMN_WIDTH_RESET_EVENT, onReset);
    return () => window.removeEventListener(COLUMN_WIDTH_RESET_EVENT, onReset);
  }, [storageKey]);

  const apply = useCallback((next) => {
    widthsRef.current = next;
    setWidths(next);
  }, []);
  const setWidth = useCallback((columnKey, value) => {
    const fallback = defaultsRef.current[columnKey] || 64;
    const next = { ...widthsRef.current, [columnKey]: Math.max(48, Number(value) || fallback) };
    apply(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  }, [apply, storageKey]);
  const nudgeWidth = useCallback((columnKey, delta) => {
    const current = widthsRef.current[columnKey] || defaultsRef.current[columnKey] || 64;
    setWidth(columnKey, current + delta);
  }, [setWidth]);
  const startResize = useCallback((event, columnKey) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widthsRef.current[columnKey] || defaultsRef.current[columnKey] || 64;
    const onMove = (moveEvent) => apply({
      ...widthsRef.current,
      [columnKey]: Math.max(48, Math.round(startWidth + moveEvent.clientX - startX)),
    });
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try { window.localStorage.setItem(storageKey, JSON.stringify(widthsRef.current)); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
  }, [apply, storageKey]);

  const reset = useCallback(() => {
    const next = { ...defaultsRef.current };
    apply(next);
    try { window.localStorage.removeItem(storageKey); } catch {}
  }, [apply, storageKey]);

  return { widths, setWidth, nudgeWidth, startResize, reset };
}

export function resetAllColumnWidths() {
  if (typeof window === 'undefined') return;
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith('keyword-tracker:columns:')) window.localStorage.removeItem(key);
  }
  window.dispatchEvent(new CustomEvent(COLUMN_WIDTH_RESET_EVENT));
}

export function ResizeHandle({ columnKey, onResize, onNudge, label }) {
  return (
    <span
      className="column-resize-handle"
      role="separator"
      aria-label={`调整${label || columnKey}列宽`}
      tabIndex="0"
      onMouseDown={(event) => onResize(event, columnKey)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); onNudge(columnKey, -12); }
        if (event.key === 'ArrowRight') { event.preventDefault(); onNudge(columnKey, 12); }
      }}
    />
  );
}
