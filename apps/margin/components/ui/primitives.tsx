import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* "Index" primitives — the only sanctioned building blocks.
   Tokens live in index.css (--paper/--card/--ink/--line/--mark). */

export const Icon: React.FC<{ name: string; size?: number; fill?: boolean; className?: string }> =
    ({ name, size = 20, fill, className = '' }) => (
        <span
            className={`material-symbols-outlined shrink-0 ${fill ? 'icon-fill' : ''} ${className}`}
            style={{ fontSize: size }}
            aria-hidden
        >{name}</span>
    );

/* ---- Buttons ---- */
type BtnVariant = 'primary' | 'quiet' | 'danger' | 'ghost';

export const Btn: React.FC<{
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    variant?: BtnVariant;
    size?: 'sm' | 'md';
    icon?: string;
    disabled?: boolean;
    title?: string;
    className?: string;
    type?: 'button' | 'submit';
}> = ({ children, onClick, variant = 'quiet', size = 'md', icon, disabled, title, className = '', type = 'button' }) => {
    const base = 'inline-flex items-center justify-center gap-1.5 font-sans font-medium rounded-[var(--r)] border transition-all duration-150 select-none disabled:opacity-45 disabled:pointer-events-none active:scale-[0.98]';
    const sizes = size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-sm';
    const variants: Record<BtnVariant, string> = {
        primary: 'bg-[var(--mark)] text-[var(--mark-ink)] border-transparent hover:brightness-110 shadow-card',
        quiet: 'bg-[var(--card)] text-ink border-[var(--line-2)] hover:border-[var(--ink-3)] hover:bg-[var(--card-2)] shadow-card',
        danger: 'bg-transparent text-[var(--bad)] border-[var(--bad)]/40 hover:bg-[var(--bad)]/10',
        ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-[var(--card-2)] hover:text-ink',
    };
    return (
        <button type={type} onClick={onClick} disabled={disabled} title={title}
            className={`${base} ${sizes} ${variants[variant]} ${className}`}>
            {icon && <Icon name={icon} size={16} />}
            {children}
        </button>
    );
};

export const IconBtn: React.FC<{
    icon: string;
    onClick?: (e: React.MouseEvent) => void;
    title?: string;
    active?: boolean;
    disabled?: boolean;
    danger?: boolean;
    className?: string;
    fill?: boolean;
    size?: number;
}> = ({ icon, onClick, title, active, disabled, danger, className = '', fill, size = 18 }) => (
    <button
        onClick={onClick} title={title} disabled={disabled}
        className={`w-8 h-8 inline-flex items-center justify-center rounded-[var(--r)] transition-colors duration-150 disabled:opacity-40
            ${active ? 'text-[var(--mark)] bg-[var(--mark-soft)]'
                : danger ? 'text-ink-3 hover:text-[var(--bad)] hover:bg-[var(--bad)]/10'
                : 'text-ink-3 hover:text-ink hover:bg-[var(--card-2)]'} ${className}`}
    >
        <Icon name={icon} size={size} fill={fill || active} />
    </button>
);

/* ---- Surfaces ---- */
export const Card: React.FC<{ children: React.ReactNode; className?: string; interactive?: boolean; onClick?: () => void }> =
    ({ children, className = '', interactive, onClick }) => (
        <div
            onClick={onClick}
            className={`bg-[var(--card)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-card ${interactive ? 'paper-card cursor-pointer' : ''} ${className}`}
        >{children}</div>
    );

export const Chip: React.FC<{
    children: React.ReactNode;
    active?: boolean;
    onClick?: () => void;
    className?: string;
}> = ({ children, active, onClick, className = '' }) => (
    <button
        onClick={onClick}
        className={`h-7 px-2.5 inline-flex items-center gap-1 rounded-[var(--r)] border text-xs font-sans font-medium transition-colors duration-150
            ${active ? 'bg-[var(--mark)] text-[var(--mark-ink)] border-transparent'
                : 'bg-transparent text-ink-2 border-[var(--line-2)] hover:border-[var(--ink-3)] hover:text-ink'} ${className}`}
    >{children}</button>
);

