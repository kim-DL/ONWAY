import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const checks = [
  "audit", "lint", "typecheck", "unit", "search-performance", "functions-build",
  "production-build", "browser", "deferred-tools", "phase17", "inventory-photos", "delivery-photos",
];
const profiles: Record<"full" | "presentation" | "docs", string[]> = {
  full: checks,
  presentation: ["lint", "typecheck", "unit", "production-build", "presentation"],
  docs: [],
};
const successfulResults = (profile: keyof typeof profiles = "full"): Record<string, { result: string; outputs?: { profile: string; required: string } }> => ({
  plan: { result: "success", outputs: { profile, required: JSON.stringify(profiles[profile]) } },
  ...Object.fromEntries([...checks, "presentation"].map((id) => [id, {
    result: profiles[profile].includes(id) ? "success" : "skipped",
  }])),
});
const runRaw = (payload: string) => spawnSync(process.execPath, ["scripts/verify-ci-results.mjs"], {
  encoding: "utf8",
  env: { ...process.env, CI_RESULTS: payload },
});
const run = (payload: unknown) => runRaw(JSON.stringify(payload));

describe("CI final required check", () => {
  it("succeeds only when every required job succeeded", () => {
    const result = run(successfulResults());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("All 12 required CI checks succeeded (full)");
  });

  it.each(checks)("rejects a failure in %s", (id) => {
    const result = run({ ...successfulResults(), [id]: { result: "failure" } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(id);
  });

  it.each(["cancelled", "skipped", "in_progress", "neutral", "timed_out", undefined])(
    "rejects a non-success result: %s", (status) => {
      expect(run({ ...successfulResults(), browser: { result: status } }).status).toBe(1);
    },
  );

  it("rejects a missing required job", () => {
    const results = successfulResults();
    delete results.browser;
    expect(run(results).status).toBe(1);
  });

  it("rejects an unknown replacement even when the job count matches", () => {
    const results = successfulResults();
    delete results.browser;
    results.unknown = { result: "success" };
    expect(run(results).status).toBe(1);
  });

  it.each([null, [], "success", { browser: { result: "success" } }].map((payload) => [payload]))(
    "rejects invalid or incomplete results: %j", (payload) => {
      expect(run(payload).status).toBe(1);
    },
  );

  it.each(["docs", "presentation"] as const)("allows only the planned skips for %s", (profile) => {
    expect(run(successfulResults(profile)).status).toBe(0);
    expect(run({ ...successfulResults(profile), phase17: { result: "failure" } }).status).toBe(1);
    expect(run({ ...successfulResults(profile), plan: { result: "failure" } }).status).toBe(1);
  });

  it("rejects a skipped selected UI check", () => {
    expect(run({ ...successfulResults("presentation"), presentation: { result: "skipped" } }).status).toBe(1);
  });

  it("rejects missing or tampered plans instead of accepting fewer checks", () => {
    for (const profile of ["unknown", "__proto__", "presentation"]) {
      expect(run({ ...successfulResults(), plan: { result: "success", outputs: { profile, required: "[]" } } }).status).toBe(1);
    }
    const results = successfulResults();
    delete results.plan;
    expect(run(results).status).toBe(1);
  });

  it("rejects malformed JSON without echoing the payload", () => {
    const result = runRaw("not-json");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CI results are not valid JSON.");
    expect(result.stderr).not.toContain("not-json");
  });
});
