// Synthetic SDK measurements only; no credentials, network, Firebase writes or billing estimates.
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CustomerService, nextCustomer } from "../functions/lib/customer/customer-service.js";
import { McpQueries } from "../functions/lib/mcp/queries.js";
import { createMcpServer } from "../functions/lib/mcp/server.js";

const rows = Array.from({ length: 490 }, (_, index) => nextCustomer(null, {
  requestId: "c3bc6631-22fb-4f14-b622-bb852652c891", customerId: null, expectedRevision: null, clearNotice: false,
  draft: { name: `합성거래처${index}`, district: "합성구", administrativeDong: "합성동", status: "active",
    officialAddress: "합성 공식 주소", deliveryAddress: "합성 하차 주소", deliveryPoint: { latitude: 36, longitude: 127 },
    contacts: [{ id: "synthetic-contact", name: "합성 담당", role: "납품 담당", phoneNumber: "01012345678", isPrimary: true }],
    accessPassword: "synthetic-door-secret", accessPasswordState: "registered", deliveryLocationDescription: "합성 납품 안내 ".repeat(100),
    noticeType: "changed", changeNote: "합성 변경 안내" },
}, `c${String(index).padStart(4, "0")}`, "synthetic-actor", "2026-10-01T00:00:00Z"));
const actor = { uid: "synthetic", employeeId: "synthetic", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"], isAdmin: false };
let catalogPages = 0, catalogDocuments = 0, detailReads = 0;
const customers = new CustomerService({});
customers.listSearch = async (after) => {
  const remaining = rows.filter((row) => after === null || row.customerId > after);
  catalogPages++; catalogDocuments += Math.min(251, remaining.length);
  return { customers: remaining.slice(0, 250).map(({ customerId, name, normalizedName, choseongName, status, district, administrativeDong }) =>
    ({ customerId, name, normalizedName, choseongName, status, district, administrativeDong })),
  nextCursor: remaining.length > 250 ? remaining[249].customerId : null };
};
customers.read = async (id, current) => { assert.equal(current, actor); detailReads++; return rows.find((row) => row.customerId === id) ?? null; };
const server = createMcpServer(actor, async () => {}, new McpQueries(customers, {}, {}, {}));
const client = new Client({ name: "synthetic-customer-benchmark", version: "1" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport); await client.connect(clientTransport);
async function measure(action) {
  catalogPages = 0; catalogDocuments = 0; detailReads = 0;
  let toolCalls = 0, responseBytes = 0;
  await action(async (name, args) => {
    toolCalls++; const result = await client.callTool({ name, arguments: args });
    assert(!result.isError); assert(!JSON.stringify(result).includes("synthetic-door-secret"));
    responseBytes += Buffer.byteLength(JSON.stringify(result)); return result.structuredContent;
  });
  return { toolCalls, catalogPages, catalogDocuments, detailReads, responseBytes };
}
try {
  const separate = await measure(async (call) => {
    const result = await call("search_customers", { query: "합성거래처489" });
    assert.equal(result.customers.length, 1);
    await call("get_customer_details", { customerId: result.customers[0].customerId });
  });
  const direct = await measure(async (call) => {
    const result = await call("get_customer_details", { query: "합성거래처489유통" });
    assert.equal(result.resolution, "resolved"); assert.equal(result.customer.name, "합성거래처489");
  });
  const textJson = await measure(async (call) => call("get_customer_details", { customerId: "c0489", responseFormat: "json" }));
  const knownId = await measure(async (call) => call("get_customer_details", { customerId: "c0489" }));
  const contactOnly = await measure(async (call) => {
    const result = await call("get_customer_details", { customerId: "c0489", sections: ["contacts"] });
    assert.equal(result.customer.delivery, null); assert.equal(result.customer.addresses, null);
    assert.equal(result.customer.contacts[0].phoneNumber, "010-1234-5678");
  });
  assert.equal(separate.toolCalls, 2); assert.equal(direct.toolCalls, 1);
  assert.equal(separate.catalogDocuments, 491); assert.equal(direct.catalogDocuments, 491);
  assert.equal(knownId.catalogDocuments, 0); assert.equal(knownId.detailReads, 1);
  assert(knownId.responseBytes < textJson.responseBytes * .7);
  assert(contactOnly.responseBytes < knownId.responseBytes * .5);
  console.log(JSON.stringify({ note: "Synthetic 490 customers. Catalog counts include lookahead; detailReads counts service calls, not Firebase canonical/OAuth checks. No latency, billing or token cost claim. Selecting sections reduces responses, not the existing full source document read.",
    separate, direct, textJson, knownId, contactOnly }, null, 2));
} finally { await client.close(); await server.close(); }
