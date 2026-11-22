import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { generateVAPIDKeys } from "web-push";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureInventoryPush, deliverInventoryPush } from "../src/inventory/notice-delivery.js";

const dbFixture = vi.hoisted(() => ({
  query: vi.fn(),
  policy: vi.fn(),
  device: vi.fn(),
  write: vi.fn(),
  remove: vi.fn(),
  send: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock("web-push", async (importActual) => ({
  ...(await importActual<typeof import("web-push")>()),
  sendNotification: dbFixture.send,
}));
vi.mock("../src/inventory/inventory-authorization.js", () => ({
  requireInventoryActor: () => ({ uid: "employee-test", employeeId: "test" }),
  verifyInventoryTransactionActor: dbFixture.authorize,
}));
vi.mock("../src/shared/firebase-admin.js", () => ({
  getAdminFirestore: () => ({
    doc: () => "policy",
    collection: () => ({ where: () => ({ get: dbFixture.query }), doc: () => "device" }),
    runTransaction: (run: (tx: unknown) => unknown) =>
      run({
        get: (ref: string) => ({
          data: ref === "policy" ? dbFixture.policy : dbFixture.device,
          get: (key: string) => dbFixture.device()?.[key],
        }),
        set: dbFixture.write,
        delete: dbFixture.remove,
      }),
  }),
}));

const channel = randomUUID(),
  binding = randomUUID(),
  eventId = randomUUID();
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/example",
  keys: {
    p256dh: generateVAPIDKeys().publicKey,
    auth: Buffer.alloc(16).toString("base64url"),
  },
};
const when = Timestamp.now();
const device = {
  actor: { uid: "employee-test", employeeId: "test" },
  channel,
  binding,
  subscription,
  registeredAt: Timestamp.fromMillis(when.toMillis() - 1000),
};
const movement = { productName: "하림 팝콘치킨", delta: -4, unitLabel: "봉", locationId: "freezer1", kind: "issue" };
const deliver = (createdAt = when, details: Record<string, unknown> = movement) =>
  deliverInventoryPush.run({
    data: {
      id: eventId,
      data: () => ({ audience: [channel], createdAt, ...details }),
    },
  } as Parameters<typeof deliverInventoryPush.run>[0]);
const configure = (data: unknown) => configureInventoryPush.run({ data, rawRequest: {} } as CallableRequest);
beforeEach(() => {
  vi.resetAllMocks();
  process.env.INVENTORY_WEB_PUSH_VAPID = JSON.stringify(generateVAPIDKeys());
  dbFixture.query.mockResolvedValue({ docs: [{ ref: "device" }] });
  dbFixture.device.mockReturnValue(device);
  dbFixture.policy.mockReturnValue({ assigned: true, enabled: true, channel });
});

describe("inventory device delivery", () => {
  it("registers a verified device and sends only the committed movement summary", async () => {
    await configure({ action: "enable", channel, subscription, binding });
    expect(dbFixture.write).toHaveBeenCalledWith(
      "device",
      expect.objectContaining({ channel, binding, subscription }),
    );
    await deliver();
    expect(dbFixture.send).toHaveBeenCalledWith(
      subscription,
      JSON.stringify({ type: "inventory-notice", id: eventId, binding, title: movement.productName, body: "−4봉 · 냉동1 · 출고" }),
      expect.objectContaining({ TTL: expect.any(Number) }),
    );
  });
  it.each([
    [{ ...movement, kind: "receive", delta: 1000, unitLabel: "개" }, "+1,000낱개 · 냉동1 · 입고"],
    [{ ...movement, kind: undefined }, "−4봉 · 냉동1 · 수량 조정"],
    [{}, undefined],
  ])("handles receipts, earlier adjustments and notices without preview data", async (details, body) => {
    await deliver(when, details);
    expect(JSON.parse(dbFixture.send.mock.calls[0]![1]).body).toBe(body);
  });
  it("rejects untrusted push URLs and a different employee channel", async () => {
    await expect(
      configure({
        action: "enable",
        channel,
        binding,
        subscription: { ...subscription, endpoint: "https://example.com/test" },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(configure({ action: "key", channel: randomUUID() })).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(dbFixture.write).not.toHaveBeenCalled();
  });
  it("skips a muted recipient, an acknowledged event, and a delayed trigger", async () => {
    dbFixture.policy
      .mockReturnValueOnce({ assigned: true, enabled: false, channel })
      .mockReturnValueOnce({ assigned: true, enabled: true, channel, readTime: when.toMillis(), readId: eventId });
    await deliver();
    await deliver();
    await deliver(Timestamp.fromMillis(Date.now() - 310_000));
    expect(dbFixture.query).toHaveBeenCalledTimes(2);
    expect(dbFixture.send).not.toHaveBeenCalled();
  });
});
