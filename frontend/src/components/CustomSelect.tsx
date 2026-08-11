import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown } from "./Icons";
import { useFloatingPosition } from "../hooks/useFloatingPosition";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Renders the trigger as a filterable text input instead of a button. */
  searchable?: boolean;
  /** Allows typing a value with no matching option (e.g. a brand-new company name). */
  allowCustomValue?: boolean;
}

export function CustomSelect({
  value, onChange, options, placeholder = "Select…", className = "", disabled, searchable, allowCustomValue,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rect = useFloatingPosition(triggerRef, open);

  const selected = options.find((o) => o.value === value);
  const filtered = searchable && query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
    // `close()` reads `query`/`selected` from this render's closure — without
    // `query` here the listener attached on open freezes to the EMPTY query
    // captured at open-time, so typed free text never commits on outside
    // click (only Enter/picking an option would). Re-subscribing per
    // keystroke is cheap; correctness here matters more.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  function openMenu() {
    if (disabled) return;
    setQuery("");
    setHighlight(Math.max(0, filtered.findIndex((o) => o.value === value)));
    setOpen(true);
    if (searchable) setTimeout(() => inputRef.current?.focus(), 0);
  }

  function close() {
    setOpen(false);
    if (searchable && allowCustomValue && query.trim() && query !== selected?.label) {
      onChange(query.trim());
    }
  }

  function pick(opt: SelectOption) {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) pick(filtered[highlight]);
      else close();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  const displayLabel = searchable && open ? query : (selected?.label ?? (allowCustomValue ? value : ""));

  return (
    <div
      ref={triggerRef}
      className={`custom-select ${className}`}
      data-open={open || undefined}
      data-disabled={disabled || undefined}
      tabIndex={searchable ? -1 : disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      onClick={() => (open ? undefined : openMenu())}
    >
      {searchable ? (
        <input
          ref={inputRef}
          className="custom-select-input"
          value={displayLabel}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={openMenu}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
        />
      ) : (
        <span className={selected ? "custom-select-value" : "custom-select-placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
      )}
      <IconChevronDown size={14} className="custom-select-chevron" />

      {open && rect && createPortal(
        <div
          ref={menuRef}
          className="custom-select-menu"
          role="listbox"
          style={{ top: rect.top, left: rect.left, width: rect.width }}
        >
          {filtered.length === 0 && (
            <div className="custom-select-empty">
              {allowCustomValue && query.trim() ? `Use "${query.trim()}"` : "No matches"}
            </div>
          )}
          {filtered.map((opt, i) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              aria-disabled={opt.disabled || undefined}
              className={`custom-select-option${opt.value === value ? " is-selected" : ""}${i === highlight ? " is-highlighted" : ""}${opt.disabled ? " is-disabled" : ""}`}
              onMouseEnter={() => !opt.disabled && setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(opt); }}
            >
              {opt.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
