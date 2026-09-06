import { useEffect } from 'react';

// Delegate text tips so virtualized rows do not retain listeners or stale tips.
export default function TextTooltips() {
  useEffect(() => {
    let anchor = null;
    let bubble = null;
    let animation = null;
    const clear = () => {
      animation?.cancel();
      bubble?.remove();
      bubble = null;
      anchor = null;
    };
    const hide = () => {
      anchor = null;
      if (!bubble) return;
      const node = bubble;
      const opacity = getComputedStyle(node).opacity;
      animation?.cancel();
      animation = node.animate([{ opacity }, { opacity: 0 }], { duration: 500, fill: 'forwards' });
      animation.onfinish = () => { if (bubble === node) clear(); };
    };
    const show = target => {
      const cell = target?.closest?.('[data-text-tooltip]');
      if (!cell || !cell.dataset.textTooltip || cell === anchor) return;
      clear();
      anchor = cell;
      bubble = document.createElement('div');
      bubble.className = 'app-text-tooltip';
      bubble.id = 'app-text-tooltip';
      bubble.setAttribute('role', 'tooltip');
      bubble.textContent = cell.dataset.textTooltip;
      document.body.appendChild(bubble);
      const rect = cell.getBoundingClientRect();
      bubble.style.left = `${Math.max(8, Math.min(rect.left + 12, innerWidth - bubble.offsetWidth - 8))}px`;
      bubble.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - bubble.offsetHeight - 8))}px`;
      animation = bubble.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
    };
    const over = event => show(event.target);
    const out = event => {
      if (anchor && !anchor.contains(event.relatedTarget)) hide();
    };
    const escape = event => { if (event.key === 'Escape') clear(); };
    const observer = new MutationObserver(() => { if (anchor && !anchor.isConnected) clear(); });
    observer.observe(document.getElementById('root'), { childList: true, subtree: true });
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusin', over);
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', clear, true);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', clear);
    return () => {
      clear(); observer.disconnect();
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', over);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('scroll', clear, true);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', clear);
    };
  }, []);
  return null;
}
