import clsx from "clsx";
import { useEffect, useRef, type ReactNode } from "react";

type Props = { label: string; onClose: () => void; className?: string; children: ReactNode };

/**
 * A native modal dialog, open while mounted: the browser traps focus and makes the page behind inert. Esc and clicks
 * on the dialog's own empty area (outside the content) call `onClose`; focus returns to whatever opened it.
 */
export default function Modal({ label, onClose, className, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null); // captured once, before the modal takes focus

  useEffect(() => {
    if (!dialog.current!.open) dialog.current!.showModal();
    return () => opener.current?.focus(); // the dialog is removed rather than closed, so return focus ourselves
  }, []);

  return (
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
    </dialog>
  );
}
