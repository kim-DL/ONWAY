import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { buildInventoryPhotoFixture } from "./build-inventory-photo-fixture";

/** Real UI, isolated data boundaries. Shared by browser regression and local preview. */
export async function buildCustomerCeramicFixture(photosEnabled = true) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const data = JSON.stringify(fileURLToPath(new URL("../e2e/fixtures/customer-ceramic-data.ts", import.meta.url)));
  const inventoryData = JSON.stringify(fileURLToPath(new URL("../e2e/fixtures/inventory-settings-data.ts", import.meta.url)));
  const mocks: Record<string, string> = {
    "use-customers": `export {useCustomers} from ${data}`,
    "use-recent-customers": `export {useRecentCustomers} from ${data}`,
    "customer-repository": `export {customerRepository,customerErrorMessage} from ${data}`,
    "inventory-repository": `import {inventoryRepository as source,context} from ${inventoryData};import {blockedWrite} from ${data};export {inventoryErrorMessage} from ${inventoryData};export const inventoryRepository=new Proxy({...source,context:async()=>({...context,canWrite:false})},{get:(target,key)=>target[key]??blockedWrite});`,
    "use-delivery-photo-data": `export {useDeliveryPhotoData} from ${data}`,
    "use-delivery-photo-catalog": `export {useDeliveryPhotoCatalog} from ${data}`,
    "use-delivery-photo-uploads": `export {useDeliveryPhotoUploads} from ${data}`,
    "auth-context": `import {session,blockedWrite} from ${data};export function useAuth(){return {state:{status:'authenticated',session},logout:blockedWrite}}`,
    "pwa-provider": `export function usePwa(){return {installState:'installed',isOnline:true,install:async()=>{}}}`,
    "customer-map": `export function CustomerMap(){return <div role="status" style={{padding:24,background:'#eef2f5'}}>로컬 미리보기 · 지도 연결 없음</div>} export default CustomerMap;`,
    "delivery-photo-repository": `import {blockedWrite} from ${data};export const deliveryPhotoRepository=new Proxy({},{get:()=>blockedWrite});export const deliveryPhotoErrorKind=()=> 'unknown';`,
    "firebase-client": `export function getFirebaseClientServices(){throw Error('Network services are disabled in the local preview')} export function getFirebaseAuthIfInitialized(){return null}`,
  };
  const fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/customer-ceramic.tsx", [{ name: "customer-ceramic-isolation", setup(builder) {
    builder.initialOptions.define = { ...builder.initialOptions.define, "process.env": "{}", "process.env.NEXT_PUBLIC_ENABLE_INVENTORY": '"true"', "process.env.NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS": JSON.stringify(String(photosEnabled)) };
    builder.onResolve({ filter: /use-customers$|use-recent-customers$|customer-repository$|inventory-repository$|use-delivery-photo-data$|use-delivery-photo-catalog$|use-delivery-photo-uploads$|auth-context$|pwa-provider$|customer-map$|delivery-photo-repository$|firebase\/client$/ }, args => ({
      path: args.path.endsWith("firebase/client") ? "firebase-client" : args.path.split("/").at(-1)!, namespace: "customer-ceramic",
    }));
    builder.onLoad({ filter: /.*/, namespace: "customer-ceramic" }, ({ path }) => ({ loader: "tsx", resolveDir: root, contents: mocks[path]! }));
  } }]);
  // Apply the same Tailwind preflight as Next rather than requesting a bare CSS import in the browser.
  const compiled = await postcss([tailwindcss()]).process(fixture.css, { from: fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)) });
  return { ...fixture, css: compiled.css };
}
