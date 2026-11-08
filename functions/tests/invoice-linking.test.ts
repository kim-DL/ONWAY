import { describe, expect, it } from "vitest";
import { invoiceAddressMatches, matchInvoice } from "../src/delivery-planning/invoice-matching.js";
import { matchPhotoRows } from "../src/delivery-planning/photo-batch-matching.js";

const today = "2026-11-09";
const customer = { customerId: "one", name: "자연유통, 자연푸드", officialAddress: "대전 유성구 갑동로 59", deliveryAddress: "" };
const fields = { recipientName: "㈜자연푸드", recipientAddress: "대전광역시 유성구 갑동로 59 (갑동)", invoiceDate: today, uncertain: false };

describe("invoice identity across registered spelling variants", () => {
  it("uses an explicitly registered alternate company name and corporate prefix", () => {
    expect(matchInvoice(fields, [customer], today).customerId).toBe("one");
  });
  it("preserves matching the complete original registered name as well as its parts", () => {
    expect(matchInvoice({ ...fields, recipientName: customer.name }, [customer], today).customerId).toBe("one");
    expect(matchPhotoRows({ kind: "customer_list", truncated: false, rows: [{ rawName: customer.name, address: "", date: null,
      dateUncertain: false, uncertain: false }] }, [customer], [], today)[0]?.customerId).toBe("one");
  });
  it.each(["(주)찬솔유통(비:0000)", "주식회사 찬솔유통", "찬솔유통㈜"])("ignores corporate/operational notation in %s", (recipientName) => {
    expect(matchInvoice({ ...fields, recipientName }, [{ ...customer, name: "찬솔유통" }], today).customerId).toBe("one");
  });
  it("keeps a registered branch and selects it using its matching address", () => {
    const customers = [{ ...customer, customerId: "other", name: "더푸드, 동해냉동, 푸드원", officialAddress: "대전 유성구 용산2로 2-27" },
      { ...customer, name: "동해냉동(목상동)", officialAddress: "대전 대덕구 대덕대로1470번길 27" }];
    expect(matchInvoice({ ...fields, recipientName: "동해냉동", recipientAddress: "대전시 대덕구 대덕대로1470번길27, 상가동 1층" }, customers, today).customerId).toBe("one");
  });
  it("does not merge conflicting explicit branches or guess a similar company name", () => {
    for (const name of ["자연푸드(금산)", "지연푸드", "자연"]) {
      expect(matchInvoice({ ...fields, recipientName: name }, [{ ...customer, name: "자연푸드(대전)" }], today).customerId).toBeNull();
    }
  });
  it("does not choose one of two equal candidates or bypass date/uncertainty", () => {
    expect(matchInvoice(fields, [customer, { ...customer, customerId: "two" }], today).customerId).toBeNull();
    for (const change of [{ invoiceDate: null }, { invoiceDate: "2026-11-08" }, { uncertain: true }]) {
      expect(matchInvoice({ ...fields, ...change }, [customer], today).customerId).toBeNull();
    }
  });
  it("also normalizes corporate and alternate names in handwritten lists without dropping branch qualifiers", () => {
    const row = { rawName: "㈜자연푸드", address: "", date: null, dateUncertain: false, uncertain: false };
    const extraction = { kind: "customer_list" as const, truncated: false, rows: [row] };
    expect(matchPhotoRows(extraction, [customer], [], today)[0]).toMatchObject({ status: "saved", customerId: "one" });
    expect(matchPhotoRows({ ...extraction, rows: [{ ...row, rawName: "자연푸드(금산)" }] }, [customer], [], today)[0]?.status).toBe("review");
    expect(matchPhotoRows(extraction, [customer, { ...customer, customerId: "two", name: "자연푸드" }], [], today)[0]?.status).toBe("review");
  });
});

describe("invoice address spelling equivalence", () => {
  it.each([
    ["대전 유성구 진잠로 140번길 64, 1층(원내동)", "대전 유성구 진잠로140번길 64"],
    ["대전시 대덕구 대덕대로1470번길27, 상가동 108호", "대전광역시 대덕구 대덕대로1470번길 27"],
    ["대전광역시 중구 안영동 659－4", "대전 중구 안영동659-4"],
  ])("matches harmless spacing and administrative spelling: %s", (left, right) => {
    expect(invoiceAddressMatches(left, right)).toBe(true);
    expect(invoiceAddressMatches(right, left)).toBe(true);
  });
  it.each([
    ["대전 유성구 진잠로140번길 64", "대전 유성구 진잠로140번길 65"],
    ["대전 유성구 진잠로140번길 64", "대전 유성구 진잠로141번길 64"],
    ["안영동659-4", "안영동659-40"], ["안영동 산10", "안영동10"],
    ["서울 중구 예시로 10", "대전 중구 예시로 10"],
    ["대전 대덕구 예시로 10", "대전 유성구 예시로 10"],
  ])("keeps a different street, number or municipality distinct: %s", (left, right) => {
    expect(invoiceAddressMatches(left, right)).toBe(false);
  });
});
