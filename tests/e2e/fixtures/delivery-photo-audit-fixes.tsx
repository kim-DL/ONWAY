/* eslint-disable @next/next/no-img-element -- This fixture tests native blob URL loading and failures. */
import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import type { AuthenticatedSession } from "../../../src/features/auth/auth-context";
import { useDeliveryPhotoImage } from "../../../src/features/delivery-photos/use-delivery-photo-image";
import { useDeliveryPhotoData } from "../../../src/features/delivery-photos/use-delivery-photo-data";
import { DeliveryPhotoUploadCoordinator } from "../../../src/features/delivery-photos/delivery-photo-upload-memory";
import type { PhotoOutboxRecord } from "../../../src/features/delivery-photos/delivery-photo-outbox";

declare global {
  interface Window {
    __deliveryAuditMode: "image" | "data" | "upload";
    __deliveryAudit: {
      images: Array<{ photoId: string; resolve: (blob: Blob) => void; signal: AbortSignal }>;
      reads: Array<{ resolve: (count: number) => void; reject: (error: unknown) => void }>;
      calls: { route: number; day: number; today: number };
      revoked: string[]; errors: string[];
      records: PhotoOutboxRecord[];
      listReads: number; notifications: number; renders: number;
      ready: boolean;
      resolveImage: (index: number) => void;
    };
  }
}

const session: AuthenticatedSession = { uid: "audit-user", displayName: "합성 직원", claims: {
  employeeId: "audit-employee", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"],
} };
const audit: Window["__deliveryAudit"] = window.__deliveryAudit = {
  images: [], reads: [], calls: { route: 0, day: 0, today: 0 }, revoked: [], errors: [], records: [],
  listReads: 0, notifications: 0, renders: 0, ready: false,
  resolveImage: (index: number) => audit.images[index]!.resolve(new Blob([
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>',
  ], { type: "image/svg+xml" })),
};

function ImageFixture() {
  const [photoId, setPhotoId] = useState("photo-a");
  const image = useDeliveryPhotoImage(photoId, "evidence", session);
  return <main>
    <button onClick={() => setPhotoId(value => value === "photo-a" ? "photo-b" : "photo-a")}>사진 전환</button>
    <output aria-label="사진 상태">{image.status}</output>
    {image.url && <img src={image.url} alt="납품사진" onError={() => { audit.errors.push("broken-image"); image.fail(); }} />}
  </main>;
}

function DataFixture() {
  const data = useDeliveryPhotoData(session);
  return <main>
    <output aria-label="조회 중">{String(data.loading)}</output>
    <output aria-label="사진 수">{data.snapshot?.today.customers[0]?.count ?? "none"}</output>
    <output aria-label="조회 날짜">{data.snapshot?.today.deliveryDateKey ?? "none"}</output>
    <output aria-label="조회 오류">{data.error}</output>
    <button onClick={data.refresh}>다시 불러오기</button>
    <button onClick={() => data.accept(snapshot => ({ ...snapshot,
      today: { ...snapshot.today, customers: [{ customerId: "customer-a", count: 9, latest: null }] },
    }))}>서버 저장 반영</button>
  </main>;
}

function startUploads() {
  const unexpected = async () => { throw new Error("This fixture must not upload."); };
  const coordinator = new DeliveryPhotoUploadCoordinator(session, {
    prepare: unexpected, preparationMessage: () => "unexpected", create: unexpected, encode: unexpected,
    uuid: () => "audit-worker", now: () => Date.now(), maxConcurrentRelays: 2,
    store: {
      activate: async owner => ({ owner, token: "audit-only" }),
      list: async () => { audit.listReads++; return structuredClone(audit.records); },
      add: unexpected, save: unexpected, claim: unexpected,
      remove: async (_scope, id) => { audit.records = audit.records.filter(record => record.job.jobId !== id); },
      clear: async () => { audit.records = []; },
    },
  });
  function UploadFixture() {
    const jobs = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
    useLayoutEffect(() => { audit.renders++; });
    const job = jobs[0];
    return <main>
      <output aria-label="보관 사진 수">{jobs.length}</output>
      <output aria-label="보관 안내">{job?.message ?? ""}</output>
      <output aria-label="미리보기">{String(!!job && !!coordinator.getPreview(job.jobId))}</output>
      <output aria-label="접수 완료">{String(!!job && !!coordinator.peekConfirmed(job.jobId))}</output>
    </main>;
  }
  void coordinator.ready.then(ready => {
    audit.ready = ready;
    coordinator.subscribe(() => { audit.notifications++; });
    createRoot(document.getElementById("root")!).render(<UploadFixture />);
  });
}

if (window.__deliveryAuditMode === "upload") startUploads();
else createRoot(document.getElementById("root")!).render(window.__deliveryAuditMode === "image" ? <ImageFixture /> : <DataFixture />);
