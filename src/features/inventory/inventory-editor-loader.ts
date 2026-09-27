type EditorModule = { default: typeof import("./inventory-product-editor").InventoryProductEditorImpl };
let pending: Promise<EditorModule> | undefined;
let loaded: EditorModule | undefined;

export function getLoadedInventoryProductEditor() { return loaded?.default; }

export function loadInventoryProductEditor() {
  return pending ??= import("./inventory-product-editor")
    .then((module) => { loaded = { default: module.InventoryProductEditorImpl }; return loaded; })
    .catch((cause: unknown) => { pending = undefined; throw cause; });
}

// Prepare code only after the inventory list is visible. Mounting an editor
// here would also start data work; importing it does not.
export function scheduleInventoryProductEditorPreload() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return () => {};
  const prepare = () => { void loadInventoryProductEditor().catch(() => {}); };
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(prepare);
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(prepare, 500);
  return () => window.clearTimeout(id);
}
