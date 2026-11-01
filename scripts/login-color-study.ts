/** Palette experiments are preview-only until the user chooses a direction. */
const palettes = {
  blue: { title: "급식길 블루 × 샌드크림", hero: "#e9f1ff", glow: "#f5f8ff", panel: "#f4eddf", ink: "#293e4c", accent: "#426e8b", brand: "#45677e", line: "#d9cebb", field: "#faf6ed", muted: "#e3dfd3", hint: "#646b66", action: "#38647c" },
  cream: { title: "오트크림 × 린넨샌드", hero: "#f2eee4", glow: "#faf6ed", panel: "#e9e1d3", ink: "#3d4640", accent: "#527866", brand: "#50665b", line: "#cfc3b0", field: "#f8f2e7", muted: "#dad7c9", hint: "#65685d", action: "#496b5b" },
} as const;

export function loginPaletteCss(key: string | null): string {
  if (!key || !(key in palettes)) return "";
  const p = palettes[key as keyof typeof palettes];
  return `
  .auth-shell--login {--landing-paper:${p.hero};--landing-ink:${p.ink};--line:${p.line};background:radial-gradient(ellipse at 15% 15%,${p.glow},transparent 65%),${p.hero};color:${p.ink}}
  .auth-shell--login .auth-header .auth-brand,.auth-shell--login .auth-brand strong{color:${p.brand}}
  .auth-shell--login .login-story h1{color:${p.ink}}
  .auth-shell--login .login-story h1 em{color:${p.accent}}
  .auth-shell--login .login-panel{background:${p.panel};border-left-color:#ffffff65}
  .auth-shell--login .login-card h2{color:${p.ink}}
  .auth-shell--login .pin-form>label,.auth-shell--login .login-support{color:${p.hint}}
  .auth-shell--login .pin-indicator span{border-color:${p.line};background:linear-gradient(145deg,#fffaf2,${p.field});box-shadow:inset 0 1px 0 #ffffffb0,0 2px 3px #7a6b4c06}
  .auth-shell--login .pin-indicator span::after{background:#abae9f}
  .auth-shell--login .pin-indicator span[data-filled="true"]{border-color:${p.accent};background:${p.field}}
  .auth-shell--login .pin-indicator span[data-filled="true"]::after{background:${p.action}}
  .auth-shell--login .pin-field:focus-within .pin-indicator span[data-current="true"]{border-color:${p.accent};box-shadow:0 0 0 3px ${p.accent}19}
  .auth-shell--login .pin-field:focus-within .pin-indicator:has(span:last-child[data-filled="true"]) span{border-color:${p.accent}}
  .auth-shell--login .pin-field:has(input[aria-invalid="true"]) .pin-indicator span{border-color:#b63f29}
  .auth-shell--login .pin-form button,.auth-shell--login .pin-form button[aria-busy="true"]{background:${p.action};border-color:${p.action};color:#fffaf1}
  .auth-shell--login .pin-form button:hover:not(:disabled){background:${p.ink}}
  .auth-shell--login .pin-form button:disabled{background:${p.muted};border-color:${p.line};color:${p.hint}}
  .auth-shell--login .admin-google-login{border-color:${p.line};color:${p.ink}}
  .auth-shell--login .admin-google-login:hover:not(:disabled){background:${p.field};border-color:${p.accent}}
  .auth-shell--login .google-mark{background:transparent}
  .auth-shell--login .admin-login-separator{gap:0}
  .motion-panel::before{background:linear-gradient(140deg,#e6e8dc,#99afa4 58%,#d5deca);box-shadow:0 22px 30px #4c655b29,0 5px 8px #52655420}
  .motion-panel__face{background:linear-gradient(145deg,#fffdf6,#f1f2e9 48%,#e1e7dc);box-shadow:inset 0 1px 1px #fff,inset -1px -2px 3px #59756b24}
  .motion-panel[data-position="1"],.motion-panel[data-position="2"]{filter:brightness(.96) saturate(.85)}
  .login-motion__floor{background:radial-gradient(ellipse,#8fa59b1c,transparent 68%)}
  @media(forced-colors:active){.auth-shell--login .auth-brand strong{color:CanvasText}.auth-shell--login .pin-form button:disabled{color:GrayText}.auth-shell--login .pin-indicator span{border-color:CanvasText}}
  `;
}

export const loginColorStudyPage = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>급식길 · 밝은 랜딩 색상 비교</title><style>
*{box-sizing:border-box}body{margin:0;background:#e5e5e0;color:#38443e;font-family:system-ui,sans-serif}header{max-width:900px;margin:auto;padding:26px 24px 18px}h1{margin:0;font-size:23px;letter-spacing:-.045em}header p{margin:10px 0 0;font-size:13px;line-height:1.7;color:#647068}.study{display:flex;justify-content:center;gap:32px;flex-wrap:wrap;padding:0 20px 32px}article{width:390px;max-width:100%}h2{font-size:15px;margin:0 0 8px;letter-spacing:-.02em}.note{font-size:12px;line-height:1.6;margin:0 0 14px;color:#647068}.palette{display:flex;gap:8px;align-items:center;margin-bottom:14px;font:10px ui-monospace,monospace}.swatch{width:16px;height:16px;display:inline-block;border-radius:50%;border:1px solid #47584d20}iframe{width:100%;height:800px;display:block;border:1px solid #ffffffa0;border-radius:20px;box-shadow:0 14px 36px #4d594c14;background:#f4eddf}a{display:inline-block;font-size:12px;color:#3b6559;text-underline-offset:4px;margin:14px 0}footer{max-width:850px;margin:auto;padding:0 20px 32px;font-size:12px;line-height:1.8;color:#647068}footer a{margin:0}
</style><header><h1>밝은 랜딩, 두 가지 방향</h1><p>같은 모션과 배치로 색감만 비교합니다. 소개 문구와 재생 컨트롤은 추가하지 않았습니다.</p></header><main class="study">${Object.entries(palettes).map(([key,p],index)=>`<article><h2>${index===0?"A · ":"B · "}${p.title}${index===0?" — 추천":""}</h2><p class="note">${index===0?"급식길의 연한 블루를 이어받고, PIN 영역은 따뜻하게.":"화면 전체를 따뜻하게 연결하고, 명도 차이로 영역을 구분."}</p><div class="palette"><span class="swatch" style="background:${p.hero}"></span>${p.hero.toUpperCase()}<span class="swatch" style="background:${p.panel}"></span>${p.panel.toUpperCase()}</div><iframe src="/app?palette=${key}" title="${p.title} 모바일 시안"></iframe><a href="/app?palette=${key}">이 색상으로 넓은 화면 보기 ↗</a></article>`).join("")}</main><footer>실제 로그인 컴포넌트의 색상 연구용 미리보기 · 운영 연결 없음 · 미배포<br>참고: <a href="https://www.apple.com/macbook-air/">Apple Sky Blue</a> · <a href="https://www.aesop.com/skin-care.html">Aesop</a> · <a href="https://www.muji.com/">MUJI</a>. 표기한 색상은 이 서비스들의 색을 복제한 값이 아닌 급식길 전용 제안입니다.</footer></html>`;
