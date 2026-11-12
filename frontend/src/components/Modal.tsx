import { useEffect, useId, useRef, type ReactNode } from "react";

import { useEscape } from "./escape";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Draws it above other dialogs (a confirmation over a list, say). */
  onTop?: boolean;
}

/** A dialog over the page: Escape, the × button and the backdrop close it. */
export function Modal({ title, onClose, children, onTop = false }: ModalProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useEscape(onClose);

  useEffect(() => {
    // Back to where the user was when the dialog closes.
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus the first field (or button), so keyboard users start inside it.
    const first = dialog.current?.querySelector<HTMLElement>(
      "input, textarea, select, button:not(.x)",
    );
    (first ?? dialog.current)?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div
      className={`scrim ${onTop ? "confirm-z" : "modal-z"}`}
      onMouseDown={(event) => {
        // Only a press on the backdrop itself, not one that starts inside.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
