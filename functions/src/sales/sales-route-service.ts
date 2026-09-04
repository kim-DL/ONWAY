import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminFirestore } from "../shared/firebase-admin.js";
import type { OptimizeSalesRouteInput } from "./sales-route-contract.js";
import { KakaoRouteRequestError, type RoadMatrixClient } from "./kakao-route-client.js";
import {
  createEstimatedRouteMatrix,
  optimizeSalesRouteOrder,
  routeMetric,
  type SalesRouteMetric,
  type SalesRouteNode,
} from "./sales-route-optimizer.js";

const assignmentSchema = z.object({
  schoolId: z.string(),
  assigneeIds: z.array(z.string()).min(1),
}).passthrough();
const schoolSchema = z.object({
  schoolId: z.string(),
  name: z.string().trim().min(1),
  operationalStatus: z.enum(["active", "inactiveCandidate", "inactive", "closed", "merged"]),
  location: z.object({
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    matchStatus: z.enum(["unmatched", "autoMatched", "needsReview", "confirmed", "failed"]),
  }).passthrough(),
}).passthrough();

export type SalesRouteActor = { uid: string; employeeId: string };

export class SalesRouteCycleError extends Error {}
export class SalesRoutePermissionError extends Error {}
export class SalesRouteSchoolError extends Error {}
export class SalesRouteLocationError extends Error {
  constructor(readonly schoolIds: string[]) {
    super("Some schools do not have trusted coordinates.");
  }
}

async function fillRoadMetrics(
  nodes: readonly SalesRouteNode[],
  matrix: ReturnType<typeof createEstimatedRouteMatrix>,
  client: RoadMatrixClient,
) {
  let nextIndex = 0;
  let haltExternalRequests = false;
  let roadMetricCount = 0;
  const worker = async () => {
    while (!haltExternalRequests) {
      const index = nextIndex;
      nextIndex += 1;
      const origin = nodes[index];
      if (!origin) return;
      const destinations = nodes.filter((node) => node.schoolId !== origin.schoolId);
      try {
        const roadMetrics = await client.loadFrom(origin, destinations);
        const row = matrix.get(origin.schoolId)!;
        for (const [schoolId, metric] of roadMetrics) {
          row.set(schoolId, metric);
          roadMetricCount += 1;
        }
      } catch (error) {
        if (error instanceof KakaoRouteRequestError && error.haltFurtherRequests) {
          haltExternalRequests = true;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, nodes.length) }, () => worker()));
  return roadMetricCount;
}

export class SalesRouteService {
  constructor(
    private readonly db: Firestore = getAdminFirestore(),
    private readonly roadClient?: RoadMatrixClient,
  ) {}

  async optimize(input: OptimizeSalesRouteInput, actor: SalesRouteActor) {
    const cycleRef = this.db.doc(`salesCycles/${input.cycleId}`);
    const settingsRef = this.db.doc("appSettings/public");
    const assignmentRefs = input.schoolIds.map((schoolId) => this.db.doc(`salesCycles/${input.cycleId}/assignments/${schoolId}`));
    const schoolRefs = input.schoolIds.map((schoolId) => this.db.doc(`schools/${schoolId}`));
    const [cycleSnapshot, settingsSnapshot, assignmentSnapshots, schoolSnapshots] = await Promise.all([
      cycleRef.get(),
      settingsRef.get(),
      this.db.getAll(...assignmentRefs),
      this.db.getAll(...schoolRefs),
    ]);

    if (
      !cycleSnapshot.exists
      || cycleSnapshot.get("status") !== "active"
      || !settingsSnapshot.exists
      || settingsSnapshot.get("currentSalesCycleId") !== input.cycleId
    ) {
      throw new SalesRouteCycleError();
    }
    if (assignmentSnapshots.some((snapshot) => !snapshot.exists)) throw new SalesRouteSchoolError();
    const assignments = assignmentSnapshots.map((snapshot) => assignmentSchema.parse(snapshot.data()));
    if (assignments.some((assignment) => !assignment.assigneeIds.includes(actor.employeeId))) {
      throw new SalesRoutePermissionError();
    }
    if (schoolSnapshots.some((snapshot) => !snapshot.exists)) throw new SalesRouteSchoolError();
    const schools = schoolSnapshots.map((snapshot) => schoolSchema.parse(snapshot.data()));
    const invalidLocationSchoolIds = schools.flatMap((school) => (
      school.operationalStatus !== "active"
      || !["confirmed", "autoMatched"].includes(school.location.matchStatus)
      || school.location.latitude === null
      || school.location.longitude === null
    ) ? [school.schoolId] : []);
    if (invalidLocationSchoolIds.length > 0) throw new SalesRouteLocationError(invalidLocationSchoolIds);

    const nodes: SalesRouteNode[] = schools.map((school) => ({
      schoolId: school.schoolId,
      name: school.name,
      latitude: school.location.latitude!,
      longitude: school.location.longitude!,
    }));
    const matrix = createEstimatedRouteMatrix(nodes);
    const roadMetricCount = this.roadClient
      ? await fillRoadMetrics(nodes, matrix, this.roadClient)
      : 0;
    const orderedSchoolIds = optimizeSalesRouteOrder(nodes, input.startSchoolId, matrix);
    const nodeById = new Map(nodes.map((node) => [node.schoolId, node]));
    const legs = orderedSchoolIds.slice(1).map((schoolId, index) =>
      routeMetric(matrix, orderedSchoolIds[index]!, schoolId)
    );
    const roadLegCount = legs.filter((metric) => metric.source === "road").length;
    const calculationMode = roadLegCount === legs.length
      ? "road" as const
      : roadMetricCount === 0
        ? "distanceEstimate" as const
        : "hybrid" as const;
    const metrics: SalesRouteMetric[] = [];
    for (const row of matrix.values()) metrics.push(...row.values());

    return {
      cycleId: input.cycleId,
      calculationMode,
      orderedSchoolIds,
      stops: orderedSchoolIds.map((schoolId, index) => {
        const node = nodeById.get(schoolId)!;
        return {
          ...node,
          position: index + 1,
          fromPrevious: index === 0 ? null : routeMetric(matrix, orderedSchoolIds[index - 1]!, schoolId),
        };
      }),
      metrics,
      totalDistanceMeters: legs.reduce((total, metric) => total + metric.distanceMeters, 0),
      totalDurationSeconds: legs.reduce((total, metric) => total + metric.durationSeconds, 0),
      warning: calculationMode === "road"
        ? null
        : calculationMode === "hybrid"
          ? "일부 구간은 도로 정보를 확인하지 못해 거리 추정치를 함께 사용했습니다."
          : "도로 정보를 확인하지 못해 좌표 간 거리로 방문 순서를 계산했습니다.",
    };
  }
}

