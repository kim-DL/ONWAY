import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], stateCursor: 0, refs: [] as Array<{ current: unknown }>, refCursor: 0,
  remove: vi.fn(), onDeleted: vi.fn(),
}));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.stateCursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function"
      ? (next as (value: unknown) => unknown)(harness.states[index]) : next; }];
  },
  useRef: (initial: unknown) => {
    const index = harness.refCursor++;
    harness.refs[index] ??= { current: initial };
    return harness.refs[index];
  },
  useEffect: vi.fn(),
}));
vi.mock("./delivery-photo-delete-repository", () => ({
  deliveryPhotoDeleteRepository: { remove: harness.remove },
  deliveryPhotoDeleteErrorKind: (error: unknown) => (error as { kind?: string }).kind ?? "temporary",
}));

import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { DeliveryPhotoDeleteAction } from "./delivery-photo-delete-action";

const photo: DeliveryPhotoMetadata = { photoId: "10000000-0000-4000-8000-000000000001", customerId: "customer-a",
  deliveryDateKey: "2026-09-24", source: "camera", createdAt: "2026-09-24T01:42:00.000Z",
  createdByEmployeeId: "employee_1", createdByName: "홍길동", expiresAt: "2026-10-01T01:42:00.000Z",
  thumbnail: { width: 640, height: 480 } };
const session: AuthenticatedSession = { uid: "uid_1", displayName: "홍길동",
  claims: { employeeId: "employee_1", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"] } };

function render(currentPhoto = photo, currentSession = session) {
  harness.stateCursor = 0; harness.refCursor = 0;
  return DeliveryPhotoDeleteAction({ photo: currentPhoto, session: currentSession, onDeleted: harness.onDeleted });
}
type TestElement = ReactElement<{ children?: ReactNode; onClick?: () => void; role?: string; variant?: string }>;
function find(node: ReactNode, predicate: (element: TestElement) => boolean): TestElement | null {
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as TestElement;
  if (predicate(element)) return element;
  for (const child of Array.isArray(element.props.children) ? element.props.children : [element.props.children]) {
    const match = find(child, predicate); if (match) return match;
  }
  return null;
}
async function settle() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T03:00:00.000Z"));
  harness.states = []; harness.refs = []; harness.stateCursor = 0; harness.refCursor = 0;
  harness.remove.mockReset(); harness.onDeleted.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

function openConfirmation() {
  find(render(), (element) => element.props.children === "사진 삭제")!.props.onClick?.();
  return render();
}

describe("delivery photo delete confirmation", () => {
  it("keeps the action out of the DOM unless the current owner or verified admin is eligible", () => {
    expect(find(render(), (element) => element.props.children === "사진 삭제")).not.toBeNull();
    expect(render({ ...photo, deliveryDateKey: "2026-09-23" })).toBeNull();
    expect(render({ ...photo, createdByEmployeeId: "employee_2" })).toBeNull();
    const admin = { ...session, claims: { ...session.claims, employeeId: "admin_1", roleScopes: ["admin" as const],
      adminApproved: true, signInProvider: "google.com" as const } };
    expect(find(render({ ...photo, createdByEmployeeId: "employee_2" }, admin), (element) => element.props.children === "사진 삭제")).not.toBeNull();
  });

  it("cancels without a write and collapses rapid activation into one request", async () => {
    const initial = openConfirmation();
    find(initial, (element) => element.props.children === "취소")?.props.onClick?.();
    expect(harness.remove).not.toHaveBeenCalled();

    let reject!: (error: unknown) => void;
    harness.remove.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const remove = find(openConfirmation(), (element) => element.props.variant === "danger")!;
    remove.props.onClick?.(); remove.props.onClick?.();
    expect(harness.remove).toHaveBeenCalledOnce();
    reject({ kind: "temporary" }); await settle();
    expect(JSON.stringify(find(render(), (element) => element.props.role === "alert"))).toContain("삭제하지 못했습니다. 다시 시도해 주세요.");
  });

  it("retries the same logical delete with the same requestId and reconciles only after success", async () => {
    harness.remove.mockRejectedValueOnce({ kind: "temporary" }).mockResolvedValueOnce({ photoId: photo.photoId, deletedAt: "2026-09-24T02:00:00.000Z" });
    find(openConfirmation(), (element) => element.props.variant === "danger")!.props.onClick?.(); await settle();
    find(render(), (element) => element.props.variant === "danger")!.props.onClick?.(); await settle();
    expect(harness.remove).toHaveBeenCalledTimes(2);
    expect(harness.remove.mock.calls[1]?.[1]).toBe(harness.remove.mock.calls[0]?.[1]);
    expect(harness.onDeleted).toHaveBeenCalledWith(photo.photoId, expect.any(Function));
  });

  it("reconciles an already unavailable photo without presenting raw backend text", async () => {
    harness.remove.mockRejectedValueOnce({ kind: "unavailable", message: "raw sdk detail" });
    find(openConfirmation(), (element) => element.props.variant === "danger")!.props.onClick?.(); await settle();
    expect(harness.onDeleted).toHaveBeenCalledWith(photo.photoId, expect.any(Function));
    expect(JSON.stringify(render())).not.toContain("raw sdk detail");
  });
});
