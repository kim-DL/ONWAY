export const INVENTORY_WRITE_VIEW_URI = "ui://geupsikgil/inventory-approval-v1.html";
export const INVENTORY_WRITE_VIEW_META = { ui: { csp: { connectDomains: [], resourceDomains: [] } },
  "openai/widgetCSP": { connect_domains: [], resource_domains: [] }, "openai/widgetPrefersBorder": true,
  "openai/widgetDescription": "재고 변경 전후 미리보기. 사용자가 직접 확인하고 승인해야 저장됩니다." };
export const INVENTORY_WRITE_VIEW_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>재고 변경 승인</title>
<style>*{box-sizing:border-box}body{font:15px system-ui;margin:0;padding:12px;color:light-dark(#162033,#edf2f7);background:light-dark(#fff,#151a22);color-scheme:light dark}main{display:flex;flex-direction:column;max-height:min(580px,calc(100dvh - 24px));gap:10px}h2,p{margin:0}h2{font-size:18px}#details{min-height:0;overflow:auto;overscroll-behavior:contain;line-height:1.55}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{text-align:left;padding:8px 4px;border-bottom:1px solid #8885}footer{flex:none;display:grid;gap:10px;padding-bottom:max(4px,env(safe-area-inset-bottom,0px));background:inherit}button{min-height:48px;border:0;border-radius:8px;background:#215fc4;color:white;font:inherit;font-weight:600;padding:12px}button:disabled{opacity:.5}label{display:flex;align-items:center;gap:10px;min-height:44px}input{width:22px;height:22px;flex:none}#status{line-height:1.5;overflow-wrap:anywhere}.muted{font-size:13px;opacity:.8}[hidden]{display:none!important}</style></head><body>
<main><h2 id="title">재고 변경 미리보기</h2><div id="details"></div><footer><p id="status" role="status">미리보기를 불러오는 중입니다.</p><label id="confirmation" hidden><input id="checked" type="checkbox"><span id="check-label">변경 내용을 확인했습니다.</span></label><button id="approve" disabled hidden>승인하고 저장</button></footer></main>
<script>(()=>{
const el=id=>document.getElementById(id), pending=new Map();let sequence=0, ready=false, approval=null, current=null, saving=false, settled=false, attempted=false;
const locations={refrigerated:'냉장',freezer1:'냉동1',freezer2:'냉동2',sample:'샘플'};
const actions={count_match:'수량일치 확인',count_adjust:'실사 수량 조정',receive:'입고',issue:'출고',adjust:'수량 조정',transfer:'창고 이동',update_lot:'묶음·유통기한 수정'};
const send=m=>window.parent.postMessage({jsonrpc:'2.0',...m},'*');
function request(method,params){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('timeout'))},40000);pending.set(id,{resolve,reject,timer});send({id,method,params});});}
function resize(){const height=Math.ceil(document.querySelector('main').getBoundingClientRect().height+24);if(ready)send({method:'ui/notifications/size-changed',params:{height}});window.openai?.notifyIntrinsicHeight?.(height);}
const text=(tag,value,parent)=>{const e=document.createElement(tag);e.textContent=value;parent.appendChild(e);return e;};
const date=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
function refresh(){el('approve').disabled=saving||settled||!approval||!el('checked').checked||(!attempted&&Date.parse(current?.validUntil??'')<=Date.now());}
function show(result){if(saving||settled)return;if(result?.isError){approval=null;current=null;el('details').replaceChildren();el('status').textContent=result._meta?.error?.message||'미리보기를 만들지 못했습니다. 상품·묶음·수량·권한을 확인하세요.';el('confirmation').hidden=true;el('approve').hidden=true;resize();return;}const s=result?.structuredContent, a=result?._meta?.inventoryApproval;if(!s||s.state!=='awaiting_approval'||!a)return;
 current=s;approval=a;el('details').replaceChildren();el('checked').checked=false;
 text('p',s.productName+' · '+(actions[s.action]||s.action),el('details'));
 const table=document.createElement('table');el('details').appendChild(table);const head=document.createElement('tr');table.appendChild(head);['장소','변경 전','변경 후'].forEach(v=>text('th',v,head));
 Object.keys(locations).filter(k=>s.before[k]!==s.after[k]||k===s.locationId).forEach(k=>{const row=document.createElement('tr');table.appendChild(row);[locations[k],s.before[k]+' '+s.unitLabel,s.after[k]+' '+s.unitLabel].forEach(v=>text('td',v,row));});
 for(const line of s.lines||[]){const expiry=line.expiryDate||(line.expiryState==='not_applicable'?'유통기한 해당 없음':'유통기한 미등록');text('p',(locations[line.locationId]||'')+' · '+(line.lotLabel?line.lotLabel+' · ':'')+expiry+' · '+line.before+' → '+line.after+' '+s.unitLabel,el('details'));}
 if(s.lotMetadataChange){const m=s.lotMetadataChange;const showLot=l=>(l.label||'이름 없는 묶음')+' / '+(l.expiryDate||(l.expiryState==='not_applicable'?'해당 없음':'미등록'));text('p',showLot(m.before)+' → '+showLot(m.after),el('details'));text('p','같은 원본 묶음의 모든 보관 장소에 적용됩니다.',el('details'));}
 if(s.reason)text('p','사유: '+s.reason,el('details'));text('p','승인 가능: '+date(s.validUntil)+'까지 (서울)',el('details')).className='muted';
 el('status').textContent=s.canWrite?'아직 저장하지 않았습니다. 승인 전 재고가 바뀌면 다시 확인해야 합니다.':'아직 저장하지 않았습니다. 저장하려면 기존 직원 PIN으로 재고 변경 권한에 추가 동의해야 합니다.';
 el('check-label').textContent=s.action==='count_match'?'실제 재고를 확인했고 표시 수량과 일치합니다.':'변경 전후·단위·장소·유통기한을 확인했습니다.';
 el('confirmation').hidden=false;el('approve').hidden=false;refresh();resize();}
