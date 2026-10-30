/* eslint-disable @next/next/no-img-element -- Inline synthetic images; no production service is contacted. */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DeliveryPhotoViewer } from "../../../src/features/delivery-photos/delivery-photo-viewer";
import DeliveryPhotoUploadPanel from "../../../src/features/delivery-photos/delivery-photo-upload-panel";
import type { DeliveryPhotoUploadCoordinator } from "../../../src/features/delivery-photos/delivery-photo-upload-memory";
import type { DeliveryPhotoUploadProjection } from "../../../src/features/delivery-photos/delivery-photo-upload-state";
import type { DeliveryPhotoMetadata } from "../../../src/domain/delivery-photo";

declare global { interface Window { __fixtureImages: Record<string, string>; __revokedPhotos: string[]; __evidenceLoads: string[]; __rejectEvidence: boolean; __delayEvidence: boolean } }
const ids = ["fed0b3f0-5b10-41d1-9bc3-e67d304fd283", "fed0b3f0-5b10-41d1-9bc3-e67d304fd284"];
const image = (label: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1800"><rect width="2400" height="1800" fill="#ecf4ef"/><path d="M0 900h2400M1200 0v1800" stroke="#567b68" stroke-width="8"/><rect x="300" y="400" width="1800" height="900" fill="#fff5dd" stroke="#264d39" stroke-width="15"/><text x="400" y="650" font-size="100">${label}</text><text x="400" y="900" font-size="70">SAMPLE DELIVERY · LOT 1234</text></svg>`;
window.__fixtureImages = Object.fromEntries(ids.map((id, index) => [id, image(`합성 납품사진 ${index + 1}`)]));
window.__revokedPhotos = []; window.__evidenceLoads = []; window.__rejectEvidence = false; window.__delayEvidence = false;
const url = `data:image/svg+xml,${encodeURIComponent(window.__fixtureImages[ids[0]!]!)}`;
const photos: DeliveryPhotoMetadata[] = ids.map((photoId) => ({ photoId, customerId: "fixture-customer", deliveryDateKey: "2026-10-18", source: "camera",
  createdAt: "2026-10-18T03:00:00.000Z", createdByEmployeeId: "fixture-employee", createdByName: "검증 담당", expiresAt: "2026-10-25T03:00:00.000Z", thumbnail: { width: 640, height: 480 } }));
const session = { uid: "fixture", displayName: "검증 담당", claims: { employeeId: "fixture-employee", roleScopes: ["delivery" as const], sessionVersion: 1, permissionsVersion: 1 } };
function Fixture() {
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const [completed, setCompleted] = useState(false);
  useEffect(() => { const confirm = () => setCompleted(true); window.addEventListener("fixture:server-confirmed", confirm); return () => window.removeEventListener("fixture:server-confirmed", confirm); }, []);
  const job: DeliveryPhotoUploadProjection = { jobId: "fixture-job", requestId: "fixture-request", customerId: "fixture-customer", source: "camera", status: completed ? "completed" : "uploading", errorCategory: null, message: "", startedAt: 1, updatedAt: 1, durable: true };
  const coordinator = { getPreview: () => ({ thumbnail: url, full: url }), getSnapshot: () => [job], canRetry: () => false } as unknown as DeliveryPhotoUploadCoordinator;
  return <main style={{ padding: 20 }}><h1>납품사진 Pan &amp; Zoom 검증</h1><p>저장된 사진과 촬영 대기 사진의 실제 UI, 합성 이미지와 I/O 대체를 사용하는 로컬 화면입니다.</p>
    <button onClick={(event) => setOrigin(event.currentTarget)} aria-label="저장된 납품사진 크게 보기"><img src={url} width="160" height="120" alt="합성 납품사진" /></button>
    <DeliveryPhotoUploadPanel coordinator={coordinator} jobs={[job]} names={new Map([["fixture-customer", { name: "샘플거래처" }]])} />
    {origin ? <DeliveryPhotoViewer customerName="샘플거래처" session={session} photos={photos} initialIndex={0} origin={origin} onClose={() => setOrigin(null)} onDeleted={() => {}} /> : null}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
