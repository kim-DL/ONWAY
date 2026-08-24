import { describe, expect, it } from "vitest";

import { exportCsvInputSchema } from "../src/export/csv-export-contract.js";
import { encodeCsv } from "../src/export/csv-export-service.js";

describe("Phase 12 CSV contract", () => {
  it("requires a cycle for monthly assignments and accepts cumulative visits", () => {
    const filter = {
      cycleId: null, zoneId: null, assigneeId: null, district: null, schoolType: null, monthlyStatus: null,
      interestScore: null, followUpOnly: false, tagId: null, visitedFrom: null, visitedTo: null,
    };
    expect(exportCsvInputSchema.safeParse({ kind: "assignments", scope: "own", filter, requestId: crypto.randomUUID(), appVersion: "phase12" }).success).toBe(false);
    expect(exportCsvInputSchema.safeParse({ kind: "visits", scope: "own", filter, requestId: crypto.randomUUID(), appVersion: "phase12" }).success).toBe(true);
  });

  it("writes UTF-8 BOM, keeps Korean, quotes CSV cells, and neutralizes formulas", () => {
    const csv = encodeCsv([
      ["학교명", "메모", "담당자"],
      ["대전온누리고등학교", "안내, \"확인\"\n다음 줄", "=HYPERLINK(\"bad\")"],
      ["한밭중학교", "+1+1", "@SUM(A1)"],
    ]);
    expect([...csv.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = csv.toString("utf8");
    expect(text).toContain("대전온누리고등학교");
    expect(text).toContain('"안내, ""확인""\n다음 줄"');
    expect(text).toContain("'=HYPERLINK");
    expect(text).toContain("'+1+1");
    expect(text).toContain("'@SUM");
    expect(text.endsWith("\r\n")).toBe(true);
  });
});
