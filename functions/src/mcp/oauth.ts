import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import { inventoryActorCanWrite } from "../inventory/inventory-authorization.js";
import { MCP_SCOPE, MCP_WRITE_SCOPE, validMcpScope, type McpConfig } from "./config.js";
import type { McpIdentity, McpPrincipal } from "./authorization.js";
import type { McpStore, Stored, StoreTransaction } from "./store.js";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const ACCESS_MS = 15 * 60_000;
const SESSION_MS = 30 * 24 * 60 * 60_000;
const FLOW_MS = 10 * 60_000;
const CODE_MS = 60_000;
const identifier = z.string().min(1).max(200);
const opaque = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const challenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const resource = z.string().url().max(500);
const scope = z.string().max(100).refine(validMcpScope);
const authInput = z.object({ response_type: z.literal("code"), client_id: identifier,
  redirect_uri: z.string().url().max(500), state: z.string().min(1).max(512),
  code_challenge: challenge, code_challenge_method: z.literal("S256"), resource, scope: scope.default(MCP_SCOPE),
// RFC 6749 authorization/token endpoints ignore unknown extension parameters.
// ChatGPT sends ui_locales; only the validated security parameters are persisted.
}).strip();
const tokenInput = z.discriminatedUnion("grant_type", [
  z.object({ grant_type: z.literal("authorization_code"), client_id: identifier, code: opaque,
    redirect_uri: z.string().url().max(500), code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/), resource }).strip(),
  z.object({ grant_type: z.literal("refresh_token"), client_id: identifier, refresh_token: opaque, resource,
    scope: scope.optional() }).strip(),
]);
type Client = Stored & { redirectUris: string[] };
type Authorization = z.infer<typeof authInput>;
type Flow = Stored & { request: Authorization; browserHash: string };
type Code = Stored & { request: Authorization; principal: McpPrincipal };
type Family = Stored & { principal: McpPrincipal; clientId: string; revoked: boolean; resource: string; scope: string };
type Token = Stored & { familyId: string; clientId: string; used: boolean; resource: string; scope: string };
export class OAuthError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
function check(condition: unknown, code = "invalid_grant", status = 400): asserts condition {
  if (!condition) throw new OAuthError(code, status);
}
function equal(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class McpOAuth {
  constructor(readonly config: McpConfig, private readonly store: McpStore,
    readonly identity: McpIdentity, private readonly now: () => number = Date.now) {}
  private live(record: Stored | null): boolean { return Boolean(record && record.expiresAt > this.now()); }
  async rate(key: string, limit: number, windowMs: number) {
    const now = this.now();
    const allowed = await this.store.transaction(async (tx) => {
      const id = `rate-${hash(key)}`;
      const previous = await tx.get<Stored & { count: number }>(id);
      const record = previous && this.live(previous) ? previous : { expiresAt: now + windowMs, count: 0 };
      if (record.count >= limit) return false;
      tx.set(id, { ...record, count: record.count + 1 });
      return true;
    });
    check(allowed, "rate_limited", 429);
  }
  async register(input: unknown) {
    const parsed = z.object({ redirect_uris: z.array(z.string().url().max(500)).min(1).max(5),
      client_name: z.string().max(120).optional(), token_endpoint_auth_method: z.literal("none").optional(),
      grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).max(2).optional(),
      response_types: z.array(z.literal("code")).max(1).optional(), scope: scope.optional(),
    }).safeParse(input);
    check(parsed.success, "invalid_client_metadata");
    check(parsed.data.redirect_uris.every((uri) => this.config.allowedRedirectUris.includes(uri)), "invalid_redirect_uri");
    const clientId = `mcp_${secret()}`;
    await this.store.set(`client-${hash(clientId)}`, { redirectUris: parsed.data.redirect_uris, expiresAt: this.now() + 365 * 24 * 60 * 60_000 });
    return { client_id: clientId, client_id_issued_at: Math.floor(this.now() / 1000),
      redirect_uris: parsed.data.redirect_uris, token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: parsed.data.scope ?? MCP_SCOPE };
  }
  async begin(input: unknown) {
    const parsed = authInput.safeParse(input);
    check(parsed.success, "invalid_request");
    const request = parsed.data;
    check(request.resource === this.config.resource, "invalid_target");
    const client = await this.store.get<Client>(`client-${hash(request.client_id)}`);
    check(this.live(client) && client?.redirectUris.includes(request.redirect_uri)
      && this.config.allowedRedirectUris.includes(request.redirect_uri), "invalid_client");
    const flow = secret(); const browser = secret();
    await this.store.set(`flow-${hash(flow)}`, { request, browserHash: hash(browser), expiresAt: this.now() + FLOW_MS });
    return { flow, browser, scope: request.scope };
  }
  async authorize(input: unknown, browser: string, source: string, requestId: string) {
    const parsed = z.object({ flow: opaque, pin: z.string().max(32), consent: z.literal("allow") }).strict().safeParse(input);
    check(parsed.success, "invalid_request");
    const key = `flow-${hash(parsed.data.flow)}`;
    const flow = await this.store.transaction(async (tx) => {
      const record = await tx.get<Flow>(key);
      check(this.live(record) && record && equal(record.browserHash, hash(browser)), "invalid_request");
      tx.delete(key); // Browser-bound, one use, including failed PIN attempts.
      return record;
    });
    const principal = await this.identity.login(parsed.data.pin, source, requestId);
    check(!flow.request.scope.split(" ").includes(MCP_WRITE_SCOPE) || inventoryActorCanWrite(principal), "access_denied", 403);
    const code = secret();
    await this.store.set(`code-${hash(code)}`, { request: flow.request, principal, expiresAt: this.now() + CODE_MS });
    const redirect = new URL(flow.request.redirect_uri);
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("state", flow.request.state);
    redirect.searchParams.set("iss", this.config.origin);
    return redirect.toString();
  }
  private issue(tx: StoreTransaction, familyId: string, family: Family) {
    const access = secret(); const refresh = secret();
    const expiresAt = Math.min(this.now() + ACCESS_MS, family.expiresAt);
    const record = { familyId, clientId: family.clientId, used: false, resource: family.resource, scope: family.scope };
    tx.set(`access-${hash(access)}`, { ...record, expiresAt });
    tx.set(`refresh-${hash(refresh)}`, { ...record, expiresAt: family.expiresAt });
    return { access_token: access, refresh_token: refresh, token_type: "Bearer", scope: family.scope,
      expires_in: Math.max(0, Math.floor((expiresAt - this.now()) / 1000)) };
  }
  async token(input: unknown) {
    const parsed = tokenInput.safeParse(input);
    check(parsed.success, "invalid_request");
    const request = parsed.data;
    check(request.resource === this.config.resource, "invalid_target");
    if (request.grant_type === "authorization_code") {
      const key = `code-${hash(request.code)}`;
      const stored = await this.store.get<Code>(key);
      check(this.live(stored) && stored, "invalid_grant");
      await this.identity.verify(stored.principal);
      return this.store.transaction(async (tx) => {
        const code = await tx.get<Code>(key);
        check(this.live(code) && code);
        check(code.request.client_id === request.client_id && code.request.redirect_uri === request.redirect_uri
          && code.request.resource === request.resource && equal(code.request.code_challenge,
            createHash("sha256").update(request.code_verifier).digest("base64url")));
        const familyId = secret();
        const family: Family = { principal: code.principal, clientId: request.client_id, revoked: false,
          resource: this.config.resource, scope: code.request.scope, expiresAt: this.now() + SESSION_MS };
        tx.delete(key); tx.set(`family-${hash(familyId)}`, family);
        return this.issue(tx, familyId, family);
      });
    }
    const key = `refresh-${hash(request.refresh_token)}`;
    const record = await this.store.get<Token>(key);
    check(this.live(record) && record && record.clientId === request.client_id);
    const familyKey = `family-${hash(record.familyId)}`;
    const current = await this.store.get<Family>(familyKey);
    check(this.live(current) && current && !current.revoked);
    await this.identity.verify(current.principal);
    const result = await this.store.transaction(async (tx) => {
      const token = await tx.get<Token>(key);
      const family = await tx.get<Family>(familyKey);
      check(this.live(token) && token && this.live(family) && family && !family.revoked);
      check(token.clientId === request.client_id && family.clientId === request.client_id
        && token.resource === this.config.resource && family.resource === this.config.resource && token.scope === family.scope);
      // Refresh never upgrades or silently changes the original consent.
      check(request.scope === undefined || request.scope === family.scope, "invalid_scope");
      if (token.used) { tx.set(familyKey, { ...family, revoked: true }); return null; }
      tx.set(key, { ...token, used: true }); // Retained until family expiry to detect replay.
      return this.issue(tx, token.familyId, family);
    });
    check(result);
    return result;
  }
  async authenticate(bearer: string): Promise<McpPrincipal> {
    check(opaque.safeParse(bearer).success, "invalid_token", 401);
    const token = await this.store.get<Token>(`access-${hash(bearer)}`);
    check(this.live(token) && token && token.resource === this.config.resource && validMcpScope(token.scope), "invalid_token", 401);
    const family = await this.store.get<Family>(`family-${hash(token.familyId)}`);
    check(this.live(family) && family && !family.revoked && family.resource === this.config.resource
      && family.clientId === token.clientId && family.scope === token.scope, "invalid_token", 401);
    try { await this.identity.verify(family.principal); } catch { throw new OAuthError("invalid_token", 401); }
    return family.principal;
  }
  /** Stable session-family binding for previews; refresh does not invalidate a pending approval. */
  async writeAuthorization(bearer: string) {
    const tokenKey = `access-${hash(bearer)}`;
    const token = await this.store.get<Token>(tokenKey);
    check(this.live(token) && token, "invalid_token", 401);
    const familyKey = `family-${hash(token.familyId)}`;
    return { binding: familyKey, canWrite: token.scope.split(" ").includes(MCP_WRITE_SCOPE),
      check: async (transaction: Transaction) => {
        // Check consent/revocation/expiry in the SAME transaction as stock, audit and receipt.
        const db = getAdminFirestore();
        const records = await transaction.getAll(db.doc(`mcpPrivate/${tokenKey}`), db.doc(`mcpPrivate/${familyKey}`));
        const currentToken = records[0]?.data() as Token | undefined;
        const family = records[1]?.data() as Family | undefined;
        check(currentToken && family && this.live(currentToken) && this.live(family) && !family.revoked
          && currentToken.familyId === token.familyId && currentToken.clientId === family.clientId
          && currentToken.resource === this.config.resource && family.resource === this.config.resource
          && currentToken.scope === family.scope, "invalid_token", 401);
        if (!family.scope.split(" ").includes(MCP_WRITE_SCOPE)) throw new HttpsError("permission-denied", "Write consent required");
      } };
  }
  async revoke(input: unknown) {
    const parsed = z.object({ token: opaque, client_id: identifier,
      token_type_hint: z.enum(["access_token", "refresh_token"]).optional() }).strict().safeParse(input);
    check(parsed.success, "invalid_request");
    const request = parsed.data;
    for (const kind of ["access", "refresh"]) {
      const token = await this.store.get<Token>(`${kind}-${hash(request.token)}`);
      if (token?.clientId !== request.client_id) continue;
      await this.store.transaction(async (tx) => {
        const key = `family-${hash(token.familyId)}`;
        const family = await tx.get<Family>(key);
        if (family) tx.set(key, { ...family, revoked: true });
      });
    }
  }
}
