import { type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

// Built on Radix's Dialog primitive (redesign spec, Component Library
// category) instead of the hand-rolled focus-trap/Escape-handling this
// used to do itself - real, maintained focus-trapping and
// Escape/click-outside-to-close behavior, verified against axe rather
// than hoped-for from a manual keydown listener. Every call site
// (`{open && <Modal ...>}`) keeps working unchanged - Root's `open` is
// always true here since Modal itself only exists in the tree while it
// should be open; onOpenChange fires onClose exactly when Radix would
// otherwise have unmounted the dialog (Escape, outside click, or the
// Close button below).
export function Modal({
  title, onClose, children, footer, wide, xwide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  xwide?: boolean;
}) {
  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal${xwide ? " xwide" : wide ? " wide" : ""}`}>
          <div className="modal-header">
            <Dialog.Title className="modal-title">{title}</Dialog.Title>
            <Dialog.Close className="btn btn-ghost btn-sm" type="button">✕</Dialog.Close>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
