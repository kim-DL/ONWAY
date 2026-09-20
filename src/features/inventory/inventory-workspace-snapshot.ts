import type { InventoryContext, InventoryProduct } from "@/domain/inventory";
import { RevalidationCoordinator, type RevalidationFreshness } from "@/lib/revalidation-coordinator";

import { InventoryListReconciler } from "./inventory-list-reconciler";
import type { InventoryLocationFilter } from "./inventory-model";

export type InventoryWorkspaceSnapshot = {
  catalog: null | {
    context: InventoryContext | null;
    products: InventoryProduct[];
    observedDate: string;
    freshness: RevalidationFreshness;
    lastSuccessAt: number | null;
  };
  ui: { location: InventoryLocationFilter; query: string; urgentOnly: boolean; showInactive: boolean; limit: number; scrollTop: number };
};

type InventorySessionEntry = {
  namespace: string;
  coordinator: RevalidationCoordinator;
  reconciler: InventoryListReconciler;
  snapshot: InventoryWorkspaceSnapshot;
  listeners: Set<(catalog: NonNullable<InventoryWorkspaceSnapshot["catalog"]>) => void>;
};

let entry: InventorySessionEntry | null = null;

export function getInventoryWorkspaceSession(namespace: string) {
  if (entry?.namespace !== namespace) {
    entry?.coordinator.invalidate();
    entry?.reconciler.dispose();
    entry = {
      namespace,
      coordinator: new RevalidationCoordinator(namespace),
      reconciler: new InventoryListReconciler(namespace),
      snapshot: { catalog: null, ui: { location: "all", query: "", urgentOnly: false, showInactive: false, limit: 60, scrollTop: 0 } },
      listeners: new Set(),
    };
  }
  return entry;
}

export function updateInventoryWorkspaceUi(namespace: string, ui: Partial<InventoryWorkspaceSnapshot["ui"]>) {
  const current = entry;
  if (!current || current.namespace !== namespace) return;
  current.snapshot = { ...current.snapshot, ui: { ...current.snapshot.ui, ...ui } };
}

export function commitInventoryCatalog(namespace: string, catalog: NonNullable<InventoryWorkspaceSnapshot["catalog"]>, expectedReconciler?: InventoryListReconciler) {
  const current = entry;
  if (!current || current.namespace !== namespace || expectedReconciler && current.reconciler !== expectedReconciler) return false;
  current.snapshot = { ...current.snapshot, catalog };
  for (const listener of current.listeners) listener(catalog);
  return true;
}

export function subscribeInventoryCatalog(namespace: string, listener: (catalog: NonNullable<InventoryWorkspaceSnapshot["catalog"]>) => void) {
  const current = entry;
  if (!current || current.namespace !== namespace) return () => undefined;
  current.listeners.add(listener);
  return () => current.listeners.delete(listener);
}

export function updateInventoryCatalogFreshness(namespace: string, freshness: RevalidationFreshness, lastSuccessAt: number | null) {
  const current = entry;
  if (!current || current.namespace !== namespace) return;
  if (!current.snapshot.catalog) return;
  current.snapshot = { ...current.snapshot, catalog: { ...current.snapshot.catalog, freshness, lastSuccessAt: lastSuccessAt ?? current.snapshot.catalog.lastSuccessAt } };
}

export function updateInventorySnapshotProduct(namespace: string, product: InventoryProduct) {
  const current = entry;
  if (!current || current.namespace !== namespace) return;
  if (!current.snapshot.catalog) return;
  const old = current.snapshot.catalog.products;
  const products = product.status === "deleted"
    ? old.filter((item) => item.productId !== product.productId)
    : old.some((item) => item.productId === product.productId)
      ? old.map((item) => item.productId === product.productId ? product : item)
      : [...old, product];
  current.snapshot = { ...current.snapshot, catalog: { ...current.snapshot.catalog, products } };
}

export function updateInventorySnapshotContext(namespace: string, context: InventoryContext, observedDate: string) {
  const current = entry;
  if (!current || current.namespace !== namespace) return;
  if (!current.snapshot.catalog) return;
  current.snapshot = { ...current.snapshot, catalog: { ...current.snapshot.catalog, context, observedDate } };
}

export function clearInventoryWorkspaceSnapshot(namespace?: string) {
  if (!entry || namespace && entry.namespace !== namespace) return;
  entry.coordinator.invalidate();
  entry.reconciler.dispose();
  entry = null;
}

export function discardInventoryWorkspaceCatalog(namespace: string) {
  if (!entry || entry.namespace !== namespace) return;
  entry.coordinator.invalidate();
  entry.reconciler.dispose();
  entry.reconciler = new InventoryListReconciler(namespace);
  entry.snapshot = { catalog: null, ui: { location: "all", query: "", urgentOnly: false, showInactive: false, limit: 60, scrollTop: 0 } };
}
