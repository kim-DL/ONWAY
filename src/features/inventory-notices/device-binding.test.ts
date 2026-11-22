import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { claimPush, writeBinding } from "./device-binding";

afterEach(() => writeBinding(null));
it("claims concurrent retries once, and rejects deliveries after logout or a switch of employee", async () => {
  await writeBinding({ channel: "test-channel", id: "first" });
  expect(await Promise.all([claimPush("first", "movement"), claimPush("first", "movement")])).toEqual([
    true,
    false,
  ]);
  await writeBinding(null);
  expect(await claimPush("first", "late")).toBe(false);
  await writeBinding({ channel: "other-channel", id: "next" });
  expect(await claimPush("first", "late")).toBe(false);
  expect(await claimPush("next", "new-movement")).toBe(true);
});
