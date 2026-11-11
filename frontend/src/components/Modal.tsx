import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Draws it above other dialogs (a confirmation over a list, say). */
  onTop?: boolean;
}

// The dialogs open now, oldest first. Escape closes only the last one, so a
// confirmation opened from another dialog closes without the one beneath.
const openDialogs: symbol[] = [];

/** A dialog over the page: Escape, the × button and the backdrop close it. */
export function Modal({ title, onClose, children, onTop = false }: ModalProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  // The latest onClose, for the Escape listener that is set up only once.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const self = Symbol(title);
    openDialogs.push(self);
    // Back to where the user was when the dialog closes.
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus the first field (or button), so keyboard users start inside it.
    const first = dialog.current?.querySelector<HTMLElement>(
      "input, textarea, select, button:not(.x)",
    );
    (first ?? dialog.current)?.focus();

    // On the document, not the dialog: focus can leave the dialog (a clicked
    // button that disappears takes it to <body>), and Escape must still work.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && openDialogs.at(-1) === self) {
        event.preventDefault();
        close.current();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openDialogs.splice(openDialogs.indexOf(self), 1);
      if (opener?.isConnected) opener.focus();
    };
    // Runs once per dialog: the title doesn't change while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
