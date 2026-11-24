import { useEffect, useRef } from 'react';

/* MosaicGlobe — the landing globe's no-WebGL fallback made reusable: the
   48-frame sprite atlas (/atlas/globe-frames.webp, 8×6 grid) stepped one
   frame per 1.2s. Cheap enough for every page header — one div, one
   interval that gates itself offscreen/hidden and under reduced-motion. */
export function MosaicGlobe({ className }: { className?: string }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let frame = 0;
    let visible = true;
    let moving = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const paint = () => {
      node.style.backgroundPosition =
        `${(frame % 8) * (100 / 7)}% ${Math.floor(frame / 8) * 20}%`;
    };
    node.style.backgroundImage = "url('/atlas/globe-frames.webp')";
    node.style.backgroundSize = '800% 600%';
    paint();

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => {
      moving = !reduced.matches;
      paint();
    };
    reduced.addEventListener('change', onMotion);
    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
          })
        : null;
    observer?.observe(node);
    const timer = window.setInterval(() => {
      if (!moving || !visible || document.hidden) return;
      frame = (frame + 1) % 48;
      paint();
    }, 1200);
    return () => {
      reduced.removeEventListener('change', onMotion);
      observer?.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return <div ref={el} className={className} aria-hidden="true" />;
}
