import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpHttpApp } from "../../src/mcp/http.js";
import { OAuthError } from "../../src/mcp/oauth.js";
import { fixture } from "./fixture.js";

const servers: Server[] = [];
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } });
const navigation = { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" };
async function start() {
  const f = fixture(), server = createServer(createMcpHttpApp(f.oauth, (ip) => ip, undefined, { metricSink: () => {} }));
  servers.push(server); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // node fetch changes Sec-Fetch-Mode; raw HTTP lets us exercise real browser headers.
  const get = (headers: Record<string, string> = navigation, path = "/mcp", method = "GET") => new Promise<{ status: number; headers: import("node:http").IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = request(`${origin}${path}`, { method, headers }, (res) => {
      const chunks: Buffer[] = []; res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    }); req.on("error", reject); req.end(headers["Content-Length"] ? Buffer.alloc(Number(headers["Content-Length"]), 32) : undefined);
  });
  return { ...f, get };
}
describe("MCP document navigation isolation", () => {
  it("serves only the public design behind common guards with a fresh CSP nonce and no cache", async () => {
    const f = await start(), auth = vi.spyOn(f.oauth, "authenticate"), rate = vi.spyOn(f.oauth, "rate");
    const a = await f.get(), b = await f.get();
    expect(a.status).toBe(200); expect(a.headers["content-type"]).toContain("text/html");
    expect(a.body).toContain("/mcp-assets/v1/onnuri-food-logo.png"); expect(a.body).not.toMatch(/DESIGN PREVIEW|__LANDING_NONCE__/);
    const nonce = /<script nonce="([^"]+)"/.exec(a.body)![1];
    expect(a.headers["content-security-policy"]).toContain(`script-src 'nonce-${nonce}'`);
    expect(b.body).not.toContain(nonce); expect(a.headers["content-security-policy"]).toContain("font-src 'self'");
    expect(a.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(a.headers["x-frame-options"]).toBe("DENY"); expect(a.headers["x-content-type-options"]).toBe("nosniff");
    expect(a.headers["set-cookie"]).toBeUndefined(); expect(auth).not.toHaveBeenCalled();
    expect(rate).toHaveBeenCalledWith("http-global", 600, 60_000);
    expect(f.identity.login).not.toHaveBeenCalled(); expect(f.identity.verify).not.toHaveBeenCalled();
  });
  it.each([
    {}, { Accept: "text/html" }, { ...navigation, Accept: "*/*" },
    { ...navigation, Accept: "text/html;q=0" }, { ...navigation, Accept: "text/html;q=oops" },
    { ...navigation, Accept: "application/json" }, { ...navigation, Accept: "text/event-stream" },
    { ...navigation, Accept: "text/html,application/json;q=0" }, { ...navigation, Accept: "text/html,text/event-stream" },
    { ...navigation, "Sec-Fetch-Mode": "cors" }, { ...navigation, "Sec-Fetch-Dest": "iframe" },
    { ...navigation, Authorization: "" }, { ...navigation, Authorization: "Bearer invalid" },
    { ...navigation, "MCP-Protocol-Version": "2025-03-26" }, { ...navigation, "MCP-Session-Id": "synthetic" },
    { ...navigation, "Last-Event-ID": "1" }, { ...navigation, "Content-Type": "application/json" },
  ])("preserves the unauthenticated protocol challenge for %j", async (headers) => {
    const f = await start(), response = await f.get(headers);
    expect(response.status).toBe(401); expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["www-authenticate"]).toContain('Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"');
    expect(response.headers["cache-control"]).toContain("no-store");
  });
  it("keeps POST/HEAD, query strings and valid-token GET on the original MCP path", async () => {
    const f = await start();
    for (const method of ["POST", "HEAD", "DELETE"]) expect((await f.get(navigation, "/mcp", method)).status).toBe(401);
    expect((await f.get(navigation, "/mcp?ignored=1")).status).toBe(401);
    const { exchange } = await f.setup(), token = await f.oauth.token(exchange);
    const response = await f.get({ ...navigation, Authorization: `Bearer ${token.access_token}` });
    expect(response.status).toBe(405); expect(response.headers.allow).toBe("POST");
  });
  it("preserves discovery, HTTPS, Origin, body size and rate guards for documents and assets", async () => {
    const f = await start();
    for (const path of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-authorization-server"]) {
      const r = await f.get(navigation, path); expect(r.status).toBe(200); expect(r.headers["content-type"]).toContain("application/json");
    }
    for (const path of ["/mcp", "/mcp-assets/v1/onnuri-text.woff2"]) {
      expect((await f.get({ ...navigation, Origin: "https://untrusted.example" }, path)).status).toBe(403);
      expect((await f.get({ ...navigation, "Content-Length": "16385" }, path)).status).toBe(413);
      f.config.emulator = false;
      expect((await f.get(navigation, path)).status).toBe(400); f.config.emulator = true;
    }
    vi.spyOn(f.oauth, "rate").mockRejectedValue(new OAuthError("rate_limited", 429));
    const limited = await f.get(); expect(limited.status).toBe(429); expect(limited.headers["retry-after"]).toBe("60");
  });
  it("serves only allowlisted packaged assets without relaxing cache or exposing files", async () => {
    const f = await start();
    for (const [file, type] of [["onnuri-text.woff2", "font/woff2"], ["onnuri-editorial.woff2", "font/woff2"], ["onnuri-food-logo.png", "image/png"], ["FONT-LICENSE.txt", "text/plain"]]) {
      const r = await f.get({}, `/mcp-assets/v1/${file}`);
      expect(r.status).toBe(200); expect(r.headers["content-type"]).toContain(type); expect(r.headers["cache-control"]).toContain("no-store");
    }
    for (const path of ["/mcp-assets/v1/index.html", "/mcp-assets/v1/unknown", "/mcp-assets/v1/%2e%2e/http.ts"])
      expect((await f.get({}, path)).status).toBe(404);
  });
});
