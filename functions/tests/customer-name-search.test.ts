import { describe, expect, it } from "vitest";
import { customerNameMatcher, selectCustomerCandidate } from "../src/customer/customer-name-search.js";
import { normalizeCustomerName, getCustomerChoseong } from "../src/customer/customer-contract.js";
import { CustomerService } from "../src/customer/customer-service.js";
import type { Firestore } from "firebase-admin/firestore";

const named = (name: string) => ({ name, normalizedName: normalizeCustomerName(name), choseongName: getCustomerChoseong(name) });
describe("registered customer name matching", () => {
  it("prefers a unique full registered name over substring, initial and business suffix candidates", () => {
    const rows = [named("한별"), named("한빛유통"), named("한빛")];
    const page = { complete: true, startedFromBeginning: true };
    expect(rows.filter(customerNameMatcher("한빛"))).toHaveLength(3);
    expect(selectCustomerCandidate("한빛", rows, page)).toBe(rows[2]);
    expect(selectCustomerCandidate(" 한 빛 ", rows, page)).toBe(rows[2]);
    expect(selectCustomerCandidate("한빛유통", rows.slice(1), page)).toBe(rows[1]);
    expect(selectCustomerCandidate("ㅎㅂ", rows, page)).toBeNull();
    expect(selectCustomerCandidate("없는업체", [], page)).toBeNull();
    expect(selectCustomerCandidate("*", [rows[0]!], page)).toBeNull();
    expect(selectCustomerCandidate("한빛", [named("한빛"), named("한 빛")], page)).toBeNull();
    expect(selectCustomerCandidate("한빛", rows, { ...page, complete: false })).toBeNull();
    expect(selectCustomerCandidate("한빛", rows, { ...page, startedFromBeginning: false })).toBeNull();
  });
  it.each([
    ["합성유통", "합성", true], ["(주) 합성 유통", "㈜합성", true], ["주식회사 합성", "합성", true],
    ["합성유통", "합성상사", false], ["합성유통", "다른합성", false], ["한유통", "한", false],
    ["합성유통유통", "합성", false], ["합성", "합성유통", true], ["ㅎㅂㅊ", "한빛초", true],
    ["합셩유통", "합성", false],
    ["*", "합성", false], [" ", "합성", false],
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
