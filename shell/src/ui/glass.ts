import { useEffect, useRef } from 'react';
import { glass, supportsBackdropSvg, type GlassOptions } from 'glassy-liquid';

const presets = {
  search: { radius: 9, bezel: 4, refraction: 3, fill: 'rgba(134,158,126,.10)' },
  atlas: { radius: 16, bezel: 7, refraction: 8, fill: 'rgba(7,34,25,.65)' },
  actions: { radius: 12, bezel: 6, refraction: 6, fill: 'rgba(17,50,35,.42)' },
} satisfies Record<string, GlassOptions>;

// Only enhance visible controls. A stationary lens has no animation clock.
export function useIterraGlass<T extends HTMLElement>(preset: keyof typeof presets, active = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !active || typeof matchMedia !== 'function' || typeof ResizeObserver === 'undefined' ||
        typeof IntersectionObserver === 'undefined' || !supportsBackdropSvg()) return;
    const solid = matchMedia('(prefers-reduced-transparency: reduce), (forced-colors: active)');
    let visible = false;
    let surface: ReturnType<typeof glass> | undefined;
    const release = () => {
      surface?.destroy();
      surface = undefined;
      delete el.dataset.optical;
    };
    const update = () => {
      if (!visible || document.hidden || solid.matches) { release(); return; }
      if (surface) return;
      surface = glass(el, {
        material: 'clear', engine: 'backdrop', blur: 0, dispersion: 0, zoom: 1,
        specular: .78, shadow: false, ...presets[preset],
      });
      el.dataset.optical = 'on';
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(el);
    solid.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      solid.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      release();
    };
  }, [active, preset]);
  return ref;
}
