"use client";

import "client-only";

import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { documentIdSchema } from "@/domain/common";
import {
  schoolFieldProfilePatchSchema,
  PHOTO_SLOT_IDS,
  type SchoolFieldProfilePatch,
} from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { peekCachedSalesWorkspace } from "@/features/sales-cycle/sales-workspace-cache";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { recordFirestoreReads } from "@/lib/performance/performance-monitor";
import {
  activityTagConverter,
  communicationTagConverter,
  employeeDirectoryConverter,
  productConverter,
  publicAppSettingsConverter,
  salesAssignmentConverter,
  salesCycleConverter,
  salesProfileConverter,
  schoolConverter,
  schoolFieldProfileConverter,
  schoolPhotoConverter,
} from "@/lib/firebase/firestore-converters";
import {
  createSchoolDetailCacheKey,
  readCachedSchoolDetail,
  writeCachedSchoolDetail,
  type CachedSchoolDetail,
} from "./school-detail-cache";

export type DetailRoleScope = "delivery" | "sales";

export type UpdateSchoolFieldProfileInput = {
  schoolId: string;
  expectedRevision: number;
  requestId: string;
  appVersion: string;
  patch: SchoolFieldProfilePatch;
};

export type UpdateSchoolFieldProfileResult = {
  revision: number;
  replayed: boolean;
};

export function createSchoolDetailSessionNamespace(
  session: AuthenticatedSession,
  roleScope: DetailRoleScope,
) {
  return `onnuriway:${session.claims.employeeId}:${roleScope}:${session.claims.sessionVersion}`;
}

async function fetchSalesDetail(sessionNamespace: string, schoolId: string) {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  const [settingsSnapshot, profileSnapshot, productsSnapshot, communicationTagsSnapshot, activityTagsSnapshot, employeesSnapshot] = await Promise.all([
    getDoc(doc(services.firestore, "appSettings", "public").withConverter(publicAppSettingsConverter)),
    getDoc(doc(services.firestore, "salesProfiles", schoolId).withConverter(salesProfileConverter)),
    getDocs(query(collection(services.firestore, "products").withConverter(productConverter), orderBy("displayOrder", "asc"))),
    getDocs(query(collection(services.firestore, "communicationTags").withConverter(communicationTagConverter), orderBy("displayOrder", "asc"))),
    getDocs(query(collection(services.firestore, "activityTags").withConverter(activityTagConverter), orderBy("displayOrder", "asc"))),
    getDocs(query(collection(services.firestore, "employeeDirectory").withConverter(employeeDirectoryConverter), orderBy("displayOrder", "asc"))),
  ]);
  recordFirestoreReads(
    "sales",
    2
      + productsSnapshot.size
      + communicationTagsSnapshot.size
      + activityTagsSnapshot.size
      + employeesSnapshot.size,
  );
  if (!settingsSnapshot.exists()) throw new Error("Public app settings are missing.");
  const activeCycleId = settingsSnapshot.data().currentSalesCycleId;
  const [assignmentSnapshot, activeCycleSnapshot] = await Promise.all([
    getDoc(doc(services.firestore, "salesCycles", activeCycleId, "assignments", schoolId).withConverter(salesAssignmentConverter)),
    getDoc(doc(services.firestore, "salesCycles", activeCycleId).withConverter(salesCycleConverter)),
  ]);
  recordFirestoreReads("sales", 2);
  const assignment = assignmentSnapshot.exists() ? assignmentSnapshot.data() : null;
  const employeeDirectory = employeesSnapshot.docs.map((snapshot) => snapshot.data());
  const workspace = peekCachedSalesWorkspace(sessionNamespace, activeCycleId);
  const salesEmployeeIds = new Set(
    workspace
      ? workspace.assignments.flatMap((candidate) => candidate.assigneeIds)
      : assignment?.assigneeIds ?? [],
  );
  return {
    activeCycleId,
    promotedProductNames: activeCycleSnapshot.exists() ? activeCycleSnapshot.data().promotedProductNames : [],
    assignment,
    profile: profileSnapshot.exists() ? profileSnapshot.data() : null,
    products: productsSnapshot.docs.map((snapshot) => snapshot.data()),
    communicationTags: communicationTagsSnapshot.docs.map((snapshot) => snapshot.data()),
    activityTags: activityTagsSnapshot.docs.map((snapshot) => snapshot.data()),
    employees: employeeDirectory
      .filter((employee) => employee.active && salesEmployeeIds.has(employee.employeeId)),
    employeeDirectory,
  };
}

async function fetchSchoolDetail(
  sessionNamespace: string,
  schoolId: string,
  roleScope: DetailRoleScope,
): Promise<CachedSchoolDetail> {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  const validSchoolId = documentIdSchema.parse(schoolId);
  const [schoolSnapshot, profileSnapshot, photoSnapshots, salesData] = await Promise.all([
    getDoc(doc(services.firestore, "schools", validSchoolId).withConverter(schoolConverter)),
    getDoc(doc(services.firestore, "schoolFieldProfiles", validSchoolId).withConverter(schoolFieldProfileConverter)),
    Promise.all(PHOTO_SLOT_IDS.map((slotId) => getDoc(
      doc(services.firestore, "schools", validSchoolId, "photos", slotId).withConverter(schoolPhotoConverter),
    ))),
    roleScope === "sales" ? fetchSalesDetail(sessionNamespace, validSchoolId) : Promise.resolve(null),
  ]);
  recordFirestoreReads("detail", 2 + photoSnapshots.length);
  if (!schoolSnapshot.exists()) throw new Error("School does not exist.");

  const photos = photoSnapshots
    .filter((snapshot) => snapshot.exists())
    .map((snapshot) => snapshot.data())
    .filter((photo) => photo.status === "active")
    .sort((left, right) => left.slotId.localeCompare(right.slotId));

  const detail: CachedSchoolDetail = {
    cacheKey: createSchoolDetailCacheKey(sessionNamespace, validSchoolId),
    sessionNamespace,
    schoolId: validSchoolId,
    school: schoolSnapshot.data(),
    fieldProfile: profileSnapshot.exists() ? profileSnapshot.data() : null,
    photos,
    salesData,
    cachedAt: Date.now(),
  };
  await writeCachedSchoolDetail(detail);
  return detail;
}

export class SchoolDetailRepository {
  readCached(sessionNamespace: string, schoolId: string) {
    return readCachedSchoolDetail(sessionNamespace, schoolId);
  }

  refresh(sessionNamespace: string, schoolId: string, roleScope: DetailRoleScope) {
    return fetchSchoolDetail(sessionNamespace, schoolId, roleScope);
  }

  async updateFieldProfile(input: UpdateSchoolFieldProfileInput) {
    const services = getFirebaseClientServices();
    if (!services) throw new Error("Firebase is not configured.");
    const callable = httpsCallable<UpdateSchoolFieldProfileInput, UpdateSchoolFieldProfileResult>(
      services.functions,
      "updateSchoolFieldProfile",
    );
    const response = await callable({
      ...input,
      schoolId: documentIdSchema.parse(input.schoolId),
      patch: schoolFieldProfilePatchSchema.parse(input.patch),
    });
    return response.data;
  }
}

export const schoolDetailRepository = new SchoolDetailRepository();
