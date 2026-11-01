import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { readStylesheet } from "../tests/helpers/read-stylesheet";
import { loginPaletteCss, loginColorStudyPage } from "./login-color-study";

// Real login presentation, isolated from Firebase and all production data.
const root = resolve(".");
const bundle = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AuthGate} from './src/features/auth/auth-gate';import {LaunchTimingProvider} from './src/features/auth/auth-loading';createRoot(document.getElementById('root')).render(<LaunchTimingProvider><AuthGate/></LaunchTimingProvider>);`, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, outfile: "login-preview.js", format: "iife", platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "isolated-login", setup(builder) {
    builder.onResolve({ filter: /auth-context$|^next\/dynamic$|performance-monitor$|app-shell\/app-shell$/ }, ({ path }) => ({ path, namespace: "login-preview" }));
    builder.onLoad({ filter: /.*/, namespace: "login-preview" }, ({ path }) => {
      let contents = "";
      if (path.endsWith("auth-context")) contents = `const reject=async()=>{await new Promise(r=>setTimeout(r,650));throw new Error('로컬 디자인 미리보기입니다. 실제 로그인은 연결하지 않았습니다.');};export const useAuth=()=>({state:{status:'unauthenticated'},login:reject,loginWithGoogle:reject});`;
      else if (path === "next/dynamic") contents = "export default function dynamic(){return ()=>null}";
      else if (path.endsWith("app-shell/app-shell")) contents = "export const AppShell=()=>null";
      else contents = "export const markAppBootReady=()=>{}";
      return { contents, loader: "tsx", resolveDir: root };
    });
  } }],
});
const css = (await postcss([tailwindcss()]).process(readStylesheet(new URL("../src/app/globals.css", import.meta.url)), { from: resolve("src/app/globals.css") })).css + (bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "");
const app = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>급식길 · 로그인 랜딩 미리보기</title><style>${css}</style><div id="root"></div><script>${bundle.outputFiles[0]!.text.replaceAll("</script>", "<\\/script>")}</script></html>`;
const review = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>급식길 · 새 로그인 디자인</title><style>*{box-sizing:border-box}body{margin:0;background:#dfe3df;color:#29433c;font:13px system-ui}header{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:12px;padding:16px}a,button{font:inherit;color:inherit;border:1px solid #aebcb4;border-radius:6px;padding:6px 10px;background:#f5f7f3;text-decoration:none;cursor:pointer}iframe{display:block;width:min(390px,100%);height:900px;border:0;margin:0 auto 24px;box-shadow:0 12px 40px #24362c18;border-radius:18px}small{display:block;text-align:center;margin:0 0 16px;color:#586b61}</style><header><strong>급식길 · 로그인 랜딩</strong><button data-width="320">320</button><button data-width="390">390</button><button data-width="430">430</button><a href="/app">넓은 화면</a></header><small>디자인 미리보기 · 실제 로그인 연결 없음</small><iframe src="/app" title="모바일 로그인 미리보기"></iframe><script>document.querySelectorAll('button').forEach(b=>b.onclick=()=>document.querySelector('iframe').style.width='min('+b.dataset.width+'px,100%)')</script></html>`;
const publicRoot = resolve("public");
createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/favicon.ico") { res.writeHead(204).end(); return; }
  if (url.pathname === "/colors") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(loginColorStudyPage); return; }
  if (url.pathname === "/" || url.pathname === "/app") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(url.pathname === "/" ? review : app.replace("</style>", `${loginPaletteCss(url.searchParams.get("palette"))}</style>`)); return; }
  const path = resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
  if (!path.startsWith(publicRoot + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader("Content-Type", ({ ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" } as Record<string, string>)[extname(path)] ?? "application/octet-stream"); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
}).listen(51342, "127.0.0.1", () => console.log("LOGIN_PREVIEW_URL=http://127.0.0.1:51342/"));
