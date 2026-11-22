import { createHash, ECDH } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineJsonSecret } from "firebase-functions/params";
import { z } from "zod";
import * as webpush from "web-push";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import {
  requireInventoryActor,
  verifyInventoryTransactionActor,
  type InventoryActor,
} from "./inventory-authorization.js";
import { NOTICE_POLICY_PATH, NOTICE_FEED_PATH } from "./inventory-notification-contract.js";
import { setPrivateCallableResponse } from "../shared/private-callable-response.js";

// The admin SDK floors Timestamp.toMillis(), while browser timestamps retain microseconds.
const noticeTime = (stamp: Timestamp) => stamp.seconds * 1000 + stamp.nanoseconds / 1_000_000;
const devices = "companies/onnuri/inventoryPushDevices";
const options = {
  region: "asia-northeast3" as const,
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
  maxInstances: 4,
};
const vapid = defineJsonSecret<{ publicKey: string; privateKey: string }>("INVENTORY_WEB_PUSH_VAPID");
const grant = z.uuid();
const endpoint = z
  .url()
  .max(2048)
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "web.push.apple.com" ||
        url.hostname.endsWith(".push.apple.com") ||
        url.hostname.endsWith(".notify.windows.com") ||
        url.hostname === "updates.push.services.mozilla.com")
    );
  });
const subscription = z.object({
  endpoint,
  keys: z.object({
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]{87}$/)
      .refine((value) => {
        try {
          return ECDH.convertKey(Buffer.from(value, "base64url"), "prime256v1").length === 65;
        } catch {
          return false;
        }
      }),
  }),
});
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("key"), channel: grant }),
  z.object({ action: z.literal("enable"), channel: grant, subscription, binding: z.uuid() }),
  z.object({ action: z.literal("disable"), channel: grant, endpoint, binding: z.uuid() }),
]);
const deviceId = (value: string) => createHash("sha256").update(value).digest("hex");

export const configureInventoryPush = onCall({ ...options, secrets: [vapid] }, async (request) => {
  setPrivateCallableResponse(request);
  const actor = await requireInventoryActor(request);
  const parsed = action.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "기기 정보를 확인해주세요.");
  const input = parsed.data;
  const db = getAdminFirestore();
  return db.runTransaction(async (tx) => {
    await verifyInventoryTransactionActor(db, tx, actor, "read");
    const policy = (await tx.get(db.doc(NOTICE_POLICY_PATH + "/" + actor.employeeId))).data();
    if (!policy?.assigned || !policy.enabled || policy.channel !== input.channel)
      throw new HttpsError("permission-denied", "수신 설정을 확인해주세요.");
    if (input.action === "key") return { publicKey: vapid.value().publicKey };
    const ref = db
      .collection(devices)
      .doc(deviceId(input.action === "enable" ? input.subscription.endpoint : input.endpoint));
    if (input.action === "enable")
      tx.set(ref, {
        actor,
        channel: input.channel,
        binding: input.binding,
        subscription: input.subscription,
        registeredAt: Timestamp.now(),
      });
    else {
      const prior = (await tx.get(ref)).data();
      if (prior?.actor.uid === actor.uid && prior.binding === input.binding) tx.delete(ref);
    }
    return { ok: true };
  });
});

export const acknowledgeInventoryInbox = onCall(options, async (request) => {
  setPrivateCallableResponse(request);
  const actor = await requireInventoryActor(request);
  const parsed = z.object({ channel: grant, noticeId: z.uuid() }).safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "알림을 확인해주세요.");
  const { channel, noticeId } = parsed.data;
  const db = getAdminFirestore();
  await db.runTransaction(async (tx) => {
    await verifyInventoryTransactionActor(db, tx, actor, "read");
    const ref = db.doc(NOTICE_POLICY_PATH + "/" + actor.employeeId);
    const [p, n] = await tx.getAll(ref, db.doc(NOTICE_FEED_PATH + "/" + noticeId));
    const policy = p?.data(),
      notice = n?.data();
    if (!policy?.assigned || !policy.enabled || policy.channel !== channel || !notice?.audience?.includes(channel))
      throw new HttpsError("permission-denied", "현재 수신할 수 없는 알림입니다.");
    const time = noticeTime(notice.createdAt);
    if (time > (policy.readTime ?? 0) || (time === policy.readTime && noticeId > policy.readId))
      tx.update(ref, { readTime: time, readId: noticeId });
  });
  return { ok: true };
});

export const deliverInventoryPush = onDocumentCreated(
  {
    document: NOTICE_FEED_PATH + "/{noticeId}",
    region: "asia-northeast3",
    secrets: [vapid],
    retry: true,
    maxInstances: 4,
  },
  async (event) => {
    const notice = event.data?.data();
    if (!notice || Date.now() - notice.createdAt.toMillis() > 300_000) return;
    const db = getAdminFirestore();
    const id = event.data!.id;
    const time = noticeTime(notice.createdAt);
    // Read only device registrations for employees in the committed audience.
    for (const channel of notice.audience as string[]) {
      const registrations = await db.collection(devices).where("channel", "==", channel).get();
      await Promise.all(
        registrations.docs.map(async (registration) => {
          const current = await db.runTransaction(async (tx) => {
            const d = (await tx.get(registration.ref)).data();
            if (!d || d.channel !== channel || d.registeredAt.toMillis() > notice.createdAt.toMillis()) return;
            const actor = d.actor as InventoryActor;
            try {
              await verifyInventoryTransactionActor(db, tx, actor, "read");
            } catch (error) {
              if (error instanceof HttpsError && error.code === "permission-denied") return;
              throw error;
            }
            const p = (await tx.get(db.doc(NOTICE_POLICY_PATH + "/" + actor.employeeId))).data();
            if (
              !p?.assigned ||
              !p.enabled ||
              p.channel !== channel ||
              p.readTime > time ||
              (p.readTime === time && p.readId >= id)
            )
              return;
            return d;
          });
          if (!current) return;
          try {
            await webpush.sendNotification(
              current.subscription,
              JSON.stringify({ type: "inventory-notice", id, binding: current.binding }),
              {
                TTL: Math.max(0, Math.floor((time + 300_000 - Date.now()) / 1000)),
                timeout: 10000,
                topic: deviceId(id).slice(0, 32),
                vapidDetails: { subject: "https://onnuriway.com", ...vapid.value() },
              },
            );
          } catch (error) {
            if (!(error instanceof webpush.WebPushError) || ![404, 410].includes(error.statusCode))
              throw new Error("Inventory push temporarily unavailable");
            await db.runTransaction(async (tx) => {
              if ((await tx.get(registration.ref)).get("binding") === current.binding) tx.delete(registration.ref);
            });
          }
        }),
      );
    }
  },
);
