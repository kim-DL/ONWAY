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
try{
 const context=await browser.newContext({viewport:{width:412,height:915},serviceWorkers:"block"});
 await context.grantPermissions(["local-network-access"],{origin:INVENTORY_E2E_ORIGIN});
 const page=await context.newPage();const cdp=await context.newCDPSession(page);
 await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
 await page.goto(INVENTORY_E2E_ORIGIN);await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);await page.getByRole("button",{name:"급식길 시작하기"}).click();
 const trigger=page.getByRole("button",{name:/^업무 모드 변경, 현재 /});await expect(trigger).toBeVisible();await trigger.click();await page.getByRole("dialog",{name:"업무 모드 선택",exact:true}).locator('button[data-mode="inventory"]').click();
 await expect(page.getByText("1,000개 품목",{exact:true})).toBeVisible();await page.waitForTimeout(1000);
 await cdp.send("Profiler.enable");await cdp.send("Profiler.setSamplingInterval",{interval:1000});await cdp.send("Profiler.start");
 const search=page.getByRole("searchbox",{name:"품목 검색",exact:true});
 for(let round=0;round<3;round++)for(const value of ["속도 검증 상품 0001","속도 검증 상품 0500","속도 검증 상품 1000"]){await search.fill("");await search.pressSequentially(value);await expect(page.getByRole("button",{name:new RegExp(`^${value},`)})).toBeVisible();}
 const {profile}=await cdp.send("Profiler.stop");
 const label=process.env.INVENTORY_BENCHMARK_LABEL||"search-profile";if(!/^[a-z0-9-]+$/.test(label))throw new Error("Unsafe label");const output=`output/playwright/inventory-benchmark/${label}`;mkdirSync(output,{recursive:true});writeFileSync(`${output}/search.cpuprofile`,JSON.stringify(profile));
 const times=new Map<number,number>();for(let i=0;i<(profile.samples?.length??0);i++){const id=profile.samples![i]!;times.set(id,(times.get(id)??0)+(profile.timeDeltas?.[i]??0));}
 const top=profile.nodes.map(n=>({selfMs:(times.get(n.id)??0)/1000,...n.callFrame})).sort((a,b)=>b.selfMs-a.selfMs).slice(0,50);
 writeFileSync(`${output}/top-frames.json`,JSON.stringify({method:"V8 sampling1ms, CPU4x; 3 rounds of 3 trusted typed queries, no network shaping during diagnostic; photos omitted because core list has no photo consumer",top},null,2));console.log(`Search profile written: ${output}`);
}finally{await browser.close();}
