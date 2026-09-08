import { useRef, useState, type KeyboardEvent } from "react";
import * as Select from "@radix-ui/react-select";
import * as Popover from "@radix-ui/react-popover";
import { IconChevronDown } from "./Icons";

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
  /** Accessible name when there's no visible `<label htmlFor>` pointing at this control (e.g. a dynamically-generated field). */
  ariaLabel?: string;
}

// Built on Radix Select (redesign spec, Component Library category) for
// the plain dropdown case - real combobox/listbox ARIA, keyboard nav
// (typeahead, Home/End), and scroll-aware Popper positioning as
// maintained behavior, instead of the hand-rolled version this used to
// be. Radix's Select.Item forbids an empty-string value (it's reserved
// internally to mean "no selection"), but several call sites across the
// app use "" as a real, selectable "All ___" option - translated to/from
// a sentinel at this boundary rather than touching any of those call
// sites.
const EMPTY_SENTINEL = "__empty__";

export function CustomSelect({
  value, onChange, options, placeholder = "Select…", className = "", disabled, searchable, allowCustomValue, ariaLabel,
}: CustomSelectProps) {
  if (searchable) {
    return (
      <SearchableSelect
        value={value} onChange={onChange} options={options} placeholder={placeholder}
        className={className} disabled={disabled} allowCustomValue={allowCustomValue} ariaLabel={ariaLabel}
      />
    );
  }

  return (
    <Select.Root
      value={value === "" ? EMPTY_SENTINEL : value}
      onValueChange={(v) => onChange(v === EMPTY_SENTINEL ? "" : v)}
      disabled={disabled}
    >
      <Select.Trigger className={`custom-select ${className}`} aria-label={ariaLabel}>
        <Select.Value className="custom-select-value" placeholder={<span className="custom-select-placeholder">{placeholder}</span>} />
        <Select.Icon>
          <IconChevronDown size={14} className="custom-select-chevron" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="custom-select-menu" position="popper" sideOffset={4} style={{ width: "var(--radix-select-trigger-width)" }}>
          <Select.Viewport>
            {options.length === 0 && <div className="custom-select-empty">No matches</div>}
            {options.map((opt) => (
              <Select.Item key={opt.value} value={opt.value === "" ? EMPTY_SENTINEL : opt.value} disabled={opt.disabled} className="custom-select-option">
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

// The searchable/allowCustomValue variant needs free-text filtering and
// custom keyboard nav that Radix's Select can't do (it's a strict
// listbox, no text input inside the trigger) - so this stays hand-rolled,
// but on Radix Popover instead of the old custom-hook+manual-portal
// positioning, which is what actually fixes the audit's "detached
// autocomplete popover doesn't reposition on scroll" finding (Add
// Opportunity's company autocomplete) - Popover.Content's Popper-based
// positioning is scroll/resize-aware by default.
function SearchableSelect({
  value, onChange, options, placeholder, className, disabled, allowCustomValue, ariaLabel,
}: {
  value: string; onChange: (v: string) => void; options: SelectOption[]; placeholder?: string;
  className?: string; disabled?: boolean; allowCustomValue?: boolean; ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;

  function openMenu() {
    if (disabled) return;
    setQuery("");
    setHighlight(Math.max(0, filtered.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    if (allowCustomValue && query.trim() && query !== selected?.label) {
      onChange(query.trim());
    }
  }

  function pick(opt: SelectOption) {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  }

  function commitCustomValue() {
    const v = query.trim();
    if (!v) return;
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
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
      else if (allowCustomValue) commitCustomValue();
      else close();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  const displayLabel = open ? query : (selected?.label ?? (allowCustomValue ? value : ""));

  return (
    <Popover.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <Popover.Anchor asChild>
        <div className={`custom-select ${className}`} data-open={open || undefined} data-disabled={disabled || undefined}>
          <input
            ref={inputRef}
            className="custom-select-input"
            value={displayLabel}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={ariaLabel}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            onFocus={openMenu}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!open) setOpen(true);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
          />
          <IconChevronDown size={14} className="custom-select-chevron" />
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="custom-select-menu"
          role="listbox"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          style={{ width: "var(--radix-popover-trigger-width)" }}
        >
          {filtered.length === 0 && allowCustomValue && query.trim() && (
            <div
              role="option"
              aria-selected={false}
              className="custom-select-option custom-select-custom-value"
              onMouseDown={(e) => { e.preventDefault(); commitCustomValue(); }}
            >
              Use &quot;{query.trim()}&quot;
            </div>
          )}
          {filtered.length === 0 && !(allowCustomValue && query.trim()) && (
            <div className="custom-select-empty">No matches</div>
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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
