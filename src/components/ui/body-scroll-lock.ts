type Lock = { owners: Set<symbol>; overflow: string; priority: string };
const locks = new WeakMap<HTMLElement, Lock>();

/** Nested overlays may disappear in either order; only the last owner restores. */
export function lockBodyScroll(body: HTMLElement = document.body): () => void {
  let lock = locks.get(body);
  if (!lock) {
    lock = { owners: new Set(), overflow: body.style.overflow, priority: body.style.getPropertyPriority?.("overflow") ?? "" };
    locks.set(body, lock);
    body.style.overflow = "hidden";
  }
  const owner = Symbol("body-scroll-lock");
  lock.owners.add(owner);
  return () => {
    if (!lock.owners.delete(owner) || lock.owners.size > 0) return;
    locks.delete(body);
    // Don't overwrite a deliberate change made outside this overlay ownership.
    if (body.style.overflow !== "hidden") return;
    if (typeof body.style.setProperty === "function") body.style.setProperty("overflow", lock.overflow, lock.priority);
    else body.style.overflow = lock.overflow;
  };
}
