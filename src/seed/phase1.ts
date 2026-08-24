import {
  catalogMetaSchema,
  productSchema,
  SEARCH_CATALOG_SCHEMA_VERSION,
  tagDefinitionSchema,
} from "@/domain/catalog";
import { authzSchema, employeeDirectorySchema, employeeSchema } from "@/domain/identity";
import {
  salesAssignmentSchema,
  salesCycleSchema,
  salesProfileSchema,
  salesVisitSchema,
  salesZoneSchema,
} from "@/domain/sales";
import { schoolFieldProfileSchema, schoolPhotoSchema, schoolSchema } from "@/domain/school";
import { publicAppSettingsSchema } from "@/domain/system";
import { buildCommonSearchCatalog } from "@/features/search/common-catalog-builder";
import { firestorePaths } from "@/lib/firebase/firestore-paths";

export const PHASE1_SEED_INSTANT = "2026-08-18T09:00:00.000Z";

export interface SeedAuthUser {
  uid: string;
  employeeId: string;
  displayName: string;
  disabled: boolean;
  roleScopes: readonly ("delivery" | "sales" | "viewer" | "admin")[];
  sessionVersion: number;
  permissionsVersion: number;
}

export interface SeedDocument {
  path: string;
  data: object;
}

export function createPhase1Seed() {
  const createdAt = new Date(PHASE1_SEED_INSTANT);
  const visitAt = new Date("2026-08-20T04:30:00.000Z");

  const authUsers: SeedAuthUser[] = [
    {
      uid: "uid-delivery",
      employeeId: "EMP-DELIVERY",
      displayName: "납품 담당",
      disabled: false,
      roleScopes: ["delivery"],
      sessionVersion: 1,
      permissionsVersion: 1,
    },
    {
      uid: "uid-sales-a",
      employeeId: "EMP-SALES-A",
      displayName: "영업 A",
      disabled: false,
      roleScopes: ["sales"],
      sessionVersion: 1,
      permissionsVersion: 1,
    },
    {
      uid: "uid-sales-b",
      employeeId: "EMP-SALES-B",
      displayName: "영업 B",
      disabled: false,
      roleScopes: ["sales"],
      sessionVersion: 1,
      permissionsVersion: 1,
    },
    {
      uid: "uid-sales-c",
      employeeId: "EMP-SALES-C",
      displayName: "영업 C",
      disabled: false,
      roleScopes: ["sales"],
      sessionVersion: 1,
      permissionsVersion: 1,
    },
    {
      uid: "uid-admin",
      employeeId: "EMP-ADMIN",
      displayName: "관리자",
      disabled: false,
      roleScopes: ["admin"],
      sessionVersion: 1,
      permissionsVersion: 1,
    },
    {
      uid: "uid-disabled",
      employeeId: "EMP-DISABLED",
      displayName: "비활성 직원",
      disabled: true,
      roleScopes: ["viewer"],
      sessionVersion: 2,
      permissionsVersion: 1,
    },
  ];

  const employees = employeeSchema.array().parse(
    authUsers.map((user) => ({
      employeeId: user.employeeId,
      firebaseUid: user.uid,
      displayName: user.displayName,
      roleScopes: user.roleScopes,
      permissions: { exportTeam: user.roleScopes.includes("admin") },
      status: user.disabled ? "disabled" : "active",
      sessionVersion: user.sessionVersion,
      createdAt,
      updatedAt: createdAt,
    })),
  );

  const employeeDirectory = employeeDirectorySchema.array().parse(
    authUsers.map((user, index) => ({
      employeeId: user.employeeId,
      displayName: user.displayName,
      active: !user.disabled,
      displayOrder: index + 1,
    })),
  );

  const authz = authzSchema.array().parse(
    authUsers.map((user) => ({
      employeeId: user.employeeId,
      active: !user.disabled,
      sessionVersion: user.sessionVersion,
      permissionsVersion: user.permissionsVersion,
      updatedAt: createdAt,
    })),
  );

  const schools = schoolSchema.array().parse([
    {
      schoolId: "SCH-NEIS-G100000001",
      source: {
        provider: "NEIS",
        schoolCode: "G100000001",
        educationOfficeCode: "G10",
        syncedAt: createdAt,
      },
      name: "대전온누리고등학교",
      shortName: "온누리고",
      normalizedName: "대전온누리고등학교",
      initials: "ㄷㅈㅇㄴㄹㄱㄷㅎㄱ",
      aliases: ["온누리고"],
      schoolType: "high",
      district: "seo",
      address: { road: "대전광역시 서구 온누리로 1", jibun: null, postalCode: "35200" },
      phone: "042-000-0001",
      homepage: "https://school.example/onnuri",
      location: {
        latitude: 36.35,
        longitude: 127.38,
        kakaoPlaceId: "KAKAO-ONNURI-1",
        matchStatus: "confirmed",
        matchMethod: "address+keyword",
        matchConfidence: 0.99,
        matchedName: "대전온누리고등학교",
        matchedRoadAddress: "대전광역시 서구 온누리로 1",
        matchedAt: createdAt,
        confirmedBy: "EMP-ADMIN",
        confirmedAt: createdAt,
      },
      operationalStatus: "active",
      possibleRelocation: false,
      schoolBaseRevision: 1,
      createdAt,
      updatedAt: createdAt,
    },
    {
      schoolId: "SCH-NEIS-G100000002",
      source: {
        provider: "NEIS",
        schoolCode: "G100000002",
        educationOfficeCode: "G10",
        syncedAt: createdAt,
      },
      name: "대전한밭중학교",
      shortName: "한밭중",
      normalizedName: "대전한밭중학교",
      initials: "ㄷㅈㅎㅂㅈㅎㄱ",
      aliases: [],
      schoolType: "middle",
      district: "jung",
      address: { road: "대전광역시 중구 한밭로 2", jibun: null, postalCode: null },
      phone: null,
      homepage: null,
      location: {
        latitude: null,
        longitude: null,
        kakaoPlaceId: null,
        matchStatus: "needsReview",
        matchMethod: "address",
        matchConfidence: 0.62,
        matchedName: "한밭중학교",
        matchedRoadAddress: null,
        matchedAt: createdAt,
        confirmedBy: null,
        confirmedAt: null,
      },
      operationalStatus: "active",
      possibleRelocation: false,
      schoolBaseRevision: 1,
      createdAt,
      updatedAt: createdAt,
    },
    {
      schoolId: "SCH-NEIS-G100000003",
      source: {
        provider: "NEIS",
        schoolCode: "G100000003",
        educationOfficeCode: "G10",
        syncedAt: createdAt,
      },
      name: "대전새봄초등학교",
      shortName: "새봄초",
      normalizedName: "대전새봄초등학교",
      initials: "ㄷㅈㅅㅂㅊㄷㅎㄱ",
      aliases: [],
      schoolType: "elementary",
      district: "yuseong",
      address: { road: "대전광역시 유성구 새봄로 3", jibun: null, postalCode: null },
      phone: null,
      homepage: null,
      location: {
        latitude: null,
        longitude: null,
        kakaoPlaceId: null,
        matchStatus: "unmatched",
        matchMethod: null,
        matchConfidence: null,
        matchedName: null,
        matchedRoadAddress: null,
        matchedAt: null,
        confirmedBy: null,
        confirmedAt: null,
      },
      operationalStatus: "active",
      possibleRelocation: false,
      schoolBaseRevision: 1,
      createdAt,
      updatedAt: createdAt,
    },
    {
      schoolId: "SCH-NEIS-G100000004",
      source: {
        provider: "NEIS",
        schoolCode: "G100000004",
        educationOfficeCode: "G10",
        syncedAt: createdAt,
      },
      name: "대전새빛고등학교",
      shortName: "새빛고",
      normalizedName: "대전새빛고등학교",
      initials: "ㄷㅈㅅㅂㄱㄷㅎㄱ",
      aliases: ["대전구명고등학교", "구명고"],
      schoolType: "high",
      district: "dong",
      address: { road: "대전광역시 동구 새빛로 4", jibun: null, postalCode: "34600" },
      phone: "042-000-0004",
      homepage: null,
      location: {
        latitude: 36.34,
        longitude: 127.44,
        kakaoPlaceId: "KAKAO-SAEBIT-4",
        matchStatus: "confirmed",
        matchMethod: "manual",
        matchConfidence: 1,
        matchedName: "대전새빛고등학교",
        matchedRoadAddress: "대전광역시 동구 새빛로 4",
        matchedAt: createdAt,
        confirmedBy: "EMP-ADMIN",
        confirmedAt: createdAt,
      },
      operationalStatus: "active",
      possibleRelocation: false,
      schoolBaseRevision: 2,
      createdAt,
      updatedAt: createdAt,
    },
    {
      schoolId: "SCH-NEIS-G100000005",
      source: {
        provider: "NEIS",
        schoolCode: "G100000005",
        educationOfficeCode: "G10",
        syncedAt: createdAt,
      },
      name: "대전푸른특수학교",
      shortName: "푸른학교",
      normalizedName: "대전푸른특수학교",
      initials: "ㄷㅈㅍㄹㅌㅅㅎㄱ",
      aliases: [],
      schoolType: "special",
      district: "daedeok",
      address: { road: "대전광역시 대덕구 푸른로 5", jibun: null, postalCode: null },
      phone: null,
      homepage: null,
      location: {
        latitude: null,
        longitude: null,
        kakaoPlaceId: null,
        matchStatus: "failed",
        matchMethod: "keyword",
        matchConfidence: null,
        matchedName: null,
        matchedRoadAddress: null,
        matchedAt: createdAt,
        confirmedBy: null,
        confirmedAt: null,
      },
      operationalStatus: "inactiveCandidate",
      possibleRelocation: true,
      schoolBaseRevision: 1,
      createdAt,
      updatedAt: createdAt,
    },
  ]);

  const completeSchool = schools[0];
  const partialSchool = schools[1];
  if (completeSchool === undefined || partialSchool === undefined) {
    throw new Error("Phase 1 seed requires complete and partial school scenarios.");
  }

  const fieldProfiles = schoolFieldProfileSchema.array().parse([
    {
      schoolId: completeSchool.schoolId,
      cafeteria: {
        building: "본관",
        floor: "1층",
        locationDescription: "정문에서 오른쪽 통로 끝",
        entranceDescription: "급식실 전용 출입구",
        routeDescription: "정문 진입 후 우회전",
      },
      inspection: { startTime: "07:30", endTime: "08:10", note: "08시 이후 학생 이동 주의" },
      equipment: { cartRequired: "required", elevator: "available", stairsRequired: "notRequired" },
      vehicle: {
        access: "available",
        unloadingLocation: "본관 뒤 하역장",
        parking: "limited",
        note: "하역 후 즉시 이동",
      },
      fieldNotes: "경비실에 납품 차량 번호 사전 전달",
      completeness: 100,
      reviewRequired: false,
      revision: 1,
      createdAt,
      createdBy: "EMP-DELIVERY",
      updatedAt: createdAt,
      updatedBy: "EMP-DELIVERY",
    },
    {
      schoolId: partialSchool.schoolId,
      cafeteria: {
        building: null,
        floor: "2층",
        locationDescription: null,
        entranceDescription: "후문 이용",
        routeDescription: null,
      },
      inspection: { startTime: "08:00", endTime: null, note: null },
      equipment: { cartRequired: "unknown", elevator: "unknown", stairsRequired: "unknown" },
      vehicle: { access: "limited", unloadingLocation: null, parking: "unknown", note: null },
      fieldNotes: null,
      completeness: 45,
      reviewRequired: true,
      revision: 1,
      createdAt,
      createdBy: "EMP-DELIVERY",
      updatedAt: createdAt,
      updatedBy: "EMP-DELIVERY",
    },
  ]);

  const photos = schoolPhotoSchema.array().parse(
    (["01", "02", "03"] as const).map((slotId, index) => ({
      schoolId: completeSchool.schoolId,
      slotId,
      currentVersionId: `v00${index + 1}`,
      caption: ["학교 접근", "급식실 출입구", "검수·하역 위치"][index],
      status: "active",
      photoRevision: 1,
      createdAt,
      createdBy: "EMP-DELIVERY",
      updatedAt: createdAt,
      updatedBy: "EMP-DELIVERY",
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
    })),
  );

  const zones = salesZoneSchema.array().parse(
    ["A", "B", "C"].map((zoneId, index) => ({
      zoneId,
      name: `${zoneId}구역`,
      displayOrder: index + 1,
      active: true,
      createdAt,
      updatedAt: createdAt,
    })),
  );

  const products = productSchema.array().parse([
    {
      productId: "PROD-001",
      name: "온누리 샘플 A",
      shortName: "샘플 A",
      active: true,
      displayOrder: 1,
      createdAt,
      updatedAt: createdAt,
    },
    {
      productId: "PROD-002",
      name: "온누리 샘플 B",
      shortName: "샘플 B",
      active: true,
      displayOrder: 2,
      createdAt,
      updatedAt: createdAt,
    },
  ]);

  const communicationTags = tagDefinitionSchema.array().parse([
    { tagId: "COMM-DETAIL", label: "상세 자료 선호", active: true, displayOrder: 1, createdAt, updatedAt: createdAt },
    { tagId: "COMM-TEXT", label: "문자 연락 선호", active: true, displayOrder: 2, createdAt, updatedAt: createdAt },
  ]);

  const activityTags = tagDefinitionSchema.array().parse([
    { tagId: "ACT-FOLLOWUP", label: "후속 필요", active: true, displayOrder: 1, createdAt, updatedAt: createdAt },
    { tagId: "ACT-SAMPLE", label: "샘플 반응", active: true, displayOrder: 2, createdAt, updatedAt: createdAt },
  ]);

  const cycle = salesCycleSchema.parse({
    cycleId: "2026-08",
    year: 2026,
    month: 8,
    status: "active",
    copiedFromCycleId: null,
    createdAt,
    createdBy: "EMP-ADMIN",
    activatedAt: createdAt,
    closedAt: null,
  });

  const visit = salesVisitSchema.parse({
    visitId: "VISIT-20260820-001",
    schoolId: completeSchool.schoolId,
    cycleId: cycle.cycleId,
    assignmentSnapshot: {
      zoneId: "A",
      primaryAssigneeId: "EMP-SALES-A",
      assigneeIds: ["EMP-SALES-A"],
    },
    visitedAt: visitAt,
    visitedBy: "EMP-SALES-A",
    recordedBy: "EMP-SALES-A",
    brochure: { status: "delivered" },
    sample: { status: "delivered", items: [{ productId: "PROD-001", quantity: 2 }] },
    interest: { score: 80, explicitlySelected: true },
    activityTagIds: ["ACT-FOLLOWUP", "ACT-SAMPLE"],
    summary: "샘플 반응이 좋아 다음 주 상세 자료 전달 예정",
    followUp: { required: true, dueDate: "2026-08-27", summary: "상세 자료 전달" },
    deleted: false,
    deletedAt: null,
    deletedBy: null,
    deleteReason: null,
    revision: 1,
    createdAt: visitAt,
    updatedAt: visitAt,
  });

  const salesProfiles = salesProfileSchema.array().parse([
    {
      schoolId: completeSchool.schoolId,
      interestScore: 80,
      interestEvaluated: true,
      interestedProductIds: ["PROD-001"],
      communicationTagIds: ["COMM-DETAIL"],
      latestVisit: { visitId: visit.visitId, visitedAt: visit.visitedAt, visitedBy: visit.visitedBy },
      followUp: { required: true, dueDate: "2026-08-27", summary: "상세 자료 전달" },
      nextAction: { dueDate: "2026-08-27", summary: "자료 전달 후 연락" },
      salesRevision: 1,
      createdAt,
      updatedAt: visitAt,
      updatedBy: "EMP-SALES-A",
    },
    {
      schoolId: partialSchool.schoolId,
      interestScore: 0,
      interestEvaluated: false,
      interestedProductIds: [],
      communicationTagIds: [],
      latestVisit: { visitId: null, visitedAt: null, visitedBy: null },
      followUp: { required: false, dueDate: null, summary: null },
      nextAction: { dueDate: null, summary: null },
      salesRevision: 1,
      createdAt,
      updatedAt: createdAt,
      updatedBy: "EMP-SALES-B",
    },
  ]);

  const assignees = ["EMP-SALES-A", "EMP-SALES-B", "EMP-SALES-C", "EMP-SALES-A", "EMP-SALES-C"];
  const zoneIds = ["A", "B", "C", "A", "C"];
  const assignments = salesAssignmentSchema.array().parse(
    schools.map((school, index) => ({
      schoolId: school.schoolId,
      cycleId: cycle.cycleId,
      zoneId: zoneIds[index],
      primaryAssigneeId: assignees[index],
      assigneeIds: [assignees[index]],
      monthlyStatus: index === 0 ? "completed" : index === 4 ? "onHold" : "before",
      latestVisitId: index === 0 ? visit.visitId : null,
      latestVisitedAt: index === 0 ? visit.visitedAt : null,
      brochureStatus: index === 0 ? "delivered" : "unknown",
      sampleStatus: index === 0 ? "delivered" : "unknown",
      revision: 1,
      createdAt,
      updatedAt: index === 0 ? visitAt : createdAt,
    })),
  );

  const commonCatalog = buildCommonSearchCatalog({
    schools,
    fieldProfiles,
    photos,
    version: 1,
    generatedAt: createdAt,
  });
  const catalogMeta = catalogMetaSchema.parse({
    commonCatalogVersion: 1,
    fieldCatalogVersion: 1,
    salesCatalogVersion: 1,
    assignmentCatalogVersion: 1,
    commonCatalogIds: commonCatalog.catalogIds,
    commonCatalogItemCount: commonCatalog.itemCount,
    commonCatalogSchemaVersion: SEARCH_CATALOG_SCHEMA_VERSION,
    updatedAt: createdAt,
  });

  const publicAppSettings = publicAppSettingsSchema.parse({
    minimumAppVersion: null,
    currentSalesCycleId: cycle.cycleId,
    commonCatalogVersion: 1,
    maintenanceMode: false,
    updatedAt: createdAt,
  });

  const adminAccess = {
    entries: [
      {
        email: "admin@onnuriway.test",
        employeeId: "EMP-ADMIN",
        active: true,
      },
    ],
    updatedAt: createdAt,
  };

  return {
    authUsers,
    employees,
    employeeDirectory,
    authz,
    schools,
    fieldProfiles,
    photos,
    zones,
    products,
    communicationTags,
    activityTags,
    salesProfiles,
    salesVisits: [visit],
    cycles: [cycle],
    assignments,
    commonCatalogs: commonCatalog.documents,
    catalogMeta,
    publicAppSettings,
    adminAccess,
  };
}

