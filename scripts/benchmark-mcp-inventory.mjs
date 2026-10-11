// Synthetic only: no credentials, network, Firebase reads or business mutations.
// Run after npm run functions:build. Timings here are not production latency.
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { InventoryService } from "../functions/lib/inventory/inventory-service.js";
import { inventoryLocationMap, inventoryProductSchema } from "../functions/lib/inventory/inventory-contract.js";
import { defaultInventorySettings, inventoryCycle } from "../functions/lib/inventory/inventory-calendar.js";
import { McpQueries } from "../functions/lib/mcp/queries.js";
import { createMcpServer } from "../functions/lib/mcp/server.js";

const now = new Date("2026-10-12T03:00:00Z");
const rows = Array.from({ length: 490 }, (_, index) => inventoryProductSchema.parse({
  productId: `p${String(index).padStart(4, "0")}`, name: `합성 ${index === 480 ? "만두 쌀" : index === 489 ? "떡" : "상품"}`, manufacturer: "합성 제조사", specification: "1kg", origin: "국산",
  unitLabel: "봉", unitsPerBox: 8, defaultLocationId: "freezer1", companyId: "onnuri", status: "active", note: "", urgent: false,
  revision: 1, stockRevision: 1, hasHistory: true, quantityByLocation: { ...inventoryLocationMap(0), freezer1: index % 10 },
  nearestExpiryByLocation: { ...inventoryLocationMap(null), freezer1: "2026-10-15" }, lastCountByLocation: inventoryLocationMap(null), photo: null,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-12T01:00:00Z", createdBy: "synthetic", updatedBy: "synthetic",
}));
let pages = 0, catalogDocuments = 0, settingsReads = 0, latestEventQueries = 0, authorBatches = 0, authorDocuments = 0, includeAuthors = false;
const inventory = new InventoryService({}, () => now);
inventory.listActive = async (after) => {
  const remaining = rows.filter((product) => after === null || product.productId > after);
  pages++; catalogDocuments += Math.min(101, remaining.length);
  return { products: remaining.slice(0, 100), nextCursor: remaining.length > 100 ? remaining[99].productId : null };
};
inventory.context = async () => {
  settingsReads++; const settings = defaultInventorySettings(), today = "2026-10-12";
  return { settings, today, cycle: inventoryCycle(settings, today) };
};
inventory.lastQuantityMatches = async (ids) => {
  latestEventQueries += ids.length;
  return new Map(ids.map((id) => [id, includeAuthors ? {
    eventId: "10000000-0000-4000-8000-000000000000", productId: id, kind: "count_match", locationId: "freezer1",
    createdAt: "2026-10-09T02:00:00Z", cycleId: "week-2026-10-09", stockRevision: 1, actorEmployeeId: "synthetic-recorder",
  } : null]));
};
const actor = { uid: "synthetic", employeeId: "synthetic", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"], isAdmin: false };
const server = createMcpServer(actor, async () => {}, new McpQueries({}, inventory, {}, { namesByIds: async (ids) => {
  authorBatches++; authorDocuments += ids.length;
  return new Map(ids.map((id) => [id, "합성 기록자"]));
} }));
const client = new Client({ name: "synthetic-inventory-benchmark", version: "1" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport); await client.connect(clientTransport);
async function measure(action) {
  pages = 0; catalogDocuments = 0; settingsReads = 0; latestEventQueries = 0; authorBatches = 0; authorDocuments = 0;
  let calls = 0, responseBytes = 0;
  await action(async (name, args) => {
    calls++; const result = await client.callTool({ name, arguments: args });
    assert(!result.isError); responseBytes += Buffer.byteLength(JSON.stringify(result)); return result.structuredContent;
  });
  return { toolCalls: calls, catalogPages: pages, catalogDocuments, settingsReads, latestEventQueries, authorBatches, authorDocuments, responseBytes };
}
try {
  const terms = ["ㅁㄷ", "쌀", "떡"];
  const separate = await measure(async (call) => { for (const query of terms) await call("search_inventory_products", { query }); });
  const batch = await measure(async (call) => {
    const result = await call("search_inventory_products", { queries: terms });
    assert.deepEqual(result.products.map((product) => product.productId), ["p0480", "p0489"]);
  });
  const textJson = await measure(async (call) => { await call("search_inventory_products", { queries: terms, responseFormat: "json" }); });
  const fullCatalog = await measure(async (call) => {
    let afterId = null, count = 0;
    do { const result = await call("search_inventory_products", { query: "합성", afterId, limit: 100 }); count += result.products.length; afterId = result.nextCursor; } while (afterId);
    assert.equal(count, 490);
  });
  const overview = await measure(async (call) => {
    const result = await call("get_inventory_overview", { exampleLimit: 3 });
    assert.equal(result.counts.activeProducts, 490); assert.equal(result.page.complete, true);
  });
  assert.equal(separate.catalogPages, 15); assert.equal(batch.catalogPages, 5);
  assert.equal(separate.latestEventQueries, 3); assert.equal(batch.latestEventQueries, 2);
  assert(overview.latestEventQueries <= 9);
  assert(batch.responseBytes < textJson.responseBytes * .7);
  assert(overview.responseBytes < fullCatalog.responseBytes * .05);
  includeAuthors = true;
  const recorderBatch = await measure(async (call) => {
    const result = await call("search_inventory_products", { query: "합성", limit: 100 });
    assert.equal(result.products.length, 100);
    assert(result.products.every((p) => p.lastStocktake.actorName === "합성 기록자"));
  });
  assert.equal(recorderBatch.authorBatches, 1); assert.equal(recorderBatch.authorDocuments, 1);
  assert.equal(batch.authorBatches, 0);
  console.log(JSON.stringify({ note: "Synthetic 490 active products, no button events; latest-event queries include empty results (Firestore still charges a minimum query read). Catalog reads include lookahead. Excludes OAuth, billing and production latency; bytes are not token/currency costs.",
    separate, batch, textJson, fullCatalog, overview, recorderBatch }, null, 2));
} finally { await client.close(); await server.close(); }