export const Tag: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border border-[var(--line-2)] text-ink-3 font-mono text-[10px] ${className}`}>
        {children}
    </span>
);

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <kbd className="font-mono text-[10px] text-ink-3 border border-[var(--line-2)] border-b-2 rounded px-1 py-0.5 bg-[var(--card-2)]">{children}</kbd>
);

export const Divider: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`h-px bg-[var(--line)] ${className}`} />
);

/* ---- Form controls ---- */
export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
    <label className="block">
        <span className="block text-[13px] font-medium text-ink mb-1.5">{label}</span>
        {children}
        {hint && <span className="block mt-1 text-xs text-ink-3">{hint}</span>}
    </label>
);

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    (props, ref) => (
        <input
            ref={ref}
            {...props}
            className={`w-full h-9 px-3 rounded-[var(--r)] bg-[var(--card-2)] border border-[var(--line-2)] text-sm text-ink placeholder:text-ink-3
                focus:outline-none focus:border-[var(--mark)] transition-colors ${props.className || ''}`}
        />
    )
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
    <select
        {...props}
        className={`h-9 px-2.5 rounded-[var(--r)] bg-[var(--card-2)] border border-[var(--line-2)] text-sm text-ink
            focus:outline-none focus:border-[var(--mark)] transition-colors ${props.className || ''}`}
    />
);

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string }> = ({ checked, onChange, label }) => (
    <button
        role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className="flex items-center gap-2.5 group"
    >
        <span className={`w-9 h-5 rounded-full border transition-colors relative ${checked ? 'bg-[var(--mark)] border-transparent' : 'bg-[var(--card-2)] border-[var(--line-2)]'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--card)] shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
        </span>
        {label && <span className="text-sm text-ink-2 group-hover:text-ink transition-colors">{label}</span>}
    </button>
);

export const Segmented: React.FC<{
    options: { value: string; label: string; icon?: string }[];
    value: string;
    onChange: (v: string) => void;
    className?: string;
}> = ({ options, value, onChange, className = '' }) => (
    <div className={`inline-flex items-center p-0.5 rounded-full border border-[var(--line-2)] bg-[var(--card-2)] ${className}`}>
        {options.map(o => (
            <button
                key={o.value}
                onClick={() => onChange(o.value)}
                className={`h-7 px-3 inline-flex items-center gap-1.5 rounded-full text-xs font-medium transition-all duration-150
                    ${value === o.value ? 'bg-[var(--card)] text-ink shadow-card' : 'text-ink-3 hover:text-ink-2'}`}
            >
                {o.icon && <Icon name={o.icon} size={14} />}
                {o.label}
            </button>
        ))}
    </div>
);

/* ---- Modal & popover ---- */

/* Open modals stack: only the topmost one owns Escape. A hidden modal must
   not swallow the press meant for the modal rendered above it. */
const modalStack: symbol[] = [];

export const Modal: React.FC<{
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    width?: string;
}> = ({ open, onClose, children, width = 'max-w-md' }) => {
    const idRef = useRef(Symbol('modal'));
    /* Escape dismisses the modal. Capture phase so a view-level Escape
       handler (e.g. the editor's) doesn't also fire for the same press. */
    useEffect(() => {
        if (!open) return;
        const id = idRef.current;
        modalStack.push(id);
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (modalStack[modalStack.length - 1] !== id) return;
            e.stopImmediatePropagation();
            e.preventDefault();
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            const i = modalStack.indexOf(id);
            if (i !== -1) modalStack.splice(i, 1);
        };
    }, [open, onClose]);

    return (
    <AnimatePresence>
        {open && (
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[90] bg-black/45 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.99 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className={`bg-[var(--card)] border border-[var(--line-2)] rounded-[var(--r-lg)] shadow-pop w-full ${width}`}
                    onClick={e => e.stopPropagation()}
                >
                    {children}
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
    );
};

/* ---- Feedback ---- */
export const EmptyState: React.FC<{
    icon: string;
    title: string;
    body?: string;
    action?: React.ReactNode;
    className?: string;
}> = ({ icon, title, body, action, className = '' }) => (
    <div className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}>
        <div className="w-12 h-12 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--card)] flex items-center justify-center mb-4 shadow-card">
            <Icon name={icon} size={22} className="text-ink-3" />
        </div>
        <h3 className="font-serif text-lg text-ink ink-write">{title}</h3>
        {body && <p className="text-sm text-ink-2 mt-1.5 max-w-sm">{body}</p>}
        {action && <div className="mt-5">{action}</div>}
    </div>
);

export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
    <div
        className={`rounded-full border-2 border-[var(--line-2)] border-t-[var(--mark)] animate-spin ${className}`}
        style={{ width: size, height: size }}
    />
);

export const ProgressBar: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
    <div className={`h-1.5 w-full rounded-full bg-[var(--card-2)] border border-[var(--line)] overflow-hidden ${className}`}>
        <div className="h-full bg-[var(--mark)] transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
);

export const Stat: React.FC<{ value: string | number; label: string; className?: string }> = ({ value, label, className = '' }) => (
    <div className={`flex flex-col ${className}`}>
        <span className="font-serif text-2xl text-ink leading-none">{value}</span>
        <span className="font-mono text-[10px] text-ink-3 mt-1.5">{label}</span>
    </div>
);
