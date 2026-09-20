import { afterEach, describe, expect, it } from "vitest";

import type { Customer } from "@/domain/customer";

import {
  acceptCustomerWorkspaceWrite, beginCustomerCatalogRead, clearCustomerWorkspaceSnapshot,
  commitCustomerCatalogRead, readCustomerWorkspaceSnapshot, updateCustomerWorkspaceUi,
} from "./customer-workspace-snapshot";

const customer = (revision = 1) => ({ customerId: "customer-1", name: `거래처 ${revision}`, revision } as Customer);

afterEach(() => clearCustomerWorkspaceSnapshot());

describe("customer workspace memory snapshot", () => {
  it("keeps one namespace only and never returns the previous session snapshot", () => {
    readCustomerWorkspaceSnapshot("A:1:1");
    commitCustomerCatalogRead("A:1:1", [customer()], 1_000, beginCustomerCatalogRead("A:1:1"));
    updateCustomerWorkspaceUi("A:1:1", { query: "온누리", searchOpen: true, scrollTop: 480 });
    expect(readCustomerWorkspaceSnapshot("A:1:1")).toMatchObject({ catalog: { customers: [customer()] }, ui: { query: "온누리", scrollTop: 480 } });

    expect(readCustomerWorkspaceSnapshot("B:1:1")).toEqual({ catalog: null, ui: { query: "", searchOpen: false, scrollTop: 0 } });
    expect(readCustomerWorkspaceSnapshot("A:1:1").catalog).toBeNull();
  });

  it("retains an authoritative write over an older in-flight list result", () => {
    readCustomerWorkspaceSnapshot("A:1:1");
    commitCustomerCatalogRead("A:1:1", [customer()], 1_000, beginCustomerCatalogRead("A:1:1"));
    const oldReadGeneration = beginCustomerCatalogRead("A:1:1");
    acceptCustomerWorkspaceWrite("A:1:1", customer(2));
    const effective = commitCustomerCatalogRead("A:1:1", [customer()], 2_000, oldReadGeneration);
    expect(effective).toEqual([customer(2)]);
    expect(readCustomerWorkspaceSnapshot("A:1:1").catalog?.customers).toEqual([customer(2)]);
  });

  it("ignores a late catalog commit from an invalidated namespace", () => {
    readCustomerWorkspaceSnapshot("A:1:1");
    const oldReadGeneration = beginCustomerCatalogRead("A:1:1");
    readCustomerWorkspaceSnapshot("A:2:1");

    expect(commitCustomerCatalogRead("A:1:1", [customer()], 2_000, oldReadGeneration)).toBeNull();
    expect(readCustomerWorkspaceSnapshot("A:2:1").catalog).toBeNull();
  });
});
