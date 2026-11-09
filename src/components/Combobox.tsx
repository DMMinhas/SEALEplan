"use client";

import { useId, useMemo, useRef, useState } from "react";

export interface ComboOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  id: string;
  label: string;
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  description?: string;
  maxShown?: number;
}

/** Accessible searchable select (WAI-ARIA 1.2 combobox with listbox popup). */
export default function Combobox({
  id,
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled,
  required,
  error,
  description,
  maxShown = 60,
}: Props) {
  const listId = useId();
  const descId = useId();
  const errId = useId();
  const selected = options.find((o) => o.value === value);
  const [query, setQuery] = useState<string | null>(null); // null = not typing
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = (query ?? "").trim().toLowerCase();
    const base = q
      ? options.filter(
          (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
        )
      : options;
    return base.slice(0, maxShown);
  }, [options, query, maxShown]);

  const choose = (o: ComboOption) => {
    onChange(o.value);
    setQuery(null);
    setOpen(false);
  };

  const scrollIntoView = (idx: number) => {
    const el = listRef.current?.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      const n = Math.min(active + 1, filtered.length - 1);
      setActive(n);
      scrollIntoView(n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const n = Math.max(active - 1, 0);
      setActive(n);
      scrollIntoView(n);
    } else if (e.key === "Enter") {
      if (open && filtered[active]) {
        e.preventDefault();
        choose(filtered[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery(null);
      }
    }
  };

  const onBlur = () => {
    if (query !== null) {
      const q = query.trim().toLowerCase();
      const exact = options.find((o) => o.label.toLowerCase() === q || o.value.toLowerCase() === q);
      if (exact) onChange(exact.value);
    }
    setQuery(null);
    setOpen(false);
  };

  const describedBy = [description ? descId : null, error ? errId : null].filter(Boolean).join(" ");

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {description && (
        <p id={descId} className="mt-0.5 text-xs text-muted">
          {description}
        </p>
      )}
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        aria-required={required}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={query ?? selected?.label ?? ""}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onClick={() => !disabled && setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={`mt-1 w-full rounded-md border bg-white px-3 py-2 text-base disabled:bg-surface disabled:text-muted ${
          error ? "border-red-700" : "border-gray-400"
        }`}
      />
      {open && !disabled && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-400 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted" role="presentation">
              No matches
            </li>
          )}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseMove={() => setActive(i)}
              className={`flex cursor-pointer justify-between gap-2 px-3 py-2 text-sm ${
                i === active ? "bg-blue-100" : ""
              } ${o.value === value ? "font-semibold" : ""}`}
            >
              <span>{o.label}</span>
              {o.hint && <span className="shrink-0 text-muted">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={errId} className="mt-1 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
