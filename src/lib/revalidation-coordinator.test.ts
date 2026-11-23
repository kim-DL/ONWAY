import { describe, expect, it, vi } from "vitest";

import { RevalidationCoordinator, revalidationFreshnessText } from "./revalidation-coordinator";

describe("memory-only revalidation coordinator", () => {
  it("joins an in-flight request and skips event bursts inside the TTL", async () => {
    let now = 1_000;
    let resolve!: (value: string) => void;
    const task = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const coordinator = new RevalidationCoordinator("EMP:1:1", 60_000, () => now);

    const first = coordinator.run(task, { hasData: false });
    const joined = coordinator.run(task, { hasData: false });
    expect(first.kind).toBe("started");
    expect(joined.kind).toBe("joined");
    expect(joined.promise).toBe(first.promise);
    expect(task).toHaveBeenCalledOnce();

    resolve("ready");
    await expect(first.promise).resolves.toBe("ready");
    expect(coordinator.remainingTtl(true)).toBe(60_000);
    now = 60_999;
    expect(coordinator.run(task, { hasData: true }).kind).toBe("skipped");
    expect(task).toHaveBeenCalledOnce();
  });

  it("refreshes after TTL, lets authoritative callers force a refresh, and invalidates session state", async () => {
    let now = 10_000;
    const task = vi.fn(async () => "ready");
    const coordinator = new RevalidationCoordinator("EMP:1:1", 60_000, () => now);

    await coordinator.run(task, { hasData: false }).promise;
    now = 70_000;
    await coordinator.run(task, { hasData: true }).promise;
    now = 70_001;
    await coordinator.run(task, { force: true, hasData: true }).promise;
    expect(task).toHaveBeenCalledTimes(3);

    coordinator.invalidate();
    expect(coordinator.remainingTtl(true)).toBe(0);
    expect(coordinator.run(task, { hasData: true }).kind).toBe("started");
  });

  it("does not mark a failed or invalidated request as fresh", async () => {
    const failed = new RevalidationCoordinator("EMP:1:1");
    await expect(failed.run(async () => { throw new Error("offline"); }, { hasData: true }).promise).rejects.toThrow("offline");
    expect(failed.remainingTtl(true)).toBe(0);

    let resolve!: () => void;
    const invalidated = new RevalidationCoordinator("EMP:1:1", 60_000, () => 5_000);
    const run = invalidated.run(() => new Promise<void>((done) => { resolve = done; }), { hasData: false });
    invalidated.invalidate();
    resolve();
    await run.promise;
    expect(invalidated.remainingTtl(true)).toBe(0);
  });

  it("invalidates progressive callbacks from an older generation", () => {
    const coordinator = new RevalidationCoordinator("EMP:1:1");
    const isCurrent = coordinator.guardCurrentGeneration();
    expect(isCurrent()).toBe(true);
    coordinator.invalidate();
    expect(isCurrent()).toBe(false);
    expect(coordinator.guardCurrentGeneration()()).toBe(true);
  });

  it("distinguishes quiet success, background refresh, and stale fallback text", () => {
    expect(revalidationFreshnessText("fresh")).toBe("");
    expect(revalidationFreshnessText("refreshing")).toBe("최신 정보 확인 중");
    expect(revalidationFreshnessText("stale-error")).toBe("갱신 실패 · 기존 정보 표시");
    expect(revalidationFreshnessText("idle")).toBe("");
  });
});
