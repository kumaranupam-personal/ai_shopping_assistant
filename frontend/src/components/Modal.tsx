import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = { label: string; onClose: () => void; className?: string; children: ReactNode };

/**
 * A native modal dialog, open while mounted: the browser traps focus and makes the page behind inert. Esc and clicks
 * on the dialog's own empty area (outside the content) call `onClose`; focus returns to whatever opened it. It renders
 * into <body>, so a parent hidden at some widths can never hide an open modal while the page stays inert.
 */
export default function Modal({ label, onClose, className, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null); // captured once, before the modal takes focus

  useEffect(() => {
    if (!dialog.current!.open) dialog.current!.showModal();
    return () => opener.current?.focus(); // the dialog is removed rather than closed, so return focus ourselves
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className={clsx("m-0 max-h-none max-w-none p-0 text-fg backdrop:bg-black/40", className)}
    >
      {children}
    </dialog>,
    document.body,
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close" className="grid size-9 place-items-center rounded-lg hover:bg-surface-muted">
      <X aria-hidden className="size-5" />
    </button>
  );
}
