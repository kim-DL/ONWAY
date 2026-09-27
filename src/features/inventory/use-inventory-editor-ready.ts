import { useEffect, useState } from "react";

/** Let the existing modal header paint before mounting its large input tree. */
export function useInventoryEditorReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      timer = window.setTimeout(() => { if (!cancelled) setReady(true); }, 0);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
  return ready;
}
