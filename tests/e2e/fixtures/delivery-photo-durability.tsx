import { createRoot } from "react-dom/client";
import { useRef, useSyncExternalStore } from "react";
import { DeliveryPhotoInputController, type DeliveryPhotoInputControllerHandle } from "../../../src/features/delivery-photos/delivery-photo-input-controller";
import { DeliveryPhotoUploadCoordinator } from "../../../src/features/delivery-photos/delivery-photo-upload-memory";
import DeliveryPhotoUploadPanel from "../../../src/features/delivery-photos/delivery-photo-upload-panel";
import { deliveryPhotoOutbox, type PhotoOutboxRecord } from "../../../src/features/delivery-photos/delivery-photo-outbox";
import type { DeliveryPhotoCreateInput } from "../../../src/features/delivery-photos/delivery-photo-create-repository";

const params = new URLSearchParams(location.search);
const delay = Number(params.get("readDelay") ?? 0);
const read = File.prototype.arrayBuffer;
const reads: Array<{ size: number; bytes?: number; error?: string }> = [];
const storageErrors: string[] = [];
const add = deliveryPhotoOutbox.add;
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
const coordinator = new DeliveryPhotoUploadCoordinator({ uid: "durability-user", displayName: "합성 직원", claims: {
  employeeId: "DURABILITY", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1,
} });
const names = new Map([["customer", { name: "합성 납품처" }]]);
export type PhotoDurabilityFixture = {
  coordinator: DeliveryPhotoUploadCoordinator;
  records: () => Promise<PhotoOutboxRecord[]>;
  requests: DeliveryPhotoCreateInput[];
  storageErrors: string[];
  reads: typeof reads;
};
declare global { interface Window { __photoDurability: PhotoDurabilityFixture } }
window.__photoDurability = { coordinator, requests: [], storageErrors, reads, records: async () => {
  const scope = await deliveryPhotoOutbox.activate(JSON.stringify(["durability-user", "DURABILITY", 1, 1]));
  return deliveryPhotoOutbox.list(scope);
} };
function Fixture() {
  const input = useRef<DeliveryPhotoInputControllerHandle>(null);
  const jobs = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
  return <main><button onClick={() => input.current?.openCamera("customer")}>납품사진 촬영</button>
    <DeliveryPhotoInputController ref={input} coordinator={coordinator} />
    <DeliveryPhotoUploadPanel coordinator={coordinator} jobs={jobs} names={names} />
  </main>;
}
void coordinator.ready.then((ready) => {
  if (!ready) throw Error("Fixture outbox did not open");
  createRoot(document.getElementById("root")!).render(<Fixture />);
});
