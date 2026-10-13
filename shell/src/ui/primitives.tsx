import React, { useEffect, useRef, useState } from 'react';
import { X, Link2, ArrowUpRight, ChevronDown } from 'lucide-react';

/* ── Buttons ─────────────────────────────────────────────────────────────── */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'xs' | 'sm' | 'md';
  icon?: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  icon,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const sizeCls =
    size === 'xs'
      ? 'px-2 py-1 text-[11.5px] gap-1 rounded-[4px]'
      : size === 'sm'
        ? 'px-2.5 py-1.5 text-[12.5px] gap-1.5 rounded-[5px]'
        : 'px-3.5 py-2 text-[13px] gap-2 rounded-[6px]';

  const varCls =
    variant === 'primary'
      ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] border border-[var(--color-accent-2)] hover:bg-[var(--color-accent-2)] shadow-[0_1px_0_rgba(0,0,0,0.08)]'
      : variant === 'secondary'
        ? 'bg-[var(--color-sheet)] text-[var(--color-ink)] border border-[var(--color-line)] hover:border-[var(--color-line-2)] hover:bg-[var(--color-sheet-hover)]'
        : variant === 'danger'
          ? 'bg-[var(--color-bad-soft)] text-[var(--color-bad)] border border-[var(--color-bad)]/30 hover:bg-[var(--color-bad)] hover:text-white'
          : 'bg-transparent text-[var(--color-mute)] border border-transparent hover:text-[var(--color-ink)] hover:bg-[var(--color-sheet-2)]';

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center font-medium transition-colors active:translate-y-px disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${sizeCls} ${varCls} ${className}`}
      {...rest}
    >
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      {children}
    </button>
  );
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
}

export function IconButton({
  label,
  active = false,
  size = 'sm',
  children,
  className = '',
  ...rest
}: IconButtonProps) {
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-[5px] border transition-colors cursor-pointer ${dim} ${
        active
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent)]/40'
          : 'bg-transparent text-[var(--color-mute)] border-transparent hover:bg-[var(--color-sheet-2)] hover:text-[var(--color-ink)]'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── Badges & Relationship Chips ─────────────────────────────────────────── */

export function Badge({
  children,
  tone = 'neutral',
  onClick,
  title,
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'warn' | 'bad' | 'mono';
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  className?: string;
}) {
  const toneCls =
    tone === 'accent'
      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent)]/30'
      : tone === 'warn'
        ? 'bg-[var(--color-warn-soft)] text-[var(--color-warn)] border-[var(--color-warn)]/30'
        : tone === 'bad'
          ? 'bg-[var(--color-bad-soft)] text-[var(--color-bad)] border-[var(--color-bad)]/30'
          : tone === 'mono'
            ? 'bg-[var(--color-sheet-2)] text-[var(--color-mute)] border-[var(--color-line)] font-mono uppercase tracking-[0.06em]'
            : 'bg-[var(--color-sheet-2)] text-[var(--color-mute)] border-[var(--color-line)]';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium leading-none transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] cursor-pointer ${toneCls} ${className}`}
      >
        {children}
      </button>
    );
  }

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium leading-none ${toneCls} ${className}`}
    >
      {children}
    </span>
  );
}

export function RelationshipChip({
  kind,
  targetTitle,
  targetModule,
  onClick,
}: {
  kind: string;
  targetTitle: string;
  targetModule?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${kind}: ${targetTitle}${targetModule ? ` (${targetModule})` : ''}`}
      className="inline-flex items-center gap-1 rounded-[4px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-2 py-0.5 text-[11px] text-[var(--color-mute)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors cursor-pointer"
    >
      <Link2 className="h-3 w-3 shrink-0 opacity-75" />
      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-faint)]">{kind}</span>
      <span className="max-w-[160px] truncate font-medium text-[var(--color-ink)]">{targetTitle}</span>
      <ArrowUpRight className="h-2.5 w-2.5 shrink-0 opacity-60" />
    </button>
  );
}

/* ── Inputs & Selectors ──────────────────────────────────────────────────── */

export function Input({
  className = '',
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-[5px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)] focus:outline-none ${className}`}
      {...rest}
    />
  );
}

export function Select({
  className = '',
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-[5px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none cursor-pointer ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

/* ── Tabs & Segmented Controls ───────────────────────────────────────────── */

export interface TabItem<K extends string = string> {
  key: K;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export function Tabs<K extends string = string>({
  items,
  active,
  onChange,
  ariaLabel = 'Section tabs',
}: {
  items: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-line)]"
    >
      {items.map((item) => {
        const isOn = item.key === active;
        return (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={isOn}
            onClick={() => onChange(item.key)}
            className={`relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
              isOn
                ? 'text-[var(--color-accent)] font-semibold'
                : 'text-[var(--color-mute)] hover:text-[var(--color-ink)]'
            }`}
          >
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
            {typeof item.count === 'number' && (
              <span
                className={`rounded-[4px] px-1.5 py-0.2 font-mono text-[10.5px] ${
                  isOn
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'bg-[var(--color-sheet-2)] text-[var(--color-faint)]'
                }`}
              >
                {item.count}
              </span>
            )}
            {isOn && (
              <span className="absolute inset-x-0 -bottom-px h-[2px] bg-[var(--color-accent)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Section Header ──────────────────────────────────────────────────────── */

export function SectionHeader({
  kicker,
  title,
  count,
  action,
}: {
  kicker?: string;
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-2">
      <div className="flex items-baseline gap-2 min-w-0">
        {kicker && (
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
            {kicker}
          </span>
        )}
        <h2 className="text-[14px] font-semibold tracking-tight text-[var(--color-ink)] truncate">
          {title}
        </h2>
        {typeof count === 'number' && (
          <span className="font-mono text-[11px] text-[var(--color-faint)]">({count})</span>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ── Empty State ─────────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  actions,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-[6px] border border-dashed border-[var(--color-line-2)] bg-[var(--color-sheet)]/50 ${
        compact ? 'px-4 py-4' : 'px-5 py-7'
      } text-left`}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] bg-[var(--color-sheet-2)] text-[var(--color-accent)]">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-[var(--color-ink)]">{title}</div>
          {description && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-mute)]">
              {description}
            </p>
          )}
          {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

/* ── Dialog & Responsive Drawer ──────────────────────────────────────────── */

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`anim-rise w-full ${maxWidth} rounded-[8px] border border-[var(--color-line-2)] bg-[var(--color-sheet)] shadow-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--color-ink)]">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[12px] text-[var(--color-mute)]">{subtitle}</p>}
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ── Disclosure — hides secondary detail behind a quiet expander ─────────── */

export function Disclosure({
  label,
  children,
  defaultOpen = false,
  className = '',
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-[4px] py-1 text-left text-[11.5px] font-medium text-[var(--color-mute)] hover:text-[var(--color-ink)] transition-colors cursor-pointer"
      >
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-[var(--color-faint)] transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span>{label}</span>
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

/* ── Dropdown Menu ───────────────────────────────────────────────────────── */

export function DropdownMenu({
  trigger,
  align = 'right',
  children,
}: {
  trigger: (open: boolean, toggle: (e: React.MouseEvent) => void) => React.ReactNode;
  align?: 'left' | 'right';
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      {trigger(open, (e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      })}
      {open && (
        <div
          className={`anim-pop absolute top-full z-50 mt-1 min-w-[190px] rounded-[6px] border border-[var(--color-line-2)] bg-[var(--color-sheet)] p-1 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
