import { describe, expect, it } from "vitest";
import { fixture } from "./fixture.js";
import { hash } from "../../src/mcp/oauth.js";
import { mcpConfig } from "../../src/mcp/config.js";

describe("MCP OAuth security", () => {
  it("accepts ChatGPT locale extensions without persisting them or weakening required parameters", async () => {
    const f = fixture(); const { request, exchange } = await f.setup();
    const flow = await f.oauth.begin({ ...request, ui_locales: "ko-KR", extension: "ignored-extension" });
    const stored = f.store.values.get(`flow-${hash(flow.flow)}`)!;
    expect(stored.request).toEqual(request);
    const redirect = new URL(await f.oauth.authorize({ flow: flow.flow, pin: "test-only", consent: "allow" }, flow.browser, "source", "request"));
    const token = await f.oauth.token({ ...exchange, code: redirect.searchParams.get("code"), ui_locales: "ko-KR" });
    await expect(f.oauth.authenticate(token.access_token)).resolves.toHaveProperty("employeeId", "MCP-TEST");
    await expect(f.oauth.begin({ ...request, ui_locales: "ko-KR", code_challenge_method: "plain" })).rejects.toThrow();
    await expect(f.oauth.begin({ ...request, ui_locales: "ko-KR", client_id: [request.client_id, "other"] })).rejects.toThrow();
  });
  it("exchanges browser-bound PIN consent for audience-bound opaque tokens; stores no raw credentials", async () => {
    const f = fixture(); const { exchange, redirect } = await f.setup();
    expect(redirect.searchParams.get("state")).toBe("test-state");
    expect(redirect.searchParams.get("iss")).toBe(f.config.origin);
    const result = await f.oauth.token(exchange);
    expect(result.expires_in).toBe(900);
    expect((await f.oauth.authenticate(result.access_token)).employeeId).toBe("MCP-TEST");
    const stored = JSON.stringify([...f.store.values]);
    for (const value of [result.access_token, result.refresh_token, exchange.code, "test-only"]) expect(stored).not.toContain(value);
    await expect(f.oauth.token(exchange)).rejects.toThrow("invalid_grant");
    await expect(f.oauth.authenticate(result.refresh_token)).rejects.toThrow("invalid_token");
  });
  it("requires PKCE, exact redirect, exact resource, registered client and read-only scope", async () => {
    const f = fixture(); const { request, exchange } = await f.setup();
    for (const patch of [{ code_challenge_method: "plain" }, { code_challenge: "" }, { redirect_uri: "https://evil.test" },
      { resource: "https://evil.test/mcp" }, { scope: "geupsikgil:write" }, { client_id: "unknown" }]) {
      await expect(f.oauth.begin({ ...request, ...patch })).rejects.toThrow();
    }
    for (const patch of [{ code_verifier: "x".repeat(43) }, { resource: "https://evil.test" },
      { client_id: "other" }, { redirect_uri: "https://evil.test" }]) await expect(f.oauth.token({ ...exchange, ...patch })).rejects.toThrow();
    await expect(f.oauth.token(exchange)).resolves.toHaveProperty("access_token");
    await expect(f.oauth.register({ redirect_uris: ["https://chatgpt.com.evil.test/callback"] })).rejects.toThrow();
  });
  it("requires browser cookie and explicit consent and only consumes a flow once", async () => {
    const f = fixture(); const { request } = await f.setup(); const flow = await f.oauth.begin(request);
    const input = { flow: flow.flow, pin: "test-only", consent: "allow" };
    await expect(f.oauth.authorize(input, "wrong-cookie", "source", "request")).rejects.toThrow();
    await expect(f.oauth.authorize({ ...input, consent: "deny" }, flow.browser, "source", "request")).rejects.toThrow();
    await f.oauth.authorize(input, flow.browser, "source", "request");
    await expect(f.oauth.authorize(input, flow.browser, "source", "request")).rejects.toThrow();
  });
  it("atomically redeems codes under simultaneous requests", async () => {
    const f = fixture(); const { exchange } = await f.setup();
    const results = await Promise.allSettled([f.oauth.token(exchange), f.oauth.token(exchange)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("rotates refresh tokens and revokes the entire family upon reuse", async () => {
    const f = fixture(); const { exchange } = await f.setup(); const first = await f.oauth.token(exchange);
    const request = { grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: exchange.client_id, resource: f.config.resource };
    const second = await f.oauth.token(request);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    await expect(f.oauth.authenticate(second.access_token)).resolves.toHaveProperty("employeeId");
    await expect(f.oauth.token(request)).rejects.toThrow("invalid_grant");
    await expect(f.oauth.authenticate(second.access_token)).rejects.toThrow("invalid_token");
    await expect(f.oauth.authenticate(first.access_token)).rejects.toThrow("invalid_token");
  });
  it("expires codes, access tokens and absolute refresh lifetime", async () => {
    const f = fixture(); const { exchange } = await f.setup(); f.advance(60_001);
    await expect(f.oauth.token(exchange)).rejects.toThrow();
    const next = await f.setup(); const token = await f.oauth.token(next.exchange); f.advance(900_001);
    await expect(f.oauth.authenticate(token.access_token)).rejects.toThrow();
    f.advance(30 * 24 * 60 * 60_000);
    await expect(f.oauth.token({ grant_type: "refresh_token", refresh_token: token.refresh_token,
      client_id: next.exchange.client_id, resource: f.config.resource })).rejects.toThrow();
  });
  it("revokes from either token, binds client and rechecks canonical employee on every access", async () => {
    const f = fixture(); const { exchange } = await f.setup(); const token = await f.oauth.token(exchange);
    await f.oauth.revoke({ token: token.access_token, client_id: "someone-else" });
    await expect(f.oauth.authenticate(token.access_token)).resolves.toBeDefined();
    f.identity.verify.mockRejectedValueOnce(new Error("disabled"));
    await expect(f.oauth.authenticate(token.access_token)).rejects.toThrow("invalid_token");
    await f.oauth.revoke({ token: token.refresh_token, client_id: exchange.client_id });
    await expect(f.oauth.authenticate(token.access_token)).rejects.toThrow("invalid_token");
  });
  it("rejects a persisted token for a different audience or scope", async () => {
    const f = fixture(); const { exchange } = await f.setup(); const token = await f.oauth.token(exchange);
    const key = `access-${hash(token.access_token)}`; const record = f.store.values.get(key)!;
    for (const patch of [{ resource: "https://other.test" }, { scope: "geupsikgil:write" }]) {
      f.store.values.set(key, { ...record, ...patch });
      await expect(f.oauth.authenticate(token.access_token)).rejects.toThrow("invalid_token");
    }
  });
  it("enforces shared, atomic rate limits across requests and resets only at expiry", async () => {
    const f = fixture(); const results = await Promise.allSettled(Array.from({ length: 8 }, () => f.oauth.rate("network", 3, 60_000)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    f.advance(60_000); await expect(f.oauth.rate("network", 3, 60_000)).resolves.toBeUndefined();
  });
  it("fails closed on insecure or path-bearing production origins", () => {
    for (const origin of ["http://mcp.example.test", "https://mcp.example.test/", "https://mcp.example.test/path"]) {
      expect(() => mcpConfig({ MCP_PUBLIC_ORIGIN: origin })).toThrow();
    }
    expect(mcpConfig({ MCP_PUBLIC_ORIGIN: "https://mcp.example.test" }).resource).toBe("https://mcp.example.test/mcp");
  });
});

describe("inventory write consent", () => {
  it("retains read-only grants and cannot upgrade via refresh", async () => {
    const f = fixture(); const { exchange } = await f.setup(); const token = await f.oauth.token(exchange);
    expect(token.scope).toBe("geupsikgil:read");
    await expect(f.oauth.token({ grant_type: "refresh_token", client_id: exchange.client_id, resource: f.config.resource,
      refresh_token: token.refresh_token, scope: "geupsikgil:read geupsikgil:inventory.write" })).rejects.toThrow("invalid_scope");
    expect((await f.oauth.writeAuthorization(token.access_token)).canWrite).toBe(false);
  });
  it("requires a new explicit PIN consent, preserves write scope on refresh and rejects viewers", async () => {
    const f = fixture(); const { request, exchange } = await f.setup();
    const consent = { ...request, scope: "geupsikgil:read geupsikgil:inventory.write" };
    const flow = await f.oauth.begin(consent);
    expect(flow.scope).toBe(consent.scope);
    const redirect = new URL(await f.oauth.authorize({ flow: flow.flow, pin: "test-only", consent: "allow" }, flow.browser, "test", "test"));
    const token = await f.oauth.token({ ...exchange, code: redirect.searchParams.get("code") });
    expect(token.scope).toBe(consent.scope);
    expect((await f.oauth.writeAuthorization(token.access_token)).canWrite).toBe(true);
    const next = await f.oauth.token({ grant_type: "refresh_token", client_id: exchange.client_id, resource: f.config.resource,
      refresh_token: token.refresh_token, scope: consent.scope });
    expect(next.scope).toBe(consent.scope);
    expect(await f.oauth.authenticate(next.access_token)).toHaveProperty("employeeId", "MCP-TEST");
    const denied = await f.oauth.begin(consent);
    f.identity.login.mockResolvedValueOnce({ ...(await f.oauth.authenticate(next.access_token)), roleScopes: ["viewer"] });
    await expect(f.oauth.authorize({ flow: denied.flow, pin: "test-only", consent: "allow" }, denied.browser, "test", "test")).rejects.toThrow("access_denied");
  });
});
