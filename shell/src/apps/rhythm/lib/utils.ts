import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cx(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const FRICTION_LABEL: Record<string, string> = {
  tired: 'tired',
  'no-time': 'no time',
  location: 'wrong place',
  forgot: 'forgot',
  sick: 'sick',
  avoided: 'avoided it',
  other: 'other',
};

export const EXCEPTION_LABEL: Record<string, string> = {
  travel: 'travel',
  exam: 'exam',
  sick: 'sick day',
  break: 'break',
  other: 'other',
};
