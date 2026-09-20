import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";

import { customerSchema, type CustomerDraft, type SaveCustomerInput } from "../../src/domain/customer";

const PROJECT_ID = "demo-onnuriway";
const FIXTURE_PREFIX = "phase32-customer-api";
let app: App;
let adminToken: string;
let staffToken: string;
let outsiderToken: string;
const createdCustomers = new Set<string>();
const usedRequestIds = new Set<string>();
const photoUploadIds = new Set<string>();
const adminUid = `${FIXTURE_PREFIX}-admin`;
const staffUid = `${FIXTURE_PREFIX}-staff`;
const outsiderUid = `${FIXTURE_PREFIX}-outsider`;

test.setTimeout(90_000);

function assertEmulators() {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST
    || !/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST)
    || !/^(127\.0\.0\.1|localhost):/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
    throw new Error("Customer API fixtures are restricted to local Firebase emulators.");
  }
}

async function emulatorToken(uid: string) {
  const customToken = await getAuth(app).createCustomToken(uid);
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const payload = await response.json() as { idToken?: string };
  if (!payload.idToken) throw new Error("Emulator customer fixture sign-in failed.");
  return payload.idToken;
}

async function emulatorGoogleToken(uid: string) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestUri: "http://127.0.0.1", returnSecureToken: true, idToken: await emulatorToken(uid),
      postBody: new URLSearchParams({ providerId: "google.com", id_token: JSON.stringify({
        sub: `${FIXTURE_PREFIX}-google`, email: "phase32-customer-admin@onnuriway.test", email_verified: true, name: "거래처 검증 관리자",
      }) }).toString(),
    }),
  });
  const payload = await response.json() as { idToken?: string };
  if (!payload.idToken) throw new Error("Emulator customer Google fixture sign-in failed.");
  return payload.idToken;
}

async function call(name: string, token: string | null, data: unknown) {
  const response = await fetch(`http://127.0.0.1:5001/${PROJECT_ID}/asia-northeast3/${name}`, {
    method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }),
  });
  const body = await response.json() as { result?: unknown; data?: unknown; error?: { status?: string; message?: string } };
  return { result: body.result ?? body.data, error: body.error, cacheControl: response.headers.get("cache-control") };
}

const draft: CustomerDraft = {
  name: "API 검증 거래처", district: "서구", administrativeDong: "탄방동", officialAddress: "테스트 공식 주소", deliveryAddress: "테스트 실제 주소",
  accessPassword: "001234*", accessPasswordState: "registered", deliveryLocationDescription: "후문 왼쪽 창고", deliveryPoint: { latitude: 36.3501, longitude: 127.3801 },
  contacts: [{ id: "primary", name: "테스트 담당", role: "현장", phoneNumber: "01012345678", isPrimary: true }],
  status: "active", noticeType: "new", changeNote: "에뮬레이터 테스트 전용",
};

function request(overrides: Partial<SaveCustomerInput> = {}): SaveCustomerInput {
  const requestId = randomUUID(); usedRequestIds.add(requestId);
  return { requestId, customerId: null, expectedRevision: null, draft, clearNotice: false, ...overrides };
}

test.beforeAll(async () => {
  assertEmulators();
  app = getApps().find((candidate) => candidate.name === FIXTURE_PREFIX) ?? initializeApp({ projectId: PROJECT_ID }, FIXTURE_PREFIX);
  const auth = getAuth(app); const database = getFirestore(app);
  for (const [uid, role] of [[adminUid, "admin"], [staffUid, "delivery"], [outsiderUid, "delivery"]] as const) {
    await auth.deleteUser(uid).catch(() => {});
    await auth.createUser({ uid, ...(role === "admin" ? { email: "phase32-customer-admin@onnuriway.test", emailVerified: true } : {}) });
    await auth.setCustomUserClaims(uid, { employeeId: uid, roleScopes: [role], sessionVersion: 1, permissionsVersion: 1, ...(role === "admin" ? { adminApproved: true } : {}) });
    if (uid !== outsiderUid) {
      await database.doc(`employees/${uid}`).set({ employeeId: uid, firebaseUid: uid, displayName: "테스트 직원", status: "active", sessionVersion: 1, roleScopes: [role] });
      await database.doc(`authz/${uid}`).set({ employeeId: uid, active: true, sessionVersion: 1, permissionsVersion: 1, updatedAt: Timestamp.now() });
    }
  }
  [adminToken, staffToken, outsiderToken] = await Promise.all([emulatorGoogleToken(adminUid), emulatorToken(staffUid), emulatorToken(outsiderUid)]);
});

