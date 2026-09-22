import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Customer } from "@/domain/customer";
import type { InventoryContext } from "@/domain/inventory";

vi.mock("@/features/search/search-catalog-cache", () => ({ clearSearchClientState: async () => undefined }));
vi.mock("@/features/sales-cycle/sales-workspace-cache", () => ({ clearSalesWorkspaceClientState: async () => undefined }));
vi.mock("@/features/school-detail/school-detail-cache", () => ({ clearSchoolDetailClientState: async () => undefined }));
vi.mock("@/features/school-detail/school-photo-cache", () => ({ clearSchoolPhotoClientState: async () => undefined }));

import {
  beginCustomerCatalogRead, clearCustomerWorkspaceSnapshot, commitCustomerCatalogRead, readCustomerWorkspaceSnapshot,
} from "@/features/customers/customer-workspace-snapshot";
import {
  clearInventoryWorkspaceSnapshot, commitInventoryCatalog, getInventoryWorkspaceSession,
} from "@/features/inventory/inventory-workspace-snapshot";
import { clearPrivateClientState } from "./private-client-state";

const storage = { length: 0, key: () => null, removeItem: vi.fn() };

beforeEach(() => {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
});
afterEach(() => {
  clearCustomerWorkspaceSnapshot(); clearInventoryWorkspaceSnapshot(); vi.unstubAllGlobals();
});

describe("private workspace snapshot cleanup", () => {
  it("drops customer and inventory memory before logout completes", async () => {
    const namespace = "EMP:1:1";
    commitCustomerCatalogRead(namespace, [{ customerId: "customer" } as Customer], 1_000, beginCustomerCatalogRead(namespace));
    commitInventoryCatalog(namespace, { context: { today: "2026-09-20" } as InventoryContext, products: [], observedDate: "2026-09-20", freshness: "fresh", lastSuccessAt: 1_000 });

    await clearPrivateClientState();

    expect(readCustomerWorkspaceSnapshot(namespace).catalog).toBeNull();
    expect(getInventoryWorkspaceSession(namespace).snapshot.catalog).toBeNull();
  });

  it("removes the namespaced recent-customer ID history on logout without touching public storage", async () => {
    const values = new Map([
      ["onnuriway:private:recent-customers:v1:employee:1:1", '["customer_1"]'],
      ["public-preference", "keep"],
    ]);
    const scopedStorage = {
      get length() { return values.size; },
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: vi.fn((key: string) => { values.delete(key); }),
    };
    vi.stubGlobal("localStorage", scopedStorage);
    vi.stubGlobal("sessionStorage", { length: 0, key: () => null, removeItem: vi.fn() });

    await clearPrivateClientState();

    expect(values.has("onnuriway:private:recent-customers:v1:employee:1:1")).toBe(false);
    expect(values.get("public-preference")).toBe("keep");
  });
});