el('checked').addEventListener('change',refresh);
el('approve').addEventListener('click',async event=>{if(!event.isTrusted||el('approve').disabled||saving)return;attempted=true;saving=true;refresh();el('status').textContent='저장 결과를 확인하는 중입니다. 잠시 기다려 주세요.';
 try{const result=ready?await request('tools/call',{name:'commit_inventory_change',arguments:approval}):await window.openai.callTool('commit_inventory_change',approval);
 if(result?.isError){let error=result._meta?.error;try{error??=JSON.parse(result.content?.find(c=>c.type==='text')?.text??'{}').error;}catch{}
 el('status').textContent=error?.message||'저장 결과를 확인하지 못했습니다. 같은 미리보기로 결과를 재확인하세요.';
 if(['PREVIEW_STALE','PREVIEW_EXPIRED','AUTH_REQUIRED','FORBIDDEN','WRITE_CONSENT_REQUIRED'].includes(error?.code)){settled=true;approval=null;el('confirmation').hidden=true;}
 }else if(result?.structuredContent?.state==='committed'){settled=true;approval=null;el('title').textContent='재고 저장 완료';el('status').textContent=result.structuredContent.note+' '+date(result.structuredContent.registeredAt)+' (서울)';el('confirmation').hidden=true;el('approve').hidden=true;
 const update={role:'user',content:[{type:'text',text:'사용자가 재고 변경 미리보기에서 직접 승인했고 서버가 저장 완료를 확인했습니다. '+JSON.stringify(result.structuredContent)}]};
 if(ready)void request('ui/update-model-context',update).catch(()=>{});else window.openai?.sendFollowUpMessage?.({prompt:update.content[0].text});
 }else throw new Error('invalid result');
 }catch{el('status').textContent='응답을 확인하지 못했습니다. 이미 저장됐을 수 있습니다. 같은 버튼으로 결과를 재확인하면 중복 저장되지 않습니다.';el('approve').textContent='같은 승인 결과 재확인';}
 finally{saving=false;refresh();resize();}});
window.addEventListener('message',event=>{if(event.source!==window.parent)return;const m=event.data;if(!m||m.jsonrpc!=='2.0')return;
 if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error('host error')):p.resolve(m.result);return;}
 if(m.method==='ui/notifications/tool-result')show(m.params);
 if(m.method==='ui/resource-teardown'){approval=null;current=null;settled=true;el('details').replaceChildren();el('status').textContent='미리보기가 닫혔습니다.';refresh();if(m.id)send({id:m.id,result:{}});}
});
function compatibility(){if(window.openai?.toolOutput)show({structuredContent:window.openai.toolOutput,_meta:window.openai.toolResponseMetadata});}
window.addEventListener('openai:set_globals',compatibility);compatibility();
void request('ui/initialize',{appInfo:{name:'geupsikgil-inventory-approval',version:'1.7.0'},appCapabilities:{},protocolVersion:'2026-01-26'}).then(()=>{ready=true;send({method:'ui/notifications/initialized'});resize();}).catch(()=>{compatibility();});
setInterval(refresh,1000);new ResizeObserver(resize).observe(el('details'));
})();</script></body></html>`;
