import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { IconAlert } from "./Icons";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmContextValue = (opts: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

type PendingConfirm = ConfirmOptions & { resolve: (v: boolean) => void };

// Replaces window.confirm() — a browser-chrome dialog that breaks the app's
// own visual identity — with one rendered in the app's own design system.
// Call sites keep the same "await confirm(...); if not, bail" shape they had
// with window.confirm, just async.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirmFn = useCallback<ConfirmContextValue>((opts) => {
    const normalized: ConfirmOptions = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending({ ...normalized, resolve });
    });
  }, []);

  function settle(result: boolean) {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirmFn}>
      {children}
      {pending && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) settle(false); }}>
          <div className="modal confirm-dialog">
            <div className="confirm-dialog-body">
              <div className={`confirm-dialog-icon${pending.danger ? " danger" : ""}`}>
                <IconAlert size={20} />
              </div>
              <div>
                <div className="confirm-dialog-title">{pending.title ?? "Are you sure?"}</div>
                <div className="confirm-dialog-message">{pending.message}</div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => settle(false)} autoFocus>
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                className={pending.danger ? "btn btn-danger" : "btn btn-primary"}
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
