import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  label: string;
  onClose: () => void;
  /** Where focus goes on close when the opener is gone, as after moving between the drawer and the cart. */
  fallbackFocus?: () => HTMLElement | null;
  className?: string;
  children: ReactNode;
};

/**
 * A native modal dialog, open while mounted: the browser traps focus and makes the page behind inert. Esc and clicks
 * on the dialog's own empty area (outside the content) call `onClose`; focus returns to whatever opened it, or to
 * `fallbackFocus` when that element has left the page. It renders into <body>, so a parent hidden at some widths can
 * never hide an open modal while the page stays inert.
 */
export default function Modal({ label, onClose, fallbackFocus, className, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null); // captured once, before the modal takes focus
  const fallback = useRef(fallbackFocus);
  fallback.current = fallbackFocus;

  useEffect(() => {
    if (!dialog.current!.open) dialog.current!.showModal();
    // The dialog is removed rather than closed, so return focus ourselves.
    return () => (opener.current?.isConnected ? opener.current : fallback.current?.())?.focus();
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

/**
 * The product drawer's and cart panel's shared frame (docs/06-frontend.md, Drawer): a right-hand drawer
 * `min(480px, 100vw)` wide from 640 px, a full-width bottom sheet at most 90dvh tall below that. It slides in once:
 * crossing 640 px later switches its position without replaying the slide.
 */
export function Drawer({ children, ...props }: Omit<Props, "className">) {
  const [entering, setEntering] = useState(true);
  return (
    <Modal {...props} className="fixed inset-0 size-full bg-transparent">
      <div
        onAnimationEnd={(event) => event.target === event.currentTarget && setEntering(false)}
        className={clsx(
          "absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-2xl bg-surface sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[min(480px,100vw)] sm:rounded-none",
          entering && "animate-drawer-up sm:animate-drawer-left",
        )}
      >
        {children}
      </div>
    </Modal>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-surface-muted">
      <X aria-hidden className="size-5" />
    </button>
  );
}
