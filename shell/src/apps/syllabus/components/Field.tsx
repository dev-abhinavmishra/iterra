import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="f-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[color:var(--color-ink-faint)]">{hint}</span>}
    </label>
  );
}

export const FInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function FInput(props, ref) {
    return <input ref={ref} className="f-input" {...props} />;
  },
);

export const FSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function FSelect(props, ref) {
    return <select ref={ref} className="f-select" {...props} />;
  },
);

export const FTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function FTextarea(props, ref) {
    return <textarea ref={ref} className="f-textarea" rows={3} {...props} />;
  },
);
