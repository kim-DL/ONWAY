import { randomUUID, createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Timestamp } from "firebase-admin/firestore";
import sharp from "sharp";
import { getAdminAuth, getAdminFirestore } from "../../src/shared/firebase-admin.js";
import { createPinLookupKey, generateRandomPin, hashPin } from "../../src/auth/pin-crypto.js";
import { firebaseMcpIdentity } from "../../src/mcp/authorization.js";
import { FirestoreMcpStore } from "../../src/mcp/store.js";
import { McpOAuth } from "../../src/mcp/oauth.js";
import { EmployeeDirectory } from "../../src/employee/employee-directory.js";
import { deliveryPhotoPath } from "../../src/delivery-photo/delivery-photo-store.js";
import { McpQueries } from "../../src/mcp/queries.js";
import { InventoryService } from "../../src/inventory/inventory-service.js";
import { CustomerService } from "../../src/customer/customer-service.js";
import { DeliveryPhotoService, deliveryDateKeyInSeoul } from "../../src/delivery-photo/delivery-photo-service.js";
import type { McpPrincipal } from "../../src/mcp/authorization.js";
import { newReadObservation, withReadObservation } from "../../src/shared/read-observation.js";
import { PHOTO_VIEW_URI } from "../../src/mcp/photo-view.js";
import { InventoryPhotoService } from "../../src/inventory/inventory-photo-service.js";

