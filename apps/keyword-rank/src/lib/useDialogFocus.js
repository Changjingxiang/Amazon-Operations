import { useEffect, useRef } from 'react';

export default function useDialogFocus(open, onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const controls = () => [...(ref.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]') || [])].filter(node => node.getClientRects().length);
    (ref.current?.querySelector('[data-dialog-close]') || controls()[0] || ref.current)?.focus();
    const keydown = event => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current?.(); }
      if (event.key === 'Tab') {
        const items = controls(), first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    const dialog = ref.current;
    dialog?.addEventListener('keydown', keydown);
    return () => { dialog?.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  }, [open]);
  return ref;
}
