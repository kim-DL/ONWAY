import { fileURLToPath } from "node:url";
import { buildInventoryPhotoFixture } from "./build-inventory-photo-fixture";

export function buildInventorySettingsFixture() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const data = JSON.stringify(fileURLToPath(new URL("../e2e/fixtures/inventory-settings-data.ts", import.meta.url)));
  return buildInventoryPhotoFixture("tests/e2e/fixtures/inventory-settings.tsx", [{ name: "inventory-settings-isolation", setup(builder) {
    builder.initialOptions.define = { ...builder.initialOptions.define, "process.env": "{}", "process.env.NEXT_PUBLIC_ENABLE_INVENTORY": '"true"' };
    builder.onResolve({ filter: /inventory-repository$/ }, () => ({ path: "repository", namespace: "inventory-settings" }));
    builder.onResolve({ filter: /auth-context$/ }, () => ({ path: "auth", namespace: "inventory-settings" }));
    builder.onResolve({ filter: /pwa-provider$/ }, () => ({ path: "pwa", namespace: "inventory-settings" }));
    builder.onLoad({ filter: /.*/, namespace: "inventory-settings" }, ({ path }) => ({ loader: "js", resolveDir: root, contents:
      path === "repository" ? `export {inventoryRepository,inventoryErrorMessage} from ${data}` :
      path === "auth" ? `import {session} from ${data};export function useAuth(){return {state:{status:'authenticated',session},logout:async()=>{document.documentElement.dataset.logoutRequests=String(Number(document.documentElement.dataset.logoutRequests||0)+1);if(new URLSearchParams(location.search).has('logout-fail'))throw Error('fixture logout failure');}}}` :
      `export function usePwa(){return {installState:'installed',isOnline:true,install:async()=>{}}}`,
    }));
  } }]);
}
