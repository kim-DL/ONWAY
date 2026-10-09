import { describe, expect, it } from "vitest";
import { customerNameMatcher } from "../src/customer/customer-name-search.js";
import { normalizeCustomerName, getCustomerChoseong } from "../src/customer/customer-contract.js";
import { CustomerService } from "../src/customer/customer-service.js";
import type { Firestore } from "firebase-admin/firestore";

const named = (name: string) => ({ name, normalizedName: normalizeCustomerName(name), choseongName: getCustomerChoseong(name) });
describe("registered customer name matching", () => {
  it.each([
    ["합성유통", "합성", true], ["(주) 합성 유통", "㈜합성", true], ["주식회사 합성", "합성", true],
    ["합성유통", "합성상사", false], ["합성유통", "다른합성", false], ["한유통", "한", false],
    ["합성유통유통", "합성", false], ["합성", "합성유통", true], ["ㅎㅂㅊ", "한빛초", true],
    ["합셩유통", "합성", false],
  ])("query %s / registered %s matches=%s", (query, name, expected) => {
    expect(Boolean(customerNameMatcher(query)(named(name)))).toBe(expected);
  });
  it("selects only search metadata and never needs private credentials, contacts or timestamps", async () => {
    let fields: string[] = [];
    const row = { ...named("합성"), customerId: "synthetic", status: "active", district: "합성구", administrativeDong: "합성동" };
    const query = { orderBy: () => query, limit: () => query, startAfter: () => query,
      select: (...selected: string[]) => { fields = selected; return query; },
      get: async () => ({ docs: [{ id: "synthetic", data: () => row }] }) };
    const result = await new CustomerService({ collection: () => query } as unknown as Firestore).search("합성유통");
    expect(result.items).toEqual([row]); expect(result.page.complete).toBe(true);
    expect(fields.toSorted()).toEqual(Object.keys(row).toSorted());
    expect(fields).not.toContain("accessPassword"); expect(fields).not.toContain("contacts");
  });
});