test.afterAll(async () => {
  if (!app) return;
  assertEmulators();
  const database = getFirestore(app);
  const batch = database.batch();
  for (const id of createdCustomers) batch.delete(database.doc(`companies/onnuri/customers/${id}`));
  for (const id of usedRequestIds) batch.delete(database.doc(`requestLocks/customer-${id}`));
  if (photoUploadIds.size && !/^(127\.0\.0\.1|localhost):/.test(process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "")) throw new Error("Customer photo cleanup requires the local Storage emulator.");
  for (const id of photoUploadIds) {
    batch.delete(database.doc(`customerPhotoUploads/${id}`));
    for (const variant of ["thumbnail", "preview"]) await getStorage(app).bucket(`${PROJECT_ID}.appspot.com`).file(`companies/onnuri/customerPhotos/${id}/${variant}.webp`).delete({ ignoreNotFound: true });
  }
  for (const uid of [adminUid, staffUid, outsiderUid]) {
    batch.delete(database.doc(`employees/${uid}`)); batch.delete(database.doc(`authz/${uid}`));
    batch.delete(database.doc(`customerPhotoUploadRates/${uid}`));
    await getAuth(app).deleteUser(uid).catch(() => {});
  }
  for (const uid of [adminUid, staffUid]) {
    const auditLogs = await database.collection("auditLogs").where("actorUid", "==", uid).get();
    for (const log of auditLogs.docs) batch.delete(log.ref);
  }
  await batch.commit();
});

test("verified admin creates, revises, clears notices and closes a retained customer through real callables", async () => {
  const create = request();
  const creation = await call("saveCustomer", adminToken, create);
  expect(creation.error).toBeUndefined();
  const customer = customerSchema.parse(creation.result); createdCustomers.add(customer.customerId);
  expect(customer).toMatchObject({ revision: 1, noticeType: "new", companyId: "onnuri", accessPassword: "001234*" });
  expect(creation.cacheControl).toContain("no-store");
  const repeated = await call("saveCustomer", adminToken, create);
  expect(repeated.result).toEqual(customer);
  const changed = await call("saveCustomer", adminToken, request({ customerId: customer.customerId, expectedRevision: 1, draft: { ...draft, accessPassword: "000001#" } }));
  expect(changed.error).toBeUndefined();
  expect(customerSchema.parse(changed.result)).toMatchObject({ revision: 2, noticeType: "changed", accessPassword: "000001#" });
  const stale = await call("saveCustomer", adminToken, request({ customerId: customer.customerId, expectedRevision: 1 }));
  expect(stale.error?.status).toBe("ABORTED");
  const closed = await call("saveCustomer", adminToken, request({ customerId: customer.customerId, expectedRevision: 2, clearNotice: true,
    draft: { ...draft, accessPassword: "000001#", status: "closed" },
  }));
  expect(customerSchema.parse(closed.result)).toMatchObject({ revision: 3, status: "closed", noticeType: "none" });
  const listed = await call("listCustomers", staffToken, { afterId: null });
  expect(listed.result).toMatchObject({ customers: expect.arrayContaining([expect.objectContaining({ customerId: customer.customerId, status: "closed" })]) });
  expect(listed.cacheControl).toContain("no-store");
  const stored = await getFirestore(app).doc(`companies/onnuri/customers/${customer.customerId}`).get();
  expect(stored.get("createdAt")).toBeInstanceOf(Timestamp);
  const logs = await getFirestore(app).collection("auditLogs").where("actorUid", "==", adminUid).get();
  expect(logs.size).toBe(3);
  const serialized = JSON.stringify(logs.docs.map((log) => log.data()));
  for (const privateValue of ["001234*", "000001#", "01012345678", "후문 왼쪽 창고", "36.3501", draft.deliveryAddress, draft.changeNote]) expect(serialized).not.toContain(privateValue);
});

