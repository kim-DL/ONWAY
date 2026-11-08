import { describe, expect, it } from "vitest";
import { invoicePartiesToExtraction } from "../src/delivery-planning/invoice-parties.js";

const party = (name: string, address = "", businessNumber = "") => ({ name, address, businessNumber });
const invoice = (changes: Record<string, unknown> = {}) => ({
  supplier: party("온누리종합식품", "공급자 주소", "306-28-68765"),
  recipient: party("받는거래처", "수취인 주소", "123-45-67890"),
  recipientRole: "공급받는자", date: "2026-11-09", dateUncertain: false, uncertain: false, ...changes,
});
const document = (rows: unknown[]) => ({ kind: "invoice", truncated: false, rows });

describe("invoice recipient evidence boundary", () => {
  it("maps only the recipient's fields and discards supplier evidence", () => {
    expect(invoicePartiesToExtraction(document([invoice()]))).toEqual({ kind: "invoice", truncated: false,
      rows: [{ rawName: "받는거래처", address: "수취인 주소", date: "2026-11-09", dateUncertain: false, uncertain: false }],
    });
  });
  it.each([
    { recipient: party("온누리종합식품", "공급자 주소") },
    { recipient: party("(주) 온누리 종합식품") },
    { recipient: party("오독한 이름", "", "306 28 68765") },
    { supplier: party("다른 공급사"), recipient: party("다른공급사") },
    { supplier: party("다른 공급사", "", "111-22-33333"), recipient: party("다른 이름", "", "1112233333") },
    { recipientRole: "unknown" },
    { recipient: party("") },
  ])("rejects supplier identity or missing recipient evidence: %j", (changes) => {
    expect(() => invoicePartiesToExtraction(document([invoice(changes)])))
      .toThrow("공급받는 자");
  });
  it("does not keep a partial batch after one invoice identifies the supplier", () => {
    expect(() => invoicePartiesToExtraction(document([invoice(), invoice({ recipient: party("온누리종합식품") })])))
      .toThrow("공급받는 자");
  });
  it("retains branch notes, duplicate recipients, missing dates and uncertainty for review", () => {
    const row = invoice({ recipient: party("받는거래처(금산)", "주소"), date: null, dateUncertain: true, uncertain: true });
    const result = invoicePartiesToExtraction(document([row, row]));
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ rawName: "받는거래처(금산)", date: null, dateUncertain: true, uncertain: true });
  });
  it("rejects truncated and unsupported documents and unexpected fields", () => {
    for (const value of [{ ...document([invoice()]), truncated: true }, { ...document([]), kind: "unsupported" },
      document([invoice({ extra: "injected" })]), document([invoice({ recipientRole: "공급자" })])]) {
      expect(() => invoicePartiesToExtraction(value)).toThrow();
    }
  });
});
