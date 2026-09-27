import { readFileSync, writeFileSync } from "node:fs";
const paths = process.argv.slice(2);
const quantiles = (values) => { const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b); return {n:sorted.length,p50:sorted[Math.ceil(sorted.length*.5)-1]??null,p75:sorted[Math.ceil(sorted.length*.75)-1]??null,p95:sorted[Math.ceil(sorted.length*.95)-1]??null}; };
for(const path of paths){
 const data=JSON.parse(readFileSync(path,"utf8"));const summary={method:{...data.method,metricNotes:{network:"request cohorts initiated during each interval; received bytes accumulated through trial end, including later completions; CDP encoded lengths, not a production billing estimate",warm_reentry:"customer mode exit plus return to inventory",inventory_search_to_result:"entire typed query through observed matching row",eventTimingComponents:"per longest-duration EventTiming entry; ties choose greater processing; lab estimate, not full interaction/field attribution",inputToObservedDom:"supplemental observed DOM upper bound after trusted input; excludes prior driver scroll/actionability but includes polling; not paint latency"}},groups:{}};
 for(const count of [...new Set(data.samples.map(s=>s.count))]){
 const samples=data.samples.filter(s=>s.count===count), metrics={};
 for(const name of new Set(samples.flatMap(s=>Object.keys(s.metric))))metrics[name]=quantiles(samples.map(s=>s.metric[name]));
 const net=(rows)=>({requests:rows.length,callablePosts:rows.filter(r=>r.method==="POST"&&r.url.includes(":5001/")).length,contextPosts:rows.filter(r=>r.method==="POST"&&r.url.endsWith("/getInventoryContext")).length,listPosts:rows.filter(r=>r.method==="POST"&&r.url.endsWith("/listInventoryProducts")).length,uploadBytes:rows.reduce((n,r)=>n+(r.uploadBytes??0),0),transferredBytes:rows.reduce((n,r)=>n+r.bytes,0),photoRequests:rows.filter(r=>r.method==="POST"&&r.url.endsWith("/getInventoryPhoto")).length,photoBytes:rows.filter(r=>r.url.endsWith("/getInventoryPhoto")).reduce((n,r)=>n+r.bytes,0),jsRequests:rows.filter(r=>/\.js(?:\?|$)/.test(r.url)).length,jsBytes:rows.filter(r=>/\.js(?:\?|$)/.test(r.url)).reduce((n,r)=>n+r.bytes,0)});
 const list=samples.map(s=>net(s.network.slice(s.inventoryStart??0,s.listNetworkEnd)));
 const warm=samples.map(s=>net(s.network.slice(s.warmStart,s.warmEnd)));
 const interaction=samples.map(s=>{const byId=new Map();for(const e of s.observer.events){if(e.start+s.observer.timeOrigin<s.inventoryStartedAt)continue;if(!byId.has(e.interactionId)||byId.get(e.interactionId).duration<e.duration||(byId.get(e.interactionId).duration===e.duration&&byId.get(e.interactionId).processing<e.processing))byId.set(e.interactionId,e);}return [...byId.values()].sort((a,b)=>b.duration-a.duration)[Math.floor(byId.size/50)]??{duration:0,inputDelay:0,processing:0,presentation:0};});
 const selectedInteractionJourneys=interaction.map((event,index)=>{const sample=samples[index],at=event.start+sample.observer.timeOrigin;const matches=Object.entries(sample.intervals??{}).filter(([,range])=>at>=range.start&&at<=range.end).sort((a,b)=>(a[1].end-a[1].start)-(b[1].end-b[1].start));return {iteration:sample.iteration,journey:matches[0]?.[0]??"outside timed intervals",...event};});
 const eventTimingByJourney={};
 for(const key of Object.keys(metrics)){
  const selected=samples.filter(s=>s.intervals?.[key]).map(s=>s.observer.events.filter(e=>e.start+s.observer.timeOrigin>=s.intervals[key].start&&e.start+s.observer.timeOrigin<=s.intervals[key].end).sort((a,b)=>b.duration-a.duration||b.processing-a.processing)[0]).filter(Boolean);
  if(selected.length)eventTimingByJourney[key]=Object.fromEntries(["duration","inputDelay","processing","presentation"].map(k=>[k,quantiles(selected.map(e=>e[k]))]));
 }
 const inputToObservedDom={};
 for(const key of Object.keys(metrics)){
  const inputType=key.startsWith("inventory_search_to_result")?"keydown":key.startsWith("inventory_capture_to_preview")?"change":"click";
  const values=samples.flatMap(s=>{const interval=s.intervals?.[key];if(!interval)return [];const events=(s.observer.inputs??[]).filter(e=>e.trusted&&e.type===inputType&&e.at+s.observer.timeOrigin>=interval.start&&e.at+s.observer.timeOrigin<=interval.end);const last=events.at(-1);return last?[interval.end-last.at-s.observer.timeOrigin]:[];});
  if(values.length)inputToObservedDom[key]={anchor:inputType==="keydown"?"last trusted keydown in the typed-query interval":inputType==="change"?"trusted file change event":"last trusted click within the action interval",...quantiles(values)};
 }
 const networkByJourney={};
 for(const key of Object.keys(metrics)){
  const rows=samples.filter(s=>s.intervals?.[key]).map(s=>net(s.network.filter(r=>r.start>=s.intervals[key].start&&r.start<=s.intervals[key].end)));
  if(rows.length)networkByJourney[key]=Object.fromEntries(Object.keys(rows[0]).map(k=>[k,quantiles(rows.map(r=>r[k]))]));
 }
 const chunkInventory=[...new Set(samples.flatMap(s=>s.network.filter(r=>/\.js(?:\?|$)/.test(r.url)).map(r=>new URL(r.url).pathname)))];
 const savePreparationMs=quantiles(samples.flatMap(s=>Object.entries(s.intervals??{}).filter(([key])=>key.startsWith("inventory_save_to_server_confirm")).flatMap(([,interval])=>{const upload=s.network.find(r=>r.method==="POST"&&r.url.endsWith("/uploadInventoryPhoto")&&r.start>=interval.start&&r.start<=interval.end);const click=(s.observer.inputs??[]).find(e=>e.trusted&&e.type==="click"&&e.at+s.observer.timeOrigin>=interval.start&&e.at+s.observer.timeOrigin<=interval.end);return upload&&click?[upload.start-click.at-s.observer.timeOrigin]:[];})));
 const heapSamples=Object.fromEntries([...new Set(samples.flatMap(s=>Object.keys(s.heapSamples??{})))].map(key=>[key,quantiles(samples.map(s=>s.heapSamples?.[key]))]));
 const detailPhotoVisibleMs={};
 for(const index of [1,2]){
  const rows=samples.filter(s=>s.intervals?.[`inventory_item_to_shell_${index}`]&&s.intervals?.[`inventory_back_to_restored_list_${index}`]).map(s=>{const range=s.intervals[`inventory_item_to_shell_${index}`],end=s.intervals[`inventory_back_to_restored_list_${index}`].start;const click=(s.observer.inputs??[]).filter(e=>e.trusted&&e.type==="click"&&e.at+s.observer.timeOrigin>=range.start&&e.at+s.observer.timeOrigin<=range.end).at(-1);return {automation:end-range.start,input:click?end-click.at-s.observer.timeOrigin:NaN};});
  detailPhotoVisibleMs[index]={automation:quantiles(rows.map(r=>r.automation)),trustedClickToObserved:quantiles(rows.map(r=>r.input))};
 }
 const detailPhotoSettleLongTaskMaxMs={};
 for(const index of [1,2])detailPhotoSettleLongTaskMaxMs[index]=quantiles(samples.filter(s=>s.intervals?.[`inventory_item_to_fresh_data_${index}`]&&s.intervals?.[`inventory_back_to_restored_list_${index}`]).map(s=>{const start=s.intervals[`inventory_item_to_fresh_data_${index}`].end,end=s.intervals[`inventory_back_to_restored_list_${index}`].start;return Math.max(0,...s.observer.longTasks.filter(e=>e.start+s.observer.timeOrigin>=start&&e.start+s.observer.timeOrigin<=end).map(e=>e.duration));}));
 const maximumLongTaskMs=quantiles(samples.map(s=>Math.max(0,...s.observer.longTasks.filter(e=>e.start+s.observer.timeOrigin>=s.inventoryStartedAt).map(e=>e.duration))));
 const uploadRows=samples.flatMap(s=>s.network.filter(r=>r.method==="POST"&&r.url.endsWith("/uploadInventoryPhoto")&&r.end));
 const longTasksByJourney={};for(const key of Object.keys(metrics)){longTasksByJourney[key]=quantiles(samples.filter(s=>s.intervals?.[key]).map(s=>s.observer.longTasks.filter(e=>e.start+s.observer.timeOrigin>=s.intervals[key].start&&e.start+s.observer.timeOrigin<=s.intervals[key].end).reduce((n,e)=>n+e.duration,0)));}
 summary.groups[count]={journeys:metrics,selectedInteractionJourneys,eventTimingByJourney,maximumLongTaskMs,detailPhotoVisibleMs,detailPhotoSettleLongTaskMaxMs,networkByJourney,chunkInventory,savePreparationMs,heapSamples,inputToObservedDom,longTasksByJourney,photoUploadRoundTripMs:quantiles(uploadRows.map(r=>r.end-r.start)),listNetwork:Object.fromEntries(Object.keys(list[0]).map(k=>[k,quantiles(list.map(n=>n[k]))])),warmNetwork:warm,maximumInputProcessingMs:quantiles(samples.map(s=>Math.max(0,...s.observer.events.filter(e=>e.start+s.observer.timeOrigin>=s.inventoryStartedAt).map(e=>e.processing)))),labInteractionEstimate: Object.fromEntries(["duration","inputDelay","processing","presentation"].map(k=>[k,quantiles(interaction.map(e=>e[k]))])),longTasks:quantiles(samples.map(s=>s.observer.longTasks.filter(e=>e.start+s.observer.timeOrigin>=s.inventoryStartedAt).length)),longTaskTotalMs:quantiles(samples.map(s=>s.observer.longTasks.filter(e=>e.start+s.observer.timeOrigin>=s.inventoryStartedAt).reduce((n,e)=>n+e.duration,0)))};
 }
 const out=path.replace(/samples\.json$/,"summary.json");writeFileSync(out,JSON.stringify(summary,null,2));console.log(out);
}
