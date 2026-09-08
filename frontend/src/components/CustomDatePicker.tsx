import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconX } from "./Icons";

interface CustomDatePickerProps {
  /** ISO date string, "yyyy-mm-dd", or "" for empty. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  /** Accessible name when there's no visible `<label htmlFor>` pointing at this control. */
  ariaLabel?: string;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatDisplay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${d} ${MONTH_LABELS[m - 1].slice(0, 3)} ${y}`;
}

// Radix has no calendar/date-picker primitive to build on (that's genuine
// app-specific UI, not something a headless-primitives library ships) -
// but the floating panel itself is exactly what Radix Popover is for
// (redesign spec, Component Library category), replacing the hand-rolled
// useFloatingPosition hook and manual mousedown/Escape document
// listeners with real scroll-aware positioning, focus-trapping, and
// dismiss behavior.
export function CustomDatePicker({ value, onChange, className = "", placeholder = "Select date…", disabled, min, max, ariaLabel }: CustomDatePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = value ? value.split("-").map(Number) : null;
  const today = new Date();
  const [viewYear, setViewYear] = useState(parsed ? parsed[0] : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed ? parsed[1] - 1 : today.getMonth());

  function openPanel() {
    if (disabled) return;
    const p = value ? value.split("-").map(Number) : null;
    setViewYear(p ? p[0] : today.getFullYear());
    setViewMonth(p ? p[1] - 1 : today.getMonth());
    setOpen(true);
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function isDisabled(iso: string): boolean {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); } else setViewMonth((m) => m + 1);
  }

  return (
    <Popover.Root open={open} onOpenChange={(next) => (next ? openPanel() : setOpen(false))}>
      <Popover.Anchor asChild>
        <div
          className={`custom-datepicker ${className}`}
          data-open={open || undefined}
          data-disabled={disabled || undefined}
          role="button"
          aria-label={ariaLabel ?? (value ? formatDisplay(value) : placeholder)}
          aria-haspopup="dialog"
          aria-expanded={open}
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && openPanel()}
          onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openPanel(); } }}
        >
          <IconCalendar size={15} className="custom-datepicker-icon" />
          <span className={value ? "custom-datepicker-value" : "custom-datepicker-placeholder"}>
            {value ? formatDisplay(value) : placeholder}
          </span>
          {value && !disabled && (
            <button
              type="button"
              className="custom-datepicker-clear"
              aria-label="Clear date"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
            >
              <IconX size={12} />
            </button>
          )}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content className="custom-datepicker-panel" sideOffset={4} onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="custom-datepicker-nav">
            <button type="button" className="custom-datepicker-navbtn" onClick={prevMonth} aria-label="Previous month"><IconChevronLeft size={15} /></button>
            <span className="custom-datepicker-title">{MONTH_LABELS[viewMonth]} {viewYear}</span>
            <button type="button" className="custom-datepicker-navbtn" onClick={nextMonth} aria-label="Next month"><IconChevronRight size={15} /></button>
          </div>
          <div className="custom-datepicker-weekdays">
            {WEEKDAY_LABELS.map((w, i) => <span key={i}>{w}</span>)}
          </div>
          <div className="custom-datepicker-grid">
            {cells.map((d, i) => {
              if (d === null) return <span key={i} className="custom-datepicker-cell is-empty" />;
              const iso = toISO(viewYear, viewMonth, d);
              const isToday = iso === toISO(today.getFullYear(), today.getMonth(), today.getDate());
              const isSelected = iso === value;
              const disabledCell = isDisabled(iso);
              return (
                <button
                  key={i}
                  type="button"
                  className={`custom-datepicker-cell${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                  disabled={disabledCell}
                  onClick={() => { onChange(iso); setOpen(false); }}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="custom-datepicker-footer">
            <button type="button" className="custom-datepicker-today" onClick={() => { const iso = toISO(today.getFullYear(), today.getMonth(), today.getDate()); onChange(iso); setOpen(false); }}>
              Today
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
