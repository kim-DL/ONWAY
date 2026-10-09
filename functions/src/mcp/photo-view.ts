/** Private bytes/metadata arrive only in authenticated tool results; no browser network fetch. */
export const PHOTO_VIEW_URI = "ui://geupsikgil/delivery-photo-v8.html";
export const PHOTO_VIEW_HTML = String.raw`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>급식길 납품사진</title><style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;padding:16px;font:16px system-ui;color:CanvasText;background:Canvas}
h2{margin:0;font-size:18px}p{margin:8px 0;font-size:14px}[hidden]{display:none!important}figure{margin:0}
button{font:inherit;cursor:pointer;touch-action:manipulation;min-width:44px;min-height:44px;padding:8px 12px;border:1px solid #8886;border-radius:9px;color:inherit;background:transparent}
button:disabled{opacity:.4;cursor:default}button:focus-visible,#viewport:focus-visible{outline:3px solid #528bff;outline-offset:-3px}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;overflow:hidden!important;clip-path:inset(50%);white-space:nowrap!important;border:0!important}
#window-bounds{position:fixed;visibility:hidden;pointer-events:none;inset:0 auto auto 0;width:100vw;height:100vh;width:100dvw;height:100dvh}
html.viewer-open,html.viewer-open body{overflow:hidden;overscroll-behavior:none}
#company,#viewer-company{font-size:16px;font-weight:650;overflow-wrap:anywhere;line-height:1.5}#company{margin:12px 0 8px}
#open{display:block;width:100%;padding:0;overflow:hidden;background:#8881;touch-action:pan-y;min-height:80px}
#photo{display:block;width:100%;max-height:420px;object-fit:contain;user-select:none}figcaption{padding:10px 2px 0;font-size:14px;line-height:1.6;overflow-wrap:anywhere}
#hint,#page-note,#time-basis{color:GrayText;font-size:12px;line-height:1.6}.navigation{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:12px}
.counter{min-width:64px;text-align:center;font-variant-numeric:tabular-nums}#more{display:block;margin:8px auto 0}
dialog{--gutter:24px;position:fixed;inset:var(--view-top,0px) auto auto var(--view-left,0px);margin:0;width:var(--view-width,100%);height:var(--view-height,100vh);max-width:100%;max-height:100dvh;border:0;background:transparent;color:#fff;overflow:hidden;
padding:calc(var(--gutter) + max(env(safe-area-inset-top,0px),var(--safe-top,0px))) calc(var(--gutter) + max(env(safe-area-inset-right,0px),var(--safe-right,0px))) calc(var(--gutter) + max(env(safe-area-inset-bottom,0px),var(--safe-bottom,0px))) calc(var(--gutter) + max(env(safe-area-inset-left,0px),var(--safe-left,0px)))}
dialog[open]{display:flex;align-items:center;justify-content:center}dialog::backdrop{background:rgba(0,0,0,.86)}
.panel{display:grid;grid-template-rows:minmax(0,auto) minmax(0,1fr) auto;gap:8px;width:min(100%,1080px);height:100%;min-width:0;min-height:0;padding:12px;background:#151a22;border:1px solid #ffffff30;border-radius:16px;overflow:hidden}
.viewer-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;min-width:0;min-height:44px;max-height:clamp(44px,calc(var(--view-height,100vh) * .22),120px)}
.viewer-info{min-width:0;max-height:inherit;overflow:auto;overscroll-behavior:contain}.viewer-info p{overflow-wrap:anywhere}
#close{flex:none;width:44px;height:44px;min-height:44px;padding:10px;display:grid;place-items:center}#close svg{width:22px;height:22px}
.panel button{border-color:#ffffff50;background:#283140}.panel p{margin:0;line-height:1.45}.panel .navigation{margin:0;gap:6px}
#viewer-company{margin:0;font-size:15px}#viewer-caption{margin-top:3px;font-size:13px;color:#d3dbe6}
#viewer-body{position:relative;min-height:0;min-width:0;overflow:hidden;border-radius:8px;background:#080c12}
#viewer-feedback{position:absolute;inset:8px 8px auto;pointer-events:none}#viewer-status:not(.sr-only):not(:empty){padding:8px;border-radius:6px;background:#151a22e8;font-size:13px;color:#d3dbe6}#retry{pointer-events:auto;margin-top:6px}
.viewer-controls{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px 16px;border-top:1px solid #ffffff24;padding-top:8px;background:#151a22;z-index:1}
.viewer-controls button{min-width:48px;min-height:48px;padding:6px 10px}.toolbar{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:nowrap}.toolbar button{font-size:18px}#zoom-fit{font-size:14px}
#zoom{min-width:48px;text-align:center;font-size:14px;font-variant-numeric:tabular-nums}.viewer-controls .counter{min-width:48px;font-size:14px}
#viewport{position:absolute;inset:0;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;touch-action:none;border-radius:8px;background:#080c12}
#viewport.zoomed{cursor:grab;touch-action:none}#viewport.dragging{cursor:grabbing}#stage{position:relative;min-width:100%;min-height:100%}
#evidence{position:absolute;display:block;max-width:none;user-select:none;-webkit-user-drag:none}
dialog.compact{--gutter:0px}dialog.compact .panel{width:100%;border:0;border-radius:0;padding:8px;gap:6px}
@media(max-width:600px){body{padding:10px}dialog{--gutter:0px}.panel{width:100%;border:0;border-radius:0;padding:8px;gap:6px}#photo{max-height:360px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style></head><body><div id="window-bounds" aria-hidden="true"></div>
<main><h2 id="photo-title">납품사진</h2><p id="time-basis">사진 등록 시각 기준 · 실제 납품완료 시각은 별도 기록되지 않습니다.</p><p id="company" hidden></p><p id="status" role="status">사진을 불러오는 중입니다.</p>
<figure id="card" hidden><button id="open" type="button" aria-label="사진 크게 보기" aria-haspopup="dialog" aria-describedby="caption"><img id="photo" alt="급식길 납품사진" draggable="false" hidden></button>
<figcaption id="caption"></figcaption><p id="hint">사진을 누르면 크게 볼 수 있습니다.</p></figure>
<nav id="navigation" class="navigation" aria-label="납품사진 이동" hidden><button id="prev" type="button" aria-label="이전 사진">←</button><span id="counter" class="counter" aria-live="polite"></span><button id="next" type="button" aria-label="다음 사진">→</button></nav>
<p id="page-note" role="status"></p><button id="more" type="button" hidden>사진 더 보기</button><button id="thumb-retry" type="button" hidden>사진 다시 불러오기</button></main>
<dialog id="viewer" aria-labelledby="viewer-title" aria-describedby="viewer-caption viewer-time-basis"><section class="panel">
<header class="viewer-header"><div class="viewer-info"><h2 id="viewer-title" class="sr-only">납품사진 크게 보기</h2><p id="viewer-company"></p><p id="viewer-caption" aria-label="사진 등록 시각과 기록자"></p><span id="viewer-time-basis" class="sr-only">사진 등록 시각이며 실제 납품완료 시각은 별도 기록되지 않습니다.</span></div><button id="close" type="button" autofocus aria-label="사진 뷰어 닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></header>
<div id="viewer-body">
<div id="viewport" tabindex="0" aria-label="확대 사진 영역"><div id="stage"><img id="evidence" alt="확대된 납품사진" draggable="false" hidden></div></div>
<div id="viewer-feedback"><p id="viewer-status" role="status"></p><button id="retry" type="button" hidden>다시 시도</button></div></div>
<footer class="viewer-controls" aria-label="사진 조작">
<nav id="viewer-navigation" class="navigation" aria-label="확대 사진 이동" hidden><button id="viewer-prev" type="button" aria-label="이전 사진">←</button><span id="viewer-counter" class="counter" aria-live="polite"></span><button id="viewer-next" type="button" aria-label="다음 사진">→</button></nav>
<div class="toolbar" aria-label="사진 배율"><button id="zoom-out" type="button" aria-label="사진 축소" disabled>−</button><output id="zoom" aria-label="화면 맞춤 기준 배율" aria-live="polite">100%</output><button id="zoom-in" type="button" aria-label="사진 확대" disabled>＋</button><button id="zoom-fit" type="button" title="화면에 맞추기 (100%)" disabled>맞춤</button></div>
</footer>
</section></dialog>
<script>
(() => {
  const el = (id) => document.getElementById(id);
  const card = el('card'), photo = el('photo'), status = el('status'), opener = el('open');
  const viewer = el('viewer'), evidence = el('evidence'), viewerStatus = el('viewer-status'), retry = el('retry');
  const viewport = el('viewport'), stage = el('stage'), pending = new Map(), localPhotos = new Set();
  let initialized = false, host = {}, current = null, gallery = null, index = 0, sequence = 0, requestId = 0, disposed = false;
  let mode = 'inline', modeQueue = Promise.resolve(), changingMode = false;
  let wanted = null, running = false, thumbId = null, loadingPage = false, zoom = 1, suppressClickUntil = 0;
  let compatibilityGlobals = {}, lastHeight = null, clearGestures = () => {};
  const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const cursorValid = (value) => value === null || value && uuid(value.photoId) && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt));
  const sameCursor = (a, b) => (a?.photoId ?? null) === (b?.photoId ?? null) && (a?.createdAt ?? null) === (b?.createdAt ?? null);
  const send = (message) => window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*');
  const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Infinity;
  const inset = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  function layoutViewer() {
    if (disposed) return;
    // An iframe's dvh/VisualViewport cannot see native host chrome. Respect both host contracts too.
    const visual = window.visualViewport, bounds = el('window-bounds').getBoundingClientRect();
    const top = Math.max(0, Math.min(inset(visual?.offsetTop), window.innerHeight));
    const left = Math.max(0, Math.min(inset(visual?.offsetLeft), window.innerWidth));
    const dimensions = host.containerDimensions ?? {};
    const height = Math.max(0, Math.min(window.innerHeight - top, positive(bounds.height), positive(visual?.height),
      positive(dimensions.height), positive(dimensions.maxHeight), positive(compatibilityGlobals.maxHeight)));
    const width = Math.max(0, Math.min(window.innerWidth - left, positive(bounds.width), positive(visual?.width),
      positive(dimensions.width), positive(dimensions.maxWidth)));
    for (const [key, value] of Object.entries({ top, left, width, height })) viewer.style.setProperty('--view-' + key, value + 'px');
    // Insets are alternative measurements of the same obscured edge, not additive padding.
    for (const edge of ['top', 'right', 'bottom', 'left']) viewer.style.setProperty('--safe-' + edge,
      Math.max(inset(host.safeAreaInsets?.[edge]), inset(compatibilityGlobals.safeArea?.insets?.[edge])) + 'px');
    viewer.classList.toggle('compact', width <= 600 || height <= 500 || host.platform === 'mobile'
      || compatibilityGlobals.userAgent?.device?.type === 'mobile');
  }
  const resize = () => {
    layoutViewer();
    // Fullscreen geometry belongs to the host. A hidden card's intrinsic height must not resize it.
    if (disposed || viewer.open || mode === 'fullscreen') return;
    const height = Math.ceil(document.querySelector('main').getBoundingClientRect().bottom + 16);
    if (height === lastHeight) return;
    lastHeight = height;
    if (initialized) send({ method: 'ui/notifications/size-changed', params: { height } });
    window.openai?.notifyIntrinsicHeight?.(height);
  };
  function request(method, params, timeout = 35000) {
    return new Promise((resolve, reject) => {
      const id = 'photo-' + (++requestId);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout')); }, timeout);
      pending.set(id, { resolve, reject, timer }); send({ id, method, params });
    });
  }
  function callTool(name, args) {
    // Both bridges use the host's OAuth connection. No PIN, token, URL or direct fetch in this UI.
    if (initialized && host.serverTools) return request('tools/call', { name, arguments: args });
    if (window.openai?.callTool) return window.openai.callTool(name, args);
    return request('tools/call', { name, arguments: args });
  }
  function unwrap(result) { return result?.mcp_tool_result ?? result?.call_tool_result ?? result; }
  function extract(result) {
    result = unwrap(result);
    const inventory = !result?.isError && result?._meta?.inventoryPhoto;
    const item = inventory || !result?.isError && result?._meta?.deliveryPhoto;
    if (inventory && (result?._meta?.deliveryPhoto || typeof item.productId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(item.productId)
      || typeof item.name !== 'string' || !['thumbnail', 'preview'].includes(item.variant))) return null;
    if (!item || item.mimeType !== 'image/webp' || typeof item.data !== 'string' || item.data.length > 16000000
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data) || !uuid(item.photoId) || !(inventory ? ['thumbnail', 'preview'] : ['thumbnail', 'evidence']).includes(item.variant)) return null;
    return inventory ? { ...item, kind: 'inventory', variant: item.variant === 'preview' ? 'evidence' : 'thumbnail' } : { ...item, kind: 'delivery' };
  }
  function extractGallery(result) {
    result = unwrap(result);
    const item = !result?.isError && result?._meta?.deliveryGallery;
    if (!item || typeof item.customerId !== 'string' || !item.customerId || item.customerId.length > 128
      || !(item.date === null || typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date))
      || !(item.employeeId == null || typeof item.employeeId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(item.employeeId))
      || !Array.isArray(item.photos) || item.photos.length > 100 || !item.photos.every((photo) => uuid(photo?.photoId))
      || !cursorValid(item.after) || !cursorValid(item.nextCursor)) return null;
    return { ...item, photos: item.photos.map(({ photoId, createdAt, createdByName }) => ({ photoId, createdAt, createdByName })) };
  }
  const imageKey = (item) => (item.kind || 'delivery') + ':' + (item.productId || '') + ':' + item.photoId + ':' + item.variant;
  function caption(item) {
    if (item.kind === 'inventory') return [item.manufacturer, item.specification].filter((value) => typeof value === 'string' && value.trim()).map((value) => value.slice(0, 200)).join(' · ') || '등록된 상품 사진';
    const date = typeof item.createdAt === 'string' ? new Date(item.createdAt) : new Date(NaN);
    const parts = Number.isFinite(date.getTime()) ? Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).map((part) => [part.type, part.value])) : null;
    const time = parts ? parts.year + '-' + parts.month + '-' + parts.day + ' ' + parts.hour + ':' + parts.minute : '등록 시각 없음';
    const name = typeof item.createdByName === 'string' && item.createdByName.trim() ? item.createdByName.slice(0, 200) : '기록자 정보 없음';
    return time + ' · ' + name;
  }
  function companyName() {
    const name = gallery?.customerName ?? current?.customerName;
    return typeof name === 'string' && name.trim() ? name.slice(0, 200) : '업체명 정보 없음';
  }
  function captions() {
    const inventory = current?.kind === 'inventory';
    const title = inventory ? '상품 사진' : '납품사진'; document.title = '급식길 ' + title;
    el('photo-title').textContent = title; el('viewer-title').textContent = title + ' 크게 보기';
    photo.alt = inventory ? '급식길 상품 사진' : '급식길 납품사진'; evidence.alt = inventory ? '확대된 상품 사진' : '확대된 납품사진';
    const basis = inventory ? '등록된 상품 사진 · 촬영일과 현재 묶음의 상태는 별도 확인이 필요합니다.' : '사진 등록 시각 기준 · 실제 납품완료 시각은 별도 기록되지 않습니다.';
    el('time-basis').textContent = basis; el('viewer-time-basis').textContent = basis;
    el('viewer-caption').setAttribute('aria-label', inventory ? '제조사와 규격' : '사진 등록 시각과 기록자');
    if (inventory) {
      el('company').textContent = current.name.slice(0, 200); el('company').hidden = false;
      el('caption').textContent = caption(current); el('viewer-company').textContent = viewer.open ? current.name.slice(0, 200) : '';
      el('viewer-caption').textContent = viewer.open ? caption(current) : ''; return;
    }
    el('company').textContent = '납품업체 · ' + companyName(); el('company').hidden = !(gallery || current);
    el('caption').textContent = current ? caption(current) : '';
    el('viewer-company').textContent = viewer.open ? '납품업체 · ' + companyName() : '';
    el('viewer-caption').textContent = viewer.open && current ? caption(current) : '';
  }
  function clearImage(img) { img.onload = null; img.onerror = null; img.hidden = true; img.removeAttribute('src'); }
  function updateHost(context) {
    if (!context) return;
    const previous = mode; host = { ...host, ...context };
    if (context.displayMode) mode = context.displayMode;
    if (!changingMode && previous === 'fullscreen' && mode === 'inline' && viewer.open) closeViewer(false);
    if (!changingMode && mode === 'fullscreen' && !viewer.open) changeMode('inline');
    resize();
  }
  function changeMode(next) {
    modeQueue = modeQueue.catch(() => {}).then(async () => {
      if (disposed || (next === 'fullscreen' && !viewer.open) || (next === 'inline' && viewer.open)) return;
      changingMode = true;
      try {
        const result = initialized && host.availableDisplayModes?.includes('fullscreen')
          ? await request('ui/request-display-mode', { mode: next }, 5000)
          : await window.openai?.requestDisplayMode?.({ mode: next });
        if (result?.mode) updateHost({ displayMode: result.mode });
      } catch { /* Hosts without fullscreen keep the accessible in-frame modal. */ }
      finally { changingMode = false; }
    });
  }
  function navigation() {
    const count = gallery?.photos.length ?? (current ? 1 : 0), more = Boolean(gallery?.nextCursor);
    for (const prefix of ['', 'viewer-']) {
      el(prefix + 'navigation').hidden = !gallery || count < 2 && !more;
      el(prefix + 'counter').textContent = (count ? index + 1 : 0) + ' / ' + count + (more ? '+' : '');
      el(prefix + 'prev').disabled = index === 0;
      el(prefix + 'next').disabled = index >= count - 1 && (!more || loadingPage);
    }
    el('more').hidden = !more; el('more').disabled = loadingPage;
    el('more').textContent = loadingPage ? '사진 목록을 불러오는 중…' : '사진 더 보기';
    el('page-note').textContent = gallery ? (gallery.employeeId ? (typeof gallery.employeeName === 'string' ? gallery.employeeName.slice(0, 120) : '선택한 직원') + ' · ' : '') + (gallery.date ? gallery.date + ' · ' : '최근 7일 · ')
      + count + '장' + (more ? ' 불러옴 · 더 볼 사진이 있습니다.' : '') : '';
    resize();
  }
  function fitImage(reset = false, anchor = null) {
    const ready = viewer.open && !evidence.hidden && evidence.naturalWidth > 0;
    el('zoom').textContent = Math.round(zoom * 100) + '%';
    el('zoom-in').disabled = !ready || zoom >= 4; el('zoom-out').disabled = !ready || zoom <= .5; el('zoom-fit').disabled = !ready;
    viewport.classList.toggle('zoomed', ready && zoom > 1);
    if (!ready || !viewport.clientWidth || !viewport.clientHeight) return;
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const oldW = parseFloat(evidence.style.width) || 1, oldH = parseFloat(evidence.style.height) || 1;
    const cx = reset ? .5 : (viewport.scrollLeft + (anchor?.fromX ?? vw / 2) - (parseFloat(evidence.style.left) || 0)) / oldW;
    const cy = reset ? .5 : (viewport.scrollTop + (anchor?.fromY ?? vh / 2) - (parseFloat(evidence.style.top) || 0)) / oldH;
    const scale = Math.min(vw / evidence.naturalWidth, vh / evidence.naturalHeight) * zoom;
    const width = evidence.naturalWidth * scale, height = evidence.naturalHeight * scale;
    const sw = Math.max(vw, width), sh = Math.max(vh, height), left = (sw - width) / 2, top = (sh - height) / 2;
    stage.style.width = sw + 'px'; stage.style.height = sh + 'px';
    Object.assign(evidence.style, { width: width + 'px', height: height + 'px', left: left + 'px', top: top + 'px' });
    viewport.scrollLeft = cx * width + left - (anchor?.toX ?? vw / 2); viewport.scrollTop = cy * height + top - (anchor?.toY ?? vh / 2);
  }
  function clearEvidence() { clearGestures(); clearImage(evidence); zoom = 1; stage.style.width = ''; stage.style.height = ''; fitImage(); }
  function closeViewer(restoreMode = true, reload = true) {
    const wasOpen = viewer.open; sequence++; wanted = null;
    viewer.close(); document.documentElement.classList.remove('viewer-open'); lastHeight = null;
    clearEvidence(); retry.hidden = true; viewerStatus.textContent = '';
    el('viewer-caption').textContent = ''; el('viewer-company').textContent = '';
    if (restoreMode && (wasOpen || mode === 'fullscreen')) changeMode('inline');
    if (reload && current && thumbId !== current.photoId && !disposed) scheduleImage('thumbnail');
    if (wasOpen && !card.hidden && !disposed) opener.focus({ preventScroll: true });
    resize();
  }
  function clearAll() {
    current = null; gallery = null; index = 0; thumbId = null; loadingPage = false;
    card.hidden = true; clearImage(photo); closeViewer(true, false); el('thumb-retry').hidden = true; captions(); navigation();
  }
  function authFailure(result) {
    if (!['AUTH_REQUIRED', 'FORBIDDEN'].includes(errorCode(result))) return false;
    clearAll(); status.textContent = '조회 권한이 변경되었습니다. 다시 연결한 뒤 조회해 주세요.'; return true;
  }
  function errorCode(result) {
    if (!result?.isError) return null;
    const code = result?._meta?.error?.code || result?.structuredContent?.error?.code;
    if (typeof code === 'string') return code;
    try { return JSON.parse(result?.content?.find((item) => item.type === 'text')?.text || '{}')?.error?.code || null; }
    catch { return null; }
  }
  function imageFailure(task, missing = false) {
    const inventory = current?.kind === 'inventory';
    const message = missing ? inventory ? '상품 사진이 교체되었거나 삭제되었습니다. 상품을 다시 조회해 주세요.' : '사진이 삭제되었거나 보관기간이 지났습니다.' : '사진을 불러오지 못했습니다. 다시 시도해 주세요.';
    if (missing && !gallery) { clearAll(); if (inventory) { el('photo-title').textContent = '상품 사진'; el('time-basis').textContent = ''; } status.textContent = inventory ? message : '사진이 만료되었거나 조회 권한이 변경되었습니다. 다시 조회해 주세요.'; return; }
    if (missing) { clearImage(photo); thumbId = null; opener.disabled = true; }
    if (task.variant === 'evidence') { clearEvidence(); viewerStatus.classList.remove('sr-only'); viewerStatus.textContent = message; retry.hidden = missing; }
    else { clearImage(photo); thumbId = null; opener.disabled = true; status.textContent = message; el('thumb-retry').hidden = missing; }
    resize();
  }
  function applyImage(item, task) {
    const target = task.variant === 'evidence' ? evidence : photo;
    target.onload = () => {
      if (sequence !== task.sequence || disposed || current?.photoId !== item.photoId) return;
      target.hidden = false;
      // Authenticated image metadata is fresher than the gallery list.
      current = current.kind === 'inventory' ? { ...current, name: item.name, manufacturer: item.manufacturer, specification: item.specification }
        : { ...current, createdAt: item.createdAt, createdByName: item.createdByName };
      if (gallery && (typeof item.customerName === 'string' || item.customerName === null)) gallery.customerName = item.customerName;
      captions();
      if (task.variant === 'evidence') { viewerStatus.classList.add('sr-only'); viewerStatus.textContent = '큰 사진을 표시했습니다.'; fitImage(true); }
      else { thumbId = item.photoId; card.hidden = false; opener.disabled = false; status.textContent = current.kind === 'inventory' ? '조회한 상품 사진입니다.' : '조회한 납품사진입니다.'; }
      resize();
    };
    target.onerror = () => { if (sequence === task.sequence && !disposed) imageFailure(task); };
    target.src = 'data:image/webp;base64,' + item.data;
  }
  async function pump() {
    if (running || disposed || !initialized && !window.openai?.callTool) return;
    running = true;
    try {
      while (wanted && !disposed) {
        const task = wanted; wanted = null;
        localPhotos.add(imageKey(task));
        if (localPhotos.size > 256) localPhotos.delete(localPhotos.values().next().value);
        try {
          const result = unwrap(await (task.kind === 'inventory'
            ? callTool('get_inventory_photo', { productId: task.productId, photoId: task.photoId, variant: task.variant === 'evidence' ? 'preview' : 'thumbnail' })
            : callTool('get_delivery_photo', { photoId: task.photoId, variant: task.variant })));
          // A revoked connection clears even a superseded request's private content.
          if (disposed) break;
          if (authFailure(result)) continue;
          if (sequence !== task.sequence || current?.photoId !== task.photoId || viewer.open !== (task.variant === 'evidence')) continue;
          const item = extract(result);
          if (!item || item.photoId !== task.photoId || item.variant !== task.variant
            || item.kind !== task.kind || task.kind === 'inventory' && item.productId !== task.productId
            || gallery && (item.customerId !== gallery.customerId || gallery.employeeId && item.createdByEmployeeId !== gallery.employeeId)) { imageFailure(task, errorCode(result) === 'NOT_FOUND'); continue; }
          applyImage(item, task);
        } catch { if (!disposed && sequence === task.sequence) imageFailure(task); }
      }
    } finally { running = false; }
  }
  function scheduleImage(variant) {
    if (!current || disposed) return;
    sequence++; wanted = { photoId: current.photoId, kind: current.kind || 'delivery', productId: current.productId, variant, sequence };
    if (variant === 'evidence') { clearEvidence(); retry.hidden = true; viewerStatus.classList.remove('sr-only'); viewerStatus.textContent = '큰 사진을 불러오는 중입니다.'; }
    else { clearImage(photo); thumbId = null; opener.disabled = true; el('thumb-retry').hidden = true; status.textContent = '사진을 불러오는 중입니다.'; }
    captions(); void pump();
  }
  function select(next) {
    if (!gallery?.photos[next]) return;
    index = next; current = gallery.photos[index]; clearImage(photo); thumbId = null; card.hidden = false;
    el('thumb-retry').hidden = true; scheduleImage(viewer.open ? 'evidence' : 'thumbnail'); navigation();
  }
  async function loadMore(advance = false) {
    if (!gallery?.nextCursor || loadingPage) return;
    const owner = gallery, after = gallery.nextCursor, oldCount = gallery.photos.length;
    loadingPage = true; navigation();
    try {
      const result = unwrap(await callTool('get_delivery_gallery', { customerId: owner.customerId,
        ...(owner.date ? { date: owner.date } : {}), ...(owner.employeeId ? { employeeId: owner.employeeId } : {}), limit: 50, after }));
      if (disposed) return;
      if (authFailure(result) || gallery !== owner) return;
      const page = extractGallery(result);
      if (!page || page.customerId !== owner.customerId || page.date !== owner.date || (page.employeeId ?? null) !== (owner.employeeId ?? null) || !sameCursor(page.after, after)
        || page.nextCursor && sameCursor(page.nextCursor, after)) throw new Error('invalid page');
      const seen = new Set(owner.photos.map((item) => item.photoId));
      for (const item of page.photos) if (!seen.has(item.photoId)) { owner.photos.push(item); seen.add(item.photoId); }
      owner.nextCursor = page.nextCursor; owner.customerName = page.customerName;
      if ((!current || advance) && owner.photos.length > oldCount) select(oldCount);
      else if (!current) status.textContent = owner.nextCursor ? '사진 더 보기로 목록을 계속 확인해 주세요.' : '이 기간에 조회할 수 있는 사진이 없습니다.';
      captions();
    } catch {
      if (gallery === owner && !disposed) {
        const target = viewer.open ? viewerStatus : status;
        target.classList.remove('sr-only');
        target.textContent = '다음 사진 목록을 불러오지 못했습니다. 다시 시도해 주세요.';
      }
    } finally { if (gallery === owner) { loadingPage = false; navigation(); } }
  }
  function move(delta) {
    if (!gallery) return;
    const next = index + delta;
    if (next >= gallery.photos.length && delta > 0) { void loadMore(true); return; }
    if (next >= 0) select(next);
  }
  function render(raw) {
    if (disposed) return;
    const result = unwrap(raw);
    if (result?.isError) {
      if (!authFailure(result) && !current && !gallery) status.textContent = '사진을 불러오지 못했습니다. 다시 조회해 주세요.';
      return;
    }
    if (typeof result?._meta?.inventoryNotice?.message === 'string') {
      clearAll(); el('photo-title').textContent = '상품 사진'; el('time-basis').textContent = '';
      status.textContent = result._meta.inventoryNotice.message.slice(0, 300); resize(); return;
    }
    if (typeof result?._meta?.deliveryNotice?.message === 'string') {
      clearAll(); status.textContent = result._meta.deliveryNotice.message.slice(0, 300); resize(); return;
    }
    const group = extractGallery(result);
    if (group) {
      // Page calls can be echoed by the host. Only their direct reply may append results.
      if (gallery && group.customerId === gallery.customerId && group.date === gallery.date && (group.employeeId ?? null) === (gallery.employeeId ?? null)) return;
      clearAll(); gallery = group; captions(); navigation();
      if (group.photos.length && result._meta?.deliveryPhoto) {
        // The employee lookup includes the first authenticated thumbnail: zero follow-up calls to display it.
        const initial = extract(result);
        index = 0; current = group.photos[0]; card.hidden = false; opener.disabled = true; captions();
        if (initial?.variant === 'thumbnail' && initial.photoId === current.photoId && initial.customerId === group.customerId
          && (!group.employeeId || initial.createdByEmployeeId === group.employeeId)) applyImage(initial, { sequence, variant: 'thumbnail' });
        else imageFailure({ variant: 'thumbnail' });
      } else if (group.photos.length) select(0);
      else status.textContent = group.nextCursor ? '사진 더 보기로 목록을 계속 확인해 주세요.' : '이 기간에 조회할 수 있는 사진이 없습니다.';
      resize(); return;
    }
    const item = extract(result);
    if (!item || localPhotos.has(imageKey(item))) return;
    if (current?.photoId === item.photoId && (current.kind || 'delivery') === item.kind && current.productId === item.productId && thumbId === item.photoId) return;
    clearAll(); current = item; captions(); navigation(); opener.disabled = true;
    status.textContent = '사진을 불러오는 중입니다.';
    applyImage(item, { sequence, variant: 'thumbnail' });
  }
  opener.addEventListener('click', () => {
    if (!current || viewer.open || Date.now() < suppressClickUntil) return;
    viewer.showModal(); document.documentElement.classList.add('viewer-open'); resize();
    el('close').focus({ preventScroll: true }); changeMode('fullscreen'); scheduleImage('evidence');
  });
  el('close').addEventListener('click', () => closeViewer());
  viewer.addEventListener('cancel', (event) => { event.preventDefault(); closeViewer(); });
  viewer.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (zoom <= 1) { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); } return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...viewer.querySelectorAll('button,[tabindex="0"]')].filter((control) => !control.disabled && control.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  viewer.addEventListener('click', (event) => {
    if (Date.now() < suppressClickUntil) return;
    if (event.target === viewer || event.target === viewer.querySelector('.panel')
      || zoom <= 1 && (event.target === viewport || event.target === stage)) closeViewer();
  });
  for (const prefix of ['', 'viewer-']) {
    el(prefix + 'prev').addEventListener('click', () => move(-1)); el(prefix + 'next').addEventListener('click', () => move(1));
  }
  el('more').addEventListener('click', () => void loadMore());
  retry.addEventListener('click', () => scheduleImage('evidence'));
  el('thumb-retry').addEventListener('click', () => scheduleImage('thumbnail'));
  el('zoom-in').addEventListener('click', () => { zoom = Math.min(4, zoom + .25); fitImage(); });
  el('zoom-out').addEventListener('click', () => { zoom = Math.max(.5, zoom - .25); fitImage(); });
  el('zoom-fit').addEventListener('click', () => { zoom = 1; fitImage(true); });
  // Some mobile WebViews suppress the next synthesized click after a pinch/pan. Activate a
  // stationary single-finger button tap on pointerup, keeping keyboard/mouse clicks native.
  let buttonTap = null, handledTap = null;
  viewer.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') { handledTap = null; return; }
    const button = event.target.closest('button');
    buttonTap = event.isPrimary && button && !button.disabled ? { button, id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    if (buttonTap) event.preventDefault();
  }, true);
  viewer.addEventListener('pointercancel', () => { buttonTap = null; }, true);
  viewer.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'touch' || buttonTap?.id !== event.pointerId) return;
    const tap = buttonTap; buttonTap = null;
    if (tap.button !== event.target.closest('button') || tap.button.disabled
      || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10) return;
    event.preventDefault(); handledTap = { button: tap.button, until: Date.now() + 700 };
    tap.button.focus({ preventScroll: true }); tap.button.click();
  }, true);
  viewer.addEventListener('click', (event) => {
    if (event.isTrusted && event.detail > 0 && event.pointerType !== 'mouse'
      && handledTap?.button === event.target.closest('button') && Date.now() < handledTap.until) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  function thumbnailGestures(surface) {
    let drag = null;
    surface.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    const finish = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      drag = null;
      if (event.type === 'pointercancel') return;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) suppressClickUntil = Date.now() + 400;
      if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx < 0 ? 1 : -1);
    };
    surface.addEventListener('pointerup', finish); surface.addEventListener('pointercancel', finish);
  }
  thumbnailGestures(opener);
  // Keep image gestures local: a pinch/pan must never zoom the host page or turn a gallery page.
  const pointers = new Map();
  let imageDrag = null, pinch = null, multiTouch = false;
  clearGestures = () => {
    for (const id of pointers.keys()) if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    pointers.clear(); imageDrag = null; pinch = null; multiTouch = false; viewport.classList.remove('dragging');
  };
  const pair = () => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || evidence.hidden) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); viewport.setPointerCapture(event.pointerId);
    imageDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, sx: viewport.scrollLeft, sy: viewport.scrollTop, pan: zoom > 1 };
    if (pointers.size >= 2) { const center = pair(); pinch = { ...center, zoom, previous: center }; multiTouch = true; imageDrag = null; }
    if (zoom > 1 || multiTouch) viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size >= 2) {
      const center = pair(), box = viewport.getBoundingClientRect();
      zoom = Math.max(.5, Math.min(4, pinch.zoom * center.distance / pinch.distance));
      fitImage(false, { fromX: pinch.previous.x - box.left, fromY: pinch.previous.y - box.top, toX: center.x - box.left, toY: center.y - box.top });
      pinch.previous = center; suppressClickUntil = Date.now() + 400;
    } else if (imageDrag?.id === event.pointerId && imageDrag.pan && !multiTouch) {
      viewport.scrollLeft = imageDrag.sx - (event.clientX - imageDrag.x); viewport.scrollTop = imageDrag.sy - (event.clientY - imageDrag.y);
    }
  });
  function finishImageGesture(event) {
    if (!pointers.has(event.pointerId)) return;
    const drag = imageDrag; pointers.delete(event.pointerId); pinch = null; imageDrag = null;
    if (multiTouch) suppressClickUntil = Date.now() + 400;
    else if (drag?.id === event.pointerId && event.type === 'pointerup') {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) suppressClickUntil = Date.now() + 400;
      if (!drag.pan && Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx < 0 ? 1 : -1);
    }
    if (!pointers.size) { multiTouch = false; viewport.classList.remove('dragging'); }
  }
  viewport.addEventListener('pointerup', finishImageGesture); viewport.addEventListener('pointercancel', finishImageGesture);
  viewport.addEventListener('lostpointercapture', finishImageGesture);
  const viewportObserver = new ResizeObserver((entries) => {
    if (entries.some((entry) => entry.target.id === 'window-bounds')) resize();
    fitImage();
  });
  viewportObserver.observe(viewport); viewportObserver.observe(el('window-bounds'));
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.jsonrpc !== '2.0' || disposed) return;
    const message = event.data, waiting = pending.get(message.id);
    if (waiting) {
      clearTimeout(waiting.timer); pending.delete(message.id);
      if (message.error) waiting.reject(new Error('host error')); else waiting.resolve(message.result);
    }
    if (message.method === 'ui/notifications/tool-result') render(message.params);
    if (message.method === 'ui/notifications/host-context-changed') updateHost(message.params);
    if (message.method === 'ui/resource-teardown' && message.id !== undefined) {
      disposed = true; clearAll(); viewportObserver.disconnect();
      window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize); window.removeEventListener('openai:set_globals', compatibility);
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('closed')); }
      pending.clear(); localPhotos.clear(); send({ id: message.id, result: {} });
    }
  });
  const compatibility = (event) => {
    const globals = { ...window.openai, ...event?.detail?.globals };
    for (const key of ['maxHeight', 'safeArea', 'userAgent']) if (key in globals) compatibilityGlobals[key] = globals[key];
    updateHost({ ...(globals.displayMode ? { displayMode: globals.displayMode } : {}) });
    const metadata = globals.toolResponseMetadata;
    if (metadata) render(unwrap(metadata)?._meta ? unwrap(metadata) : { _meta: metadata });
    void pump();
  };
  window.addEventListener('openai:set_globals', compatibility); window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize); window.visualViewport?.addEventListener('scroll', resize); compatibility();
  request('ui/initialize', {
    appInfo: { name: 'geupsikgil-photo', version: '1.6.2' },
    appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] }, protocolVersion: '2026-01-26'
  }, 5000).then((result) => {
    initialized = true; host = { ...result.hostCapabilities, ...result.hostContext }; mode = host.displayMode ?? 'inline';
    lastHeight = null; send({ method: 'ui/notifications/initialized', params: {} }); resize(); void pump();
  }).catch(() => { if (!window.openai?.callTool && wanted) { imageFailure(wanted); wanted = null; } });
})();
</script></body></html>`;

export const PHOTO_VIEW_META = {
  ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
  "openai/widgetDescription": "재고 상품 사진은 상품명·제조사·규격을 표시하고 같은 사진의 preview를 클릭할 때 조회합니다. 상품 사진을 납품기록/7일 보관 사진으로 해석하지 마세요. 납품업체·등록 시각(서울)·기록자가 있는 납품사진 갤러리입니다. 등록 시각은 실제 납품완료 시각이 아닙니다. 최초 썸네일이 함께 오면 추가 호출 없이 표시합니다. 여러 장을 이전/다음·가로 스와이프로 넘깁니다. 사진을 누르면 큰 사진을 열고 하단 고정 툴바의 −/＋/맞춤 또는 두 손가락 핀치로 배율을 조절하며 확대 후 드래그로 이동합니다. 닫기/ESC/배경 클릭으로 돌아옵니다. 표시된 정보를 본문에 반복하거나 내부 ID·이미지 URL을 노출하지 마세요.",
  "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
  "openai/widgetPrefersBorder": true,
  "openai/ui": { availableDisplayModes: ["inline", "fullscreen"] },
};
