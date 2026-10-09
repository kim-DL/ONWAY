import { createHash, randomBytes } from "node:crypto";
import { vi } from "vitest";
import { McpOAuth } from "../../src/mcp/oauth.js";
import type { McpPrincipal } from "../../src/mcp/authorization.js";
import type { McpStore, Stored, StoreTransaction } from "../../src/mcp/store.js";

export class MemoryStore implements McpStore {
  values = new Map<string, Stored>();
  private queue: Promise<unknown> = Promise.resolve();
  async get<T extends Stored>(key: string) { return this.values.get(key) as T ?? null; }
  async set(key: string, value: Stored) { this.values.set(key, value); }
  transaction<T>(action: (tx: StoreTransaction) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const writes: (() => void)[] = [];
      const result = await action({ get: this.get.bind(this), set: (key, value) => { writes.push(() => this.values.set(key, value)); },
        delete: (key) => { writes.push(() => this.values.delete(key)); } });
      writes.forEach((write) => write()); return result;
    });
    this.queue = run.catch(() => undefined); return run;
  }
}
export const principal: McpPrincipal = { uid: "mcp-test-uid", employeeId: "MCP-TEST", sessionVersion: 1,
  permissionsVersion: 1, roleScopes: ["delivery"], isAdmin: false };
export function fixture(origin = "https://mcp.example.test") {
  const store = new MemoryStore(); let now = Date.now();
  const config = { origin, resource: `${origin}/mcp`, allowedRedirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"], emulator: true };
  const identity = { login: vi.fn().mockResolvedValue(principal), verify: vi.fn().mockResolvedValue(undefined) };
  const oauth = new McpOAuth(config, store, identity, () => now);
  const setup = async () => {
    const client = await oauth.register({ redirect_uris: config.allowedRedirectUris, token_endpoint_auth_method: "none" });
    const verifier = randomBytes(32).toString("base64url");
    const request = { response_type: "code" as const, client_id: client.client_id,
      redirect_uri: config.allowedRedirectUris[0]!, state: "test-state", resource: config.resource,
      scope: "geupsikgil:read", code_challenge_method: "S256" as const,
      code_challenge: createHash("sha256").update(verifier).digest("base64url") };
    const flow = await oauth.begin(request);
    const redirect = new URL(await oauth.authorize({ flow: flow.flow, pin: "test-only", consent: "allow" }, flow.browser, "test-source", "request-test"));
    const exchange = { grant_type: "authorization_code" as const, client_id: client.client_id,
      redirect_uri: request.redirect_uri, resource: config.resource, code_verifier: verifier, code: redirect.searchParams.get("code")! };
    return { request, flow, redirect, exchange };
  };
  return { store, config, oauth, identity, setup, advance: (milliseconds: number) => { now += milliseconds; } };
}
