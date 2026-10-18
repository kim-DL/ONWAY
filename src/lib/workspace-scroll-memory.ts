export function restoreWorkspaceScroll(scroller: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">, savedTop: number) {
  const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  scroller.scrollTop = Math.min(Math.max(0, savedTop), maximum);
}

/** Restore once on entry; cleanup must not force layout after a list commit. */
export function rememberWorkspaceScroll(scroller: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop" | "addEventListener" | "removeEventListener">, savedTop: number, save: (top: number) => void) {
  restoreWorkspaceScroll(scroller, savedTop);
  const remember = () => save(scroller.scrollTop);
  scroller.addEventListener("scroll", remember, { passive: true });
  return () => scroller.removeEventListener("scroll", remember);
}
