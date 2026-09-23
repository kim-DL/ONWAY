import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";

import type { CustomerActor } from "../functions/src/customer/customer-authorization.js";
import { DeliveryPhotoService } from "../functions/src/delivery-photo/delivery-photo-service.js";
import { GoogleDeliveryPhotoStorage } from "../functions/src/delivery-photo/delivery-photo-store.js";

const projectId = process.env.GCLOUD_PROJECT;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const storageHost = process.env.STORAGE_EMULATOR_HOST;
const deliveryBucket = process.env.DELIVERY_PHOTO_BUCKET;
if (projectId !== "demo-onnuriway") throw new Error("Delivery photo emulator gate requires the demo-onnuriway project.");
if (!firestoreHost || !/^(127\.0\.0\.1|localhost):\d+$/.test(firestoreHost)) throw new Error("Delivery photo gate requires a loopback Firestore Emulator.");
if (!storageHost) throw new Error("Delivery photo gate requires a Storage Emulator.");
const storageUrl = new URL(storageHost);
if (!(["127.0.0.1", "localhost"].includes(storageUrl.hostname)) || !storageUrl.port) throw new Error("Delivery photo gate requires a loopback Storage Emulator.");
if (deliveryBucket !== "demo-onnuriway-delivery-photos.appspot.com") throw new Error("Delivery photo gate requires the dedicated fake bucket.");
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN) throw new Error("Delivery photo gate refuses production credentials.");
if (process.env.FIREBASE_CONFIG) {
  const config = JSON.parse(process.env.FIREBASE_CONFIG) as { projectId?: string; storageBucket?: string };
  if (config.projectId !== projectId || config.storageBucket !== "demo-onnuriway.appspot.com") throw new Error("Delivery photo gate refused a non-demo Firebase configuration.");
}

const app = getApps()[0] ?? initializeApp({ projectId, storageBucket: deliveryBucket });
const db = getFirestore(app);
const bucket = getStorage(app).bucket(deliveryBucket);
const actor: CustomerActor = {
  uid: "uid-delivery-photo", employeeId: "EMP-DELIVERY-PHOTO", roleScopes: ["delivery"],
  sessionVersion: 1, permissionsVersion: 1, isAdmin: false,
};
const now = Timestamp.fromDate(new Date("2026-09-22T00:00:00.000Z"));

await Promise.all([
  db.recursiveDelete(db.collection("companies/onnuri/deliveryPhotoRoutes")),
  db.recursiveDelete(db.collection("companies/onnuri/deliveryPhotoDays")),
  db.recursiveDelete(db.collection("companies/onnuri/deliveryPhotos")),
  db.recursiveDelete(db.collection("deliveryPhotoUploadRates")),
]);
const staleLocks = await db.collection("requestLocks").where("operation", "==", "createDeliveryPhoto").get();
await Promise.all(staleLocks.docs.map((document) => document.ref.delete()));
const [files] = await bucket.getFiles({ prefix: "delivery-photos/" });
await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));

await db.doc(`authz/${actor.uid}`).set({
  employeeId: actor.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1, updatedAt: now,
});
await db.doc(`employees/${actor.employeeId}`).set({
  employeeId: actor.employeeId, firebaseUid: actor.uid, displayName: "에뮬레이터 배송",
  roleScopes: actor.roleScopes, status: "active", sessionVersion: 1, updatedAt: now,
});
for (const customerId of ["delivery-photo-a", "delivery-photo-b"]) {
  await db.doc(`companies/onnuri/customers/${customerId}`).set({ customerId, companyId: "onnuri", name: customerId, status: "active" });
}

const service = new DeliveryPhotoService(db, new GoogleDeliveryPhotoStorage(bucket), () => now);
const route = await service.saveRoute({ requestId: randomUUID(), expectedRevision: null, customerIds: ["delivery-photo-a", "delivery-photo-b"] }, actor, now);
if (route.revision !== 1 || route.customerIds.length !== 2) throw new Error("Route persistence failed.");
const day = await service.saveDay({ requestId: randomUUID(), expectedRevision: null, customerIds: ["delivery-photo-b"] }, actor, now);
if (!day.isOverride || day.customerIds[0] !== "delivery-photo-b") throw new Error("Day override failed.");

const inputBytes = await sharp({ create: { width: 960, height: 640, channels: 3, background: "#5b8da8" } }).jpeg().toBuffer();
const request = {
  requestId: randomUUID(), customerId: "delivery-photo-a", source: "camera" as const,
  contentType: "image/jpeg" as const, fileBase64: inputBytes.toString("base64"),
};
const photo = await service.create(request, actor, now);
const replay = await service.create(request, actor, now);
if (replay.photoId !== photo.photoId) throw new Error("Create replay was not stable.");
const today = await service.list({ scope: "today" }, actor, now);
if (today.scope !== "today" || today.photos.length !== 1 || today.customers[0]?.count !== 1) throw new Error("Today aggregation failed.");
const recent = await service.list({ scope: "customer", customerId: "delivery-photo-a", limit: 30 }, actor, now);
if (recent.scope !== "customer" || recent.photos.length !== 1) throw new Error("Recent customer list failed.");
const download = await service.get({ photoId: photo.photoId, variant: "evidence" }, actor, now);
if (!download.fileBase64 || download.contentType !== "image/webp") throw new Error("Private relay failed.");

await db.doc(`authz/${actor.uid}`).update({ active: false });
let revoked = false;
try { await service.list({ scope: "today" }, actor, now); } catch { revoked = true; }
if (!revoked) throw new Error("Revoked session was accepted.");
await db.doc(`authz/${actor.uid}`).update({ active: true });

await service.delete({ requestId: randomUUID(), photoId: photo.photoId }, actor, now);
const hidden = await service.list({ scope: "today" }, actor, now);
if (hidden.scope !== "today" || hidden.photos.length !== 0) throw new Error("Deleted photo remained visible.");

const expiring = await service.create({ ...request, requestId: randomUUID() }, actor, now);
const cleanup = await service.expire(Timestamp.fromMillis(now.toMillis() + 169 * 60 * 60 * 1000));
if (cleanup.removed < 2 || cleanup.failures !== 0) throw new Error(`Cleanup failed: ${JSON.stringify(cleanup)}`);
if ((await db.doc(`companies/onnuri/deliveryPhotos/${expiring.photoId}`).get()).exists) throw new Error("Expired metadata remained.");

console.log("Delivery photo emulator gate passed: route/day, create replay, list/get, revocation, delete and expiry cleanup.");
