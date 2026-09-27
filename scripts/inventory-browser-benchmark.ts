import { chromium, expect as baseExpect, type Page } from "@playwright/test";
import { getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
import sharp from "sharp";
import { PHASE3_TEST_PINS } from "./fixtures/phase3-auth";
import { assertInventoryE2EEnvironment, INVENTORY_E2E_ORIGIN } from "./inventory-e2e-safety";
import { inventoryProductSchema, inventoryLocationMap, INVENTORY_PRODUCT_PATH } from "../src/domain/inventory";

const expect = baseExpect.configure({ timeout: 30000 });
assertInventoryE2EEnvironment();
const label = process.env.INVENTORY_BENCHMARK_LABEL || "candidate";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid benchmark label");
const campaign = process.env.INVENTORY_BENCHMARK_CAMPAIGN || "full";
const controlledSw = process.env.INVENTORY_BENCHMARK_SW === "controlled";
const output = `output/playwright/inventory-benchmark/${label}`;
mkdirSync(output, { recursive: true });
const app = getApps().find(a => a.name === "phase1-seed")!;
const db = getFirestore(app);
const bucket = getStorage(app).bucket("demo-inventory-e2e.appspot.com");
const pixels = Buffer.alloc(1600 * 1200 * 3);
let random = 12345; for (let i = 0; i < pixels.length; i++) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; pixels[i] = (i % 1600 + (random >>> 26) * 2) % 256; }
const image = await sharp(pixels, {raw:{width:1600,height:1200,channels:3}}).jpeg({quality:88}).toBuffer();
const webp = await sharp(image).rotate().resize({width:1440,height:1440,fit:"inside",withoutEnlargement:true}).webp({quality:82,effort:5,smartSubsample:true}).toBuffer();
const capturePath = resolve(output,"synthetic-capture.jpg");
writeFileSync(capturePath,image);
const thumbnail = await sharp(image).rotate().resize({width:400,height:300,fit:"cover",withoutEnlargement:true}).webp({quality:76,effort:5,smartSubsample:true}).toBuffer();
const browser = await chromium.launch({ headless: true });
const samples: Record<string, unknown>[] = [];
async function mode(page: Page, name: string) {
  const trigger = page.getByRole("button", { name: /^업무 모드 변경, 현재 / });
  if (await trigger.isVisible()) { await trigger.click(); await page.getByRole("dialog", { name: "업무 모드 선택", exact:true }).locator(`button[data-mode="${name}"]`).click(); }
  else await page.getByRole("group", { name:"업무 모드", exact:true }).locator(`button[data-mode="${name}"]`).click();
}
const nameOf = (i:number) => `속도 검증 상품 ${String(i).padStart(4,"0")}`;
try {
for (const count of controlledSw ? [1000] : [100, 1000]) {
  const previous = await db.collection(INVENTORY_PRODUCT_PATH).get();
  for (let i=0;i<previous.docs.length;i+=400) { const b=db.batch(); previous.docs.slice(i,i+400).forEach(d=>b.delete(d.ref)); await b.commit(); }
  for(let i=1;i<=count;i++) {
    const productId=`benchmark-${String(i).padStart(4,"0")}`, photoId=randomUUID();
    const product=inventoryProductSchema.parse({ productId, companyId:"onnuri", name:nameOf(i), manufacturer:`검증 제조사 ${i%5}`, specification:"1kg", origin:"대한민국", note:`코드${i}`, unitLabel:"봉", unitsPerBox:8, defaultLocationId:"freezer1", urgent:false, status:"active", revision:1, stockRevision:0, hasHistory:false, quantityByLocation:inventoryLocationMap(0), nearestExpiryByLocation:inventoryLocationMap(null), lastCountByLocation:inventoryLocationMap(null), photo:{photoId,width:1440,height:1080},createdAt:"2026-09-10T00:00:00.000Z",updatedAt:"2026-09-10T00:00:00.000Z",createdBy:"EMP-DELIVERY",updatedBy:"EMP-DELIVERY" });
    await Promise.all([db.doc(`${INVENTORY_PRODUCT_PATH}/${productId}`).set(product),db.doc(`inventoryPhotoUploads/${photoId}`).set({uploadId:photoId,productId,state:"attached"}),...(["thumbnail","preview"] as const).map(v=>bucket.file(`companies/onnuri/inventoryPhotos/${photoId}/${v}.webp`).save(v === "thumbnail" ? thumbnail : webp,{contentType:"image/webp"}))]);
  }
  for(let iteration=-1;iteration<Number(process.env.INVENTORY_BENCHMARK_REPEATS||5);iteration++) {
    const context=await browser.newContext({viewport:{width:412,height:915}, deviceScaleFactor:1,serviceWorkers:controlledSw?"allow":"block"});
    await context.grantPermissions(["local-network-access"],{origin:INVENTORY_E2E_ORIGIN});
    const page=await context.newPage();
    page.setDefaultTimeout(30000);
    await page.addInitScript(() => {
      const w=window as unknown as {__bench:{events:unknown[],longTasks:unknown[],inputs:unknown[]}};
      w.__bench={events:[],longTasks:[],inputs:[]};
      for(const type of ["pointerdown","click","keydown","change"]) document.addEventListener(type,event=>{w.__bench.inputs.push({type,at:performance.now(),trusted:event.isTrusted});},true);
      new PerformanceObserver(list=>list.getEntries().forEach(e=>{ const x=e as PerformanceEventTiming; if(x.interactionId)w.__bench.events.push({start:x.startTime,duration:x.duration,interactionId:x.interactionId,inputDelay:x.processingStart-x.startTime,processing:x.processingEnd-x.processingStart,presentation:Math.max(0,x.duration-(x.processingEnd-x.startTime))}); })).observe({type:"event",buffered:true,durationThreshold:16} as PerformanceObserverInit);
      new PerformanceObserver(list=>list.getEntries().forEach(e=>w.__bench.longTasks.push({start:e.startTime,duration:e.duration}))).observe({type:"longtask",buffered:true});
    });
    const cdp=await context.newCDPSession(page); await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:120,downloadThroughput:200000,uploadThroughput:100000});
    await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
    const network: {url:string,start:number,bytes:number,uploadBytes:number,method:string,end?:number}[]=[];const requests=new Map<string,typeof network[number]>();
    cdp.on("Network.requestWillBeSent",e=>{const r={url:e.request.url,start:Date.now(),bytes:0,uploadBytes:Buffer.byteLength(e.request.postData??""),method:e.request.method};requests.set(e.requestId,r);network.push(r);});
    cdp.on("Network.dataReceived",e=>{const r=requests.get(e.requestId);if(r)r.bytes+=e.encodedDataLength;});
    cdp.on("Network.loadingFinished",e=>{const r=requests.get(e.requestId);if(r){r.bytes=e.encodedDataLength;r.end=Date.now();}});
    let terminal=0; page.on("response",async r=>{if(r.url().endsWith("/listInventoryProducts")&&r.request().method()==="POST"){try{const b=await r.json();if((b.result??b.data)?.nextCursor===null)terminal++;}catch{}}});
    if(controlledSw){await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await cdp.send("Emulation.setCPUThrottlingRate",{rate:1});}
    await page.goto(INVENTORY_E2E_ORIGIN);
    if(controlledSw){await page.evaluate(async()=>{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error("Benchmark SW installation timed out")),45000))]);});await page.reload();await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:120,downloadThroughput:200000,uploadThroughput:100000});await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});}
    await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);await page.getByRole("button",{name:"급식길 시작하기"}).click();
    await expect(page.getByRole("button",{name:/^업무 모드 변경, 현재 /}).or(page.getByRole("group",{name:"업무 모드",exact:true}))).toBeVisible();
    const metric:Record<string,number>={};
    const heapSamples:Record<string,number|null>={};
    const sampleHeap=async(name:string)=>{heapSamples[name]=await page.evaluate(()=> (performance as unknown as {memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize??null);};
    const intervals:Record<string,{start:number,end:number}>={};
    const record=(name:string,start:number)=>{const end=Date.now();metric[name]=end-start;intervals[name]={start,end};console.log(`BENCHMARK_PHASE ${count}/${iteration} ${name}: ${end-start}ms`);};
    const inventoryStart=network.length;
    const inventoryStartedAt=Date.now();
    let t=Date.now();await mode(page,"inventory");await expect(page.getByRole("button",{name:new RegExp(`^${nameOf(1)},`)})).toBeVisible();record("inventory_enter_to_first_searchable_row",t);
    await expect.poll(()=>terminal,{timeout:90000}).toBeGreaterThan(0);await expect(page.getByText(`${count.toLocaleString("ko-KR")}개 품목`,{exact:true})).toBeVisible();record("inventory_enter_to_complete",t);
    await page.waitForTimeout(1000);
    await page.locator(".workspace-content").evaluate(e=>e.scrollTo({top:e.scrollHeight,behavior:"instant"}));
    await page.waitForTimeout(300);
    await page.locator(".workspace-content").evaluate(e=>e.scrollTo({top:0,behavior:"instant"}));
    const listNetworkEnd=network.length;
    const search=page.getByRole("searchbox",{name:"품목 검색",exact:true});
    for(const n of [1,Math.floor(count/2),count]){ t=Date.now();await search.fill("");await search.pressSequentially(nameOf(n));await expect(page.getByRole("button",{name:new RegExp(`^${nameOf(n)},`)})).toBeVisible();record(`inventory_search_to_result_${n}`,t); }
    if(campaign === "entry" && iteration === 0){
      for(const [query,total] of [["검증 제조사 0",count/5],["1kg",count],["대한민국",count],["속도 검증 상품 00",99]] as const){
        await search.fill(query);await expect(page.getByText(`${total.toLocaleString("ko-KR")}개 품목`,{exact:true})).toBeVisible();
      }
    }
    for(const n of campaign === "entry" ? [] : [1,2]){
      await search.fill(nameOf(n));const row=page.getByRole("button",{name:new RegExp(`^${nameOf(n)},`)});t=Date.now();await row.click();const detail=page.getByRole("dialog",{name:nameOf(n),exact:true});await expect(detail.getByText(/현재 재고$/)).toBeVisible();record(`inventory_item_to_shell_${n}`,t);await expect(detail.getByRole("button",{name:"입고",exact:true})).toBeEnabled();record(`inventory_item_to_fresh_data_${n}`,t);
      await expect(detail.getByRole("img",{name:`${nameOf(n)} 제품 사진`,exact:true})).toBeVisible();t=Date.now();await page.goBack();await expect(row).toBeVisible();record(`inventory_back_to_restored_list_${n}`,t);
    }
    await search.fill("");
    const warmStart=network.length;t=Date.now();await mode(page,"customer");await mode(page,"inventory");await expect(search).toBeVisible();record("warm_reentry",t);await page.waitForTimeout(300);const warmEnd=network.length;
    for(let n=0;n<(campaign==="entry"?0:campaign==="full"&&iteration<5?2:1);n++){
      t=Date.now();await page.getByRole("button",{name:"새 품목 등록",exact:true}).click();const editor=page.getByRole("dialog",{name:"새 품목 등록",exact:true});await expect(editor.getByLabel(/품목명/)).toBeEditable();record(`inventory_new_item_to_input_${n}`,t);
      if(campaign!=="full"||iteration>=5){await page.goBack();await expect(search).toBeVisible();continue;}
      await editor.getByLabel(/품목명/).fill(`등록 속도 ${count}-${iteration}-${n}`);
      await editor.getByRole("spinbutton",{name:"초기 수량 (필수) (낱개)",exact:true}).fill("1");
      await editor.getByLabel("첫 유통기한 날짜",{exact:true}).fill("2028-12-31");
      const captureNetworkStart=network.length;await sampleHeap(`capture_before_${n}`);t=Date.now();await editor.getByLabel("제품 사진 직접 촬영").setInputFiles(capturePath);await expect(editor.getByRole("img",{name:"저장할 제품 사진 미리보기"})).toBeVisible();record(`inventory_capture_to_preview_${n}`,t);await sampleHeap(`capture_after_${n}`);
      expect(network.slice(captureNetworkStart).filter(r=>r.url.endsWith("/uploadInventoryPhoto"))).toHaveLength(0);
      const response=page.waitForResponse(r=>r.url().endsWith("/saveInventoryProduct")&&r.request().method()==="POST",{timeout:60000});t=Date.now();await editor.getByRole("button",{name:"품목 등록",exact:true}).click();await expect(editor.getByRole("button",{name:"저장 중…",exact:true})).toBeVisible();record(`inventory_save_to_local_ack_${n}`,t);await response;record(`inventory_save_to_server_confirm_${n}`,t);await sampleHeap(`save_after_${n}`);await expect(editor).toHaveCount(0);await page.goBack();await expect(search).toBeVisible();
    }
    if(iteration===0){await mode(page,"customer");await page.waitForTimeout(61000);const start=network.length;t=Date.now();await mode(page,"inventory");await expect(search).toBeVisible();await expect.poll(()=>network.slice(start).filter(r=>r.url.endsWith("/listInventoryProducts")).length).toBeGreaterThan(0);record("ttl_reentry",t);}
    const heap = await page.evaluate(()=> (performance as unknown as {memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize ?? null);
    const observer=await page.evaluate(()=>({...((window as unknown as {__bench:object}).__bench),timeOrigin:performance.timeOrigin}));
    if(iteration>=0)samples.push({count,iteration,metric,intervals,heapSamples,network,inventoryStartedAt,inventoryStart,listNetworkEnd,warmStart,warmEnd,heap,observer});
    writeFileSync(`${output}/samples.json`,JSON.stringify({method:{viewport:[412,915],cpuRate:4,latencyMs:120,downloadBytesPerSecond:200000,uploadBytesPerSecond:100000,campaign,serviceWorkers:controlledSw?"controlled with precache install outside measured interval":"blocked",warmup:"one unreported full browser journey per fixture; all reported contexts new browser storage; emulator warmed",syntheticPhoto:{sha256:createHash("sha256").update(image).digest("hex"),sourceBytes:image.length,thumbnailBytes:thumbnail.length,previewBytes:webp.length},journeyTiming:"automation action start to observed DOM; includes Playwright actionability and observation overhead; input events separately timestamped",capture:"setInputFiles to DOM preview; excludes real camera and OS chooser",cloudColdStart:"unmeasured",browser:browser.version()},samples},null,2));
    console.log(`BENCHMARK ${label}: ${count} items run ${iteration+1} complete`);
    await context.close();
    const created = await db.collection(INVENTORY_PRODUCT_PATH).where("createdBy", "==", "EMP-DELIVERY").get();
    for (const doc of created.docs) if (String(doc.get("name")).startsWith("등록 속도 ")) await doc.ref.delete();
  }
}
}finally{await browser.close();}

