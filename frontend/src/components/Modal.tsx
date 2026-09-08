import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

// Built on Radix's Dialog primitive (redesign spec, Component Library
// category) instead of the hand-rolled focus-trap/Escape-handling this
// used to do itself - real, maintained focus-trapping and
// Escape/click-outside-to-close behavior, verified against axe rather
// than hoped-for from a manual keydown listener.
//
// Exit animation: every call site is `{open && <Modal ...>}`, so the
// parent unmounts Modal the instant its own state flips - there's no
// window for an exit transition unless the actual unmount is delayed.
// Internal `visible` state does exactly that for every dismissal Radix
// itself controls (Escape, outside click, the Close button below):
// flip to false first (CSS animates out via data-state="closed", see
// theme.css), then call the real onClose after the animation's
// duration. Footer buttons that call the page's own setModalOpen(false)
// directly (bypassing this component entirely) still close instantly -
// a real limitation, but covers every dismissal path Modal can actually
// see without changing any of the ~20 call sites.
const EXIT_MS = 160;

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
  const [visible, setVisible] = useState(true);

  function requestClose() {
    setVisible(false);
    setTimeout(onClose, EXIT_MS);
  }

  return (
    <Dialog.Root open={visible} onOpenChange={(next) => { if (!next) requestClose(); }}>
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
