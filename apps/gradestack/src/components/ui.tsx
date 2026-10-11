import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

/* ── Icon ─────────────────────────────────────────────────── */
export function Icon({ name, size = 20, fill = false, className = '' }: {
  name: string; size?: number; fill?: boolean; className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined shrink-0 ${className}`}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' 400` }}
    >
      {name}
    </span>
  );
}

/* ── Logo mark — three answer bubbles, middle marked ──────── */
export function BubbleMark({ size = 10, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`} aria-hidden>
      <span className="rounded-full border-[1.5px] border-current" style={{ width: size, height: size }} />
      <span className="rounded-full bg-current" style={{ width: size, height: size }} />
      <span className="rounded-full border-[1.5px] border-current" style={{ width: size, height: size }} />
    </span>
  );
}

/* ── Bubble — the signature mark control ──────────────────── */
export function Bubble({ label, filled, onClick, disabled, size = 30, title }: {
  label?: React.ReactNode; filled: boolean; onClick?: () => void;
  disabled?: boolean; size?: number; title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-filled={filled}
      className={`bubble font-mono font-semibold ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {label}
    </button>
  );
}

/* ── Buttons ──────────────────────────────────────────────── */
type BtnVariant = 'solid' | 'outline' | 'ghost' | 'danger' | 'mist';

export function Button({ variant = 'outline', icon, children, className = '', ...rest }: {
  variant?: BtnVariant; icon?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-colors select-none disabled:opacity-40 disabled:cursor-not-allowed';
  const styles: Record<BtnVariant, string> = {
    solid: 'bg-mark text-on-mark hover:bg-mark-deep',
    outline: 'border border-hairline-strong text-ink hover:border-ink bg-form-raised',
    ghost: 'text-pencil hover:text-ink hover:bg-surface-container-low',
    danger: 'bg-red text-white hover:bg-red/90',
    mist: 'bg-mark-mist text-mark-deep hover:bg-mark-mist-2 border border-mark/20',
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, title, className = '', ...rest }: {
  icon: string; title: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      title={title}
      aria-label={title}
      className={`p-2 rounded-md text-pencil hover:text-ink hover:bg-surface-container-low transition-colors ${className}`}
      {...rest}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

/* ── Form controls ────────────────────────────────────────── */
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="ledger-label block mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-faint mt-1">{hint}</p>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-10 px-3 border border-hairline-strong rounded-md bg-form-raised text-sm font-medium text-ink focus:border-mark focus:ring-2 focus:ring-mark/15 focus:outline-none transition-all placeholder:text-faint ${props.className || ''}`}
    />
  );
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`w-full h-10 px-3 pr-9 border border-hairline-strong rounded-md bg-form-raised text-sm font-semibold text-ink appearance-none focus:border-mark focus:ring-2 focus:ring-mark/15 focus:outline-none cursor-pointer ${props.className || ''}`}
      >
        {children}
      </select>
      <Icon name="expand_more" size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
    </div>
  );
}

/* ── Toggle — a pencil tick, not a pill ───────────────────── */
export function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full text-left py-1 group"
    >
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description && <span className="block text-xs text-pencil mt-0.5">{description}</span>}
      </span>
      <span
        data-filled={checked}
        className="bubble shrink-0 ml-4"
        style={{ width: 22, height: 22 }}
      >
        {checked && <Icon name="check" size={14} />}
      </span>
    </button>
  );
}

/* ── Status chip — a stamp, not a pill-badge ──────────────── */
export function Chip({ tone = 'neutral', children }: {
  tone?: 'neutral' | 'mark' | 'red' | 'gold'; children: React.ReactNode;
}) {
  const tones = {
    neutral: 'border-hairline-strong text-pencil',
    mark: 'border-mark/40 text-mark-deep bg-mark-mist/60 dark:text-mark',
    red: 'border-red/40 text-red bg-red-mist/60',
    gold: 'border-gold/40 text-gold bg-gold-mist/60',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ── Page header — slab title over a hairline ─────────────── */
export function PageHeader({ title, description, children }: {
  title: string; description?: string; children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-5 border-b border-hairline pb-6">
      <div>
        <h2 className="text-headline-lg">{title}</h2>
        {description && <p className="text-body-md text-pencil mt-1">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-3 shrink-0">{children}</div>}
    </div>
  );
}

/* ── Empty state — a blank line in the register ───────────── */
export function EmptyState({ icon, title, body, children }: {
  icon: string; title: string; body?: string; children?: React.ReactNode;
}) {
  return (
    <div className="py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-full border-[1.5px] border-hairline-strong flex items-center justify-center mx-auto mb-5 text-faint">
        <Icon name={icon} size={26} />
      </div>
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {body && <p className="text-sm text-pencil mt-1 max-w-sm mx-auto">{body}</p>}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

/* ── Modal — a form laid over the desk ────────────────────── */
export function Modal({ onClose, title, subtitle, children, footer, wide }: {
  onClose: () => void; title: string; subtitle?: string;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-ink/50"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.18 }}
        className={`bg-form relative z-10 w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[90vh] rounded-md shadow-2xl border border-hairline flex flex-col overflow-hidden`}
      >
        <div className="px-6 py-5 border-b border-hairline flex justify-between items-start shrink-0">
          <div>
            <h2 className="text-headline-sm">{title}</h2>
            {subtitle && <p className="text-sm text-pencil mt-0.5">{subtitle}</p>}
          </div>
          <IconButton icon="close" title="Close" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-hairline bg-surface-container-low flex items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ── Thin ledger progress bar ─────────────────────────────── */
export function LedgerBar({ value, tone = 'mark' }: { value: number; tone?: 'mark' | 'red' }) {
  return (
    <div className="w-full bg-hairline rounded-full h-1 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${tone === 'red' ? 'bg-red' : 'bg-mark'}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export { AnimatePresence };
