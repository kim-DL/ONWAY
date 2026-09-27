/** Diagnostic only; does not change the frozen before/after timing protocol. */
import { chromium, expect as baseExpect } from "@playwright/test";
import { getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mkdirSync, writeFileSync } from "node:fs";
import { PHASE3_TEST_PINS } from "./fixtures/phase3-auth";
import { assertInventoryE2EEnvironment, INVENTORY_E2E_ORIGIN } from "./inventory-e2e-safety";
import { inventoryProductSchema, inventoryLocationMap, INVENTORY_PRODUCT_PATH } from "../src/domain/inventory";
assertInventoryE2EEnvironment();
const expect=baseExpect.configure({timeout:30000});
const db=getFirestore(getApps().find(a=>a.name==="phase1-seed")!);
const previous=await db.collection(INVENTORY_PRODUCT_PATH).get();
for(let i=0;i<previous.docs.length;i+=400){const batch=db.batch();previous.docs.slice(i,i+400).forEach(d=>batch.delete(d.ref));await batch.commit();}
let batch=db.batch();
for(let i=1;i<=1000;i++){
 const productId=`benchmark-${String(i).padStart(4,"0")}`;
 batch.set(db.doc(`${INVENTORY_PRODUCT_PATH}/${productId}`),inventoryProductSchema.parse({productId,companyId:"onnuri",name:`속도 검증 상품 ${String(i).padStart(4,"0")}`,manufacturer:`검증 제조사 ${i%5}`,specification:"1kg",origin:"대한민국",note:`코드${i}`,unitLabel:"봉",unitsPerBox:8,defaultLocationId:"freezer1",urgent:false,status:"active",revision:1,stockRevision:0,hasHistory:false,quantityByLocation:inventoryLocationMap(0),nearestExpiryByLocation:inventoryLocationMap(null),lastCountByLocation:inventoryLocationMap(null),photo:null,createdAt:"2026-09-10T00:00:00.000Z",updatedAt:"2026-09-10T00:00:00.000Z",createdBy:"EMP-DELIVERY",updatedBy:"EMP-DELIVERY"}));
 if(i%400===0){await batch.commit();batch=db.batch();}
}
await batch.commit();
const browser=await chromium.launch();
try{ for(const variant of (process.env.INVENTORY_EDITOR_VARIANTS||"baseline").split(",")){
 const context=await browser.newContext({viewport:{width:412,height:915},serviceWorkers:"block"});
 await context.grantPermissions(["local-network-access"],{origin:INVENTORY_E2E_ORIGIN});
 const page=await context.newPage();
 await page.addInitScript((variant)=>{
  const original=HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal=function(){
   if(variant==="autofocus")this.querySelector(".bottom-sheet__close")?.setAttribute("autofocus","");
   if(variant==="body-gate"){
    const body=this.querySelector(".bottom-sheet__body") as HTMLElement|null;
    const previous=body?.style.getPropertyValue("display")??"";const priority=body?.style.getPropertyPriority("display")??"";
    body?.style.setProperty("display","none","important");original.call(this);
    requestAnimationFrame(()=>setTimeout(()=>body?.style.setProperty("display",previous,priority),0));return;
   }
   return original.call(this);
  };
 },variant);
 const cdp=await context.newCDPSession(page);
 await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
 await page.goto(INVENTORY_E2E_ORIGIN);await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);await page.getByRole("button",{name:"급식길 시작하기"}).click();
 const trigger=page.getByRole("button",{name:/^업무 모드 변경, 현재 /});await expect(trigger).toBeVisible();await trigger.click();await page.getByRole("dialog",{name:"업무 모드 선택",exact:true}).locator('button[data-mode="inventory"]').click();
 await expect(page.getByText("1,000개 품목",{exact:true})).toBeVisible();await page.waitForTimeout(1000);
 await cdp.send("Network.enable");
 await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:120,downloadThroughput:200000,uploadThroughput:100000});
 const chunks:{url:string,start:number}[]=[];
 cdp.on("Network.requestWillBeSent",e=>{if(/\.js(?:\?|$)/.test(e.request.url))chunks.push({url:e.request.url,start:Date.now()});});
 if(variant==="no-backdrop"||variant==="no-effects")await page.addStyleTag({content:"*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}"});
 if(variant==="no-animation"||variant==="no-effects")await page.addStyleTag({content:"*,*::before,*::after{animation:none!important;transition:none!important}"});
 if(variant==="list-hidden")await page.addStyleTag({content:'section[aria-label="재고 관리"] > ul{visibility:hidden!important}'});
 if(variant==="list-none")await page.addStyleTag({content:'section[aria-label="재고 관리"] > ul{display:none!important}'});
 if(variant==="list-contain")await page.addStyleTag({content:'section[aria-label="재고 관리"] > ul{contain:layout style paint!important}'});
 if(variant==="section-block")await page.addStyleTag({content:'[class*="productSection"]{display:block!important}[class*="productSection"]>*+*{margin-top:10px!important}'});
 if(variant==="form-block")await page.addStyleTag({content:'form[class*="productForm"]{display:block!important}form[class*="productForm"]>*+*{margin-top:10px!important}'});
 if(variant==="fixed-tracks")await page.addStyleTag({content:'form[class*="productForm"],[class*="productSection"]{grid-template-columns:minmax(0,1fr)!important}'});
 if(variant==="inline-size")await page.addStyleTag({content:'.bottom-sheet{inline-size:388px!important;max-inline-size:100%!important}.bottom-sheet__body{inline-size:100%!important;min-inline-size:0!important}'});
 if(variant==="body-none")await page.addStyleTag({content:'.bottom-sheet__body{display:none!important}'});
 if(variant==="form-none")await page.addStyleTag({content:'form[class*="productForm"]{display:none!important}'});
 if(variant==="fieldset-none")await page.addStyleTag({content:'.bottom-sheet fieldset{display:none!important}'});
 if(variant==="controls-none")await page.addStyleTag({content:'.bottom-sheet input,.bottom-sheet select,.bottom-sheet textarea{display:none!important}'});
 if(variant==="appearance-none")await page.addStyleTag({content:'.bottom-sheet input,.bottom-sheet select,.bottom-sheet textarea{appearance:none!important}'});
 if(variant==="font-arial")await page.addStyleTag({content:'.bottom-sheet,.bottom-sheet *{font-family:Arial,sans-serif!important}'});
 if(variant==="content-visibility")await page.addStyleTag({content:'[class*="productSection"]>:not(:first-child){content-visibility:auto!important;contain-intrinsic-size:auto 60px!important}'});
 await page.waitForTimeout(2000);
 await page.evaluate(()=>{
   const state={timeOrigin:performance.timeOrigin,frames:[] as {at:number,headerVisible:boolean,inputVisible:boolean}[],events:[] as {at:number,kind:string,state?:string}[],timings:[] as {start:number,duration:number,processing:number,inputDelay:number}[]};
   (window as unknown as {__editorProbe:typeof state}).__editorProbe=state;
   document.addEventListener("click",e=>{if(e.isTrusted)state.events.push({at:performance.now(),kind:"trusted click"});},true);
   new PerformanceObserver(list=>list.getEntries().forEach(entry=>{const e=entry as PerformanceEventTiming;if(e.interactionId)state.timings.push({start:e.startTime,duration:e.duration,processing:e.processingEnd-e.processingStart,inputDelay:e.processingStart-e.startTime});})).observe({type:"event",durationThreshold:16} as PerformanceObserverInit);
   let previous="";
   const sample=(kind:string)=>{const dialog=document.querySelector('[role="dialog"],dialog[open]');const text=dialog?.textContent??"";const input=dialog?.querySelector('input[required][maxlength="200"]') as HTMLInputElement|null;const value=JSON.stringify({outerFallback:text.includes("품목 입력 화면을 준비하고 있어요."),manufacturerFallback:text.includes("제조사 선택 준비 중…"),input:!!input,inputEnabled:!!input&&!input.disabled,autofocus:dialog?.querySelector(".bottom-sheet__close")?.hasAttribute("autofocus")??false});if(value!==previous){previous=value;state.events.push({at:performance.now(),kind,state:value});}};
   new MutationObserver(()=>sample("DOM mutation")).observe(document.body,{childList:true,subtree:true,attributes:true});
   let frameCount=0,previousFrame="";const frame=()=>{
    sample("animation frame");
    const dialog=document.querySelector('[role="dialog"],dialog[open]');const input=dialog?.querySelector('input[required][maxlength="200"]') as HTMLInputElement|null;const header=dialog?.querySelector("h2");
    const rect=input?.getBoundingClientRect();const style=input?getComputedStyle(input):null;
    const headerVisible=!!header&&header.getClientRects().length>0;
    const inputVisible=!!input&&!input.disabled&&!!rect&&rect.width>0&&rect.height>0&&rect.top<innerHeight&&rect.bottom>0&&style?.visibility!=="hidden"&&style?.display!=="none";
    const key=`${headerVisible}:${inputVisible}`;if(key!==previousFrame){previousFrame=key;state.frames.push({at:performance.now(),headerVisible,inputVisible});}
    if(frameCount++<240)requestAnimationFrame(frame);
   };requestAnimationFrame(frame);
 });
 const trace:unknown[]=[];cdp.on("Tracing.dataCollected",e=>trace.push(...e.value));if(variant!=="plain")await cdp.send("Tracing.start",{categories:"devtools.timeline,blink.user_timing",transferMode:"ReportEvents"});
 if(variant!=="plain"){await cdp.send("Profiler.enable");await cdp.send("Profiler.setSamplingInterval",{interval:1000});await cdp.send("Profiler.start");}
 await page.getByRole("button",{name:"새 품목 등록",exact:true}).click();
 await expect(page.getByRole("dialog",{name:"새 품목 등록",exact:true}).getByLabel(/품목명/)).toBeEditable();
 await page.waitForTimeout(1000);
 const {profile}=variant==="plain"?{profile:null}:await cdp.send("Profiler.stop");
 if(variant!=="plain"){const traceDone=new Promise<void>(resolve=>cdp.once("Tracing.tracingComplete",()=>resolve()));await cdp.send("Tracing.end");await traceDone;}
 const probe=await page.evaluate(()=>(window as unknown as {__editorProbe:unknown}).__editorProbe);
 const label=process.env.INVENTORY_BENCHMARK_LABEL||"editor-profile";if(!/^[a-z0-9-]+$/.test(label))throw new Error("Unsafe label");const output=`output/playwright/inventory-benchmark/${label}${process.env.INVENTORY_EDITOR_VARIANTS?`-${variant}`:""}`;mkdirSync(output,{recursive:true});writeFileSync(`${output}/editor-readiness.json`,JSON.stringify({variant,method:"Diagnostic DOM mutation and animation frame samples; CPU4x;120ms/200KBdown/100KBup after inventory load; 2 second idle allowance; no photos",probe,chunks},null,2));writeFileSync(`${output}/editor.cpuprofile`,JSON.stringify(profile));writeFileSync(`${output}/editor-trace.json`,JSON.stringify({traceEvents:trace}));if(variant==="content-visibility"){
  await page.screenshot({path:`${output}/editor-top.png`});
  const editor=page.getByRole("dialog",{name:"새 품목 등록",exact:true});
  const quantity=editor.getByRole("spinbutton",{name:"초기 수량 (필수) (낱개)",exact:true});
  await quantity.scrollIntoViewIfNeeded();await expect(quantity).toBeVisible();await expect(quantity).toBeEditable();
  await editor.locator(".bottom-sheet__body").evaluate(e=>e.scrollTo({top:e.scrollHeight,behavior:"instant"}));await page.waitForTimeout(100);
  await page.screenshot({path:`${output}/editor-bottom.png`});
  writeFileSync(`${output}/scroll-check.json`,JSON.stringify({requiredQuantityVisibleAndEditable:true,nameInputStillMounted:await editor.getByLabel(/품목명/).count()},null,2));
 }
 if(process.env.INVENTORY_EDITOR_CAPTURE_PATH){
  const editor=page.getByRole("dialog",{name:"새 품목 등록",exact:true});
  await editor.getByLabel(/품목명/).fill("등록 속도 진단");
  await editor.getByRole("spinbutton",{name:"초기 수량 (필수) (낱개)",exact:true}).fill("1");
  await editor.getByLabel("첫 유통기한 날짜",{exact:true}).fill("2028-12-31");
  const requests:{url:string,start:number,uploadBytes:number}[]=[];
  page.on("request",r=>{if(r.method()==="POST")requests.push({url:r.url(),start:Date.now(),uploadBytes:Buffer.byteLength(r.postData()??"")});});
  const captureStart=await page.evaluate(()=>performance.now());
  await editor.getByLabel("제품 사진 직접 촬영").setInputFiles(process.env.INVENTORY_EDITOR_CAPTURE_PATH);
  await expect(editor.getByRole("img",{name:"저장할 제품 사진 미리보기"})).toBeVisible();
  const captureEnd=await page.evaluate(()=>performance.now());
  expect(requests.filter(r=>r.url.endsWith("/uploadInventoryPhoto"))).toHaveLength(0);
  const saveResponse=page.waitForResponse(r=>r.url().endsWith("/saveInventoryProduct")&&r.request().method()==="POST",{timeout:60000});
  const saveStart=await page.evaluate(()=>performance.now());
  await editor.getByRole("button",{name:"품목 등록",exact:true}).click();
  await expect(editor.getByRole("button",{name:"저장 중…",exact:true})).toBeVisible();
  const ack=await page.evaluate(()=>performance.now());await saveResponse;await expect(editor).toHaveCount(0);
  const confirmed=await page.evaluate(()=>performance.now());
  const saveProbe=await page.evaluate(()=>(window as unknown as {__editorProbe:unknown}).__editorProbe);
  writeFileSync(`${output}/photo-save-probe.json`,JSON.stringify({method:"One diagnostic save, same synthetic local file as frozen benchmark; actual callables; OS chooser excluded; observer includes trusted save click and EventTiming",captureStart,captureEnd,saveStart,ack,confirmed,requests,saveProbe},null,2));
 }
 console.log(`Editor diagnostic written: ${output}`);await context.close();
}}finally{await browser.close();}
