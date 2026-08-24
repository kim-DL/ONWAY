import { cycleIdSchema, documentIdSchema } from "@/domain/common";
import { photoSlotIdSchema } from "@/domain/school";

function id(value: string): string {
  return documentIdSchema.parse(value);
}

function cycleId(value: string): string {
  return cycleIdSchema.parse(value);
}

export const firestoreCollections = {
  schools: "schools",
  schoolFieldProfiles: "schoolFieldProfiles",
  salesProfiles: "salesProfiles",
  salesVisits: "salesVisits",
  salesCycles: "salesCycles",
  employees: "employees",
  employeeDirectory: "employeeDirectory",
  authCredentials: "authCredentials",
  pinIndexes: "pinIndexes",
  pinReservations: "pinReservations",
  authz: "authz",
  zones: "zones",
  products: "products",
  communicationTags: "communicationTags",
  activityTags: "activityTags",
  searchCatalogs: "searchCatalogs",
  catalogMeta: "catalogMeta",
  exportJobs: "exportJobs",
  auditLogs: "auditLogs",
  neisSyncRuns: "neisSyncRuns",
  kakaoMatchReviews: "kakaoMatchReviews",
  appSettings: "appSettings",
  secureSettings: "secureSettings",
  requestLocks: "requestLocks",
  photoUploadSessions: "photoUploadSessions",
  photoUploadRateLimits: "photoUploadRateLimits",
} as const;

export const firestorePaths = {
  school: (schoolId: string) => `schools/${id(schoolId)}`,
  schoolPhotos: (schoolId: string) => `schools/${id(schoolId)}/photos`,
  schoolPhoto: (schoolId: string, slotId: string) =>
    `schools/${id(schoolId)}/photos/${photoSlotIdSchema.parse(slotId)}`,
  schoolFieldProfile: (schoolId: string) => `schoolFieldProfiles/${id(schoolId)}`,
  salesProfile: (schoolId: string) => `salesProfiles/${id(schoolId)}`,
  salesVisit: (visitId: string) => `salesVisits/${id(visitId)}`,
  salesCycle: (value: string) => `salesCycles/${cycleId(value)}`,
  salesAssignments: (value: string) => `salesCycles/${cycleId(value)}/assignments`,
  salesAssignment: (value: string, schoolId: string) =>
    `salesCycles/${cycleId(value)}/assignments/${id(schoolId)}`,
  employeeCycleStats: (value: string, employeeId: string) =>
    `salesCycles/${cycleId(value)}/employeeStats/${id(employeeId)}`,
  teamCycleStats: (value: string) => `salesCycles/${cycleId(value)}/stats/team`,
  employee: (employeeId: string) => `employees/${id(employeeId)}`,
  employeeDirectory: (employeeId: string) => `employeeDirectory/${id(employeeId)}`,
  authCredential: (employeeId: string) => `authCredentials/${id(employeeId)}`,
  pinIndex: (lookupKey: string) => `pinIndexes/${id(lookupKey)}`,
  pinReservation: (reservationId: string) => `pinReservations/${id(reservationId)}`,
  authz: (uid: string) => `authz/${id(uid)}`,
  zone: (zoneId: string) => `zones/${id(zoneId)}`,
  product: (productId: string) => `products/${id(productId)}`,
  communicationTag: (tagId: string) => `communicationTags/${id(tagId)}`,
  activityTag: (tagId: string) => `activityTags/${id(tagId)}`,
  searchCatalog: (catalogId: string) => `searchCatalogs/${id(catalogId)}`,
  catalogMeta: () => "catalogMeta/current",
  exportJob: (jobId: string) => `exportJobs/${id(jobId)}`,
  auditLog: (logId: string) => `auditLogs/${id(logId)}`,
  neisSyncRun: (runId: string) => `neisSyncRuns/${id(runId)}`,
  neisSyncChanges: (runId: string) => `neisSyncRuns/${id(runId)}/changes`,
  neisSyncChange: (runId: string, changeId: string) =>
    `neisSyncRuns/${id(runId)}/changes/${id(changeId)}`,
  kakaoMatchReview: (schoolId: string) => `kakaoMatchReviews/${id(schoolId)}`,
  publicAppSettings: () => "appSettings/public",
  secureSetting: (settingId: string) => `secureSettings/${id(settingId)}`,
  requestLock: (requestId: string) => `requestLocks/${id(requestId)}`,
  photoUploadSession: (uploadId: string) => `photoUploadSessions/${id(uploadId)}`,
} as const;

export const photoStoragePath = (
  schoolId: string,
  slotId: string,
  versionId: string,
  variant: "thumbnail.webp" | "preview.webp" | "original.webp",
) =>
  `schools/${id(schoolId)}/photos/${photoSlotIdSchema.parse(slotId)}/${id(versionId)}/${variant}`;
