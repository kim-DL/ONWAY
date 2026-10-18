import type { PhotoOutboxStore } from "./delivery-photo-outbox";

// Keep IndexedDB implementation outside the memory coordinator's entry.
// The first session activation loads it; browser module loading caches it.
export const lazyDeliveryPhotoOutbox: PhotoOutboxStore = {
  activate: (...args) => import("./delivery-photo-outbox").then((m) => m.deliveryPhotoOutbox.activate(...args)),
  list: (...args) => import("./delivery-photo-outbox").then((m) => m.deliveryPhotoOutbox.list(...args)),
  add: (...args) => import("./delivery-photo-outbox").then((m) => m.deliveryPhotoOutbox.add(...args)),
  save: (...args) => import("./delivery-photo-outbox").then((m) => m.deliveryPhotoOutbox.save(...args)),
  claim: (...args) => import("./delivery-photo-outbox").then((m) => m.deliveryPhotoOutbox.claim(...args)),
  remove: (...args) => import("./delivery-photo-outbox").then((m) => m.deliveryPhotoOutbox.remove(...args)),
  clear: (...args) => import("./delivery-photo-outbox").then((m) => m.deliveryPhotoOutbox.clear(...args)),
};
