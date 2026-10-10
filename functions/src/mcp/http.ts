import { serveMcpLanding } from "./landing.js";
import { randomBytes, randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LoginRejectedError } from "../auth/login-service.js";
import { MCP_SCOPE, MCP_WRITE_SCOPE, MCP_SCOPES } from "./config.js";
import { McpOAuth, OAuthError } from "./oauth.js";
import { createMcpServer } from "./server.js";
import type { McpQueries } from "./queries.js";
import { MCP_VERSION } from "./contracts.js";
import { mcpTelemetry, type MetricSink } from "./telemetry.js";
import { measureStage } from "../shared/read-observation.js";

function loginPage(flow: string, scope: string, nonce: string) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/onnuri-icon-v1.png" type="image/png"><title>급식길 연결</title>
<style>body{font:18px system-ui;max-width:440px;margin:12vh auto;padding:24px;color:#172033}input,button{box-sizing:border-box;width:100%;padding:14px;font:inherit;margin-top:16px}button{background:#172033;color:white;border:0;border-radius:8px}p{line-height:1.6}</style>
<img src="/onnuri-icon-v1.png" alt="온누리종합식품" width="80" height="80"><h1>급식길 연결</h1><p>기존 직원 PIN으로 확인합니다. 연결한 클라이언트에서 거래처, 재고, 최근 납품사진을 조회할 수 있습니다. ${scope.split(" ").includes(MCP_WRITE_SCOPE) ? "재고 변경은 변경 전후 미리보기에서 직접 승인할 때만 실행합니다." : "업무 데이터 변경은 허용하지 않습니다."}</p>
<form method="post" action="/authorize"><input type="hidden" name="flow" value="${flow}"><input type="hidden" name="consent" value="allow"><label for="pin">직원 PIN</label><input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" required><button type="submit">확인하고 ${scope.split(" ").includes(MCP_WRITE_SCOPE) ? "조회·재고 변경" : "조회"} 연결 허용</button><p id="status" role="status" aria-live="polite"></p></form><p>PIN은 이 확인 화면에서만 사용됩니다. 취소하려면 창을 닫으세요.</p>
<script nonce="${nonce}">(()=>{const form=document.querySelector('form'),button=form.querySelector('button'),status=document.getElementById('status');let submitted=false;form.addEventListener('submit',event=>{if(submitted){event.preventDefault();return;}submitted=true;button.disabled=true;status.textContent='연결을 확인하고 있습니다. 잠시 기다려 주세요.';});window.addEventListener('pageshow',event=>{if(event.persisted){submitted=true;button.disabled=true;form.querySelector('#pin').value='';status.textContent='이 인증 화면은 다시 사용할 수 없습니다. ChatGPT에서 다시 연결해 주세요.';}});})();</script></html>`;
}
function authorizationErrorPage(status: number) {
  const message = status === 429 ? "인증 시도가 많습니다. 잠시 후 ChatGPT에서 다시 연결해 주세요."
    : status === 401 ? "PIN을 확인하지 못했습니다. ChatGPT에서 다시 연결한 뒤 PIN을 확인해 주세요."
      : status === 403 ? "이 연결에 필요한 권한을 확인하지 못했습니다. ChatGPT에서 다시 연결하거나 관리자에게 확인해 주세요."
        : status >= 500 ? "연결 확인 중 문제가 발생했습니다. 잠시 후 ChatGPT에서 다시 연결해 주세요."
      : "인증 요청이 만료되었거나 이미 처리되었습니다. ChatGPT로 돌아가 연결 상태를 확인하고, 연결되지 않았다면 다시 연결해 주세요.";
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>급식길 연결 확인</title><style>body{font:18px system-ui;max-width:440px;margin:12vh auto;padding:24px;color:#172033;line-height:1.6}</style><h1>연결을 다시 확인해 주세요</h1><p>${message}</p><p>이 화면을 새로고침하거나 PIN을 다시 제출하지 마세요.</p></html>`;
}
export function createMcpHttpApp(oauth: McpOAuth, sourceKey: (ip: string) => string, queries?: McpQueries,
  options: { metricSink?: MetricSink; toolTimeoutMs?: number } = {}) {
  const app = express();
  const { config } = oauth;
  const allowedOrigins = new Set([config.origin, ...config.allowedRedirectUris.map((uri) => new URL(uri).origin)]);
  app.disable("x-powered-by");
  app.use(mcpTelemetry(options.metricSink));
  // Firebase/Cloud Run append the proxy peer; never trust arbitrary leftmost XFF entries.
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.set({ "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY",
      "Content-Security-Policy": `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self' ${[...allowedOrigins].join(" ")}; frame-ancestors 'none'; base-uri 'none'`,
      "Strict-Transport-Security": "max-age=31536000" });
    if (!config.emulator && !req.secure) { res.status(400).json({ error: "https_required" }); return; }
    const origin = req.get("origin");
    if (origin && !allowedOrigins.has(origin)) { res.status(403).json({ error: "invalid_origin" }); return; }
    if (origin) res.set({ "Access-Control-Allow-Origin": origin, "Vary": "Origin",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version" });
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    // Functions pre-parses bodies. Check its rawBody too, before trusting Express's parser limit.
    const raw = (req as express.Request & { rawBody?: Buffer }).rawBody;
    if ((raw?.length ?? 0) > 16_384 || Number(req.get("content-length") ?? 0) > 16_384) {
      res.status(413).json({ error: "request_too_large" }); return;
    }
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.use(express.urlencoded({ extended: false, limit: "4kb", parameterLimit: 20 }));
  const protectedMetadata = { resource: config.resource, authorization_servers: [config.origin],
    scopes_supported: MCP_SCOPES, bearer_methods_supported: ["header"], resource_name: "급식길 사내 업무" };
  app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"], (_req, res) => { res.json(protectedMetadata); });
  app.get("/.well-known/oauth-authorization-server", (_req, res) => { res.json({ issuer: config.origin,
    authorization_endpoint: `${config.origin}/authorize`, token_endpoint: `${config.origin}/token`,
    registration_endpoint: `${config.origin}/register`, revocation_endpoint: `${config.origin}/revoke`,
    response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"], revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"], scopes_supported: MCP_SCOPES,
    authorization_response_iss_parameter_supported: true,
  }); });
  app.get("/health", (_req, res) => { res.json({ service: "geupsikgil-mcp", version: MCP_VERSION, readOnly: false, writesRequireApproval: true }); });
  app.use(async (req, _res, next) => {
    await measureStage("rateLimit", async () => {
      await oauth.rate("http-global", 600, 60_000);
      await oauth.rate(`http-${sourceKey(req.ip ?? "unknown")}`, 180, 60_000);
    });
    next();
  });
  app.use(serveMcpLanding);
  app.post("/register", async (req, res) => {
    await oauth.rate("register-global", 20, 60 * 60_000);
    res.status(201).json(await oauth.register(req.body));
  });
  app.get("/authorize", async (req, res) => {
    await oauth.rate("authorize-global", 100, 10 * 60_000);
    const { flow, browser, scope } = await oauth.begin(req.query);
    // Firebase Hosting forwards only __session cookies; this is an opaque CSRF binding, not a login token.
    res.cookie("__session", browser, { httpOnly: true, secure: !config.emulator, sameSite: "lax", path: "/authorize", maxAge: 10 * 60_000 });
    const nonce = randomBytes(24).toString("base64");
    res.set("Content-Security-Policy", `${res.get("Content-Security-Policy")}; script-src 'nonce-${nonce}'`);
    res.type("html").send(loginPage(flow, scope, nonce));
  });
  app.post("/authorize", async (req, res) => {
    if (req.get("origin") !== config.origin) throw new OAuthError("invalid_origin", 403);
    // PIN is only needed at first connection, so a small global budget is appropriate for 2–3 staff.
    await oauth.rate("pin-global-hour", 20, 60 * 60_000);
    await oauth.rate("pin-global-day", 60, 24 * 60 * 60_000);
    const browser = /(?:^|;\s*)__session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.get("cookie") ?? "")?.[1] ?? "";
    const redirect = await oauth.authorize(req.body, browser, `mcp|${sourceKey(req.ip ?? "unknown")}`, randomUUID());
    res.clearCookie("__session", { httpOnly: true, secure: !config.emulator, sameSite: "lax", path: "/authorize" });
    res.redirect(303, redirect);
  });
  app.post("/token", async (req, res) => { res.json(await oauth.token(req.body)); });
  app.post("/revoke", async (req, res) => { await oauth.revoke(req.body); res.status(200).end(); });
  app.all("/mcp", async (req, res) => {
    const header = req.get("authorization") ?? "";
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(header)?.[1] ?? "";
    const actor = await measureStage("authorization", () => oauth.authenticate(token));
    await measureStage("rateLimit", () => oauth.rate(`actor-${actor.uid}`, 120, 60_000));
    if (req.method !== "POST") { res.set("Allow", "POST").status(405).end(); return; }
    // Stateless Streamable HTTP: no affinity, in-memory session or long SSE connection required.
    const server = createMcpServer(actor, () => oauth.authenticate(token), queries, options.toolTimeoutMs, true, { publicOrigin: config.origin,
      resourceMetadata: `${config.origin}/.well-known/oauth-protected-resource/mcp`, authorization: () => oauth.writeAuthorization(token) });
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    res.on("close", () => { void transport.close(); void server.close(); });
    // SDK 1.32 declares optional callbacks as unions with undefined; runtime conforms to Transport.
    await server.connect(transport as Transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.use((_req, res) => { res.status(404).json({ error: "not_found" }); });
  const errors: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    void _next;
    const status = error instanceof OAuthError ? error.status : error instanceof LoginRejectedError
      ? error.kind === "rate-limited" ? 429 : 401 : 500;
    if (status === 401) res.set("WWW-Authenticate", `Bearer resource_metadata="${config.origin}/.well-known/oauth-protected-resource/mcp", scope="${MCP_SCOPE}"`);
    if (status === 429) res.set("Retry-After", "60");
    if (!res.headersSent && req.path === "/authorize" && req.accepts(["html", "json"]) === "html") {
      res.status(status).type("html").send(authorizationErrorPage(status)); return;
    }
    if (!res.headersSent) res.status(status).json({ error: error instanceof OAuthError ? error.code
      : error instanceof LoginRejectedError ? "authentication_failed" : "server_error" });
    // Deliberately do not log error objects, request URLs/bodies, PINs, tokens or business data.
  };
  app.use(errors);
  return app;
}
