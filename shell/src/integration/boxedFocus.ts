import type { StoreEntity } from '../hub';

export interface BoxedFocusTarget {
  date: string;
  blockId: string;
}

export function parseBoxedFocus(value: unknown): BoxedFocusTarget | undefined {
  if (!value || typeof value !== 'object') return;
  const { date, blockId } = value as Partial<BoxedFocusTarget>;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof blockId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(blockId)) return;
  const day = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return;
  return { date, blockId };
}

export function boxedFocusUrl(target: BoxedFocusTarget): string {
  return `#/p/boxed?${new URLSearchParams({ date: target.date, focusBlock: target.blockId })}`;
}

export function boxedFocusMinutes(entities: StoreEntity[], date: string): Map<string, number> {
  const minutesByBlock = new Map<string, number>();
  for (const entity of entities) {
    if (entity.app !== 'timer' || entity.type !== 'session') continue;
    const source = parseBoxedFocus(entity.data?.boxedFocus);
    const minutes = entity.data?.minutes;
    if (source?.date !== date || typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) continue;
    minutesByBlock.set(source.blockId, (minutesByBlock.get(source.blockId) ?? 0) + minutes);
  }
  return minutesByBlock;
}
