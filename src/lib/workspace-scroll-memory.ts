export function restoreWorkspaceScroll(scroller: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">, savedTop: number) {
  const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  scroller.scrollTop = Math.min(Math.max(0, savedTop), maximum);
  return scroller.scrollTop;
}

/** Restore once on entry; cleanup must not force layout after a list commit. */
export function rememberWorkspaceScroll(scroller: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop" | "addEventListener" | "removeEventListener">, savedTop: number, save: (top: number) => void) {
  let top = restoreWorkspaceScroll(scroller, savedTop);
  const remember = () => { top = scroller.scrollTop; save(top); };
  scroller.addEventListener("scroll", remember, { passive: true });
  return () => { scroller.removeEventListener("scroll", remember); save(top); };
}
