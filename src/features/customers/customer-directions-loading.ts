/** The reserved window cannot inherit React styles; match the app's loading indicator without a text flash. */
export function renderDirectionsLoading(popup: Window) {
  const doc = popup.document;
  doc.title = "길안내 연결 중";
  doc.documentElement.lang = "ko";
  const viewport = doc.createElement("meta");
  viewport.name = "viewport"; viewport.content = "width=device-width, initial-scale=1";
  const style = doc.createElement("style");
  style.textContent = `html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#fff;color:#0b5a84}
[role=status]{box-sizing:border-box;width:32px;height:32px;border:3px solid currentColor;border-right-color:transparent;border-radius:50%;animation:loading-ring .9s linear infinite}
@keyframes loading-ring{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){[role=status]{animation:none}}
@media(forced-colors:active){body{background:Canvas;color:CanvasText}[role=status]{animation:none}}`;
  doc.head.append(viewport, style);
  const indicator = doc.createElement("span");
  indicator.setAttribute("role", "status"); indicator.setAttribute("aria-label", "길안내 연결 중");
  doc.body.replaceChildren(indicator);
}
