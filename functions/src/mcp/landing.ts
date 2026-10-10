import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Request, RequestHandler } from "express";

// Bundled with employeeMcp; never resolve a request path against the filesystem.
const readAsset = (name: string) => readFileSync(new URL(`../../assets/mcp-landing/${name}`, import.meta.url));
const html = readAsset("index.html").toString("utf8");
const assets = new Map([
  ["onnuri-food-logo.png", "image/png"], ["onnuri-text.woff2", "font/woff2"],
  ["onnuri-editorial.woff2", "font/woff2"], ["FONT-LICENSE.txt", "text/plain; charset=utf-8"],
].map(([name, type]) => [`/mcp-assets/v1/${name}`, { type: type!, data: readAsset(name!) }]));

function isDocumentNavigation(req: Request): boolean {
  if (req.method !== "GET" || req.originalUrl !== "/mcp"
    || req.get("sec-fetch-mode") !== "navigate" || req.get("sec-fetch-dest") !== "document") return false;
  // Even malformed/empty protocol headers must keep the existing authentication path.
  if (["authorization", "mcp-protocol-version", "mcp-session-id", "last-event-id", "content-type"]
    .some((name) => name in req.headers)) return false;
  const accept = (req.get("accept") ?? "").toLowerCase().split(",").map((part) => part.trim().split(";").map((value) => value.trim()));
  if (accept.some(([mime]) => mime === "application/json" || mime?.endsWith("+json") || mime === "text/event-stream")) return false;
  return accept.some(([mime, ...params]) => mime === "text/html" && params.every((param) => !param.startsWith("q=") || /^q=(?:1(?:\.0{0,3})?|0?\.\d{1,3})$/.test(param) && Number(param.slice(2)) > 0));
}

// Mounted AFTER the common HTTPS/Origin/body/rate guards. No auth or business data here.
export const serveMcpLanding: RequestHandler = (req, res, next) => {
  if (isDocumentNavigation(req)) {
    const nonce = randomBytes(24).toString("base64");
    res.set("Content-Security-Policy", `${res.get("Content-Security-Policy")}; font-src 'self'; script-src 'nonce-${nonce}'`);
    res.type("html").send(html.replace("__LANDING_NONCE__", nonce));
    return;
  }
  const asset = assets.get(req.path);
  if (asset && (req.method === "GET" || req.method === "HEAD")) {
    res.set("Content-Type", asset.type).send(asset.data);
    return;
  }
  next();
};
