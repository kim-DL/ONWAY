import { createRoot } from "react-dom/client";
import { useRef, useState, useSyncExternalStore } from "react";
import { DeliveryPhotoInputController, type DeliveryPhotoInputControllerHandle } from "../../../src/features/delivery-photos/delivery-photo-input-controller";
import { getDeliveryPhotoUploadCoordinator, type DeliveryPhotoUploadCoordinator } from "../../../src/features/delivery-photos/delivery-photo-upload-memory";
import { useDeliveryPhotoUploads } from "../../../src/features/delivery-photos/use-delivery-photo-uploads";
import type { AuthenticatedSession } from "../../../src/features/auth/auth-context";
import DeliveryPhotoUploadPanel from "../../../src/features/delivery-photos/delivery-photo-upload-panel";
import { deliveryPhotoOutbox, type PhotoOutboxRecord } from "../../../src/features/delivery-photos/delivery-photo-outbox";
import type { DeliveryPhotoCreateInput } from "../../../src/features/delivery-photos/delivery-photo-create-repository";

const params = new URLSearchParams(location.search);
const delay = Number(params.get("readDelay") ?? 0);
const read = File.prototype.arrayBuffer;
const reads: Array<{ size: number; bytes?: number; error?: string }> = [];
const storageErrors: string[] = [];
const add = deliveryPhotoOutbox.add;
const activate = deliveryPhotoOutbox.activate;
let activationAttempts = 0;
deliveryPhotoOutbox.activate = async (...args) => {
  activationAttempts++;
  if (params.has("failOpenAlways") || params.has("failOpenOnce") && !sessionStorage.getItem("fixture-open-failed")) {
    sessionStorage.setItem("fixture-open-failed", "true"); throw new Error("Temporary fixture storage failure");
  }
  return activate(...args);
};
deliveryPhotoOutbox.add = async (...args) => {
  try {
    if (params.has("delayStore")) await new Promise((resolve) => setTimeout(resolve, 600));
    if (params.has("failStore")) throw new DOMException("Fixture storage full", "QuotaExceededError");
    return await add(...args);
  }
  catch (error) { storageErrors.push(String(error)); throw error; }
};
File.prototype.arrayBuffer = async function () {
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  try { const bytes = await read.call(this); reads.push({ size: this.size, bytes: bytes.byteLength }); return bytes; }
  catch (error) { reads.push({ size: this.size, error: String(error) }); throw error; }
};
const session: AuthenticatedSession = { uid: "durability-user", displayName: "합성 직원", claims: {
  employeeId: "DURABILITY", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1,
} };
const names = new Map([["customer", { name: "합성 납품처" }], ["other", { name: "다른 납품처" }]]);
export type PhotoDurabilityFixture = {
  coordinator: DeliveryPhotoUploadCoordinator;
  activationAttempts: number;
  records: () => Promise<PhotoOutboxRecord[]>;
  requests: DeliveryPhotoCreateInput[];
  storageErrors: string[];
  reads: typeof reads;
};
declare global { interface Window { __photoDurability: PhotoDurabilityFixture } }
window.__photoDurability = { get coordinator() { return getDeliveryPhotoUploadCoordinator(session); },
  get activationAttempts() { return activationAttempts; }, requests: [], storageErrors, reads, records: async () => {
  const scope = await deliveryPhotoOutbox.activate(JSON.stringify(["durability-user", "DURABILITY", 1, 1]));
  return deliveryPhotoOutbox.list(scope);
} };
function Fixture() {
  const coordinator = getDeliveryPhotoUploadCoordinator(session);
  const input = useRef<DeliveryPhotoInputControllerHandle>(null);
  const jobs = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
  return <main><button onClick={() => input.current?.openCamera("customer")}>납품사진 촬영</button>
    <button onClick={() => input.current?.openCamera("other")}>다른 납품처 촬영</button>
    <button onClick={() => input.current?.openAlbum("other")}>다른 납품처 앨범</button>
    <DeliveryPhotoInputController ref={input} coordinator={coordinator} jobs={jobs} names={names} />
    <DeliveryPhotoUploadPanel coordinator={coordinator} jobs={jobs} names={names} />
  </main>;
}
function RecoveryFixture() {
  const uploads = useDeliveryPhotoUploads(session, () => undefined, false);
  return <main>{uploads.storageError ? <button data-storage-failed onClick={() => window.location.reload()}>화면 다시 열기</button> : null}
    {uploads.ready ? <Fixture /> : <p>사진 보관 준비 중</p>}</main>;
}
function RecoveryWorkspace() {
  const [open, setOpen] = useState(true);
  return <><button onClick={() => setOpen(!open)}>납품사진 모드 전환</button>{open && <RecoveryFixture />}</>;
}
if (params.has("failOpenOnce") || params.has("failOpenAlways")) createRoot(document.getElementById("root")!).render(<RecoveryWorkspace />);
else void getDeliveryPhotoUploadCoordinator(session).ready.then((ready) => {
  if (!ready) throw Error("Fixture outbox did not open");
  createRoot(document.getElementById("root")!).render(<Fixture />);
});