const enabled = process.env.MCP_EMULATOR_TEST === "true";
describe.skipIf(!enabled)("MCP real Firebase boundaries (demo only)", () => {
  const suffix = randomUUID();
  const actor: McpPrincipal = { uid: `mcp-${suffix}`, employeeId: "MCP-INTEGRATION", roleScopes: ["delivery"],
    sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
  const pin = generateRandomPin();
  const lookup = "demo-only-mcp-lookup-at-least-thirty-two-characters";
  const pepper = "demo-only-mcp-pepper-at-least-thirty-two-characters";
  let db: ReturnType<typeof getAdminFirestore>;
  let queries: McpQueries;
  let productId: string;
  let customerId: string;
  let photoId: string;
  let secondPhotoId: string;
  const inventoryPhotoId = randomUUID();
  const identity = firebaseMcpIdentity(lookup, pepper, [actor.employeeId]);
  let oauth: McpOAuth;
  let exchange: { grant_type: string; client_id: string; code: string; redirect_uri: string; resource: string; code_verifier: string };
  let token: Awaited<ReturnType<McpOAuth["token"]>>;
  beforeAll(async () => {
    if (process.env.GCLOUD_PROJECT !== "demo-onnuriway" || !process.env.FIRESTORE_EMULATOR_HOST
      || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error("Demo emulators required.");
    db = getAdminFirestore();
    await getAdminAuth().createUser({ uid: actor.uid });
    await db.doc(`employees/${actor.employeeId}`).set({ employeeId: actor.employeeId, firebaseUid: actor.uid,
      displayName: "합성 MCP 직원", status: "active", roleScopes: actor.roleScopes, sessionVersion: 1 });
    await db.doc(`authz/${actor.uid}`).set({ employeeId: actor.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 });
    await db.doc(`authCredentials/${actor.employeeId}`).set({ employeeId: actor.employeeId, pinHash: await hashPin(pin, pepper),
      failedAttemptCount: 0, lockedUntil: null, sessionVersion: 1 });
    await db.doc(`pinIndexes/${createPinLookupKey(pin, lookup)}`).set({ employeeId: actor.employeeId });
    const customer = await new CustomerService().save({ requestId: randomUUID(), customerId: null, expectedRevision: null, clearNotice: false,
      draft: { name: "합성 한빛초", district: "합성구", administrativeDong: "합성동", officialAddress: "", deliveryAddress: "",
        accessPassword: "never-export-this-field", accessPasswordState: "registered", deliveryLocationDescription: "", deliveryPoint: null,
        contacts: [], status: "active", noticeType: "none", changeNote: "" } }, actor);
    customerId = customer.customerId;
    const bytes = await sharp({ create: { width: 640, height: 960, channels: 3, background: "#336699" } }).jpeg().toBuffer();
    await new InventoryPhotoService().upload({ uploadId: inventoryPhotoId, contentType: "image/jpeg", fileBase64: bytes.toString("base64") }, actor);
    const product = await new InventoryService().save({ requestId: randomUUID(), productId: null, expectedRevision: null,
      draft: { name: "합성 만두", manufacturer: "합성", specification: "1kg", origin: "대한민국", unitLabel: "봉", unitsPerBox: 8,
        defaultLocationId: "freezer1", note: "", urgent: false },
      initialStock: { quantity: 19, lot: { label: "", expiryState: "dated", expiryDate: "2026-12-31" } },
      photoChange: { action: "replace", uploadId: inventoryPhotoId } }, actor);
    productId = product.productId;
    const service = new DeliveryPhotoService();
    const photo = await service.create({ requestId: randomUUID(), customerId, source: "camera", contentType: "image/jpeg", fileBase64: bytes.toString("base64") }, actor);
    photoId = photo.photoId;
    const second = await service.create({ requestId: randomUUID(), customerId, source: "album", contentType: "image/jpeg", fileBase64: bytes.toString("base64") }, actor);
    secondPhotoId = second.photoId;
    queries = new McpQueries();
    const config = { origin: "https://mcp.example.test", resource: "https://mcp.example.test/mcp",
      allowedRedirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"], emulator: true };
    oauth = new McpOAuth(config, new FirestoreMcpStore(), identity);
    const client = await oauth.register({ redirect_uris: config.allowedRedirectUris });
    const verifier = randomBytes(32).toString("base64url");
    const request = { response_type: "code", client_id: client.client_id, redirect_uri: config.allowedRedirectUris[0]!,
      state: "test-state", resource: config.resource, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") };
    const flow = await oauth.begin(request);
    const redirect = new URL(await oauth.authorize({ flow: flow.flow, pin, consent: "allow" }, flow.browser, suffix, randomUUID()));
    exchange = { grant_type: "authorization_code", client_id: client.client_id, redirect_uri: request.redirect_uri,
      resource: config.resource, code_verifier: verifier, code: redirect.searchParams.get("code")! };
    token = await oauth.token(exchange);
  }, 30_000);
  it("authenticates through existing PIN records without creating a Firebase custom token", async () => {
    const measured = newReadObservation();
    expect(await withReadObservation(measured, () => oauth.authenticate(token.access_token))).toEqual(actor);
    expect(measured.documentReads).toBe(4); // Access + family + authz + employee; no repeated employee fetch.
    expect(measured.operations.firebaseAuth).toBe(1);
    await expect(oauth.token(exchange)).rejects.toThrow();
    const credentials = (await db.doc(`authCredentials/${actor.employeeId}`).get()).data()!;
    expect(credentials.failedAttemptCount).toBe(0); expect(credentials.lastLoginAt).toBeInstanceOf(Timestamp);
    await expect(firebaseMcpIdentity(lookup, pepper, []).login(pin, "denied", randomUUID())).rejects.toThrow();
  });
  it("reuses live catalog/stock and minimizes customer fields with no business mutation", async () => {
    const before = (await db.doc(`companies/onnuri/inventoryProducts/${productId}`).get()).data();
    const customer = await queries.searchCustomers("한빛", null);
    expect(customer.customers.map((c) => c.customerId)).toContain(customerId);
    expect(JSON.stringify(customer)).not.toContain("never-export-this-field");
    const product = await queries.product(productId, actor);
    expect(product.product.totalQuantity).toBe(19);
    expect(product.product.quantityByLocation.freezer1).toBe(19);
    expect(product.lots).toHaveLength(1);
    expect((await queries.searchProducts("ㅁㄷ", null)).products.map((p) => p.productId)).toContain(productId);
    expect((await queries.lowStock(18, null)).products.map((p) => p.productId)).not.toContain(productId);
    expect((await queries.lowStock(19, null)).products.map((p) => p.productId)).toContain(productId);
    const batch = await queries.products([productId, "missing-product"], actor);
    expect(batch.products).toHaveLength(1); expect(batch.missingProductIds).toEqual(["missing-product"]);
    expect((await queries.alerts(19, 7, null)).alerts.some((row) => row.product.productId === productId && row.lowStock)).toBe(true);
    const summary = await queries.customerDeliverySummary({ query: "합성 한빛초", limit: 5 }, actor);
    expect(summary).toMatchObject({ resolution: "resolved", customer: { customerId } });
    expect(summary.records?.photos).toHaveLength(2);
    expect((await db.doc(`companies/onnuri/inventoryProducts/${productId}`).get()).data()).toEqual(before);
  });
  it("reads the existing inventory attachment through one thumbnail download with no source changes", async () => {
    const ref = db.doc(`companies/onnuri/inventoryProducts/${productId}`), before = await ref.get();
    const observed = newReadObservation();
    const result = await withReadObservation(observed, () => queries.inventoryPhoto({ productId, variant: "thumbnail", afterId: null }, actor));
    expect(result.resolution).toBe("resolved"); expect(result.image?.photoId).toBe(inventoryPhotoId);
    expect(observed.operations.storage).toBe(1); expect(observed.storageBytes).toBe(result.image!.byteSize);
    expect(observed.documentReads).toBe(8); // Two canonical membership/product/attachment checks; no lots/events.
    const large = await queries.inventoryPhoto({ productId, photoId: inventoryPhotoId, variant: "preview", afterId: null }, actor);
    expect(large.image!.byteSize).toBeGreaterThan(result.image!.byteSize);
    expect((await ref.get()).updateTime!.isEqual(before.updateTime!)).toBe(true);
  });
  it("reads real private WebP bytes and paginates date-filtered records in KST", async () => {
    const first = await queries.deliveries({ customerId, date: deliveryDateKeyInSeoul(new Date()), limit: 1 }, actor);
    expect(first.photos).toHaveLength(1); expect(first.nextCursor).not.toBeNull();
    const second = await queries.deliveries({ customerId, date: deliveryDateKeyInSeoul(new Date()), limit: 1, after: first.nextCursor! }, actor);
    expect(new Set([...first.photos, ...second.photos].map((p) => p.photoId))).toEqual(new Set([photoId, secondPhotoId]));
    expect(second.nextCursor).toBeNull();
    expect((await queries.deliveries({ customerId, date: "2000-01-01", limit: 50 }, actor)).photos).toEqual([]);
    const photo = await queries.photo({ photoId, variant: "evidence" }, actor);
    const metadata = await sharp(Buffer.from(photo.fileBase64, "base64")).metadata();
    expect(metadata.format).toBe("webp");
  });

  it("connects through Firebase Hosting rewrite and the actual Functions OAuth/MCP handler", async () => {
    const origin = "http://127.0.0.1:5002";
    const metadata = await fetch(`${origin}/.well-known/oauth-authorization-server`);
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({ issuer: origin });
    const clientResponse = await fetch(`${origin}/register`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"] }) });
    expect(clientResponse.status).toBe(201);
    const registration = await clientResponse.json() as { client_id: string };
    const verifier = randomBytes(32).toString("base64url");
    const request = { response_type: "code", client_id: registration.client_id, redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
      state: "hosting-test", ui_locales: "ko-KR", resource: `${origin}/mcp`, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") };
    const form = await fetch(`${origin}/authorize?${new URLSearchParams(request)}`);
    expect(form.status).toBe(200);
    const cookie = form.headers.get("set-cookie")!.split(";")[0]!;
    const flow = /name="flow" value="([^"]+)"/.exec(await form.text())![1]!;
    const authorize = await fetch(`${origin}/authorize`, { method: "POST", redirect: "manual", headers: {
      "content-type": "application/x-www-form-urlencoded", origin, cookie }, body: new URLSearchParams({ flow, pin, consent: "allow" }) });
    expect(authorize.status).toBe(303);
    const callback = new URL(authorize.headers.get("location")!);
    const exchangeResult = await fetch(`${origin}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: registration.client_id, redirect_uri: request.redirect_uri,
        resource: request.resource, code_verifier: verifier, code: callback.searchParams.get("code")! }) });
    expect(exchangeResult.status).toBe(200);
    const tokens = await exchangeResult.json() as { access_token: string };
    const client = new Client({ name: "firebase-mcp-test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    }) as Transport);
    try {
      const tools = (await client.listTools()).tools;
      expect(tools).toHaveLength(17);
      expect(tools.every((tool) => tool.outputSchema?.type === "object")).toBe(true);
      const view = await client.readResource({ uri: PHOTO_VIEW_URI });
      expect(view.contents[0]?.mimeType).toBe("text/html;profile=mcp-app");
      const inventoryImage = await client.callTool({ name: "get_inventory_photo", arguments: { query: "합성 만두" } });
      expect(inventoryImage.isError).not.toBe(true);
      expect(inventoryImage.structuredContent).toMatchObject({ resolution: "resolved", product: { productId }, photo: { photoId: inventoryPhotoId, variant: "thumbnail" } });
      expect(inventoryImage._meta?.inventoryPhoto).toMatchObject({ productId, photoId: inventoryPhotoId, variant: "thumbnail" });
      expect((inventoryImage.content as Array<{ type: string }>).filter((item) => item.type === "image")).toHaveLength(1);
      const latest = await client.callTool({ name: "get_latest_employee_delivery_gallery", arguments: { employeeName: "합성 MCP", limit: 1 } });
      expect(latest.isError).not.toBe(true);
      expect(latest.structuredContent).toMatchObject({ resolution: "resolved", timeBasis: "photo_registered_at",
        latestRecord: { photoId: secondPhotoId, customerId, deliveryCompletedAt: null }, gallery: { employeeId: actor.employeeId, page: { complete: false } } });
      expect(latest._meta?.deliveryPhoto).toMatchObject({ photoId: secondPhotoId, variant: "thumbnail", createdByEmployeeId: actor.employeeId });
      expect(latest._meta?.deliveryGallery).toMatchObject({ customerId, employeeId: actor.employeeId });
      expect((latest.content as Array<{ type: string }>).filter((item) => item.type === "image")).toHaveLength(1);
      const search = await client.callTool({ name: "search_delivery_records", arguments: {
        employeeName: "합성 MCP", customerName: "합성 한빛초", date: deliveryDateKeyInSeoul(new Date()), limit: 1 } });
      expect(search.isError).not.toBe(true);
      expect(search.structuredContent).toMatchObject({ resolution: "resolved", records: [{ photoId: secondPhotoId, customerId, deliveryCompletedAt: null }], page: { complete: false } });
      expect(JSON.stringify(search)).not.toMatch(/never-export-this-field|firebaseUid|pinHash|fileBase64/);
      const continued = await client.callTool({ name: "search_delivery_records", arguments: {
        employeeId: actor.employeeId, customerId, date: deliveryDateKeyInSeoul(new Date()), limit: 1, after: search.structuredContent!.nextCursor } });
      expect(continued.structuredContent).toMatchObject({ records: [{ photoId }], page: { complete: true, startedFromBeginning: false } });
      const nextGallery = await client.callTool({ name: "get_delivery_gallery", arguments: { employeeId: actor.employeeId, customerId,
        date: deliveryDateKeyInSeoul(new Date()), limit: 1, after: (latest.structuredContent!.gallery as { nextCursor: unknown }).nextCursor } });
      expect(nextGallery.isError).not.toBe(true);
      expect(nextGallery._meta?.deliveryGallery).toMatchObject({ employeeId: actor.employeeId, photos: [{ photoId }] });
      const invalidLatest = await client.callTool({ name: "get_latest_employee_delivery_gallery", arguments: {} });
      expect(invalidLatest.isError).toBe(true);
      const inventory = await client.callTool({ name: "get_inventory_product", arguments: { productId } });
      expect(inventory.isError).not.toBe(true);
      expect(inventory.structuredContent).toMatchObject({ product: { totalQuantity: 19 } });
      expect(inventory.structuredContent).toMatchObject({ lotsIncluded: true, product: { lastStocktakeAt: null } });
      const summaryOnly = await client.callTool({ name: "get_inventory_product", arguments: { productId, includeLots: false } });
      expect(summaryOnly.isError).not.toBe(true);
      expect(summaryOnly.structuredContent).toMatchObject({ lotsIncluded: false, lots: null, product: { totalQuantity: 19, lastStocktakeAt: null } });
      const multiSearch = await client.callTool({ name: "search_inventory_products", arguments: { queries: ["ㅁㄷ", "합성"] } });
      expect(multiSearch.isError).not.toBe(true);
      expect(multiSearch.structuredContent).toMatchObject({ products: [{ productId, totalQuantity: 19 }],
        matches: [{ query: "ㅁㄷ", productIds: [productId] }, { query: "합성", productIds: [productId] }] });
      const overview = await client.callTool({ name: "get_inventory_overview", arguments: { exampleLimit: 0 } });
      expect(overview.isError).not.toBe(true);
      expect(overview.structuredContent).toMatchObject({ countScope: "returned_scan_segment", counts: { activeProducts: 1, zeroStockProducts: 0 },
        page: { complete: true, recordsScanned: 1 }, examples: { lowStock: [], expiring: [], stocktakePending: [] } });
      const gallery = await client.callTool({ name: "get_delivery_gallery", arguments: { customerId, limit: 1 } });
      expect(gallery.isError).not.toBe(true);
      expect(gallery.structuredContent).toMatchObject({ page: { complete: false, returnedCount: 1 } });
      expect(gallery._meta?.deliveryGallery).toMatchObject({ customerId, customerName: "합성 한빛초" });
      expect(gallery.content.some((item) => item.type === "image")).toBe(true);
      expect(gallery._meta?.deliveryPhoto).toMatchObject({ variant: "thumbnail", customerId });
      expect(JSON.stringify(gallery.structuredContent)).not.toMatch(/fileBase64|never-export-this-field/);
      expect(JSON.stringify(gallery.content.filter((item) => item.type === "text"))).not.toMatch(/never-export-this-field|합성 MCP 직원/);
      const namedGallery = await client.callTool({ name: "get_delivery_gallery", arguments: { query: "합성 한빛초유통", limit: 50 } });
      expect(namedGallery.isError).not.toBe(true);
      expect(namedGallery.structuredContent).toMatchObject({ resolution: "resolved", customerName: "합성 한빛초", date: null,
        photoIds: expect.arrayContaining([photoId, secondPhotoId]), page: { returnedCount: 2, complete: true } });
      expect(namedGallery._meta?.deliveryPhoto).toMatchObject({ variant: "thumbnail", customerId });
      expect(namedGallery.content.filter((item) => item.type === "image")).toHaveLength(1);
      const next = await client.callTool({ name: "get_delivery_gallery", arguments: { customerId, limit: 1, after: gallery.structuredContent!.nextCursor } });
      expect(next.isError).not.toBe(true);
      expect(next.structuredContent).toMatchObject({ page: { complete: true, returnedCount: 1, startedFromBeginning: false } });
      const galleryIds = [...gallery.structuredContent!.photoIds as string[], ...next.structuredContent!.photoIds as string[]];
      expect(new Set(galleryIds)).toEqual(new Set([photoId, secondPhotoId]));
      const photo = await client.callTool({ name: "get_delivery_photo", arguments: { photoId } });
      expect(photo.isError).not.toBe(true);
      expect((photo.content as Array<{ type: string }>).some((c) => c.type === "image")).toBe(true);
      expect(photo._meta?.deliveryPhoto).toMatchObject({ photoId, variant: "thumbnail", customerId, customerName: "합성 한빛초", mimeType: "image/webp", createdByName: "합성 MCP 직원" });
      const evidence = await client.callTool({ name: "get_delivery_photo", arguments: { photoId, variant: "evidence" } });
      expect(evidence.isError).not.toBe(true);
      expect(evidence._meta?.deliveryPhoto).toMatchObject({ photoId, variant: "evidence", createdByName: "합성 MCP 직원" });
      const batch = await client.callTool({ name: "get_inventory_products", arguments: { productIds: [productId, "missing-product"] } });
      expect(batch.isError).not.toBe(true); expect(batch.structuredContent).toMatchObject({ returnedCount: 1, missingProductIds: ["missing-product"] });
      const summary = await client.callTool({ name: "get_customer_delivery_summary", arguments: { customerId } });
      expect(summary.isError).not.toBe(true); expect(summary.structuredContent).toMatchObject({ resolution: "resolved", records: { page: { complete: true } } });
      const alerts = await client.callTool({ name: "list_inventory_alerts", arguments: { threshold: 19 } });
      expect(alerts.isError).not.toBe(true); expect(alerts.structuredContent).toMatchObject({ page: { complete: true } });
    } finally { await client.close(); }
  }, 30_000);
  it("uses the name index safely for titles, duplicate names and bounded candidate sets, and enforces caller revocation", async () => {
    const directory = new EmployeeDirectory(db);
    expect(await directory.resolve({ employeeName: "합성 MCP" }, actor)).toMatchObject({ employee: { employeeId: actor.employeeId }, complete: true });
    const ids = Array.from({ length: 21 }, (_, index) => `DIRECTORY-${index}`);
    try {
      await Promise.all(ids.map((employeeId, index) => db.doc(`employees/${employeeId}`).set({ employeeId, displayName: `경계합성 ${index}`,
        status: "disabled", firebaseUid: "private-uid", sessionVersion: 999, pin: "never-export" })));
      const bounded = await directory.resolve({ employeeName: "경계합성" }, actor);
      expect(bounded).toMatchObject({ employee: null, complete: false }); expect(bounded.candidates).toHaveLength(20);
      expect(JSON.stringify(bounded)).not.toMatch(/private-uid|sessionVersion|never-export|pin/);
      await db.doc(`employees/${ids[0]}`).update({ displayName: "동명 합성" });
      await db.doc(`employees/${ids[1]}`).update({ displayName: "동명 합성" });
      const duplicate = await queries.latestEmployeeGallery({ employeeName: "동명 합성", limit: 50 }, actor);
      expect(duplicate).toMatchObject({ resolution: "ambiguous_employee", gallery: null, initialPhoto: null });
      expect(duplicate.employeeCandidates).toHaveLength(2);
      await db.doc(`authz/${actor.uid}`).update({ active: false });
      await expect(directory.resolve({ employeeName: "합성 MCP" }, actor)).rejects.toMatchObject({ code: "permission-denied" });
    } finally {
      await db.doc(`authz/${actor.uid}`).update({ active: true });
      await Promise.all(ids.map((id) => db.doc(`employees/${id}`).delete()));
    }
  });

  it("applies employee/date/customer AND filters, KST midnight, stable ties, retention, deletion and expiry without catalog traversal", async () => {
    const basePhoto = (await db.doc(`companies/onnuri/deliveryPhotos/${photoId}`).get()).data()!;
    const baseCustomer = (await db.doc(`companies/onnuri/customers/${customerId}`).get()).data()!;
    const company = "MCP-EDGE-CUSTOMER", otherCompany = "MCP-OTHER-CUSTOMER", staff = "MCP-EDGE-STAFF";
    const now = Date.now(), date = deliveryDateKeyInSeoul(new Date(now)), start = Date.parse(date + "T00:00:00+09:00");
    const seeded: string[] = [];
    await db.doc(`employees/${staff}`).set({ employeeId: staff, displayName: "합성 경계직원 과장", status: "disabled" });
    await Promise.all([company, otherCompany].map((id) => db.doc(`companies/onnuri/customers/${id}`).set({ ...baseCustomer, customerId: id, name: "합성 경계업체" })));
    const seed = async (createdAt: number, changes: Record<string, unknown> = {}, id = randomUUID()) => {
      seeded.push(id);
      const day = deliveryDateKeyInSeoul(new Date(createdAt)), attempt = basePhoto.evidence.uploadAttemptToken;
      await db.doc(`companies/onnuri/deliveryPhotos/${id}`).set({ ...basePhoto, photoId: id, customerId: company,
        createdByEmployeeId: staff, createdByName: "이전 등록 이름", createdAt: Timestamp.fromMillis(createdAt),
        expiresAt: Timestamp.fromMillis(createdAt + 168 * 3600000), deliveryDateKey: day,
        evidence: { ...basePhoto.evidence, objectPath: deliveryPhotoPath(day, id, attempt, "evidence") },
        thumbnail: { ...basePhoto.thumbnail, objectPath: deliveryPhotoPath(day, id, attempt, "thumbnail") }, ...changes });
      return id;
    };
    try {
      const tieLow = await seed(start, {}, "00000000-0000-4000-8000-000000000001");
      const tieHigh = await seed(start, {}, "00000000-0000-4000-8000-000000000002");
      const previousDay = await seed(start - 1);
      const elsewhere = await seed(start, { customerId: otherCompany });
      const anotherStaff = await seed(start, { createdByEmployeeId: "ANOTHER-STAFF" });
      const deleted = await seed(now - 2000, { status: "deleted", deletion: { deletedAt: Timestamp.now(), deletedByEmployeeId: staff, deleteReason: "user" } });
      const expired = await seed(now - 1000, { expiresAt: Timestamp.fromMillis(now - 1) });
      const tooOld = await seed(now - 169 * 3600000, { expiresAt: Timestamp.fromMillis(now + 3600000) });
      const future = await seed(now + 3600000);
      const list = vi.spyOn(CustomerService.prototype, "list");
      try {
        const first = await queries.searchDeliveryRecords({ employeeName: "합성 경계직원", customerId: company, date, limit: 1 }, actor);
        expect(first.records.map((record) => record.photoId)).toEqual([tieHigh]);
        expect(first.page).toMatchObject({ complete: false, pagesScanned: 2 }); // Expired active row skipped; deleted row excluded by query.
        const next = await queries.searchDeliveryRecords({ employeeId: staff, customerId: company, date, limit: 1, after: first.nextCursor! }, actor);
        expect(next.records.map((record) => record.photoId)).toEqual([tieLow]); expect(next.page?.complete).toBe(true);
        expect(first.records[0]).toMatchObject({ recordedByName: "이전 등록 이름", registeredAt: new Date(start).toISOString(), deliveryCompletedAt: null });
        const byEmployee = await queries.searchDeliveryRecords({ employeeId: staff, limit: 100 }, actor);
        expect(new Set(byEmployee.records.map((record) => record.photoId))).toEqual(new Set([tieHigh, tieLow, previousDay, elsewhere]));
        const byCustomer = await queries.searchDeliveryRecords({ customerId: company, date, limit: 100 }, actor);
        expect(new Set(byCustomer.records.map((record) => record.photoId))).toEqual(new Set([tieHigh, tieLow, anotherStaff]));
        const broad = await queries.searchDeliveryRecords({ date, limit: 100 }, actor);
        for (const id of [tieHigh, tieLow, anotherStaff, elsewhere]) expect(broad.records.map((record) => record.photoId)).toContain(id);
        for (const id of [previousDay, expired, deleted, tooOld, future]) expect(broad.records.map((record) => record.photoId)).not.toContain(id);
        expect((await queries.searchDeliveryRecords({ employeeId: staff, date: "2000-01-01", limit: 10 }, actor)).records).toEqual([]);
        expect(list).not.toHaveBeenCalled();
      } finally { list.mockRestore(); }
    } finally {
      await Promise.all(seeded.map((id) => db.doc(`companies/onnuri/deliveryPhotos/${id}`).delete()));
      await db.doc(`employees/${staff}`).delete();
      await Promise.all([company, otherCompany].map((id) => db.doc(`companies/onnuri/customers/${id}`).delete()));
    }
  }, 30_000);

  it("excludes deleted/expired photos and continues pagination across deleted entries", async () => {
    const service = new DeliveryPhotoService();
    const all = await service.listPage({ customerId, limit: 10 }, actor);
    const newest = all.photos[0]!;
    await db.doc(`companies/onnuri/deliveryPhotos/${newest.photoId}`).update({ status: "deleted",
      deletion: { deletedAt: Timestamp.now(), deletedByEmployeeId: actor.employeeId, deleteReason: "user" } });
    const first = await service.listPage({ customerId, limit: 1 }, actor);
    expect(first.photos).toEqual([]); expect(first.nextCursor).not.toBeNull();
    const second = await service.listPage({ customerId, limit: 1, after: first.nextCursor! }, actor);
    expect(second.photos).toHaveLength(1);
    await expect(service.get({ photoId: newest.photoId, variant: "thumbnail" }, actor)).rejects.toThrow();
    await db.doc(`companies/onnuri/deliveryPhotos/${second.photos[0]!.photoId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
    expect((await service.listPage({ customerId, limit: 10 }, actor)).photos).toEqual([]);
  });
  it("projects committed stocktake time separately from later metadata and stock changes without rewriting business data on reads", async () => {
    let at = new Date("2026-10-09T03:00:00Z");
    const service = new InventoryService(db, () => at), inventoryQueries = new McpQueries(undefined, service);
    const draft = { name: "합성 실사시각 검사", manufacturer: "합성", specification: "1kg", origin: "대한민국", unitLabel: "봉", unitsPerBox: 8,
      defaultLocationId: "freezer1" as const, note: "private-stock-note", urgent: false };
    const product = await service.save({ requestId: randomUUID(), productId: null, expectedRevision: null, draft }, actor);
    const ref = db.doc(`companies/onnuri/inventoryProducts/${product.productId}`);
    try {
      const count = await service.count({ requestId: randomUUID(), productId: product.productId, locationId: "freezer1", cycleId: "week-2026-10-09",
        expectedStockRevision: product.stockRevision, counts: [], matchOnly: true, reason: "" }, actor);
      at = new Date("2026-10-10T03:00:00Z");
      const edited = await service.save({ requestId: randomUUID(), productId: product.productId, expectedRevision: count.product.revision,
        draft: { ...draft, specification: "규격 정정" } }, actor);
      const received = await service.move({ requestId: randomUUID(), productId: product.productId, expectedStockRevision: edited.stockRevision,
        kind: "receive", locationId: "freezer1", lotId: null, quantity: 3, newLot: { label: "", expiryState: "unknown", expiryDate: null }, reason: "" }, actor);
      const before = (await ref.get()).data(), observation = newReadObservation();
      const result = await withReadObservation(observation, () => inventoryQueries.product(product.productId, actor, false));
      expect(result).toMatchObject({ lots: null, product: { totalQuantity: 3, lastStocktakeAt: "2026-10-09T03:00:00.000Z",
        updatedAt: "2026-10-10T03:00:00.000Z", stockRevision: received.product.stockRevision,
        stocktakeByLocation: { freezer1: { checkedAt: "2026-10-09T03:00:00.000Z", stockChangedSinceCount: true } } } });
      expect(result.product.lastStocktake).toMatchObject({ eventId: count.event.eventId, kind: "count_match", createdAt: count.event.createdAt, locationId: "freezer1" });
      expect(observation.documentReads).toBe(5); expect(observation.documentWrites).toBe(0);
      expect(result.product.lastStocktake).toMatchObject({ actorEmployeeId: actor.employeeId, actorName: "합성 MCP 직원", actorNameSource: "current_employee_directory" });
      expect((await ref.get()).data()).toEqual(before);
      expect(JSON.stringify(result)).not.toContain("private-stock-note");
    } finally { await db.recursiveDelete(ref); }
  });
  it("reads the last explicit button log even after automatic count-day completion and another unchecked location", async () => {
    let at = new Date("2026-10-09T01:00:00Z");
    const service = new InventoryService(db, () => at), inventoryQueries = new McpQueries(undefined, service);
    const product = await service.save({ requestId: randomUUID(), productId: null, expectedRevision: null,
      draft: { name: "합성 버튼 로그 검증", manufacturer: "", specification: "", origin: "", unitLabel: "봉", unitsPerBox: 1,
        defaultLocationId: "freezer1", note: "", urgent: false } }, actor);
    const ref = db.doc(`companies/onnuri/inventoryProducts/${product.productId}`);
    try {
      const received = await service.move({ requestId: randomUUID(), productId: product.productId, expectedStockRevision: 0,
        kind: "receive", locationId: "freezer1", lotId: null, quantity: 2, reason: "", newLot: { label: "", expiryState: "unknown", expiryDate: null } }, actor);
      expect(received.product.lastCountByLocation.freezer1).not.toBeNull();
      expect((await inventoryQueries.product(product.productId, actor, false)).product.lastStocktakeAt).toBeNull();
      at = new Date("2026-10-09T02:00:00Z");
      const countInput = { requestId: randomUUID(), productId: product.productId, expectedStockRevision: received.product.stockRevision,
        locationId: "freezer1" as const, cycleId: "week-2026-10-09", counts: [{ lotId: received.event.lines[0]!.lotId, quantity: 2 }], matchOnly: true, reason: "" };
      const counted = await service.count(countInput, actor);
      at = new Date("2026-10-09T03:00:00Z");
      const later = await service.move({ requestId: randomUUID(), productId: product.productId, expectedStockRevision: counted.product.stockRevision,
        kind: "receive", locationId: "freezer1", lotId: null, quantity: 1, reason: "", newLot: { label: "", expiryState: "unknown", expiryDate: null } }, actor);
      expect(later.product.lastCountByLocation.freezer1?.checkedAt).toBe(at.toISOString());
      // Exact retries must not invent a new button event or timestamp.
      expect((await service.count(countInput, actor)).replayed).toBe(true);
      at = new Date("2026-10-10T01:00:00Z");
      const otherLocation = await service.move({ requestId: randomUUID(), productId: product.productId, expectedStockRevision: later.product.stockRevision,
        kind: "receive", locationId: "freezer2", lotId: null, quantity: 3, reason: "", newLot: { label: "", expiryState: "unknown", expiryDate: null } }, actor);
      expect(otherLocation.product.lastCountByLocation.freezer2).toBeNull();
      const result = await inventoryQueries.product(product.productId, actor, false);
      expect(result.product).toMatchObject({ lastStocktakeAt: counted.event.createdAt, lastStocktake: { eventId: counted.event.eventId,
        kind: "count_match", locationId: "freezer1", createdAt: "2026-10-09T02:00:00.000Z" },
        stocktakeByLocation: { freezer1: { checkedAt: "2026-10-09T03:00:00.000Z" }, freezer2: null } });
      const searched = await inventoryQueries.searchProducts("합성 버튼 로그 검증", null);
      expect(searched.products.find((row) => row.productId === product.productId)?.lastStocktake).toEqual(result.product.lastStocktake);
      expect((await inventoryQueries.products([product.productId], actor)).products[0]?.lastStocktake).toEqual(result.product.lastStocktake);
    } finally { await db.recursiveDelete(ref); }
  });
  it("revokes MCP immediately on existing permissions/session/account changes", async () => {
    await db.doc(`authz/${actor.uid}`).update({ permissionsVersion: 2 });
    await expect(oauth.authenticate(token.access_token)).rejects.toThrow("invalid_token");
    await db.doc(`authz/${actor.uid}`).update({ permissionsVersion: 1 });
    await getAdminAuth().updateUser(actor.uid, { disabled: true });
    await expect(oauth.authenticate(token.access_token)).rejects.toThrow("invalid_token");
    await getAdminAuth().updateUser(actor.uid, { disabled: false });
    await db.doc(`employees/${actor.employeeId}`).update({ sessionVersion: 2 });
    await expect(oauth.authenticate(token.access_token)).rejects.toThrow("invalid_token");
  });
});
