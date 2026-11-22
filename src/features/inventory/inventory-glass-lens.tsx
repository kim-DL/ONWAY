"use client";

import { useEffect, useRef } from "react";

/** Decorative layer only. The native button works before the renderer loads. */
export function InventoryGlassLens() {
  const surface = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = surface.current;
    if (!host || typeof WebGL2RenderingContext === "undefined") return;
    const solid = matchMedia("(prefers-reduced-transparency: reduce), (forced-colors: active)");
    let dispose: (() => void) | undefined;
    let generation = 0;
    function update() {
      const version = ++generation;
      if (solid.matches) {
        dispose?.();
        dispose = undefined;
      } else if (!dispose && !document.hidden) {
        void import(/* webpackChunkName: "inventory-glass-lens" */ "./inventory-glass-renderer").then(({ mountGlass }) => {
          if (version === generation) dispose = mountGlass(host!);
        }).catch(() => { /* The neutral CSS surface also works offline or without a GPU. */ });
      }
    }
    update();
    solid.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      ++generation;
      solid.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      dispose?.();
    };
  }, []);
  return <span ref={surface} aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: -1, overflow: "hidden", borderRadius: "inherit", pointerEvents: "none" }} />;
}
