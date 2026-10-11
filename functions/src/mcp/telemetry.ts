import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { info } from "firebase-functions/logger";
import type { RequestHandler } from "express";
import { newReadObservation, withReadObservation } from "../shared/read-observation.js";
import { MCP_VERSION, type McpToolName, type McpErrorDetail } from "./contracts.js";

interface RequestContext { tool?: McpToolName; error?: McpErrorDetail["code"]; returnedCount?: number; complete?: boolean; retries?: number }
const context = new AsyncLocalStorage<RequestContext>();
export type MetricSink = (metric: Record<string, unknown>) => void;
const routes = new Set(["/mcp", "/health", "/register", "/authorize", "/token", "/revoke",
  "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-authorization-server"]);
const methods = new Set(["initialize", "notifications/initialized", "tools/list", "tools/call", "resources/list", "resources/read", "ping"]);
export function mcpTelemetry(sink: MetricSink = (metric) => info("mcp_request", metric)): RequestHandler {
  let firstRequest = true;
  return (req, res, next) => {
    const coldStart = firstRequest; firstRequest = false;
    const started = performance.now();
    const observation = newReadObservation();
    const state: RequestContext = {};
    const requestId = randomUUID();
    res.set("X-Request-Id", requestId);
    let emitted = false;
    const finish = () => {
      if (emitted) return;
      emitted = true;
      observation.cancelled = true;
      const method = req.body?.method;
      const bytes = Number(res.getHeader("content-length"));
      // Never spread request objects, raw errors, arguments, IDs or returned business data.
      const metric = { event: "mcp_request", version: MCP_VERSION, requestId, coldStart,
        route: routes.has(req.path) ? req.path : "other", rpcMethod: methods.has(method) ? method : "other",
        httpStatus: res.statusCode, completed: res.writableFinished, durationMs: Math.round(performance.now() - started),
        outcome: !res.writableFinished ? "cancelled" : res.statusCode >= 400 ? "http_error"
          : method === "tools/call" ? state.error ? "tool_error" : state.tool ? "success" : "protocol_rejection" : "success",
        readMetricsScope: req.path === "/mcp" ? "mcp_reads" : "partial",
        stageMs: Object.fromEntries(Object.entries(observation.milliseconds).map(([key, value]) => [key, Math.round(value)])),
        readOperations: { ...observation.operations }, documentReads: observation.documentReads, documentWriteAttempts: observation.documentWrites,
        storageBytes: observation.storageBytes, responseBytes: Number.isFinite(bytes) ? bytes : null, ...state };
      try { sink(metric); } catch { /* Metrics must not break a successful business response. */ }
    };
    res.once("finish", finish); res.once("close", finish);
    withReadObservation(observation, () => context.run(state, next));
  };
}
export function observeTool(tool: McpToolName) { const state = context.getStore(); if (state) state.tool = tool; }
export function observeToolError(error: McpErrorDetail["code"]) { const state = context.getStore(); if (state) state.error = error; }
export function observeRetry() { const state = context.getStore(); if (state) state.retries = (state.retries ?? 0) + 1; }
export function observeResult(returnedCount: number, complete?: boolean) {
  const state = context.getStore();
  if (state) { state.returnedCount = returnedCount; if (complete !== undefined) state.complete = complete; }
}
