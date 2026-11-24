import { describe, it, expect } from 'vitest';
import { paintMosaicObject, MOSAIC_OBJECTS } from './mosaicObjects';

function fakeCtx() {
  const calls: any[] = [];
  return { calls, ctx: { fillRect: (...a: any[]) => calls.push(a) } as any };
}

describe('mosaic objects', () => {
  for (const name of MOSAIC_OBJECTS.filter((n) => n !== 'globe')) {
    it(`paints ${name} without throwing and emits pixels`, () => {
      const { calls, ctx } = fakeCtx();
      paintMosaicObject(ctx, name as any, 40);
      expect(calls.length).toBeGreaterThan(500);
    });
  }
});
