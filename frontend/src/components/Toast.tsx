import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { IconCheck, IconAlert, IconX } from "./Icons";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };

type ToastContextValue = {
  push: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICON: Record<ToastKind, ReactNode> = {
  success: <IconCheck size={16} style={{ color: "var(--success)" }} />,
  error: <IconAlert size={16} style={{ color: "var(--danger)" }} />,
  info: <IconAlert size={16} style={{ color: "var(--info)" }} />,
};

// Built on Radix Toast (redesign spec, Component Library category): real
// ARIA live-region announcement (role="status", polite/assertive per
// kind) instead of a plain div screen readers may never notice, plus
// pause-on-hover/focus for the auto-dismiss timer as maintained
// behavior - a bare setTimeout (what this used to be) dismisses a toast
// out from under you mid-read if your mouse happens to be elsewhere.
// Enter/exit animation is plain CSS keyed off Radix's own data-state
// ("open"/"closed") rather than Motion - Root's `asChild` merged with a
// motion.* component's own ref/style management turned out to conflict
// (the element mounted but stayed frozen at its initial opacity:0,
// confirmed by inspecting the live DOM), and CSS-via-data-state is
// Radix's own documented animation pattern for exactly this reason -
// matches how Modal/Dialog already animate in this codebase.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, kind, message }]);
  }, []);

  const dismiss = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      <RadixToast.Provider duration={4500} swipeDirection="right">
        {children}
        {items.map((t) => (
          <RadixToast.Root
            key={t.id}
            className={`toast ${t.kind}`}
            type={t.kind === "error" ? "foreground" : "background"}
            onOpenChange={(open) => { if (!open) dismiss(t.id); }}
          >
            {ICON[t.kind]}
            <RadixToast.Description asChild>
              <div>{t.message}</div>
            </RadixToast.Description>
            <RadixToast.Close className="toast-close" aria-label="Dismiss">
              <IconX size={13} />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="toast-stack" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
