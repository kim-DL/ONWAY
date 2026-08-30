"use client";

import "client-only";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { recordFirestoreReads } from "@/lib/performance/performance-monitor";
import {
  employeeDirectoryConverter,
  publicAppSettingsConverter,
  salesAssignmentConverter,
  salesCycleConverter,
  salesZoneConverter,
  schoolConverter,
} from "@/lib/firebase/firestore-converters";
import {
  cachedSalesWorkspaceSchema,
  createSalesWorkspaceCacheKey,
  type CachedSalesWorkspace,
} from "./sales-workspace-cache";

export class SalesWorkspaceSetupRequiredError extends Error {
  constructor() {
    super("An active sales cycle has not been prepared.");
    this.name = "SalesWorkspaceSetupRequiredError";
  }
}

export function createSalesSessionNamespace(session: AuthenticatedSession) {
  return `onnuriway:${session.claims.employeeId}:sales:${session.claims.sessionVersion}`;
}

async function loadSchools(schoolIds: readonly string[]) {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  const schools = [];
  for (let offset = 0; offset < schoolIds.length; offset += 20) {
    const snapshots = await Promise.all(
      schoolIds.slice(offset, offset + 20).map((schoolId) =>
        getDoc(doc(services.firestore, "schools", schoolId).withConverter(schoolConverter))
      ),
    );
    for (const snapshot of snapshots) {
      if (snapshot.exists()) schools.push(snapshot.data());
    }
    recordFirestoreReads("sales", snapshots.length);
  }
  return schools;
}

export async function loadSalesWorkspace(
  sessionNamespace: string,
  requestedCycleId?: string | null,
): Promise<CachedSalesWorkspace> {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");

  const [settingsSnapshot, cyclesSnapshot, zonesSnapshot, employeesSnapshot] = await Promise.all([
    getDoc(doc(services.firestore, "appSettings", "public").withConverter(publicAppSettingsConverter)),
    getDocs(query(
      collection(services.firestore, "salesCycles").withConverter(salesCycleConverter),
      orderBy("cycleId", "desc"),
      limit(18),
    )),
    getDocs(query(
      collection(services.firestore, "zones").withConverter(salesZoneConverter),
      orderBy("displayOrder", "asc"),
    )),
    getDocs(query(
      collection(services.firestore, "employeeDirectory").withConverter(employeeDirectoryConverter),
      orderBy("displayOrder", "asc"),
    )),
  ]);
  recordFirestoreReads(
    "sales",
    1 + cyclesSnapshot.size + zonesSnapshot.size + employeesSnapshot.size,
  );
  if (!settingsSnapshot.exists()) throw new SalesWorkspaceSetupRequiredError();
  const settings = settingsSnapshot.data();
  const cycles = cyclesSnapshot.docs.map((snapshot) => snapshot.data());
  const selectedCycleId = requestedCycleId ?? settings.currentSalesCycleId;
  const cycle = cycles.find((candidate) => candidate.cycleId === selectedCycleId);
  if (!cycle) {
    if (cycles.length === 0 && requestedCycleId == null) throw new SalesWorkspaceSetupRequiredError();
    throw new Error("Selected sales cycle is unavailable.");
  }

  const assignmentsSnapshot = await getDocs(
    collection(services.firestore, "salesCycles", selectedCycleId, "assignments")
      .withConverter(salesAssignmentConverter),
  );
  recordFirestoreReads("sales", assignmentsSnapshot.size);
  const assignments = assignmentsSnapshot.docs.map((snapshot) => snapshot.data());
  const schoolIds = [...new Set(assignments.map((assignment) => assignment.schoolId))];
  const schools = await loadSchools(schoolIds);

  return cachedSalesWorkspaceSchema.parse({
    cacheKey: createSalesWorkspaceCacheKey(sessionNamespace, selectedCycleId),
    sessionNamespace,
    currentCycleId: settings.currentSalesCycleId,
    selectedCycleId,
    cycles,
    cycle,
    assignments,
    schools,
    zones: zonesSnapshot.docs.map((snapshot) => snapshot.data()).filter((zone) => zone.active),
    employees: employeesSnapshot.docs.map((snapshot) => snapshot.data()).filter((employee) => employee.active),
    cachedAt: Date.now(),
  });
}
