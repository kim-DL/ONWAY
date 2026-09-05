import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Firestore } from "firebase-admin/firestore";
import { KakaoLocalClient } from "../functions/lib/sync/kakao-local-client.js";
import { lookupKakaoSchool } from "../functions/lib/sync/kakao-school-lookup.js";
import { KakaoMatchService } from "../functions/lib/sync/kakao-match-service.js";
import { KakaoRouteClient } from "../functions/lib/sales/kakao-route-client.js";
import { fillRoadMetrics } from "../functions/lib/sales/sales-route-service.js";
import { createEstimatedRouteMatrix, optimizeSalesRouteOrder, routeMetric } from "../functions/lib/sales/sales-route-optimizer.js";

// Default is read-only. --apply is deliberately restricted to the reported school.
// No employee session is minted and no assignments or visits are ever written.
const projectId = "onnuriway";
const schoolId = "SCH-NEIS-7451016";
const root = path.resolve(import.meta.dirname, "..");
const apply = process.argv.includes("--apply");
const load = async (file) => {
  const loaded = await import(pathToFileURL(path.join(root, "node_modules/firebase-tools/lib", file)).href);
  return loaded.default ?? loaded;
};
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
let db;
try {
  const { logger } = await load("logger.js");
  logger.silent = true;
  const auth = await load("auth.js");
  const { requireAuth } = await load("requireAuth.js");
  const { Client } = await load("apiv2.js");
  const account = auth.getGlobalDefaultAccount();
  assert(account, "CLI_AUTH_UNAVAILABLE");
  const authOptions = { project: projectId };
  auth.setActiveAccount(authOptions, account);
  await requireAuth(authOptions);
  const api = await load("api.js");
  db = new Firestore({ projectId, credentials: { type: "authorized_user",
    client_id: api.clientId(), client_secret: api.clientSecret(), refresh_token: account.tokens.refresh_token,
  } });
  const snapshot = await db.doc(`schools/${schoolId}`).get();
  const school = snapshot.data();
  assert(school?.name === "대전괴정중학교" && school.operationalStatus === "active");
  const secretClient = new Client({ urlPrefix: "https://secretmanager.googleapis.com", apiVersion: "v1" });
  const response = await secretClient.get(`projects/${projectId}/secrets/KAKAO_REST_API_KEY/versions/latest:access`, {
    skipLog: { body: true, resBody: true, queryParams: true },
  });
  const restApiKey = Buffer.from(response.body.payload.data, "base64").toString();
  const client = new KakaoLocalClient({ restApiKey });
  const decision = await lookupKakaoSchool(school, client);
  emit({ schoolId, school: school.name, before: school.location.matchStatus, liveDecision: decision.status,
    reason: decision.reason, score: decision.candidate?.score, candidateCount: decision.candidates.length });
  assert.equal(decision.status, "autoMatched");
  assert.equal(decision.candidate?.name, school.name);
  assert.equal(decision.candidate?.placeId, "10234433");
  if (apply && school.location.matchStatus !== "autoMatched" && school.location.matchStatus !== "confirmed") {
    assert.equal(school.possibleRelocation, false, "Relocation requires human review");
    const review = await db.doc(`kakaoMatchReviews/${schoolId}`).get();
    const directory = path.join(root, "output/security");
    await mkdir(directory, { recursive: true });
    const backupFile = path.join(directory, `route-location-${schoolId}-${Date.now()}.json`);
    await writeFile(backupFile, JSON.stringify({ projectId, school, review: review.data() }, null, 2));
    // Revalidate with fresh provider results inside the existing revision-checked,
    // audited matching service. No manual coordinate override.
    const saved = await new KakaoMatchService({ db, client }).match({ schoolId, requestId: randomUUID() }, {
      uid: "maintenance-route-location-20260905", employeeId: "SYSTEM-MAINTENANCE",
    });
    assert.equal(saved.status, "autoMatched");
    const persisted = (await db.doc(`schools/${schoolId}`).get()).data();
    assert.equal(persisted.location.matchStatus, "autoMatched");
    assert.equal(persisted.location.kakaoPlaceId, "10234433");
    assert.equal(persisted.possibleRelocation, false);
    emit({ saved: saved.status, revision: saved.schoolBaseRevision, backupFile });
  }
  // Real road API + actual current-cycle school coordinates; no employee identity
  // is reused. This validates geometry/ordering, not the authenticated callable.
  const settings = (await db.doc("appSettings/public").get()).data();
  const cycleId = settings?.activeSalesCycleId ?? settings?.currentSalesCycleId;
  assert(typeof cycleId === "string", "ACTIVE_CYCLE_UNAVAILABLE");
  const assignments = await db.collection(`salesCycles/${cycleId}/assignments`).limit(50).get();
  const ids = [...new Set([schoolId, ...assignments.docs.map(doc => doc.id)])].slice(0, 50);
  const snapshots = await db.getAll(...ids.map(id => db.doc(`schools/${id}`)));
  if (process.argv.includes("--audit-all")) {
    let cursor = 0;
    const failures = [];
    const worker = async () => {
      while (cursor < snapshots.length) {
        const doc = snapshots[cursor++];
        const item = doc.data();
        if (!item || item.operationalStatus !== "active") { failures.push({ schoolId: doc.id, reason: "INACTIVE_OR_MISSING" }); continue; }
        try {
          const result = await lookupKakaoSchool(item, client);
          if (result.status !== "autoMatched") failures.push({ schoolId: doc.id, school: item.name, reason: result.reason,
            candidates: result.candidates.filter(candidate => candidate.score >= 60).map(candidate => ({ name: candidate.name,
              category: candidate.categoryName, score: candidate.score, distance: candidate.distanceMeters, placeId: candidate.placeId,
              road: candidate.roadAddress })) });
        } catch { failures.push({ schoolId: doc.id, reason: "PROVIDER_UNAVAILABLE" }); }
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    emit({ liveCatalogAudit: true, checked: snapshots.length, matched: snapshots.length - failures.length, failures });
    assert.equal(failures.length, 0, "Assigned-school revalidation must not hide failures");
  }
  const nodes = snapshots.flatMap(doc => {
    const item = doc.data();
    const location = doc.id === schoolId ? decision.candidate : item?.location;
    if (!item || item.operationalStatus !== "active" || item.possibleRelocation
      || (doc.id !== schoolId && !["autoMatched", "confirmed"].includes(location?.matchStatus))) return [];
    if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)
      || location.latitude < 36 || location.latitude > 36.7 || location.longitude < 127.1 || location.longitude > 127.7) return [];
    return [{ schoolId: item.schoolId, name: item.name, latitude: location.latitude, longitude: location.longitude }];
  });
  assert(nodes.length >= 2);
  assert.equal(nodes.length, ids.length, "Do not silently omit an unresolved assigned school");
  const matrix = createEstimatedRouteMatrix(nodes);
  await fillRoadMetrics(nodes, matrix, new KakaoRouteClient(restApiKey));
  for (const startId of [schoolId, nodes.find(node => node.schoolId !== schoolId).schoolId]) {
    const order = optimizeSalesRouteOrder(nodes, startId, matrix);
    assert.equal(order[0], startId);
    assert.equal(new Set(order).size, nodes.length);
    const legs = order.slice(1).map((id, index) => routeMetric(matrix, order[index], id));
    assert(legs.every(leg => Number.isFinite(leg.durationSeconds) && leg.distanceMeters >= 0));
    emit({ verifiedRoute: true, startsAtReportedSchool: startId === schoolId, schools: order.length,
      roadLegs: legs.filter(leg => leg.source === "road").length, estimatedLegs: legs.filter(leg => leg.source !== "road").length });
  }
} catch (error) {
  emit({ status: "LIVE_VERIFICATION_FAILED", code: error?.code ?? error?.status ?? "UNKNOWN" });
  process.exitCode = 1;
} finally {
  await db?.terminate();
}
