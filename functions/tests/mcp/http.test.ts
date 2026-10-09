import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createMcpHttpApp } from "../../src/mcp/http.js";
import { McpQueries } from "../../src/mcp/queries.js";
import { fixture } from "./fixture.js";
import { PHOTO_VIEW_URI } from "../../src/mcp/photo-view.js";
import { INVENTORY_WRITE_VIEW_URI } from "../../src/mcp/inventory-write-view.js";
import { HttpsError } from "firebase-functions/v2/https";
import { observeRead } from "../../src/shared/read-observation.js";
import { stockProjection } from "../../src/mcp/queries.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { principal } from "./fixture.js";
import { inventoryLocationMap, inventoryProductSchema } from "../../src/inventory/inventory-contract.js";

const servers: Server[] = [];
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } });
const emptyLowStock = { products: [], nextCursor: null, threshold: 0, basis: "test",
  page: { returnedCount: 0, hasMore: false, complete: true, startedFromBeginning: true, pagesScanned: 1, recordsScanned: 0, stoppedBecause: "complete" as const } };
async function start(toolTimeoutMs = 20_000) {
  const server = createServer(); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const f = fixture(origin);
  const queries = new McpQueries();
  const low = vi.spyOn(queries, "lowStock").mockResolvedValue(emptyLowStock);
  vi.spyOn(queries, "photo").mockResolvedValue({ photoId: "c3bc6631-22fb-4f14-b622-bb852652c891", variant: "thumbnail",
    contentType: "image/webp", customerId: "synthetic-company", customerName: "합성 납품업체", createdByEmployeeId: "MCP-TEST", byteSize: 4, fileBase64: "UklGRg==", createdAt: "2026-10-07T03:56:00.000Z", createdByName: "합성 직원" });
  const gallery = vi.spyOn(queries, "customerGallery").mockResolvedValue({
    resolution: "resolved", candidates: [], searchPage: null, searchNextCursor: null, timeBasis: "photo_registered_at", employeeId: null,
    note: "합성 갤러리", initialPhoto: { photoId: "c3bc6631-22fb-4f14-b622-bb852652c891", variant: "thumbnail", contentType: "image/webp",
      customerId: "synthetic-company", customerName: "합성 납품업체", createdByEmployeeId: "MCP-TEST", byteSize: 4, fileBase64: "UklGRg==",
      createdAt: "2026-10-07T03:56:00.000Z", createdByName: "합성 직원" },
    customerId: "synthetic-company", customerName: "합성 납품업체", date: "2026-10-07", after: null,
    photos: [{ photoId: "c3bc6631-22fb-4f14-b622-bb852652c891", createdAt: "2026-10-07T03:56:00.000Z", createdByName: "합성 직원" }],
    nextCursor: null, page: { ...emptyLowStock.page, returnedCount: 1, recordsScanned: 1 }, retentionHours: 168, evidence: "합성 기준",
  });
  const metrics: Record<string, unknown>[] = [];
  server.on("request", createMcpHttpApp(f.oauth, (ip) => ip, queries, { metricSink: (value) => metrics.push(value), toolTimeoutMs }));
  return { ...f, origin, low, gallery, metrics, queries };
}
describe("Remote MCP over real HTTP", () => {
  it("returns an inventory photo through the official SDK with small metadata and the shared viewer", async () => {
    const f = await start(), { exchange } = await f.setup(), tokens = await f.oauth.token(exchange);
    const photo = vi.spyOn(f.queries, "inventoryPhoto").mockResolvedValue({
      resolution: "resolved", product: { productId: "synthetic", name: "합성 상품", manufacturer: "합성 제조사", specification: "1kg", status: "active" },
      candidates: [], searchPage: null, searchNextCursor: null, note: "등록된 상품 사진",
      image: { photoId: "c3bc6631-22fb-4f14-b622-bb852652c891", variant: "thumbnail", width: 600, height: 800,
        contentType: "image/webp", byteSize: 4, fileBase64: "UklGRg==" } });
    const client = new Client({ name: "inventory-photo", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${f.origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }) as Transport);
    try {
      const tool = (await client.listTools()).tools.find((item) => item.name === "get_inventory_photo")!;
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(tool._meta).toMatchObject({ "openai/outputTemplate": PHOTO_VIEW_URI });
      const result = await client.callTool({ name: "get_inventory_photo", arguments: { query: "합성 상품" } });
      expect(result.isError).not.toBe(true); expect(photo).toHaveBeenCalledOnce();
      expect(result.structuredContent).toMatchObject({ resolution: "resolved", product: { name: "합성 상품" }, photo: { variant: "thumbnail", sourceWidth: 600 } });
      expect(result.content).toContainEqual({ type: "image", data: "UklGRg==", mimeType: "image/webp" });
      expect(result._meta).toMatchObject({ inventoryPhoto: { productId: "synthetic", name: "합성 상품", variant: "thumbnail", data: "UklGRg==" } });
      await vi.waitFor(() => expect(f.metrics.find((metric) => metric.tool === "get_inventory_photo")).toMatchObject({ returnedCount: 1, complete: true }));
      expect(JSON.stringify(result.structuredContent)).not.toMatch(/UklGRg|storagePath|https:/);
      photo.mockResolvedValueOnce({ resolution: "no_photo", product: { productId: "synthetic", name: "합성 상품", manufacturer: "", specification: "", status: "active" },
        candidates: [], searchPage: null, searchNextCursor: null, image: null, note: "등록 사진 없음" });
      const empty = await client.callTool({ name: "get_inventory_photo", arguments: { productId: "synthetic" } });
      expect(empty.structuredContent).toMatchObject({ resolution: "no_photo", photo: null });
      expect(empty.content.every((item: { type: string }) => item.type !== "image")).toBe(true);
      expect(empty._meta).toMatchObject({ inventoryNotice: { message: "등록 사진 없음" } });
      photo.mockImplementationOnce(async () => { f.identity.verify.mockRejectedValueOnce(new Error("revoked")); throw new HttpsError("permission-denied", "revoked"); });
      expect((await client.callTool({ name: "get_inventory_photo", arguments: { productId: "synthetic" } })).isError).toBe(true);
    } finally { await client.close(); }
  });
  it("uses two live OAuth checks per HTTP tool request, without caching across calls or bypassing final revocation", async () => {
    const f = await start(), { exchange } = await f.setup(), token = await f.oauth.token(exchange);
    const client = new Client({ name: "authorization-budget", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${f.origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } } }) as Transport);
    try {
      await client.listTools();
      await vi.waitFor(() => expect(f.metrics.some((m) => m.rpcMethod === "notifications/initialized")).toBe(true));
      const order: string[] = [];
      f.identity.verify.mockImplementation(async () => { order.push("verify"); });
      f.low.mockImplementation(async () => { order.push("query"); return emptyLowStock; });
      for (let i = 0; i < 2; i++) {
        order.length = 0;
        expect((await client.callTool({ name: "list_low_stock", arguments: {} })).isError).not.toBe(true);
        expect(order).toEqual(["verify", "query", "verify"]);
      }
      order.length = 0;
      f.low.mockImplementationOnce(async () => {
        order.push("query"); await f.oauth.revoke({ token: token.access_token, client_id: exchange.client_id });
        return { ...emptyLowStock, basis: "DO-NOT-RELEASE" };
      });
      const revoked = await client.callTool({ name: "list_low_stock", arguments: {} });
      expect(revoked._meta).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
      expect(revoked.isError).toBe(true); expect(revoked.structuredContent).toBeUndefined();
      expect(JSON.parse((revoked.content as Array<{ text: string }>)[0]!.text)).toMatchObject({ status: "error", error: { code: "AUTH_REQUIRED", retryable: false } });
      expect(JSON.stringify(revoked)).not.toContain("DO-NOT-RELEASE");
      const calls = f.low.mock.calls.length;
      await expect(client.callTool({ name: "list_low_stock", arguments: {} })).rejects.toThrow();
      expect(f.low).toHaveBeenCalledTimes(calls);
    } finally { await client.close(); }
  });
  it("retains entry authorization for non-HTTP transports and consumes an HTTP grant only once", async () => {
    for (const requestAuthorized of [false, true]) {
      const verify = vi.fn(async () => {}), queries = new McpQueries();
      const read = vi.spyOn(queries, "lowStock").mockResolvedValue(emptyLowStock);
      const server = createMcpServer(principal, verify, queries, 20_000, requestAuthorized);
      const client = new Client({ name: "authorization-grant", version: "1" });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      await server.connect(st); await client.connect(ct);
      try {
        await client.callTool({ name: "list_low_stock", arguments: {} });
        expect(verify).toHaveBeenCalledTimes(requestAuthorized ? 1 : 2);
        verify.mockRejectedValueOnce(new HttpsError("unauthenticated", "revoked"));
        expect((await client.callTool({ name: "list_low_stock", arguments: {} })).isError).toBe(true);
        expect(read).toHaveBeenCalledTimes(1);
      } finally { await client.close(); await server.close(); }
    }
  });
  it("serves batch search, precise stocktake fields and compact results through the official SDK, with JSON fallback and revocation", async () => {
    const f = await start(), { exchange } = await f.setup(), tokens = await f.oauth.token(exchange);
    const product = stockProjection(inventoryProductSchema.parse({ productId: "synthetic-stock", name: "합성 만두", manufacturer: "합성", specification: "1kg", origin: "국산",
      unitLabel: "봉", unitsPerBox: 8, defaultLocationId: "freezer1", companyId: "onnuri", status: "active", note: "PRIVATE-NOTE", urgent: false,
      revision: 1, stockRevision: 2, hasHistory: true, quantityByLocation: { ...inventoryLocationMap(0), freezer1: 19 }, nearestExpiryByLocation: inventoryLocationMap(null),
      lastCountByLocation: { ...inventoryLocationMap(null), freezer1: { checkedAt: "2026-10-08T03:12:00Z", checkedBy: "PRIVATE-EMPLOYEE", cycleId: "week-2026-10-02", stockRevision: 1, changed: false, stockChangedSinceCount: true } },
      photo: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-09T01:00:00Z", createdBy: "test", updatedBy: "test" }),
      { eventId: "11a58c55-2d60-4806-b032-4feb76d0a1b6", productId: "synthetic-stock", kind: "count_match", actorEmployeeId: "SYNTHETIC-RECORDER", locationId: "freezer1",
        createdAt: "2026-10-08T02:00:00Z", cycleId: "week-2026-10-02", stockRevision: 1 }, "합성 확인자");
    const search = vi.spyOn(f.queries, "searchProductsBatch").mockResolvedValue({ products: [product], query: null,
      matches: [{ query: "만두", productIds: [product.productId] }, { query: "없는 품목", productIds: [] }], nextCursor: null,
      page: { ...emptyLowStock.page, returnedCount: 1, recordsScanned: 1 } });
    const detail = vi.spyOn(f.queries, "product").mockResolvedValue({ product, lots: null, lotsIncluded: false });
    const client = new Client({ name: "inventory-sdk-test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${f.origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }) as Transport);
    try {
      const args = { queries: ["만두", "없는 품목"] };
      const compact = await client.callTool({ name: "search_inventory_products", arguments: args });
      expect(compact.isError).not.toBe(true);
      expect(compact.structuredContent).toMatchObject({ products: [{ lastStocktake: { actorName: "합성 확인자", actorNameSource: "current_employee_directory" } }] });
      expect(search).toHaveBeenCalledWith(args.queries, null, 50);
      expect(compact.structuredContent).toMatchObject({ products: [{ totalQuantity: 19, lastStocktakeAt: "2026-10-08T02:00:00Z", lastStocktake: { kind: "count_match", createdAt: "2026-10-08T02:00:00Z" }, updatedAt: "2026-10-09T01:00:00Z",
        stocktakeByLocation: { freezer1: { stockChangedSinceCount: true } } }] });
      const json = await client.callTool({ name: "search_inventory_products", arguments: { ...args, responseFormat: "json" } });
      expect(json.content[0]).toMatchObject({ type: "text", text: JSON.stringify(json.structuredContent) });
      expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(json).length * .7);
      expect(JSON.stringify(compact)).not.toMatch(/PRIVATE-NOTE|PRIVATE-EMPLOYEE/);
      for (const invalid of [{ query: "만두", queries: ["만두"] }, { queries: [] }, { queries: ["만두", "만두"] }, { queries: Array.from({ length: 11 }, (_, i) => `term-${i}`) }]) {
        expect((await client.callTool({ name: "search_inventory_products", arguments: invalid })).isError).toBe(true);
      }
      expect(search).toHaveBeenCalledTimes(2);
      const summary = await client.callTool({ name: "get_inventory_product", arguments: { productId: product.productId, includeLots: false } });
      expect(summary.structuredContent).toMatchObject({ lots: null, lotsIncluded: false });
      expect(detail).toHaveBeenCalledWith(product.productId, expect.objectContaining({ employeeId: "MCP-TEST" }), false);
      search.mockImplementationOnce(async () => { f.identity.verify.mockRejectedValueOnce(new Error("revoked")); return { products: [product], query: null, matches: [], nextCursor: null, page: emptyLowStock.page }; });
      const revoked = await client.callTool({ name: "search_inventory_products", arguments: args });
      expect(revoked.isError).toBe(true); expect(JSON.stringify(revoked)).not.toContain(product.productId);
    } finally { await client.close(); }
  });
  it("publishes discovery and 401 challenge without exposing protected tools", async () => {
    const f = await start();
    const response = await fetch(`${f.origin}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("oauth-protected-resource/mcp");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await (await fetch(`${f.origin}/.well-known/oauth-protected-resource/mcp`)).json()).toMatchObject({ resource: `${f.origin}/mcp` });
    expect(await (await fetch(`${f.origin}/.well-known/oauth-authorization-server`)).json()).toMatchObject({
      issuer: f.origin, code_challenge_methods_supported: ["S256"], authorization_response_iss_parameter_supported: true,
    });
    expect(f.low).not.toHaveBeenCalled();
    const registration = await fetch(`${f.origin}/register`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: f.config.allowedRedirectUris }) });
    expect(registration.status).toBe(201);
    expect(await registration.json()).toMatchObject({ token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] });
  });
  it("completes form consent, SDK initialize/tools/list/tools/call and returns an MCP image", async () => {
    const f = await start(); const { request, exchange } = await f.setup();
    const authorize = await fetch(`${f.origin}/authorize?${new URLSearchParams(request)}`);
    const cookie = authorize.headers.get("set-cookie")!.split(";")[0]!;
    expect(authorize.headers.get("content-security-policy")).toContain("https://chatgpt.com");
    const page = await authorize.text();
    expect(page).toContain('type="password"');
    expect(page).not.toContain("test-only");
    const flow = /name="flow" value="([^"]+)"/.exec(page)![1]!;
    const consent = await fetch(`${f.origin}/authorize`, { method: "POST", redirect: "manual", headers: {
      "content-type": "application/x-www-form-urlencoded", origin: f.origin, cookie },
      body: new URLSearchParams({ flow, pin: "test-only", consent: "allow" }) });
    expect(consent.status).toBe(303);
    const callback = new URL(consent.headers.get("location")!);
    const result = await fetch(`${f.origin}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...exchange, code: callback.searchParams.get("code")! }) });
    expect(result.status).toBe(200);
    const tokens = await result.json() as { access_token: string };
    const transport = new StreamableHTTPClientTransport(new URL(`${f.origin}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    });
    const client = new Client({ name: "mcp-integration-test", version: "1.0.0" });
    await client.connect(transport as Transport);
    try {
      expect(client.getServerVersion()).toMatchObject({ title: "온누리종합식품",
        icons: [{ src: `${f.origin}/onnuri-icon-v1.png`, mimeType: "image/png", sizes: ["1254x1254"] }] });
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(17);
      expect(listed.tools.every((tool) => tool.outputSchema?.type === "object")).toBe(true);
      expect(listed.tools.filter((tool) => !["preview_inventory_change", "commit_inventory_change"].includes(tool.name)).every((tool) => tool.annotations?.readOnlyHint === true && tool.annotations.destructiveHint === false)).toBe(true);
      expect(listed.tools.find((tool) => tool.name === "get_delivery_photo")?._meta).toMatchObject({
        ui: { resourceUri: PHOTO_VIEW_URI, visibility: ["model", "app"] }, "openai/widgetAccessible": true });
      // ChatGPT rejects an app-only tool during connection unless its legacy output template is present.
      expect(listed.tools.find((tool) => tool.name === "commit_inventory_change")?._meta).toMatchObject({
        ui: { resourceUri: INVENTORY_WRITE_VIEW_URI, visibility: ["app"] },
        "openai/outputTemplate": INVENTORY_WRITE_VIEW_URI, "openai/widgetAccessible": true });
      const approvalView = await client.readResource({ uri: INVENTORY_WRITE_VIEW_URI });
      expect(approvalView.contents[0]).toMatchObject({ mimeType: "text/html;profile=mcp-app" });
      const view = await client.readResource({ uri: PHOTO_VIEW_URI });
      expect(view.contents[0]).toMatchObject({ mimeType: "text/html;profile=mcp-app",
        _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } } });
      expect(JSON.stringify(view)).not.toContain("test-only");
      const low = await client.callTool({ name: "list_low_stock", arguments: {} });
      expect(low.isError).not.toBe(true);
      expect(f.low).toHaveBeenCalledWith(0, null, 50);
      const gallery = await client.callTool({ name: "get_delivery_gallery", arguments: { customerId: "synthetic-company", date: "2026-10-07" } });
      expect(gallery.isError).not.toBe(true);
      expect(gallery.structuredContent).toMatchObject({ photoIds: ["c3bc6631-22fb-4f14-b622-bb852652c891"], page: { complete: true, returnedCount: 1 } });
      expect(gallery._meta).toMatchObject({ deliveryGallery: { customerName: "합성 납품업체", date: "2026-10-07", photos: [{ createdByName: "합성 직원" }] } });
      expect(gallery.content).toContainEqual({ type: "image", data: "UklGRg==", mimeType: "image/webp" });
      expect(JSON.stringify(gallery.structuredContent)).not.toMatch(/fileBase64|UklGRg/);
      expect(JSON.stringify(gallery.content.filter((item) => item.type === "text"))).not.toMatch(/합성 직원|합성 납품업체/);
      const invalidDate = await client.callTool({ name: "get_delivery_gallery", arguments: { customerId: "synthetic-company", date: "2026-02-30" } });
      expect(invalidDate.isError).toBe(true);
      expect(f.gallery).toHaveBeenCalledTimes(1);
      const image = await client.callTool({ name: "get_delivery_photo", arguments: { photoId: "c3bc6631-22fb-4f14-b622-bb852652c891" } });
      expect(image.content).toContainEqual({ type: "image", data: "UklGRg==", mimeType: "image/webp" });
      expect(image.structuredContent).toMatchObject({ variant: "thumbnail", contentType: "image/webp" });
      expect(image._meta).toMatchObject({ deliveryPhoto: { mimeType: "image/webp", data: "UklGRg==", variant: "thumbnail", customerName: "합성 납품업체",
        photoId: "c3bc6631-22fb-4f14-b622-bb852652c891", createdAt: "2026-10-07T03:56:00.000Z", createdByName: "합성 직원" } });
      expect(JSON.stringify(image.content)).not.toContain("합성 직원");
      expect(JSON.stringify(image.structuredContent)).not.toContain("합성 직원");
      const unsupported = await client.callTool({ name: "saveCustomer", arguments: {} });
      expect(unsupported.isError).toBe(true);
      const invalid = await client.callTool({ name: "list_low_stock", arguments: { threshold: -1 } });
      expect(invalid.isError).toBe(true);
    } finally { await client.close(); }
  });
  it("rejects cross-origin, missing CSRF binding and oversize bodies", async () => {
    const f = await start();
    expect((await fetch(`${f.origin}/mcp`, { headers: { origin: "https://evil.test" } })).status).toBe(403);
    expect((await fetch(`${f.origin}/authorize`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "pin=test-only" })).status).toBe(403);
    expect((await fetch(`${f.origin}/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ giant: "x".repeat(17000) }) })).status).toBe(413);
  });
  it("does not release data if the account is revoked while a service query runs", async () => {
    const f = await start(); const { exchange } = await f.setup(); const token = await f.oauth.token(exchange);
    const client = new Client({ name: "test", version: "1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${f.origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } } });
    await client.connect(transport as Transport);
    f.low.mockImplementationOnce(async () => { f.identity.verify.mockRejectedValue(new Error("revoked")); return { ...emptyLowStock, basis: "PRIVATE" }; });
    try {
      const result = await client.callTool({ name: "list_low_stock", arguments: {} });
      expect(result.isError).toBe(true); expect(JSON.stringify(result)).not.toContain("PRIVATE");
      expect(result._meta).toMatchObject({ error: { code: "AUTH_REQUIRED", retryable: false } });
    } finally { await client.close(); }
  });
  it("distinguishes retryable failures and emits only safe request metrics", async () => {
    const f = await start(); const { exchange } = await f.setup(); const token = await f.oauth.token(exchange);
    const client = new Client({ name: "metrics-test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${f.origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } } }) as Transport);
    try {
      f.low.mockImplementationOnce(async () => {
        await observeRead("firestore", async () => ["PRIVATE-CUSTOMER", "PRIVATE-EMPLOYEE"], (rows) => rows.length);
        throw new HttpsError("unavailable", "PRIVATE-STORAGE-PATH");
      }).mockRejectedValueOnce(new HttpsError("unavailable", "PRIVATE-STORAGE-PATH"));
      const failed = await client.callTool({ name: "list_low_stock", arguments: {} });
      expect(failed._meta).toMatchObject({ error: { code: "TEMPORARY_UNAVAILABLE", retryable: true, retryAfterSeconds: 2 } });
      expect(JSON.stringify(failed)).not.toContain("PRIVATE");
      await client.callTool({ name: "list_low_stock", arguments: {} });
      const calls = f.metrics.filter((value) => value.tool === "list_low_stock");
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ error: "TEMPORARY_UNAVAILABLE", documentReads: 2, rpcMethod: "tools/call", httpStatus: 200, outcome: "tool_error", retries: 1 });
      expect(calls[1]).toMatchObject({ documentReads: 0, returnedCount: 0, complete: true });
      expect(calls[1]).not.toHaveProperty("error");
      expect(f.metrics.filter((value) => value.coldStart)).toHaveLength(1);
      const serialized = JSON.stringify(f.metrics);
      for (const privateValue of [token.access_token, "PRIVATE", "test-only", "mcp-test-uid", "MCP-TEST"]) expect(serialized).not.toContain(privateValue);
    } finally { await client.close(); }
  });
  it("retries a transient read once but rechecks authorization before that retry", async () => {
    const f = await start(); const { exchange } = await f.setup(); const token = await f.oauth.token(exchange);
    const client = new Client({ name: "retry-test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${f.origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } } }) as Transport);
    try {
      f.low.mockRejectedValueOnce(new HttpsError("unavailable", "private"));
      const recovered = await client.callTool({ name: "list_low_stock", arguments: {} });
      expect(recovered.isError).not.toBe(true);
      expect(f.low).toHaveBeenCalledTimes(2);
      f.low.mockImplementationOnce(async () => {
        f.identity.verify.mockRejectedValue(new Error("revoked"));
        throw new HttpsError("unavailable", "private");
      });
      const revoked = await client.callTool({ name: "list_low_stock", arguments: {} });
      expect(revoked._meta).toMatchObject({ error: { code: "AUTH_REQUIRED", retryable: false } });
      expect(f.low).toHaveBeenCalledTimes(3); // The second request cannot retry its query after revocation.
    } finally { await client.close(); }
  });
  it("returns a bounded timeout without releasing late query data", async () => {
    const f = await start(15); const { exchange } = await f.setup(); const token = await f.oauth.token(exchange);
    const client = new Client({ name: "timeout-test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${f.origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } } }) as Transport);
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    f.low.mockImplementationOnce(async () => { await pending; return { ...emptyLowStock, basis: "LATE-PRIVATE" }; });
    try {
      const result = await client.callTool({ name: "list_low_stock", arguments: {} });
      expect(result._meta).toMatchObject({ error: { code: "TIMEOUT", retryable: true } });
      expect(JSON.stringify(result)).not.toContain("LATE-PRIVATE");
      const calls = f.identity.verify.mock.calls.length;
      finish(); await new Promise((resolve) => setTimeout(resolve, 10));
      expect(f.identity.verify).toHaveBeenCalledTimes(calls);
      expect(f.metrics.filter((value) => value.error === "TIMEOUT")).toHaveLength(1);
    } finally { finish(); await client.close(); }
  });
});
