import { deliveryPhotoOutbox } from "../../../src/features/delivery-photos/delivery-photo-outbox";
import "../../../src/features/delivery-photos/photo.module.css";

export type PhotoStoreFixture = typeof deliveryPhotoOutbox;
declare global { interface Window { __photoStore: PhotoStoreFixture } }
window.__photoStore = deliveryPhotoOutbox;
