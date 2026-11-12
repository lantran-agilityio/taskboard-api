import { useEffect, useRef } from "react";

// Dialogs and popovers open now, oldest first. Escape closes only the last
// one, so a confirmation opened from a dialog (or a dialog opened from a
// menu) closes without the one beneath.
const layers: symbol[] = [];

/**
 * Calls onEscape when Escape is pressed and this is the topmost layer.
 * Listens on the document, not the element: focus can leave the layer (a
 * clicked button that disappears takes it to <body>), and Escape must still work.
 */
export function useEscape(onEscape: () => void): void {
  // The latest callback, for a listener that is set up only once.
  const latest = useRef(onEscape);
  useEffect(() => {
    latest.current = onEscape;
  });

  useEffect(() => {
    const self = Symbol("layer");
    layers.push(self);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && layers.at(-1) === self) {
        event.preventDefault();
        latest.current();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      layers.splice(layers.indexOf(self), 1);
    };
  }, []);
}
