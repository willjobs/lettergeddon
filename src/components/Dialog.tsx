import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
export function Dialog({
  title,
  onClose,
  returnFocus,
  children,
}: {
  title: string;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const focusTarget = useRef(returnFocus);
  focusTarget.current = returnFocus;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      // The tile which opened this dialog may move from rack to board (or back)
      // in the same render that closes it. Wait for that replacement to mount.
      requestAnimationFrame(() => {
        const replacement = focusTarget.current?.();
        const target = replacement?.isConnected ? replacement : previous;
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
