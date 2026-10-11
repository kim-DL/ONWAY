export const MCP_SCOPE = "geupsikgil:read";
export const MCP_WRITE_SCOPE = "geupsikgil:inventory.write";
export const MCP_SCOPES = [MCP_SCOPE, MCP_WRITE_SCOPE] as const;
export function validMcpScope(value: string): boolean {
  const parts = value.split(" ");
  return parts.includes(MCP_SCOPE) && new Set(parts).size === parts.length
    && parts.every((part) => (MCP_SCOPES as readonly string[]).includes(part));
}
export interface McpConfig { origin: string; resource: string; allowedRedirectUris: string[]; emulator: boolean }
export function mcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const emulator = env.FUNCTIONS_EMULATOR === "true";
  const origin = env.MCP_PUBLIC_ORIGIN?.trim() ?? "";
  const url = new URL(origin);
  if (url.origin !== origin || (!emulator && url.protocol !== "https:")
    || (emulator && url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname))) {
    throw new Error("MCP_PUBLIC_ORIGIN must be a canonical HTTPS origin.");
  }
  const allowedRedirectUris = (env.MCP_REDIRECT_URIS ?? "https://chatgpt.com/connector_platform_oauth_redirect").split(",").map((v) => v.trim());
  for (const uri of allowedRedirectUris) {
    const redirect = new URL(uri);
    if (redirect.hash || redirect.username || redirect.password || (!emulator && redirect.protocol !== "https:")) throw new Error("Invalid MCP redirect allowlist.");
  }
  return { origin, resource: `${origin}/mcp`, allowedRedirectUris, emulator };
}
