import { useEffect, useRef, type RefObject } from 'react';
import { glass, supportsBackdropSvg, type GlassOptions } from 'glassy-liquid';

const presets = {
  navigation: { radius: 12, bezel: 5, refraction: 6, fill: 'rgba(134,158,126,.10)' },
  atlas: { radius: 16, bezel: 7, refraction: 8, fill: 'rgba(7,34,25,.65)' },
} satisfies Record<string, GlassOptions>;

type Preset = keyof typeof presets;

// Only enhance visible controls. A stationary lens has no animation clock.
// Accepts a named preset or raw GlassOptions; pass an external ref when the
// glass host is rendered conditionally (e.g. a dropdown panel).
export function useIterraGlass<T extends HTMLElement>(
  preset: Preset | GlassOptions,
  active = true,
  targetRef?: RefObject<T | null>,
) {
  const ownRef = useRef<T>(null);
  const ref = (targetRef ?? ownRef) as RefObject<T | null>;
  /* options objects are often inline literals — key the effect on a stable
     serialization so identity churn doesn't re-arm the surface every render */
  const presetKey = typeof preset === 'string' ? preset : JSON.stringify(preset);
  const optionsRef = useRef<GlassOptions>({});
  optionsRef.current = typeof preset === 'string' ? presets[preset] : preset;
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
      delete el.dataset.lit;
    };
    const update = () => {
      if (!visible || document.hidden || solid.matches) { release(); return; }
      if (surface) return;
      el.classList.add('it-glassed');
      surface = glass(el, {
        material: 'clear', engine: 'backdrop', blur: 0, dispersion: 0, zoom: 1,
        specular: .78, shadow: false, ...optionsRef.current,
      });
      el.dataset.optical = 'on';
    };
    const hitArea = (presetKey === 'navigation' ? el.parentElement : el) ?? el;
    const track = matchMedia('(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)');
    const clearLight = () => { delete el.dataset.lit; };
    const moveLight = (event: PointerEvent) => {
      if (!surface || !track.matches || event.pointerType === 'touch') { clearLight(); return; }
      const bounds = hitArea.getBoundingClientRect();
      el.style.setProperty('--lens-x', (event.clientX - bounds.left) + 'px');
      el.style.setProperty('--lens-y', (event.clientY - bounds.top) + 'px');
      el.dataset.lit = 'true';
    };
    hitArea.addEventListener('pointermove', moveLight);
    hitArea.addEventListener('pointerleave', clearLight);
    hitArea.addEventListener('pointercancel', clearLight);
    track.addEventListener('change', clearLight);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(el);
    solid.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      hitArea.removeEventListener('pointermove', moveLight);
      hitArea.removeEventListener('pointerleave', clearLight);
      hitArea.removeEventListener('pointercancel', clearLight);
      track.removeEventListener('change', clearLight);
      clearLight();
      observer.disconnect();
      solid.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      release();
      el.classList.remove('it-glassed');
    };
  }, [active, presetKey, ref]);
  return ref;
}
