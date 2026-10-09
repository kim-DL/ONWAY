import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { createOpaqueKey } from "../auth/pin-crypto.js";
import { firebaseMcpIdentity } from "./authorization.js";
import { mcpConfig } from "./config.js";
import { createMcpHttpApp } from "./http.js";
import { McpOAuth } from "./oauth.js";
import { FirestoreMcpStore } from "./store.js";

const lookup = defineSecret("PIN_LOOKUP_SECRET");
const pepper = defineSecret("PIN_PEPPER");
let app: ReturnType<typeof createMcpHttpApp> | undefined;
export const employeeMcp = onRequest({ region: "asia-northeast3", memory: "512MiB", concurrency: 4,
  maxInstances: 3, timeoutSeconds: 60, invoker: "public", cors: false,
  ...(process.env.FUNCTIONS_EMULATOR === "true" ? {} : { serviceAccount: "mcp-readonly-runtime@onnuriway.iam.gserviceaccount.com" }),
  secrets: process.env.FUNCTIONS_EMULATOR === "true" ? [] : [lookup, pepper],
}, (req, res) => {
  try {
    if (!app) {
      const config = mcpConfig();
      const ids = (process.env.MCP_ALLOWED_EMPLOYEE_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
      if (!ids.length || ids.some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new Error("MCP employee allowlist required.");
      const identity = firebaseMcpIdentity(lookup.value(), pepper.value(), ids);
      app = createMcpHttpApp(new McpOAuth(config, new FirestoreMcpStore(), identity),
        (ip) => createOpaqueKey(ip, lookup.value(), "onnuriway-mcp-network-v1"));
    }
    app(req, res);
  } catch {
    res.set("Cache-Control", "no-store").status(503).json({ error: "mcp_not_configured" });
  }
});
