import { buildInventoryPhotoFixture } from "./build-inventory-photo-fixture";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

// Use the real viewer, image hook, upload panel and gestures. Only authenticated
// I/O is substituted; no production service is contacted.
export function buildDeliveryPhotoFixture() {
  return buildInventoryPhotoFixture("tests/e2e/fixtures/delivery-photo-pan-zoom.tsx", [{ name: "synthetic-delivery-io", setup(builder) {
    builder.onLoad({ filter: /[/\\]photo-pan-zoom\.tsx$/ }, async ({ path }) => ({
      loader: "tsx", resolveDir: dirname(path), contents: `${await readFile(path, "utf8")}\nwindow.__panZoomPrepared = true;`,
    }));
    builder.onResolve({ filter: /(?:delivery-photo-history-repository|delivery-photo-delete-repository|auth\/private-client-state)$/ }, (args) => ({ path: args.path, namespace: "delivery-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "delivery-fixture" }, ({ path }) => ({ loader: "js", contents:
      path.endsWith("delivery-photo-delete-repository") ? `export const deliveryPhotoDeleteRepository={remove:()=>new Promise((resolve,reject)=>window.addEventListener('fixture:delete-failed',()=>reject(Error('fixture deletion rejected')),{once:true}))};export const deliveryPhotoDeleteErrorKind=()=> 'temporary';`
        : path.endsWith("private-client-state") ? `export const registerPrivateBlobUrl=url=>url;export function forgetPrivateBlobUrl(url){window.__revokedPhotos.push(url);URL.revokeObjectURL(url);}`
          : `export const deliveryPhotoHistoryRepository={async load(id,variant){
            window.__evidenceLoads.push({id,variant});
            if(window.__delayEvidence)await new Promise(resolve=>window.addEventListener('fixture:release-evidence',resolve,{once:true}));
            if(window.__rejectEvidence)throw Error('fixture unavailable');
            const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(window.__fixtureImages[id]);await image.decode();
            const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);
            return new Promise((resolve,reject)=>canvas.toBlob(blob=>{canvas.width=canvas.height=0;blob?resolve(blob):reject(Error('fixture encoding failed'));},'image/webp',.88));
          }};export const deliveryPhotoHistoryErrorMessage=()=> '사진을 불러오지 못했어요.';` }));
  } }]);
}
