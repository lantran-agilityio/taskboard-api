import { useCallback, useRef } from "react";

/**
 * Runs async tasks one at a time, in the order they were queued, so things
 * added in a row (cards, lists, checklist items) are saved in that order
 * even when the API answers slowly. A failed task doesn't stop the next.
 */
export function useQueue(): (task: () => Promise<unknown>) => void {
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  return useCallback((task: () => Promise<unknown>) => {
    tail.current = tail.current.then(task).catch(() => undefined);
  }, []);
}
