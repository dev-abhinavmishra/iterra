import React from 'react';
import { cn, vibrate } from '../lib/utils';
import { flapTick, unlockAudio } from '../lib/sound';

/* Physical keycap button — press depth + click + haptic. */
export function KeyButton({
  children, onClick, variant = 'dark', className, disabled, title, haptic = 30,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'dark' | 'signal' | 'paper';
  className?: string;
  disabled?: boolean;
  title?: string;
  haptic?: number;
}) {
  return (
    <button
      className={cn('key', variant === 'signal' && 'key--signal', variant === 'paper' && 'key--paper', className)}
      disabled={disabled}
      title={title}
      onClick={() => {
        unlockAudio();
        if (disabled) return;
        flapTick(0.04);
        vibrate(haptic);
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}