test("active employees create and edit customers with immutable actor audit and conflict protection", async () => {
  const create = request();
  const creation = await call("saveCustomer", staffToken, create);
  expect(creation.error).toBeUndefined();
  const customer = customerSchema.parse(creation.result); createdCustomers.add(customer.customerId);
  expect(customer).toMatchObject({ createdBy: staffUid, updatedBy: staffUid, revision: 1 });
  expect((await call("saveCustomer", staffToken, create)).result).toEqual(customer);
  const changed = await call("saveCustomer", staffToken, request({ customerId: customer.customerId, expectedRevision: 1,
    draft: { ...draft, deliveryLocationDescription: "직원이 확인한 후문" },
  }));
  expect(customerSchema.parse(changed.result)).toMatchObject({ createdBy: staffUid, updatedBy: staffUid, revision: 2, noticeType: "changed" });
  expect((await call("saveCustomer", staffToken, request({ customerId: customer.customerId, expectedRevision: 1 }))).error?.status).toBe("ABORTED");
  expect((await call("saveCustomer", staffToken, { ...request(), actorEmployeeId: adminUid })).error?.status).toBe("INVALID_ARGUMENT");
  expect((await call("saveCustomer", staffToken, { ...request(), draft: { ...draft, updatedBy: adminUid } })).error?.status).toBe("INVALID_ARGUMENT");
  const logs = await getFirestore(app).collection("auditLogs").where("actorUid", "==", staffUid).get();
  expect(logs.size).toBe(2);
  expect(logs.docs.map((log) => log.data())).toEqual(expect.arrayContaining([expect.objectContaining({
    actorEmployeeId: staffUid, revision: 2, eventType: "CUSTOMER_UPDATED", changedFields: ["deliveryLocationDescription", "noticeType"],
  })]));
  const serialized = JSON.stringify(logs.docs.map((log) => log.data()));
  for (const privateValue of [draft.accessPassword, draft.contacts[0]!.phoneNumber, "직원이 확인한 후문", draft.deliveryAddress]) expect(serialized).not.toContain(privateValue);
});

test("customer callables reject outsider and unauthenticated access and malformed tenant inputs", async () => {
  expect((await call("saveCustomer", outsiderToken, request())).error?.status).toBe("FAILED_PRECONDITION");
  expect((await call("saveCustomer", null, request())).error?.status).toBe("UNAUTHENTICATED");
  expect((await call("listCustomers", null, { afterId: null })).error?.status).toBe("UNAUTHENTICATED");
  expect((await call("listCustomers", outsiderToken, { afterId: null })).error?.status).toBe("FAILED_PRECONDITION");
  expect((await call("listCustomers", staffToken, { afterId: null, companyId: "another" })).error?.status).toBe("INVALID_ARGUMENT");
  expect((await call("saveCustomer", adminToken, request({ customerId: "../another/customer", expectedRevision: 1 }))).error?.status).toBe("INVALID_ARGUMENT");
  expect((await call("saveCustomer", adminToken, { ...request(), draft: { ...draft, contacts: [{ ...draft.contacts[0], phoneNumber: 1012345678 }] } })).error?.status).toBe("INVALID_ARGUMENT");
  // Valid employee authorization reaches input validation without spending
  // upstream quota or relying on real Kakao credentials in an emulator test.
  expect((await call("searchCustomerLocations", staffToken, { query: "x" })).error?.status).toBe("INVALID_ARGUMENT");
  expect((await call("reverseCustomerLocation", staffToken, { latitude: 91, longitude: 127.38 })).error?.status).toBe("INVALID_ARGUMENT");
  expect((await call("searchCustomerLocations", outsiderToken, { query: "테스트 장소" })).error?.status).toBe("FAILED_PRECONDITION");
  expect((await call("reverseCustomerLocation", outsiderToken, { latitude: 36.35, longitude: 127.38 })).error?.status).toBe("FAILED_PRECONDITION");
});

