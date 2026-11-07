import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { buildInventoryPhotoFixture } from "./build-inventory-photo-fixture";

export async function buildDeliveryPlanningFixture() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/delivery-planning.tsx", [{ name: "planning-isolation", setup(builder) {
    builder.onResolve({ filter: /^client-only$|firebase\/client$|customer-repository$/ }, (args) => ({ path: args.path, namespace: "planning-isolation" }));
    builder.onLoad({ filter: /.*/, namespace: "planning-isolation" }, ({ path }) => ({ loader: "ts", resolveDir: root,
      contents: path === "client-only" ? "export {};" : path.endsWith("customer-repository")
        ? `export const customerRepository={searchLocations:async(query)=>[{id:'preview',name:'예시 회사 출발지',address:query,point:{latitude:36.3,longitude:127.4}}]};`
        : `export function getFirebaseClientServices(){throw Error('Production services are disabled in this preview')}` }));
  } }]);
  const compiled = await postcss([tailwindcss()]).process(fixture.css, { from: fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)) });
  return { ...fixture, css: compiled.css };
}
