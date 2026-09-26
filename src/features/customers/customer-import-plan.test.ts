import { describe, expect, it } from "vitest";

import { customerDraftSchema, customerSchema } from "@/domain/customer";

import { customerImportManifestSchema, planCustomerImport } from "./customer-import-plan";

const draft = customerDraftSchema.parse({
  name: "새 거래처", district: "", administrativeDong: "", officialAddress: "대전 서구 새길 1",
  deliveryAddress: "대전 서구 새길 1", accessPassword: "", accessPasswordState: "unknown",
  deliveryLocationDescription: "", deliveryPoint: null, contacts: [], status: "active", noticeType: "new", changeNote: "",
});
const entry = { sourceId: "C-001", requestId: "2e36e332-ef7f-4ec1-8280-c77b833d8991", draft };
const existing = customerSchema.parse({ ...draft, name: "기존 거래처", officialAddress: "대전 서구 기존길 2",
  deliveryAddress: "대전 서구 기존길 2", customerId: "old-1", companyId: "onnuri", normalizedName: "기존거래처",
  choseongName: "ㄱㅈㄱㄹㅊ", revision: 1, createdAt: "2026-09-26T00:00:00.000Z", createdBy: "admin-1",
  updatedAt: "2026-09-26T00:00:00.000Z", updatedBy: "admin-1" });

describe("reviewed customer import plan", () => {
  it("imports new records and skips an exact existing record", () => {
    expect(planCustomerImport([entry], [existing]).create.map((item) => item.sourceId)).toEqual(["C-001"]);
    expect(planCustomerImport([{ ...entry, draft: { ...draft, name: existing.name, deliveryAddress: existing.deliveryAddress,
      officialAddress: existing.officialAddress } }], [existing]).existing).toHaveLength(1);
  });

  it("holds same-name or same-address conflicts and incoming duplicates", () => {
    expect(planCustomerImport([{ ...entry, draft: { ...draft, name: existing.name } }], [existing]).review).toHaveLength(1);
    expect(planCustomerImport([{ ...entry, draft: { ...draft, deliveryAddress: existing.deliveryAddress } }], [existing]).review).toHaveLength(1);
    expect(planCustomerImport([entry, { ...entry, sourceId: "C-002", requestId: "373194fc-24a4-4e12-9180-0d89f1b46878" }], []).review).toHaveLength(2);
    expect(planCustomerImport([entry, { ...entry, sourceId: "C-002", requestId: "373194fc-24a4-4e12-9180-0d89f1b46878",
      draft: { ...draft, name: "다른 거래처" } }], []).create).toHaveLength(2);
  });

  it("rejects duplicate request ids and inconsistent password states", () => {
    expect(customerImportManifestSchema.safeParse({ schemaVersion: 1, entries: [entry, { ...entry, sourceId: "C-002" }] }).success).toBe(false);
    expect(customerImportManifestSchema.safeParse({ schemaVersion: 1, entries: [{ ...entry,
      draft: { ...draft, accessPassword: "1234" } }] }).success).toBe(false);
  });
});
