export const LEGACY_CUSTOMER_VIEW_URI = "ui://geupsikgil/customer-details-v1.html";
export const CUSTOMER_VIEW_URI = "ui://geupsikgil/customer-details-v2.html";
export const CUSTOMER_VIEW_META = { ui: { csp: { connectDomains: [], resourceDomains: [] } },
  "openai/widgetCSP": { connect_domains: [], resource_domains: [] }, "openai/widgetPrefersBorder": true,
  "openai/widgetDescription": "현재 거래처의 주소·연락처·납품 안내를 조회 원문 그대로 표시합니다. 미조회/미등록·폐업 상태를 구분합니다." };
// Uses the existing public structuredContent once; no duplicate private metadata or extra data calls.
export const CUSTOMER_VIEW_HTML = String.raw`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'unsafe-inline';style-src 'unsafe-inline';connect-src 'none';img-src 'none';base-uri 'none';form-action 'none'">
<title>거래처 상세정보</title><style>*{box-sizing:border-box}body{margin:0;padding:12px;font:15px/1.55 system-ui;color:light-dark(#172237,#eef3fa);background:light-dark(#fff,#151a22);color-scheme:light dark}
main{max-height:var(--available,560px);overflow:auto;overscroll-behavior:contain;padding-bottom:env(safe-area-inset-bottom,0px)}header{position:sticky;top:0;padding-bottom:8px;border-bottom:1px solid #8884;background:light-dark(#fff,#151a22)}h2,h3,p{margin:0}h2{font-size:19px;overflow-wrap:anywhere}h3{font-size:15px;margin-top:14px}dl{margin:6px 0;display:grid;grid-template-columns:76px minmax(0,1fr);gap:6px 10px}dt,.muted{font-size:13px;opacity:.75}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}.warning{color:light-dark(#9f3600,#ffb780)}#status{white-space:pre-wrap;overflow-wrap:anywhere}.muted{margin-top:8px}[hidden]{display:none!important}@media(max-width:340px){body{padding:8px}dl{grid-template-columns:64px minmax(0,1fr);gap:5px 8px}}</style></head>
<body><main><header><h2 id="name">거래처 상세정보</h2><p id="state" class="muted"></p></header><p id="status" role="status">조회 결과를 불러오는 중입니다.</p><div id="details"></div><p id="updated" class="muted"></p><p id="retrieved" class="muted"></p></main><script>(()=>{
const el=id=>document.getElementById(id);let ready=false,disposed=false,lastHeight=null;
const send=m=>parent.postMessage({jsonrpc:'2.0',...m},'*');
function fit(context){const dimensions=context?.containerDimensions, insets=context?.safeAreaInsets??context?.safeArea?.insets;
const host=dimensions?.height??dimensions?.maxHeight??context?.maxHeight;const viewport=window.visualViewport?.height??innerHeight;
const height=Math.max(80,Math.min(560,Number.isFinite(host)?host:viewport,viewport)-(insets?.top??0)-(insets?.bottom??0)-24);
document.documentElement.style.setProperty('--available',height+'px');resize();}
function resize(){if(disposed)return;const height=Math.ceil(document.querySelector('main').getBoundingClientRect().height+24);
if(height===lastHeight)return;lastHeight=height;if(ready)send({method:'ui/notifications/size-changed',params:{height}});window.openai?.notifyIntrinsicHeight?.(height);}
function unwrap(raw){let value=raw;for(let i=0;i<6;i++){if(!value||typeof value!=='object')return null;if(value.isError||value.status==='error')return value;
if(value.structuredContent)return value.structuredContent;if(value.status==='ok'&&typeof value.resolution==='string'&&Array.isArray(value.sectionsIncluded))return value;
value=value.mcp_tool_result??value.toolResult??value.tool_result??value.result??value.toolOutput??value.toolResponseMetadata;}return null;}
function row(dl,label,value,id){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=typeof value==='string'&&value.length?value:'미등록';if(id)dd.id=id;dl.append(dt,dd);}
function section(title){const heading=document.createElement('h3'),dl=document.createElement('dl');heading.textContent=title;el('details').append(heading,dl);return dl;}
function matchRows(dl,match){if(!match||match.matchedField==='customerId')return;
const types={exact:'정확 일치',prefix:'앞부분 일치',substring:'중간 문자열 일치',initials:'초성 일치',corporate_exact:'법인 표기 제외 일치',business_suffix:'업종 호칭 제외 일치'};
row(dl,'일치 근거',(match.matchedField==='aliases'?'저장된 별칭':'등록명')+' · '+(types[match.matchType]??'이름 일치'));
row(dl,'일치한 값',match.matchedValue);
if(match.blockedReason)row(dl,'확인 필요',({common_term:'흔한 검색어',short_query:'짧은 검색어',weak_match:'약한 부분 일치'})[match.blockedReason]??'대상 확인');}
function clear(){el('details').replaceChildren();el('updated').textContent='';el('retrieved').textContent='';el('state').textContent='';el('name').textContent='거래처 상세정보';}
function render(raw){if(disposed)return;const result=unwrap(raw);if(!result)return;clear();
if(result.isError||result.status==='error'){el('status').textContent='상세정보를 표시하지 못했습니다. 연결과 조회 조건을 확인해 주세요.';resize();return;}
el('status').textContent=result.resolution==='resolved'?'':String(result.note??'조회 대상을 확인해 주세요.').slice(0,600);
const customer=result.customer;if(result.resolution!=='resolved'||!customer){
for(const candidate of (result.candidates??[]).slice(0,100)){const dl=section(candidate.name);row(dl,'지역',[candidate.district,candidate.administrativeDong].filter(Boolean).join(' '));row(dl,'상태',candidate.status==='closed'?'폐업':'활성');matchRows(dl,candidate.match);}resize();return;}
if(result.match&&result.match.matchType!=='id'&&result.match.matchType!=='exact')matchRows(section('검색 근거'),result.match);
el('name').textContent=customer.name;el('state').textContent=customer.status==='closed'?'폐업 거래처 · 방문/납품 전 확인':'조회한 등록 정보';el('state').classList.toggle('warning',customer.status==='closed');
if(customer.addresses){const dl=section('주소');row(dl,'납품주소',customer.addresses.deliveryAddress,'delivery-address');row(dl,'공식주소',customer.addresses.officialAddress,'official-address');
if(customer.addresses.preferredAddressSource==='official')row(dl,'표시 기준','납품주소 미등록 · 공식주소 사용');}
if(customer.contacts!==null){const dl=section('연락처');if(!customer.contacts.length)row(dl,'연락처',null);for(const contact of customer.contacts){
row(dl,contact.isPrimary?'대표 담당자':'담당자',contact.name);if(contact.role)row(dl,'역할',contact.role);row(dl,'전화번호',contact.phoneNumber);}}
if(customer.delivery){const dl=section('납품 안내');row(dl,'위치 안내',customer.delivery.locationDescription,'delivery-instructions');
const state=customer.delivery.accessPasswordState;const label=state==='registered'?'등록됨 · 명시적으로 요청하면 조회':state==='none'?'비밀번호 없음':'등록 여부 미확인';
row(dl,'출입 정보',customer.delivery.accessPasswordIncluded&&state==='registered'?customer.delivery.accessPassword:label,'door-information');}
if(customer.notes){const dl=section('변경 안내');row(dl,'안내 상태',({none:'없음',new:'신규',changed:'변경'})[customer.notes.noticeType]);row(dl,'변경 메모',customer.notes.changeNote);}
if(customer.updatedAt){const date=new Date(customer.updatedAt);if(Number.isFinite(date.getTime()))el('updated').textContent='정보 수정: '+new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date)+' (서울)';}if(result.retrievedAt){const date=new Date(result.retrievedAt);if(Number.isFinite(date.getTime()))el('retrieved').textContent='조회: '+new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(date)+' (서울)';}resize();}
function globals(){render(window.openai?.toolOutput);render(window.openai?.toolResponseMetadata);fit(window.openai);}
addEventListener('message',event=>{if(event.source!==parent||disposed)return;const message=event.data;
if(message?.id==='customer-init'&&message.result){ready=true;lastHeight=null;send({method:'ui/notifications/initialized'});fit(message.result.hostContext);resize();}
if(message?.method==='ui/notifications/tool-result')render(message.params);
if(message?.method==='ui/notifications/host-context-changed')fit(message.params);
if(message?.method==='ui/notifications/tool-cancelled'){clear();el('status').textContent='조회가 취소되었습니다.';resize();}
if(message?.method==='ui/resource-teardown'){clear();el('status').textContent='';disposed=true;send({id:message.id,result:{}});}});
addEventListener('openai:set_globals',event=>{render(event.detail?.globals?.toolOutput??window.openai?.toolOutput);render(event.detail?.globals?.toolResponseMetadata);fit(event.detail?.globals??window.openai);});
addEventListener('resize',()=>fit(window.openai));window.visualViewport?.addEventListener('resize',()=>fit(window.openai));new ResizeObserver(resize).observe(document.querySelector('main'));
globals();send({id:'customer-init',method:'ui/initialize',params:{protocolVersion:'2026-01-26',appInfo:{name:'geupsikgil-customer-view',version:'1.1.0'},appCapabilities:{}}});
})();</script></body></html>`;
