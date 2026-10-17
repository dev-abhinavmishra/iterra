/* pens.ts — the pen cup: which pen a page is written with. */

export type PenId = 'ink' | 'fountain' | 'pencil' | 'walnut';

export interface Pen {
  name: string;
  color: string;
  /** a faint wash of the same ink, for tints on paper */
  wash: string;
}

export const PENS: Record<PenId, Pen> = {
  ink: { name: 'Iron-gall', color: 'var(--color-ink)', wash: 'var(--color-paper-dim)' },
  fountain: { name: 'Fountain blue', color: 'var(--color-fountain)', wash: 'var(--color-fountain-wash)' },
  pencil: { name: "Editor's red", color: 'var(--color-pencil)', wash: 'var(--color-pencil-wash)' },
  walnut: { name: 'Walnut brown', color: 'var(--color-walnut)', wash: 'var(--color-walnut-wash)' },
};

export const PEN_ORDER: PenId[] = ['ink', 'fountain', 'pencil', 'walnut'];

export const penOf = (pen?: PenId): Pen => PENS[pen ?? 'ink'];
