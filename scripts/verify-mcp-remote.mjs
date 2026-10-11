// Public-only probe: never accepts credentials or calls a business tool.
import assert from "node:assert/strict";
const origin = process.argv[2];
if (!origin || new URL(origin).origin !== origin || !origin.startsWith("https://")) throw new Error("Usage: node scripts/verify-mcp-remote.mjs https://MCP_HOST");
const get = async (path) => {
  const response = await fetch(`${origin}${path}`, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200, `${path} must return 200`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  return response.json();
};
const protectedResource = await get("/.well-known/oauth-protected-resource/mcp");
assert.equal(protectedResource.resource, `${origin}/mcp`);
assert.deepEqual(protectedResource.authorization_servers, [origin]);
const authorization = await get("/.well-known/oauth-authorization-server");
assert.equal(authorization.issuer, origin);
assert.ok(authorization.code_challenge_methods_supported.includes("S256"));
assert.equal(authorization.authorization_response_iss_parameter_supported, true);
for (const key of ["authorization_endpoint", "token_endpoint", "registration_endpoint", "revocation_endpoint"]) assert.equal(new URL(authorization[key]).origin, origin);
const denied = await fetch(`${origin}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }), redirect: "error", signal: AbortSignal.timeout(15_000) });
assert.equal(denied.status, 401);
assert.match(denied.headers.get("www-authenticate") ?? "", /resource_metadata=/);
assert.match(denied.headers.get("cache-control") ?? "", /no-store/);
for (const accept of ["application/json", "text/event-stream", "text/html", "text/html, application/json"]) {
  const response = await fetch(`${origin}/mcp`, { headers: { accept }, signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 401, `non-navigation GET ${accept}`);
  assert.match(response.headers.get("www-authenticate") ?? "", /resource_metadata=/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
}
const crossOrigin = await fetch(`${origin}/mcp`, { headers: { origin: "https://invalid.example" }, signal: AbortSignal.timeout(15_000) });
assert.equal(crossOrigin.status, 403);
console.log("PASS: HTTPS, OAuth discovery/issuer/PKCE, unauthenticated POST/JSON/SSE/non-navigation GET 401, cross-origin denial, private no-store. Browser navigation and authenticated ChatGPT connection are separate checks.");
