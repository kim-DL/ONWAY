import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { getAdminAuth, getAdminFirestore } from "../../src/shared/firebase-admin.js";
import { InventoryService } from "../../src/inventory/inventory-service.js";
import { INVENTORY_PRODUCT_PATH } from "../../src/inventory/inventory-contract.js";
import { InventoryRecordSearch, inventoryRecordInput } from "../../src/inventory/inventory-record-search.js";
import { inventoryChangeInput, McpInventoryWrites } from "../../src/mcp/inventory-write.js";
import { McpQueries } from "../../src/mcp/queries.js";
import { McpOAuth } from "../../src/mcp/oauth.js";
import { FirestoreMcpStore } from "../../src/mcp/store.js";
import { firebaseMcpIdentity, type McpPrincipal } from "../../src/mcp/authorization.js";
import { createMcpHttpApp } from "../../src/mcp/http.js";
import { inventoryToday } from "../../src/inventory/inventory-calendar.js";

const enabled = process.env.MCP_EMULATOR_TEST === "true";
describe.skipIf(!enabled)("MCP inventory approval and event search (demo only)", () => {
  const actor: McpPrincipal = { uid: `mcp-write-${randomUUID()}`, employeeId: "MCP-WRITES", roleScopes: ["delivery"],
    sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
  let db: ReturnType<typeof getAdminFirestore>, service: InventoryService, writes: McpInventoryWrites, oauth: McpOAuth, server: Server, origin: string;
  const productIds: string[] = [];
  let clock = Date.now();
  beforeAll(async () => {
    if (process.env.GCLOUD_PROJECT !== "demo-onnuriway" || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Demo required");
    db = getAdminFirestore(); service = new InventoryService(db); writes = new McpInventoryWrites(db, service, () => clock);
    await getAdminAuth().createUser({ uid: actor.uid });
    await db.doc(`employees/${actor.employeeId}`).set({ ...actor, firebaseUid: actor.uid, displayName: "합성 실사 직원", status: "active" });
    await db.doc(`authz/${actor.uid}`).set({ employeeId: actor.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 });
    server = createServer(); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const identity = firebaseMcpIdentity("demo-lookup", "demo-pepper", [actor.employeeId]);
    oauth = new McpOAuth({ origin, resource: `${origin}/mcp`, allowedRedirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"], emulator: true },
      new FirestoreMcpStore(db), { login: async () => actor, verify: identity.verify });
    server.on("request", createMcpHttpApp(oauth, () => "demo-source"));
  });
  afterAll(async () => {
    // Exact synthetic roots created by this suite, in the asserted demo project only.
    if (db && process.env.GCLOUD_PROJECT === "demo-onnuriway" && process.env.FIRESTORE_EMULATOR_HOST) {
      for (const id of productIds) await db.recursiveDelete(db.doc(`${INVENTORY_PRODUCT_PATH}/${id}`));
    }
    if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } });
  async function session(write = true) {
    const registered = await oauth.register({ redirect_uris: oauth.config.allowedRedirectUris });
    const verifier = randomBytes(32).toString("base64url");
    const flow = await oauth.begin({ response_type: "code", client_id: registered.client_id, redirect_uri: oauth.config.allowedRedirectUris[0],
      state: "demo-state", resource: oauth.config.resource, code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"), scope: write ? "geupsikgil:read geupsikgil:inventory.write" : "geupsikgil:read" });
    const redirect = new URL(await oauth.authorize({ flow: flow.flow, pin: "synthetic-only", consent: "allow" }, flow.browser, "demo", randomUUID()));
    const token = await oauth.token({ grant_type: "authorization_code", client_id: registered.client_id, code: redirect.searchParams.get("code"),
      redirect_uri: oauth.config.allowedRedirectUris[0], resource: oauth.config.resource, code_verifier: verifier });
    return { token, clientId: registered.client_id, authorization: await oauth.writeAuthorization(token.access_token) };
  }
  async function product(quantity = 19) {
    const product = await service.save({ requestId: randomUUID(), productId: null, expectedRevision: null,
      draft: { name: "합성 승인 상품", manufacturer: "합성", specification: "1kg", origin: "대한민국", unitLabel: "봉", unitsPerBox: 8,
        defaultLocationId: "freezer1", note: "", urgent: false },
      ...(quantity ? { initialStock: { quantity, lot: { label: "합성 묶음", expiryState: "dated" as const, expiryDate: "2026-12-31" } } } : {}) }, actor);
    productIds.push(product.productId);
    const detail = await service.detail(product.productId, actor);
    return { product, lot: detail.lots[0], ref: db.doc(`${INVENTORY_PRODUCT_PATH}/${product.productId}`) };
  }
  it.each(["count_match", "count_adjust", "receive", "issue", "adjust", "transfer", "update_lot"] as const)("previews %s without business writes and commits via the canonical service", async (action) => {
    const s = await session(), p = await product();
    const base = { productId: p.product.productId, locationId: "freezer1", reason: "합성 검증", action };
    const input = inventoryChangeInput.parse({ ...base,
      ...(action === "count_adjust" ? { counts: [{ lotId: p.lot!.lotId, quantity: 17 }] } : {}),
      ...(["receive", "issue", "adjust", "transfer"].includes(action) ? { quantity: 3, lotId: p.lot!.lotId } : {}),
      ...(action === "transfer" ? { toLocationId: "freezer2" } : {}),
      ...(action === "update_lot" ? { lotId: p.lot!.lotId, draft: { label: "수정 묶음", expiryState: "unknown", expiryDate: null } } : {}) });
    const before = await p.ref.get(); const oldEvents = await p.ref.collection("events").get();
    const preview = await writes.preview(input, actor, s.authorization);
    expect((await p.ref.get()).updateTime!.isEqual(before.updateTime!)).toBe(true);
    expect((await p.ref.collection("events").get()).size).toBe(oldEvents.size);
    expect((await db.doc(`companies/onnuri/inventoryRequests/${preview.approval.planId}`).get()).exists).toBe(false);
    expect((await db.doc(`auditLogs/inventory-${preview.approval.planId}`).get()).exists).toBe(false);
    expect(JSON.stringify(preview.summary)).not.toContain(preview.approval.approvalToken);
    const committed = await writes.commit(preview.approval, actor, s.authorization);
    expect(committed.quantityByLocation).toEqual(preview.summary.after);
    expect(committed.kind).toBe(action === "update_lot" ? "lot_update" : action);
    expect((await p.ref.collection("events").get()).size).toBe(oldEvents.size + 1);
    expect((await db.doc(`auditLogs/inventory-${preview.approval.planId}`).get()).exists).toBe(true);
    const second = await writes.commit(preview.approval, actor, s.authorization);
    expect(second.replayed).toBe(true); expect((await p.ref.collection("events").get()).size).toBe(oldEvents.size + 1);
  }, 30_000);
  it("serializes simultaneous approvals and retains permanent retry protection past preview expiry", async () => {
    const s = await session(), p = await product();
    const preview = await writes.preview(inventoryChangeInput.parse({ action: "issue", productId: p.product.productId, locationId: "freezer1", quantity: 2 }), actor, s.authorization);
    const results = await Promise.all([writes.commit(preview.approval, actor, s.authorization), writes.commit(preview.approval, actor, s.authorization)]);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect((await p.ref.get()).get("quantityByLocation.freezer1")).toBe(17);
    clock += 6 * 60_000;
    try { expect((await writes.commit(preview.approval, actor, s.authorization)).replayed).toBe(true); } finally { clock -= 6 * 60_000; }
  }, 30_000);
  it("rejects expiry, wrong capability, different session, missing write consent and viewer without mutation", async () => {
    const s = await session(), read = await session(false), other = await session(), p = await product(0);
    const input = inventoryChangeInput.parse({ action: "count_match", productId: p.product.productId, locationId: "freezer1" });
    const preview = await writes.preview(input, actor, s.authorization); const before = await p.ref.get();
    await expect(writes.commit({ ...preview.approval, approvalToken: "a".repeat(43) }, actor, s.authorization)).rejects.toThrow();
    await expect(writes.commit(preview.approval, actor, other.authorization)).rejects.toThrow();
    await expect(writes.commit(preview.approval, actor, read.authorization)).rejects.toMatchObject({ details: { reason: "mcp-write-consent" } });
    await expect(writes.preview(input, { ...actor, roleScopes: ["viewer"] }, s.authorization)).rejects.toThrow();
    clock += 6 * 60_000;
    try { await expect(writes.commit(preview.approval, actor, s.authorization)).rejects.toMatchObject({ details: { reason: "mcp-preview-expired" } }); } finally { clock -= 6 * 60_000; }
    expect((await p.ref.get()).updateTime!.isEqual(before.updateTime!)).toBe(true);
  }, 30_000);
  it("rejects intervening metadata or another quantity-match even when stockRevision does not change", async () => {
    const s = await session(), p = await product();
    const input = inventoryChangeInput.parse({ action: "count_match", productId: p.product.productId, locationId: "freezer1" });
    const preview = await writes.preview(input, actor, s.authorization);
    const competing = await writes.preview(input, actor, s.authorization);
    await writes.commit(competing.approval, actor, s.authorization);
    expect((await p.ref.get()).get("stockRevision")).toBe(p.product.stockRevision);
    await expect(writes.commit(preview.approval, actor, s.authorization)).rejects.toMatchObject({ details: { reason: "mcp-preview-stale" } });
    const next = await writes.preview(input, actor, s.authorization);
    await p.ref.update({ name: "합성 이름 변경" });
    await expect(writes.commit(next.approval, actor, s.authorization)).rejects.toMatchObject({ details: { reason: "mcp-preview-stale" } });
  }, 30_000);
  it("checks session revocation in the stock transaction and keeps refreshed-family approvals valid", async () => {
    const s = await session(), p = await product();
    const preview = await writes.preview(inventoryChangeInput.parse({ action: "issue", productId: p.product.productId, locationId: "freezer1", quantity: 1 }), actor, s.authorization);
    const rotated = await oauth.token({ grant_type: "refresh_token", client_id: s.clientId, refresh_token: s.token.refresh_token, resource: oauth.config.resource });
    const fresh = await oauth.writeAuthorization(rotated.access_token);
    expect(fresh.binding).toBe(s.authorization.binding);
    await oauth.revoke({ token: rotated.access_token, client_id: s.clientId });
    await expect(writes.commit(preview.approval, actor, fresh)).rejects.toThrow("invalid_token");
    expect((await p.ref.get()).get("quantityByLocation.freezer1")).toBe(19);
  }, 30_000);
  it("uses official MCP HTTP contracts for read token preview, scope challenge and approved write", async () => {
    const p = await product(), s = await session(false);
    const connect = async (token: string) => {
      const client = new Client({ name: "synthetic-approval-ui", version: "1" });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }) as Transport);
      await client.listTools(); return client;
    };
    const readClient = await connect(s.token.access_token);
    try {
      const consent = await readClient.callTool({ name: "preview_inventory_change", arguments: { action: "count_match", productId: p.product.productId, locationId: "freezer1", requireWriteAccess: true } });
      expect(consent.isError).toBe(true); expect(consent._meta).toMatchObject({ error: { code: "WRITE_CONSENT_REQUIRED" } });
      expect(JSON.stringify(consent._meta)).toContain("insufficient_scope");
      const preview = await readClient.callTool({ name: "preview_inventory_change", arguments: { action: "count_match", productId: p.product.productId, locationId: "freezer1" } });
      expect(preview.isError).not.toBe(true); expect(preview.structuredContent).toMatchObject({ state: "awaiting_approval", canWrite: false });
      const approval = preview._meta!.inventoryApproval as Record<string, unknown>;
      expect(JSON.stringify([preview.content, preview.structuredContent])).not.toContain(approval.approvalToken);
      const denied = await readClient.callTool({ name: "commit_inventory_change", arguments: approval });
      expect(denied.isError).toBe(true); expect(denied._meta).toMatchObject({ error: { code: "WRITE_CONSENT_REQUIRED", retryable: false } });
    } finally { await readClient.close(); }
    const w = await session(), client = await connect(w.token.access_token);
    try {
      const preview = await client.callTool({ name: "preview_inventory_change", arguments: { action: "count_match", productId: p.product.productId, locationId: "freezer1" } });
      const result = await client.callTool({ name: "commit_inventory_change", arguments: preview._meta!.inventoryApproval as Record<string, unknown> });
      expect(result.isError).not.toBe(true); expect(result.structuredContent).toMatchObject({ state: "committed", kind: "count_match", replayed: false });
      const records = await client.callTool({ name: "search_inventory_records", arguments: { employeeName: "합성 실사", productId: p.product.productId,
        locationId: "freezer1", fromDate: inventoryToday(new Date()), throughDate: inventoryToday(new Date()), includeLines: true } });
      expect(records.isError).not.toBe(true); expect(records.structuredContent).toMatchObject({ resolution: "resolved", page: { returnedCount: 1, complete: true } });
      expect(JSON.stringify(records.structuredContent)).toContain("합성 실사 직원");
    } finally { await client.close(); }
  }, 30_000);
  it("queries original events by staff/location/date with stable paging, exact kinds and missing historical authors", async () => {
    const s = await session(), p = await product();
    const change = (action: "count_match" | "issue") => writes.preview(inventoryChangeInput.parse({ action, productId: p.product.productId,
      locationId: "freezer1", ...(action === "issue" ? { quantity: 1 } : {}) }), actor, s.authorization);
    for (const action of ["count_match", "issue", "count_match"] as const) await writes.commit((await change(action)).approval, actor, s.authorization);
    const filters = inventoryRecordInput.parse({ employeeId: actor.employeeId, productId: p.product.productId, locationId: "freezer1",
      fromDate: inventoryToday(new Date()), throughDate: inventoryToday(new Date()), limit: 1 });
    const records = new InventoryRecordSearch(db), first = await records.search(filters);
    expect(first.events[0]!.kind).toBe("count_match"); expect(first.nextCursor).not.toBeNull();
    const second = await records.search({ ...filters, after: first.nextCursor! });
    expect(second.events[0]!.kind).toBe("count_match"); expect(second.nextCursor).toBeNull();
    expect(second.events[0]!.eventId).not.toBe(first.events[0]!.eventId);
    await expect(records.search({ ...filters, kind: "all", after: first.nextCursor! })).rejects.toThrow();
    const queries = new McpQueries();
    const history = await queries.searchInventoryRecords({ ...filters, kind: "all", limit: 100, includeLines: true }, actor);
    expect(history.records!.map((r) => r.kind)).toEqual(["count_match", "issue", "count_match", "receive"]);
    const summary = await queries.searchInventoryRecords({ ...filters, kind: "all", limit: 100, includeRecords: false }, actor);
    expect(summary.records).toBeNull(); expect(summary.summary).toEqual(history.summary);
    expect(history.summary[0]).toMatchObject({ records: 4, quantityMatches: 2, distinctProducts: 1 });
    expect(history.records!.every((r) => r.recordedByName === "합성 실사 직원")).toBe(true);
    const record = first.events[0]!;
    const legacy = { ...record } as Record<string, unknown>; delete legacy.actorEmployeeId;
    const { Timestamp } = await import("firebase-admin/firestore"); legacy.createdAt = Timestamp.fromDate(new Date(record.createdAt));
    await p.ref.collection("events").doc(record.eventId).set(legacy);
    const missing = await queries.searchInventoryRecords({ ...filters, employeeId: undefined, limit: 100 }, actor);
    expect(missing.records!.find((r) => r.eventId === record.eventId)).toMatchObject({ employeeId: null, recordedByName: null, actorNameSource: "unavailable" });
  }, 30_000);
});
