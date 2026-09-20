import type { Customer } from "@/domain/customer";
import { RevalidationCoordinator, type RevalidationFreshness } from "@/lib/revalidation-coordinator";

export type CustomerWorkspaceSnapshot = {
  catalog: null | {
    customers: Customer[];
    freshness: RevalidationFreshness;
    lastSuccessAt: number | null;
  };
  ui: { query: string; searchOpen: boolean; scrollTop: number };
};

type CustomerSessionEntry = {
  namespace: string;
  coordinator: RevalidationCoordinator;
  snapshot: CustomerWorkspaceSnapshot;
  writeGeneration: number;
};

let entry: CustomerSessionEntry | null = null;

function sessionEntry(namespace: string) {
  if (entry?.namespace !== namespace) {
    entry?.coordinator.invalidate();
    entry = {
      namespace,
      coordinator: new RevalidationCoordinator(namespace),
      snapshot: { catalog: null, ui: { query: "", searchOpen: false, scrollTop: 0 } },
      writeGeneration: 0,
    };
  }
  return entry;
}

export function readCustomerWorkspaceSnapshot(namespace: string) {
  return sessionEntry(namespace).snapshot;
}

export function getCustomerRevalidationCoordinator(namespace: string) {
  return sessionEntry(namespace).coordinator;
}

export function updateCustomerWorkspaceUi(namespace: string, ui: Partial<CustomerWorkspaceSnapshot["ui"]>) {
  const current = entry;
  if (!current || current.namespace !== namespace) return;
  current.snapshot = { ...current.snapshot, ui: { ...current.snapshot.ui, ...ui } };
}

export function beginCustomerCatalogRead(namespace: string) {
  return entry?.namespace === namespace ? entry.writeGeneration : null;
}

export function commitCustomerCatalogRead(namespace: string, customers: Customer[], lastSuccessAt: number, expectedWriteGeneration: number | null) {
  const current = entry;
  if (!current || current.namespace !== namespace || expectedWriteGeneration === null) return null;
  if (current.writeGeneration !== expectedWriteGeneration && current.snapshot.catalog) return current.snapshot.catalog.customers;
  current.snapshot = { ...current.snapshot, catalog: { customers, freshness: "fresh", lastSuccessAt } };
  return customers;
}

export function updateCustomerCatalogFreshness(namespace: string, freshness: RevalidationFreshness, lastSuccessAt: number | null) {
  const current = entry;
  if (!current || current.namespace !== namespace) return;
  if (!current.snapshot.catalog) return;
  current.snapshot = { ...current.snapshot, catalog: { ...current.snapshot.catalog, freshness, lastSuccessAt: lastSuccessAt ?? current.snapshot.catalog.lastSuccessAt } };
}

export function acceptCustomerWorkspaceWrite(namespace: string, customer: Customer) {
  const current = entry;
  if (!current || current.namespace !== namespace) return;
  current.writeGeneration += 1;
  if (!current.snapshot.catalog) return;
  const customers = current.snapshot.catalog.customers.some((item) => item.customerId === customer.customerId)
    ? current.snapshot.catalog.customers.map((item) => item.customerId === customer.customerId ? customer : item)
    : [...current.snapshot.catalog.customers, customer];
  current.snapshot = { ...current.snapshot, catalog: { ...current.snapshot.catalog, customers } };
}

export function clearCustomerWorkspaceSnapshot(namespace?: string) {
  if (!entry || namespace && entry.namespace !== namespace) return;
  entry.coordinator.invalidate();
  entry = null;
}

export function discardCustomerWorkspaceCatalog(namespace: string) {
  if (!entry || entry.namespace !== namespace) return;
  entry.coordinator.invalidate();
  entry.snapshot = { catalog: null, ui: { query: "", searchOpen: false, scrollTop: 0 } };
  entry.writeGeneration += 1;
}
