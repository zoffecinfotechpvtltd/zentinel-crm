import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
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
      {/* Radix's AlertDialog (redesign spec, Component Library category),
          not the plain Dialog Modal.tsx uses - an alert dialog only closes
          on Escape or an explicit button, never an outside click, which is
          the right default for "delete this?" (a stray click shouldn't
          silently cancel or confirm a destructive prompt). Real
          focus-trapping and correct ARIA role="alertdialog" come from
          Radix rather than the hand-rolled keydown listener this used to
          need. */}
      <AlertDialog.Root open={!!pending} onOpenChange={(next) => { if (!next) settle(false); }}>
        {pending && (
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="modal-overlay" />
            <AlertDialog.Content className="modal confirm-dialog">
              <div className="confirm-dialog-body">
                <div className={`confirm-dialog-icon${pending.danger ? " danger" : ""}`}>
                  <IconAlert size={20} />
                </div>
                <div>
                  <AlertDialog.Title className="confirm-dialog-title">{pending.title ?? "Are you sure?"}</AlertDialog.Title>
                  <AlertDialog.Description className="confirm-dialog-message">{pending.message}</AlertDialog.Description>
                </div>
              </div>
              <div className="modal-footer">
                <AlertDialog.Cancel className="btn btn-ghost" autoFocus>
                  {pending.cancelLabel ?? "Cancel"}
                </AlertDialog.Cancel>
                <AlertDialog.Action
                  className={pending.danger ? "btn btn-danger" : "btn btn-primary"}
                  onClick={() => settle(true)}
                >
                  {pending.confirmLabel ?? "Confirm"}
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        )}
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
