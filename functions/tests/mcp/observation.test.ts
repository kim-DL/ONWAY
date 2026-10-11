import { describe, expect, it } from "vitest";
import { cancelObservedReads, newReadObservation, observeRead, withReadObservation } from "../../src/shared/read-observation.js";

describe("per-request read observations", () => {
  it("isolates concurrent requests and never keeps the observed private results", async () => {
    const first = newReadObservation(); const second = newReadObservation();
    let ready!: () => void;
    const wait = new Promise<void>((resolve) => { ready = resolve; });
    await Promise.all([
      withReadObservation(first, async () => {
        await wait;
        await observeRead("firestore", async () => ["private-one", "private-two"], (rows) => rows.length);
        await observeRead("storage", async () => Buffer.alloc(17), (bytes) => bytes.length);
      }),
      withReadObservation(second, async () => {
        await observeRead("firestore", async () => "private-three");
        ready();
        cancelObservedReads();
        await expect(observeRead("firestore", async () => "must-not-run")).rejects.toMatchObject({ code: "deadline-exceeded" });
      }),
    ]);
    expect(first).toMatchObject({ documentReads: 2, storageBytes: 17, operations: { firestore: 1, storage: 1 } });
    expect(second).toMatchObject({ documentReads: 1, storageBytes: 0, operations: { firestore: 1, storage: 0 } });
    expect(JSON.stringify([first, second])).not.toContain("private");
  });
});
