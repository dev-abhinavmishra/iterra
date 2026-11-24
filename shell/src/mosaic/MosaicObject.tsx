import { useEffect, useRef } from 'react';
import { paintMosaicObject, type MosaicObjectName } from './mosaicObjects';

/* MosaicObject — renders one of the procedural pixel-mosaic objects
   (compass, books, …) onto a canvas once; CSS upscales it pixelated so
   every cell reads as a single tessera. 'globe' is handled by the caller
   (MosaicGlobe sprite frames), not here. */
export function MosaicObject({
  name,
  className,
  size = 40,
}: {
  name: Exclude<MosaicObjectName, 'globe'>;
  className?: string;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    paintMosaicObject(ctx, name, size);
  }, [name, size]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
