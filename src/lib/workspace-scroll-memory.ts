export function restoreWorkspaceScroll(scroller: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">, savedTop: number) {
  const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  scroller.scrollTop = Math.min(Math.max(0, savedTop), maximum);
}
