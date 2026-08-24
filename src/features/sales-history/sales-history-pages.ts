import type { SalesVisit } from "@/domain/sales";

export function mergeVisitPages(current: SalesVisit[], incoming: SalesVisit[]) {
  const visits = new Map(current.map((visit) => [visit.visitId, visit]));
  for (const visit of incoming) visits.set(visit.visitId, visit);
  return [...visits.values()].toSorted((left, right) => {
    const dateDifference = right.visitedAt.getTime() - left.visitedAt.getTime();
    return dateDifference !== 0 ? dateDifference : right.visitId.localeCompare(left.visitId);
  });
}
