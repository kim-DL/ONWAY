import { buildInventoryPhotoFixture } from "./build-inventory-photo-fixture";

// Use the real viewer, image hook, upload panel and gestures. Only authenticated
// I/O and deletion are substituted; demo-emulator regression covers those paths.
export function buildDeliveryPhotoFixture() {
  return buildInventoryPhotoFixture("tests/e2e/fixtures/delivery-photo-pan-zoom.tsx", [{ name: "synthetic-delivery-io", setup(builder) {
    builder.onResolve({ filter: /(?:delivery-photo-history-repository|delivery-photo-delete-action|auth\/private-client-state)$/ }, (args) => ({ path: args.path, namespace: "delivery-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "delivery-fixture" }, ({ path }) => ({ loader: "js", contents:
      path.endsWith("delivery-photo-delete-action") ? "export const DeliveryPhotoDeleteAction=()=>null;"
        : path.endsWith("private-client-state") ? `export const registerPrivateBlobUrl=url=>url;export function forgetPrivateBlobUrl(url){window.__revokedPhotos.push(url);URL.revokeObjectURL(url);}`
          : `export const deliveryPhotoHistoryRepository={async load(id){window.__evidenceLoads.push(id);if(window.__rejectEvidence)throw Error('fixture unavailable');return new Blob([window.__fixtureImages[id]],{type:'image/svg+xml'});}};export const deliveryPhotoHistoryErrorMessage=()=> '사진을 불러오지 못했어요.';` }));
  } }]);
}
