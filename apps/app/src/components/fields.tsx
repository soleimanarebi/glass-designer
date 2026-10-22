import { useEffect, useId, useState, type ReactNode } from "react";

export function Group({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group" open={defaultOpen}>
      <summary>{title}</summary>
      <fieldset>
        <legend className="sr-only">{title}</legend>
        {children}
      </fieldset>
    </details>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  unit?: string;
  hint?: ReactNode;
  step?: number;
  required?: boolean;
  placeholder?: string;
}

/** Number input that keeps the typed text, and reports NaN for an empty or invalid entry. */
export function NumberField({ label, value, onChange, unit, hint, step, required, placeholder }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(value === undefined || Number.isNaN(value) ? "" : String(value));
  useEffect(() => {
    const parsed = text.trim() === "" ? NaN : Number(text);
    const same = (Number.isNaN(parsed) && (value === undefined || Number.isNaN(value))) || parsed === value;
    if (!same) setText(value === undefined || Number.isNaN(value) ? "" : String(value));
    // Only react to outside changes (e.g. a template load).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const empty = text.trim() === "";
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {unit ? <span className="unit"> ({unit})</span> : null}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step ?? "any"}
        value={text}
        placeholder={placeholder}
        aria-invalid={required && empty ? true : undefined}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.trim() === "" ? NaN : Number(e.target.value));
        }}
      />
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  hint?: ReactNode;
}

export function SelectField<T extends string>({ label, value, options, onChange, hint }: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Cite({ children }: { children: ReactNode }) {
  return <span className="cite">{children}</span>;
}
