import { useEffect, useRef } from 'react';

export default function LoadingWaves() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    let frame;
    let width = 0;
    let height = 0;
    const start = performance.now();
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };
    const draw = now => {
      const t = now - start;
      context.clearRect(0, 0, width, height);
      for (let x = 20; x < width; x += 32) {
        for (let y = 20; y < height; y += 32) {
          const wave = (Math.sin(x / 190 + y / 220 - t / 425) + Math.sin(y / 170 - x / 280 + t / 575) + 2) / 4;
          const distance = Math.hypot((x - width / 2) / (width * .36), (y - height * .48) / (height * .5));
          const fade = .28 + .72 * Math.min(1, Math.max(0, (distance - .25) / .8));
          context.fillStyle = `rgba(57,148,165,${(.07 + wave * .16) * fade})`;
          context.beginPath();
          context.arc(x, y, 1.6 + wave * 6.2, 0, Math.PI * 2);
          context.fill();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);
  return <canvas ref={ref} className="loading-waves" aria-hidden="true" />;
}
