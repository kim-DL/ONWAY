import { createRoot } from "react-dom/client";
import { DeliveryPhotoWorkspace } from "../../../src/features/delivery-photos/delivery-photo-workspace";
import { deliveryPhotoOutbox } from "../../../src/features/delivery-photos/delivery-photo-outbox";
import { deliveryPhotoDateKey } from "../../../src/features/delivery-photos/delivery-photo-memory";
import { deliveryPhotoUploadNamespace } from "../../../src/features/delivery-photos/delivery-photo-upload-memory";
import { customers, session } from "./customer-ceramic-data";

const customerId = customers[0]!.customerId;
const params = new URLSearchParams(location.search);
async function seed(file: File) {
  const owner = deliveryPhotoUploadNamespace(session);
  const scope = await deliveryPhotoOutbox.activate(owner);
  const requestId = crypto.randomUUID();
  await deliveryPhotoOutbox.add(scope, { version: 1, owner, source: file, prepared: null, lease: null, confirmed: null,
    approvedDay: deliveryPhotoDateKey(new Date(Date.now() - (params.has("failed") ? 0 : 86_400_000))),
    job: { jobId: requestId, requestId, customerId, source: "album", status: params.has("failed") ? "failed" : "preparing",
      errorCategory: params.has("failed") ? "storage" : null,
      startedAt: Date.now(), updatedAt: Date.now(), message: "", durable: true } });
  document.querySelector("output")!.textContent = requestId;
}
createRoot(document.getElementById("root")!).render(params.has("seed")
  ? <><input type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void seed(file); }} /><output /></>
  : <DeliveryPhotoWorkspace session={session} requestedCustomerId={params.has("detail") ? customerId : undefined} />);
