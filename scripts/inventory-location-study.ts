// Local design study only. These styles are never imported by the application.
const group = 'html[data-location-style] [role="group"][aria-label="보관 장소"]';
export const inventoryLocationStudyCss = `
${group} > span, ${group} button i{display:none}
${group}{padding:0;border:0;border-radius:0;background:transparent;gap:4px}
${group} button{position:relative;isolation:isolate;min-height:48px;padding:8px 1px;border:0;border-radius:8px;background:transparent;color:#59636f;box-shadow:none;transition:color 140ms ease}
${group} button:active{transform:none;box-shadow:none}
${group} button[aria-pressed="true"]{background:transparent;border:0;box-shadow:none;color:#25364a;font-weight:700}
${group} button::before{content:"";position:absolute;z-index:-1;inset:4px 0;border-radius:8px;pointer-events:none}
html[data-location-style="silver"] [aria-label="보관 장소"] button[aria-pressed="true"]::before{background:linear-gradient(180deg,#fff,#f4f5f6);border:1px solid #c8cdd2;box-shadow:inset 0 1px 0 #fff,0 1px 2px #25364a14}
html[data-location-style="underline"] [role="group"][aria-label="보관 장소"] button::before{inset:auto 24% 4px;height:2px;border-radius:2px}
html[data-location-style="underline"] [role="group"][aria-label="보관 장소"] button[aria-pressed="true"]::before{background:#3d586f}
@media(forced-colors:active){${group} button[aria-pressed="true"]{outline:2px solid Highlight;outline-offset:-3px}}
html[data-location-style^="motion-"] [role="group"][aria-label="보관 장소"]{position:relative;--selected:0}
html[data-location-style^="motion-"] [aria-label="보관 장소"]:has(button:nth-child(2)[aria-pressed="true"]){--selected:1}
html[data-location-style^="motion-"] [aria-label="보관 장소"]:has(button:nth-child(3)[aria-pressed="true"]){--selected:2}
html[data-location-style^="motion-"] [aria-label="보관 장소"]:has(button:nth-child(4)[aria-pressed="true"]){--selected:3}
html[data-location-style^="motion-"] [aria-label="보관 장소"]:has(button:nth-child(5)[aria-pressed="true"]){--selected:4}
html[data-location-style^="motion-"] [aria-label="보관 장소"]::after{content:"";position:absolute;bottom:4px;left:calc(var(--selected) * (100% + 4px) / 5 + (100% - 16px) / 10 - 15px);width:30px;height:2px;border-radius:2px;background:#3d586f;pointer-events:none;transition:left 200ms cubic-bezier(.2,.8,.2,1)}
html[data-location-style="motion-all"] [aria-label="보관 장소"] button:not(:nth-child(5))::after,
html[data-location-style="motion-first"] [aria-label="보관 장소"] button:first-child::after{content:"";position:absolute;right:-2.5px;top:18px;width:1px;height:12px;background:#65717d2b;pointer-events:none}
@media(prefers-reduced-motion:reduce){html[data-location-style^="motion-"] [aria-label="보관 장소"]::after{transition:none}${group} button{transition:none}}
`;

export const inventoryLocationStudyPage = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>급식길 · 재고 위치 필터 비교</title>
<style>
*{box-sizing:border-box}html{scrollbar-width:none}body{margin:0;background:#f1f2f3;color:#25313e;font-family:system-ui,sans-serif}main{max-width:1240px;margin:auto;padding:32px 28px}header{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:24px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;color:#71808c;margin:0 0 8px}h1{font-size:25px;letter-spacing:-.05em;margin:0 0 8px}header p{font-size:13px;color:#65707a;margin:0;line-height:1.6}.legend{font-size:12px;color:#65707a;white-space:nowrap}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}article{min-width:0}h2{font-size:15px;margin:0 0 6px;letter-spacing:-.03em}h2 span{display:inline-block;color:#85909a;font-size:11px;margin-right:8px;font-weight:500}article p{font-size:12px;line-height:1.6;color:#65707a;margin:0 0 14px;min-height:38px}iframe{display:block;width:100%;height:570px;border:1px solid #d0d5da;border-radius:12px;background:#fff;box-shadow:0 6px 20px #26374608}.tag{font-size:10px;background:#e1e8e5;color:#426054;padding:3px 6px;border-radius:4px;margin-left:6px;vertical-align:2px}footer{font-size:12px;color:#65707a;margin-top:18px;line-height:1.7}@media(max-width:850px){.grid{grid-template-columns:1fr;max-width:390px;margin:auto;gap:28px}main{padding:24px 16px}header{display:block}.legend{margin-top:12px}iframe{height:520px}}@media(max-width:400px){main{padding:24px 0}header,article h2,article p,footer{margin-left:12px;margin-right:12px}iframe{border:0;border-radius:0}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style><main><header><div><p class="eyebrow">GEUPSIKGIL / INVENTORY</p><h1>짧은 선, 자연스러운 이동.</h1><p>세 안 모두 30px 밑줄이 200ms 동안 이동합니다. 구분선의 차이를 비교하세요.</p></div><div class="legend">각 화면의 위치 버튼을 눌러 비교하세요.</div></header><section class="grid" aria-label="위치 필터 시안 비교">
<article><h2><span>A</span>모든 항목 사이에 짧은 선</h2><p>12px 높이의 옅은 구분선 네 개.<br>각 위치의 경계를 고르게 표시합니다.</p><iframe src="/app?mode=inventory&divider&location-style=motion-all" title="A 모든 항목 구분선"></iframe></article>
<article><h2><span>B</span>구분선 없이 밑줄만</h2><p>글자와 움직이는 밑줄만 남겼습니다.<br>세 가지 중 가장 간결한 구성입니다.</p><iframe src="/app?mode=inventory&divider&location-style=motion-none" title="B 구분선 없는 밑줄"></iframe></article>
<article><h2><span>C</span>전체 뒤에만 짧은 선</h2><p>전체 범위와 개별 장소를 구분하는 선 하나.<br>구분감과 간결함의 중간안입니다.</p><iframe src="/app?mode=inventory&divider&location-style=motion-first" title="C 전체 뒤 구분선"></iframe></article>
</section><footer>예시 데이터 · 운영 연결 없음 · 세 시안 모두 터치 높이 48px 유지 · 동작 줄이기 설정 시 즉시 전환 · 가는 헤더 구분선은 앞서 만든 비교안입니다.</footer></main></html>`;
