import { describe, expect, it } from "vitest";
import { fieldStage, fieldTransactionAttempt, observeFieldCount, type FieldLatency } from "../src/shared/field-latency.js";

describe("private field latency observations", () => {
  it("isolates concurrent requests, including errors and transaction retries", async () => {
    const reports: FieldLatency[] = [];
    await Promise.allSettled([
      observeFieldCount(async () => { fieldTransactionAttempt(); await fieldStage("countReads", async () => { await Promise.resolve(); }); return "private result"; }, (report) => reports.push(report)),
      observeFieldCount(async () => { fieldTransactionAttempt(); fieldTransactionAttempt(); throw new Error("private error, document and user"); }, (report) => reports.push(report)),
    ]);
    expect(reports.map((report) => report.transactionAttempts).sort()).toEqual([1, 2]);
    expect(reports.find((report) => report.outcome === "ok")?.stagesMs.countReads).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(reports)).not.toMatch(/private|user|body|requestId/);
  });
  it("does not turn committed success into failure when telemetry fails", async () => {
    expect(await observeFieldCount(async () => "saved", () => { throw new Error("logger unavailable"); })).toBe("saved");
  });
});