test("revoked and disabled employees cannot read or mutate customers using previously issued tokens", async () => {
  const database = getFirestore(app);
  const employee = database.doc(`employees/${staffUid}`); const authz = database.doc(`authz/${staffUid}`);
  try {
    await employee.update({ status: "disabled" });
    expect((await call("listCustomers", staffToken, { afterId: null })).error?.status).toBe("PERMISSION_DENIED");
    expect((await call("saveCustomer", staffToken, request())).error?.status).toBe("PERMISSION_DENIED");
    expect((await call("reverseCustomerLocation", staffToken, { latitude: 36.35, longitude: 127.38 })).error?.status).toBe("PERMISSION_DENIED");
    await employee.update({ status: "active" });
    await authz.update({ sessionVersion: 2 });
    expect((await call("listCustomers", staffToken, { afterId: null })).error?.status).toBe("FAILED_PRECONDITION");
    expect((await call("saveCustomer", staffToken, request())).error?.status).toBe("FAILED_PRECONDITION");
    await authz.update({ sessionVersion: 1, permissionsVersion: 2 });
    expect((await call("listCustomers", staffToken, { afterId: null })).error?.status).toBe("FAILED_PRECONDITION");
    expect((await call("saveCustomer", staffToken, request())).error?.status).toBe("FAILED_PRECONDITION");
  } finally {
    await employee.update({ status: "active" }); await authz.update({ sessionVersion: 1, permissionsVersion: 1 });
  }
});