export function buildPhase1SeedDocuments(seed = createPhase1Seed()): SeedDocument[] {
  return [
    ...seed.employees.map((data) => ({ path: firestorePaths.employee(data.employeeId), data })),
    ...seed.employeeDirectory.map((data) => ({
      path: firestorePaths.employeeDirectory(data.employeeId),
      data,
    })),
    ...seed.authz.map((data, index) => ({
      path: firestorePaths.authz(seed.authUsers[index]?.uid ?? "missing-seed-uid"),
      data,
    })),
    ...seed.schools.map((data) => ({ path: firestorePaths.school(data.schoolId), data })),
    ...seed.fieldProfiles.map((data) => ({
      path: firestorePaths.schoolFieldProfile(data.schoolId),
      data,
    })),
    ...seed.photos.map((data) => ({
      path: firestorePaths.schoolPhoto(data.schoolId, data.slotId),
      data,
    })),
    ...seed.zones.map((data) => ({ path: firestorePaths.zone(data.zoneId), data })),
    ...seed.products.map((data) => ({ path: firestorePaths.product(data.productId), data })),
    ...seed.communicationTags.map((data) => ({
      path: firestorePaths.communicationTag(data.tagId),
      data,
    })),
    ...seed.activityTags.map((data) => ({ path: firestorePaths.activityTag(data.tagId), data })),
    ...seed.salesProfiles.map((data) => ({
      path: firestorePaths.salesProfile(data.schoolId),
      data,
    })),
    ...seed.salesVisits.map((data) => ({ path: firestorePaths.salesVisit(data.visitId), data })),
    ...seed.cycles.map((data) => ({ path: firestorePaths.salesCycle(data.cycleId), data })),
    ...seed.assignments.map((data) => ({
      path: firestorePaths.salesAssignment(data.cycleId, data.schoolId),
      data,
    })),
    ...seed.commonCatalogs.map((data) => ({
      path: firestorePaths.searchCatalog(data.catalogId),
      data,
    })),
    { path: firestorePaths.catalogMeta(), data: seed.catalogMeta },
    { path: firestorePaths.publicAppSettings(), data: seed.publicAppSettings },
    { path: firestorePaths.secureSetting("adminAccess"), data: seed.adminAccess },
  ];
}
