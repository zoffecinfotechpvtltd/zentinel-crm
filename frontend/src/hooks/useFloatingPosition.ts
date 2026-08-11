import { useLayoutEffect, useState, type RefObject } from "react";

export interface FloatingRect {
  top: number;
  left: number;
  width: number;
}

// Positions a portaled popover under a trigger element using fixed
// coordinates instead of absolute — this is what lets the dropdown/date
// picker escape a scrollable modal-body's `overflow-y: auto` instead of
// being clipped by it. Recomputes on scroll (capture, so scrolling inside
// a nested modal body counts) and resize while open.
export function useFloatingPosition(triggerRef: RefObject<HTMLElement | null>, open: boolean): FloatingRect | null {
  const [rect, setRect] = useState<FloatingRect | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, triggerRef]);

  return rect;
}
