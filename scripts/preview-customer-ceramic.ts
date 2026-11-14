import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { buildCustomerCeramicFixture } from "../tests/helpers/build-customer-ceramic-fixture";
import { inventoryLocationStudyCss, inventoryLocationStudyPage } from "./inventory-location-study";

const fixture = await buildCustomerCeramicFixture(true, false, process.env.SCHOOL_PREVIEW === "true" || process.env.SALES_PREVIEW === "true", process.env.SALES_PREVIEW === "true");
const publicRoot = resolve("public");
// The optional divider exists only in this isolated preview until the user selects it.
const dividerCss = `html[data-preview-divider] .workspace-shell:is([data-mode="customer"],[data-mode="inventory"]) > .workspace-header{position:relative}html[data-preview-divider] .workspace-shell:is([data-mode="customer"],[data-mode="inventory"]) > .workspace-header::after{content:"";position:absolute;bottom:0;left:12px;right:12px;height:1px;pointer-events:none;background:linear-gradient(90deg,transparent,#64748b24 16%,#64748b24 84%,transparent)}`;
const app = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>거래처 세라믹 · 로컬 미리보기</title><style>${fixture.css}${dividerCss}${inventoryLocationStudyCss}</style><div id="root"></div><script>document.documentElement.toggleAttribute('data-preview-divider',new URLSearchParams(location.search).has('divider'));const variant=new URLSearchParams(location.search).get('location-style');if(['silver','underline','motion-all','motion-none','motion-first'].includes(variant))document.documentElement.dataset.locationStyle=variant;</script><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>`;
const preview = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>급식길 · 배포 전 미리보기</title>
<style>body{margin:0;background:#e9edf2;color:#243b55;font:14px system-ui;text-align:center}header{padding:12px}p{margin:6px 0 10px}button,a{font:inherit;color:inherit;margin:0 3px;padding:6px 8px}label{display:block;margin-top:10px}iframe{display:block;width:min(390px,100%);height:844px;max-height:calc(100dvh - 160px);margin:0 auto;border:1px solid #bec8d4;border-radius:12px;background:#fff}</style>
<header><strong>급식길 · 간격 조정 비교</strong><p>예시 데이터 · 운영 연결 없음 · 재고 모드도 확인할 수 있습니다.</p><button data-width="320">320px</button><button data-width="390">390px</button><button data-width="430">430px</button><a href="/app" target="_blank" rel="noopener">데스크톱 화면</a><label><input id="divider" type="checkbox"> 헤더 아래 가는 선 비교 (미확정)</label></header>
<iframe src="/app" title="거래처 화면 미리보기"></iframe><script>const frame=document.querySelector('iframe');const divider=document.getElementById('divider');divider.checked=new URLSearchParams(location.search).has('divider');function syncDivider(){frame.contentDocument.documentElement.toggleAttribute('data-preview-divider',divider.checked)}frame.onload=syncDivider;divider.onchange=syncDivider;document.querySelectorAll('[data-width]').forEach(b=>b.onclick=()=>frame.style.width='min('+b.dataset.width+'px,100%)');</script></html>`;
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  // Defense in depth: fixture cannot call production even through an unmocked dependency.
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self'; media-src blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/favicon.ico") { res.writeHead(204).end(); return; }
  if (url.pathname === "/inventory-study") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(inventoryLocationStudyPage); return; }
  if (url.pathname === "/" || url.pathname === "/app") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(url.pathname === "/" ? preview : app); return; }
  const path = resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
  if (!path.startsWith(publicRoot + sep)) { res.writeHead(403).end(); return; }
  try { const body = await readFile(path); res.setHeader("Content-Type", ({ ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" } as Record<string, string>)[extname(path)] ?? "application/octet-stream"); res.end(body); }
  catch { res.writeHead(404).end(); }
});
server.listen(Number(process.env.CERAMIC_PREVIEW_PORT ?? 0), "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string") console.log(`CERAMIC_PREVIEW_URL=http://127.0.0.1:${address.port}/`);
});
