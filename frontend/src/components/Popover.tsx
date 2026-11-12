import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useEscape } from "./escape";

/**
 * A small panel under the button that opened it (a list's menu). Escape, the
 * × button and a click outside close it; focus starts on its first button
 * and goes back to the opener.
 */
export function Popover({
  title,
  anchor,
  onClose,
  children,
}: {
  title: string;
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: 8, top: 60 });
  useEscape(onClose);

  // Under the anchor, kept on screen. Measured before paint, so it doesn't jump.
  useLayoutEffect(() => {
    if (!anchor || !panel.current) return;
    const box = anchor.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = panel.current;
    const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));
    let top = box.bottom + 6;
    if (top + height > window.innerHeight - 8) top = Math.max(8, box.top - height - 6);
    setPlace({ left, top });
  }, [anchor]);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("button:not(.x), select, input")?.focus();
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor?.contains(target)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      if (anchor?.isConnected) anchor.focus();
    };
    // Set up once per popover; onClose is read when it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={panel}
      className="pop"
      role="dialog"
      aria-labelledby={titleId}
      style={{ left: place.left, top: place.top }}
    >
      <div className="pop-head">
        <h3 id={titleId}>{title}</h3>
        <button type="button" className="x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </div>
  );
}
