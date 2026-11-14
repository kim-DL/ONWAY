import { expect, it, vi } from "vitest";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import type { DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";

const harness = vi.hoisted(() => ({ jobs: [] as DeliveryPhotoUploadProjection[] }));
vi.mock("react", () => ({
  useState: (initial: unknown) => [initial, vi.fn()],
  useEffect: vi.fn(),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: () => harness.jobs,
}));
import { useDeliveryPhotoUploads } from "./use-delivery-photo-uploads";

it("keeps the newest card and retry while counting only pending photos for each customer", () => {
  const job = (jobId: string, customerId: string, status: DeliveryPhotoUploadProjection["status"], errorCategory: DeliveryPhotoUploadProjection["errorCategory"] = null, durable = true): DeliveryPhotoUploadProjection => ({
    jobId, customerId, status, errorCategory, durable, requestId: jobId, source: "camera", message: "", startedAt: 1, updatedAt: 1,
  });
  harness.jobs = [job("newest", "a", "completed"), job("retry-new", "a", "failed", "retryable"),
    job("retry-old", "a", "failed", "retryable"), job("auth", "a", "failed", "auth"),
    job("invalid", "b", "failed", "preparation", false), job("queued", "b", "queued"), job("paused", "c", "paused")];
  const session: AuthenticatedSession = { uid: "test", displayName: "합성 직원", claims: { employeeId: "test", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"] } };
  const result = useDeliveryPhotoUploads(session, () => undefined);
  expect([...result.byCustomer.values()].map(row => row.jobId)).toEqual(["newest", "invalid", "paused"]);
  expect([...result.pendingByCustomer]).toEqual([["a", 2], ["b", 1], ["c", 1]]);
  expect([...result.retryByCustomer.values()].map(row => row.jobId)).toEqual(["retry-new"]);
});
