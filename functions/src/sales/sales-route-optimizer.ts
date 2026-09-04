export type SalesRouteNode = {
  schoolId: string;
  name: string;
  latitude: number;
  longitude: number;
};

export type SalesRouteMetric = {
  fromSchoolId: string;
  toSchoolId: string;
  distanceMeters: number;
  durationSeconds: number;
  source: "road" | "distanceEstimate";
};

export type SalesRouteMatrix = Map<string, Map<string, SalesRouteMetric>>;

const EARTH_RADIUS_METERS = 6_371_000;
const ESTIMATED_ROAD_FACTOR = 1.25;
const ESTIMATED_SPEED_METERS_PER_SECOND = 30_000 / 3_600;

function radians(degrees: number) {
  return degrees * Math.PI / 180;
}

export function estimateRouteMetric(from: SalesRouteNode, to: SalesRouteNode): SalesRouteMetric {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const straightDistance = 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
  const distanceMeters = Math.max(1, Math.round(straightDistance * ESTIMATED_ROAD_FACTOR));
  return {
    fromSchoolId: from.schoolId,
    toSchoolId: to.schoolId,
    distanceMeters,
    durationSeconds: Math.max(1, Math.round(distanceMeters / ESTIMATED_SPEED_METERS_PER_SECOND)),
    source: "distanceEstimate",
  };
}

export function createEstimatedRouteMatrix(nodes: readonly SalesRouteNode[]): SalesRouteMatrix {
  const matrix: SalesRouteMatrix = new Map();
  for (const from of nodes) {
    const row = new Map<string, SalesRouteMetric>();
    for (const to of nodes) {
      if (from.schoolId !== to.schoolId) row.set(to.schoolId, estimateRouteMetric(from, to));
    }
    matrix.set(from.schoolId, row);
  }
  return matrix;
}

export function routeMetric(matrix: SalesRouteMatrix, fromSchoolId: string, toSchoolId: string) {
  const metric = matrix.get(fromSchoolId)?.get(toSchoolId);
  if (!metric) throw new Error(`Missing route metric: ${fromSchoolId} -> ${toSchoolId}`);
  return metric;
}

export function routeDuration(order: readonly string[], matrix: SalesRouteMatrix) {
  let duration = 0;
  for (let index = 1; index < order.length; index += 1) {
    duration += routeMetric(matrix, order[index - 1]!, order[index]!).durationSeconds;
  }
  return duration;
}

function nearestNeighborOrder(
  nodes: readonly SalesRouteNode[],
  startSchoolId: string,
  matrix: SalesRouteMatrix,
) {
  const remaining = new Map(nodes.map((node) => [node.schoolId, node]));
  const start = remaining.get(startSchoolId);
  if (!start) throw new Error("The starting school is missing from the route nodes.");
  remaining.delete(startSchoolId);
  const order = [startSchoolId];

  while (remaining.size > 0) {
    const current = order.at(-1)!;
    const next = [...remaining.values()].sort((left, right) => {
      const durationDifference = routeMetric(matrix, current, left.schoolId).durationSeconds
        - routeMetric(matrix, current, right.schoolId).durationSeconds;
      return durationDifference || left.name.localeCompare(right.name, "ko") || left.schoolId.localeCompare(right.schoolId);
    })[0]!;
    order.push(next.schoolId);
    remaining.delete(next.schoolId);
  }
  return order;
}

export function optimizeSalesRouteOrder(
  nodes: readonly SalesRouteNode[],
  startSchoolId: string,
  matrix: SalesRouteMatrix,
) {
  let bestOrder = nearestNeighborOrder(nodes, startSchoolId, matrix);
  let bestDuration = routeDuration(bestOrder, matrix);
  let improved = true;

  // A deterministic 2-opt pass removes obvious crossings while always keeping
  // the employee-selected first school fixed.
  while (improved) {
    improved = false;
    for (let fromIndex = 1; fromIndex < bestOrder.length - 1; fromIndex += 1) {
      for (let toIndex = fromIndex + 1; toIndex < bestOrder.length; toIndex += 1) {
        const candidate = [
          ...bestOrder.slice(0, fromIndex),
          ...bestOrder.slice(fromIndex, toIndex + 1).reverse(),
          ...bestOrder.slice(toIndex + 1),
        ];
        const candidateDuration = routeDuration(candidate, matrix);
        if (candidateDuration < bestDuration) {
          bestOrder = candidate;
          bestDuration = candidateDuration;
          improved = true;
        }
      }
    }
  }
  return bestOrder;
}

