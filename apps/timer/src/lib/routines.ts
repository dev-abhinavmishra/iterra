/* Interval routines — built-ins + user customs persisted in localStorage.
   Shared by IntervalsView (UI) and lib/iterra.ts (index.timer publishing). */
import type { Routine } from '../hooks/useTimer';

export const ROUTINES_KEY = 'timer.routines.v1';
const LEGACY_KEY = 'platform.routines.v1';

export const BUILT_INS: Routine[] = [
  { id: 'pomodoro', name: 'Pomodoro', rounds: 4, phases: [
    { name: 'Focus', seconds: 25 * 60, kind: 'work' },
    { name: 'Recess', seconds: 5 * 60, kind: 'rest' },
  ]},
  { id: 'tabata', name: 'Tabata', rounds: 8, phases: [
    { name: 'Work', seconds: 20, kind: 'work' },
    { name: 'Rest', seconds: 10, kind: 'rest' },
  ]},
  { id: '5217', name: '52 / 17', rounds: 2, phases: [
    { name: 'Focus', seconds: 52 * 60, kind: 'work' },
    { name: 'Recess', seconds: 17 * 60, kind: 'rest' },
  ]},
];

export function loadRoutines(): Routine[] {
  try {
    const data = localStorage.getItem(ROUTINES_KEY);
    if (data) return JSON.parse(data);
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      localStorage.setItem(ROUTINES_KEY, legacy);
      localStorage.removeItem(LEGACY_KEY);
      return parsed;
    }
  } catch { /* fall through */ }
  return [];
}
