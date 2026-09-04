import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import { mapNeisSchool } from "../src/neis/school-mapper.js";
import { KakaoRouteLocationResolver } from "../src/sales/kakao-route-location-resolver.js";
import { KakaoMatchConflictError, KakaoMatchService } from "../src/sync/kakao-match-service.js";
import type { KakaoPlaceCandidate } from "../src/sync/kakao-local-client.js";
import type { StoredSchool } from "../src/sync/school-sync-types.js";

const school = mapNeisSchool({
  ATPT_OFCDC_SC_CODE: "G10", ATPT_OFCDC_SC_NM: "대전광역시교육청", SD_SCHUL_CODE: "7449999",
  SCHUL_NM: "대전온누리초등학교", ENG_SCHUL_NM: "", SCHUL_KND_SC_NM: "초등학교",
  LCTN_SC_NM: "대전광역시", JU_ORG_NM: "", FOND_SC_NM: "공립", ORG_RDNZC: "35200",
  ORG_RDNMA: "대전광역시 서구 온누리로 1", ORG_RDNDA: "", ORG_TELNO: "", HMPG_ADRES: "", LOAD_DTM: "",
}, { targetEducationOfficeCode: "G10", syncedAt: new Date("2026-09-05T01:00:00Z") }) as unknown as StoredSchool;
const actor = { uid: "sales-user", employeeId: "EMP-SALES" };
const candidate: KakaoPlaceCandidate = {
  candidateId: "place-1", placeId: "place-1", name: school.name, categoryName: "교육 > 학교 > 초등학교",
  addressName: "대전광역시 서구 온누리동 1", roadAddress: school.address.road!,
  latitude: 36.35, longitude: 127.38, placeUrl: "https://place.map.kakao.com/place-1",
};
const addressResult = {
  addressName: candidate.addressName, roadAddress: candidate.roadAddress,
  latitude: candidate.latitude, longitude: candidate.longitude,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

type TestReference = { path: string; id: string };
type TestDocument = Record<string, unknown>;
type TestTransaction = {
  get: (reference: TestReference) => Promise<{ exists: boolean; id: string; data: () => TestDocument | undefined }>;
  update: (reference: TestReference, value: TestDocument) => void;
  set: (reference: TestReference, value: TestDocument) => void;
  create: (reference: TestReference, value: TestDocument) => void;
};

function database(initial: StoredSchool = school) {
  const documents = new Map<string, TestDocument>([
    [`schools/${initial.schoolId}`, initial as unknown as TestDocument],
  ]);
  const snapshot = async (reference: TestReference) => {
    const value = documents.get(reference.path);
    return { exists: value !== undefined, id: reference.id, data: () => value };
  };
  let transactionTail: Promise<unknown> = Promise.resolve();
  const runTransaction = vi.fn((callback: (transaction: TestTransaction) => Promise<unknown>) => {
    // Serialize commits as Firestore does after its optimistic transaction retry.
    const result = transactionTail.then(async () => {
      const writes: Array<() => void> = [];
      const value = await callback({
        get: snapshot,
        update: (reference, update) => { writes.push(() => documents.set(reference.path, { ...documents.get(reference.path), ...update })); },
        set: (reference, update) => { writes.push(() => documents.set(reference.path, update)); },
        create: (reference, update) => { writes.push(() => documents.set(reference.path, update)); },
      });
      writes.forEach((write) => write());
      return value;
    });
    transactionTail = result.catch(() => undefined);
    return result;
  });
  const db = {
    doc: (path: string) => {
      const reference = { path, id: path.split("/").at(-1)! };
      return { ...reference, get: () => snapshot(reference) };
    },
    runTransaction,
  } as unknown as Firestore;
  return { db, documents, runTransaction };
}

describe("concurrent school location checks", () => {
  it("reuses the winning geocode without another provider call or failed write", async () => {
    const store = database();
    const entered = deferred();
    let searches = 0;
    const searchKeyword = vi.fn(async () => {
      if (++searches === 2) entered.resolve();
      await entered.promise;
      return [candidate];
    });
    const matcher = new KakaoMatchService({
      db: store.db, client: { searchAddress: vi.fn(async () => addressResult), searchKeyword },
    });
    const resolver = new KakaoRouteLocationResolver(matcher);
    const results = await Promise.all([
      resolver.resolve(school.schoolId, actor),
      resolver.resolve(school.schoolId, { uid: "other-sales", employeeId: "EMP-OTHER" }),
    ]);

    expect(results).toEqual(Array.from({ length: 2 }, () => ({ ok: true, latitude: 36.35, longitude: 127.38 })));
    expect(searchKeyword).toHaveBeenCalledTimes(2);
    expect(store.runTransaction).toHaveBeenCalledTimes(2);
    const audits = [...store.documents].filter(([path]) => path.startsWith("auditLogs/")).map(([, value]) => value.eventType);
    expect(audits).toEqual(["KAKAO_AUTO_MATCHED"]);
  });

  it("preserves a simultaneous administrator confirmation for both pending checks", async () => {
    const store = database();
    const entered = deferred();
    const release = deferred();
    let searches = 0;
    const searchKeyword = vi.fn(async () => {
      if (++searches === 2) entered.resolve();
      await release.promise;
      return [candidate];
    });
    const matcher = new KakaoMatchService({
      db: store.db, client: { searchAddress: vi.fn(async () => addressResult), searchKeyword },
    });
    const resolver = new KakaoRouteLocationResolver(matcher);
    const pending = Promise.all([
      resolver.resolve(school.schoolId, actor), resolver.resolve(school.schoolId, actor),
    ]);
    await entered.promise;
    await matcher.confirm({
      schoolId: school.schoolId, requestId: "manual-confirmation", expectedSchoolBaseRevision: school.schoolBaseRevision,
      candidateId: null,
      manualLocation: { latitude: 36.351, longitude: 127.381, name: school.name, roadAddress: school.address.road! },
    }, { uid: "administrator", employeeId: "EMP-ADMIN" });
    release.resolve();

    expect(await pending).toEqual(Array.from({ length: 2 }, () => ({ ok: true, latitude: 36.351, longitude: 127.381 })));
    expect(store.documents.get(`schools/${school.schoolId}`)?.location).toMatchObject({
      matchStatus: "confirmed", latitude: 36.351, longitude: 127.381, confirmedBy: "EMP-ADMIN",
    });
    expect(searchKeyword).toHaveBeenCalledTimes(2);
    expect(store.runTransaction).toHaveBeenCalledTimes(3);
    const audits = [...store.documents].filter(([path]) => path.startsWith("auditLogs/")).map(([, value]) => value.eventType);
    expect(audits).toEqual(["KAKAO_MATCH_CONFIRMED"]);
  });

  it("does not retry persistence or relabel a revision conflict as a provider failure", async () => {
    const store = database();
    store.runTransaction.mockRejectedValue(new KakaoMatchConflictError("Changed during lookup"));
    const matcher = new KakaoMatchService({
      db: store.db, client: { searchAddress: async () => addressResult, searchKeyword: async () => [candidate] },
    });

    await expect(matcher.match({ schoolId: school.schoolId, requestId: "lookup" }, actor)).rejects.toBeInstanceOf(KakaoMatchConflictError);
    expect(store.runTransaction).toHaveBeenCalledTimes(1);
    expect([...store.documents.keys()]).toEqual([`schools/${school.schoolId}`]);
  });

  it.each([
    { operationalStatus: "closed" as const },
    { possibleRelocation: true },
    { location: { ...school.location, matchStatus: "needsReview" as const, latitude: 36.35, longitude: 127.38 } },
    { location: { ...school.location, matchStatus: "confirmed" as const, latitude: 0, longitude: 0 } },
  ])("does not reuse an unsafe latest school state: %j", async (update) => {
    const trusted = {
      ...school, location: { ...school.location, matchStatus: "confirmed" as const, latitude: 36.35, longitude: 127.38 },
      ...update,
    };
    const store = database(trusted);
    const matcher = new KakaoMatchService({
      db: store.db, client: { searchAddress: async () => addressResult, searchKeyword: async () => [candidate] },
    });
    await expect(matcher.readTrustedLocation(school.schoolId)).resolves.toBeNull();
    expect(store.runTransaction).not.toHaveBeenCalled();
  });
});

describe("administrator-confirmed location drift", () => {
  function confirmedSchool(): StoredSchool {
    return {
      ...school,
      possibleRelocation: true,
      location: {
        ...school.location, matchStatus: "confirmed", kakaoPlaceId: candidate.placeId,
        latitude: candidate.latitude, longitude: candidate.longitude,
        confirmedBy: "EMP-ADMIN", confirmedAt: new Date("2026-09-01T00:00:00Z"),
      },
    };
  }

  it("requires review when the same Kakao place ID moved beyond 100 meters", async () => {
    const current = confirmedSchool();
    const store = database(current);
    const moved = { ...candidate, latitude: 36.36 };
    const matcher = new KakaoMatchService({
      db: store.db, client: { searchAddress: async () => addressResult, searchKeyword: async () => [moved] },
    });
    const result = await matcher.match({ schoolId: school.schoolId, requestId: "relocation-check" }, actor);

    expect(result).toMatchObject({ status: "needsReview", reason: "CONFIRMED_LOCATION_CHANGED", acceptedLocation: null });
    const stored = store.documents.get(`schools/${school.schoolId}`)!;
    expect(stored.possibleRelocation).toBe(true);
    expect(stored.location).toEqual(current.location);
    expect(store.documents.get(`kakaoMatchReviews/${school.schoolId}`)?.candidates).toEqual([
      expect.objectContaining({ placeId: candidate.placeId, latitude: 36.36 }),
    ]);
    await expect(matcher.readTrustedLocation(school.schoolId)).resolves.toBeNull();
  });

  it.each([
    [candidate.placeId, "CONFIRMED_PLACE_UNCHANGED"],
    ["renamed-place-id", "CONFIRMED_LOCATION_NEARBY"],
  ])("keeps confirmed coordinates for nearby candidate %s", async (placeId, reason) => {
    const current = confirmedSchool();
    const store = database(current);
    const nearby = { ...candidate, candidateId: placeId, placeId, latitude: 36.3505 };
    const matcher = new KakaoMatchService({
      db: store.db, client: { searchAddress: async () => addressResult, searchKeyword: async () => [nearby] },
    });
    const result = await matcher.match({ schoolId: school.schoolId, requestId: `nearby-${placeId}` }, actor);

    expect(result).toMatchObject({
      status: "confirmed", reason,
      acceptedLocation: { latitude: candidate.latitude, longitude: candidate.longitude },
    });
    const stored = store.documents.get(`schools/${school.schoolId}`)!;
    expect(stored.possibleRelocation).toBe(false);
    expect(stored.location).toEqual(current.location);
  });
});
