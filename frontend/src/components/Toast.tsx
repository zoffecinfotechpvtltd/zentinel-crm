import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const dismiss = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-stack">
        {items.map((t) => (
          <div className={`toast ${t.kind}`} key={t.id} role="status">
            {ICON[t.kind]}
            <div>{t.message}</div>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss"><IconX size={13} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