test("customer photo staging, atomic attachment, legacy compatibility, replacement and removal use private real callables", async () => {
  if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "")) throw new Error("Customer photo API test requires local Storage emulator.");
  const bytes = await sharp({ create: { width: 120, height: 90, channels: 3, background: "#89bcb7" } }).jpeg().toBuffer();
  const uploadId = randomUUID(); photoUploadIds.add(uploadId);
  const uploadInput = { uploadId, contentType: "image/jpeg", fileBase64: bytes.toString("base64") };
  expect((await call("uploadCustomerPhoto", null, uploadInput)).error?.status).toBe("UNAUTHENTICATED");
  expect((await call("uploadCustomerPhoto", outsiderToken, uploadInput)).error?.status).toBe("FAILED_PRECONDITION");
  expect((await call("uploadCustomerPhoto", staffToken, { ...uploadInput, contentType: "image/png" })).error?.status).toBe("INVALID_ARGUMENT");
  const uploaded = await call("uploadCustomerPhoto", staffToken, uploadInput);
  expect(uploaded.error).toBeUndefined();
  expect(uploaded.result).toEqual({ uploadId, width: 120, height: 90 });
  expect(uploaded.cacheControl).toContain("no-store");
  expect((await call("uploadCustomerPhoto", staffToken, uploadInput)).result).toEqual(uploaded.result);
  const different = await sharp({ create: { width: 60, height: 90, channels: 3, background: "#334455" } }).jpeg().toBuffer();
  expect((await call("uploadCustomerPhoto", staffToken, { ...uploadInput, fileBase64: different.toString("base64") })).error?.status).toBe("ALREADY_EXISTS");

  const create = request({ draft: { ...draft, noticeType: "none" }, photoChange: { action: "replace", uploadId }, includeOverviewPhoto: true });
  // An otherwise valid administrator cannot steal another employee's stage.
  expect((await call("saveCustomer", adminToken, create)).error?.status).toBe("FAILED_PRECONDITION");
  const saved = await call("saveCustomer", staffToken, create);
  expect(saved.error).toBeUndefined();
  const customer = customerSchema.parse(saved.result); createdCustomers.add(customer.customerId);
  expect(customer).toMatchObject({ noticeType: "none", overviewPhoto: { photoId: uploadId, width: 120, height: 90 } });
  const { includeOverviewPhoto: _flag, ...legacyReplay } = create; void _flag;
  const replayed = await call("saveCustomer", staffToken, legacyReplay);
  expect(replayed.error).toBeUndefined();
  expect(replayed.result).not.toHaveProperty("overviewPhoto");
  const logs = await getFirestore(app).collection("auditLogs").where("targetId", "==", customer.customerId).get();
  expect(logs.size).toBe(1);
  expect(logs.docs[0]!.get("changedFields")).toContain("overviewPhoto");
  expect(JSON.stringify(logs.docs[0]!.data())).not.toMatch(/fileBase64|storagePath|image\/jpeg/);
  const stage = await getFirestore(app).doc(`customerPhotoUploads/${uploadId}`).get();
  expect(stage.get("state")).toBe("attached"); expect(stage.get("expiresAt")).toBeUndefined();

  const listed = await call("listCustomers", staffToken, { afterId: null, includeOverviewPhoto: true });
  expect(listed.result).toMatchObject({ customers: expect.arrayContaining([expect.objectContaining({ customerId: customer.customerId, overviewPhoto: customer.overviewPhoto })]) });
  expect(JSON.stringify(listed.result)).not.toMatch(/fileBase64|storagePath|downloadTokens/);
  const legacyList = await call("listCustomers", staffToken, { afterId: null });
  expect(JSON.stringify(legacyList.result)).not.toContain("overviewPhoto");
  const get = { customerId: customer.customerId, photoId: uploadId, variant: "preview" };
  const photo = await call("getCustomerPhoto", staffToken, get);
  expect(photo.error).toBeUndefined(); expect(photo.cacheControl).toContain("no-store");
  const body = photo.result as { fileBase64: string; byteSize: number; contentType: string };
  const webp = Buffer.from(body.fileBase64, "base64");
  expect(webp.length).toBe(body.byteSize); expect(body.contentType).toBe("image/webp");
  expect((await sharp(webp).metadata()).format).toBe("webp");
  expect((await call("getCustomerPhoto", outsiderToken, get)).error?.status).toBe("FAILED_PRECONDITION");
  await getFirestore(app).doc(`employees/${staffUid}`).update({ status: "disabled" });
  try { expect((await call("getCustomerPhoto", staffToken, get)).error?.status).toBe("PERMISSION_DENIED"); }
  finally { await getFirestore(app).doc(`employees/${staffUid}`).update({ status: "active" }); }

  const legacyEdit = await call("saveCustomer", staffToken, request({ customerId: customer.customerId, expectedRevision: 1 }));
  expect(legacyEdit.error).toBeUndefined(); expect(legacyEdit.result).not.toHaveProperty("overviewPhoto");
  expect((await call("getCustomerPhoto", staffToken, get)).error).toBeUndefined();
  const secondId = randomUUID(); photoUploadIds.add(secondId);
  expect((await call("uploadCustomerPhoto", staffToken, { ...uploadInput, uploadId: secondId })).error).toBeUndefined();
  expect((await call("saveCustomer", staffToken, request({ customerId: customer.customerId, expectedRevision: 1, photoChange: { action: "replace", uploadId: secondId } }))).error?.status).toBe("ABORTED");
  expect((await getFirestore(app).doc(`customerPhotoUploads/${secondId}`).get()).get("state")).toBe("uploaded");
  const replaced = await call("saveCustomer", staffToken, request({ customerId: customer.customerId, expectedRevision: 2, photoChange: { action: "replace", uploadId: secondId }, includeOverviewPhoto: true }));
  expect(replaced.error).toBeUndefined(); expect(replaced.result).toMatchObject({ overviewPhoto: { photoId: secondId } });
  expect((await call("getCustomerPhoto", staffToken, get)).error?.status).toBe("NOT_FOUND");
  const removed = await call("saveCustomer", staffToken, request({ customerId: customer.customerId, expectedRevision: 3, photoChange: { action: "remove" }, includeOverviewPhoto: true }));
  expect(removed.error).toBeUndefined(); expect(removed.result).toMatchObject({ overviewPhoto: null });
  expect((await call("getCustomerPhoto", staffToken, { ...get, photoId: secondId })).error?.status).toBe("NOT_FOUND");
  expect((await getFirestore(app).doc(`customerPhotoUploads/${secondId}`).get()).get("state")).toBe("retired");
});
