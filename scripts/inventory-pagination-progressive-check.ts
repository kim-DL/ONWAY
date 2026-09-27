/** Separate correctness probe: never used by the frozen timing campaign. */
import { chromium, expect as baseExpect } from "@playwright/test";
import { getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mkdirSync, writeFileSync } from "node:fs";
import { PHASE3_TEST_PINS } from "./fixtures/phase3-auth";
import { assertInventoryE2EEnvironment, INVENTORY_E2E_ORIGIN } from "./inventory-e2e-safety";
import { inventoryProductSchema, inventoryLocationMap, INVENTORY_PRODUCT_PATH } from "../src/domain/inventory";
assertInventoryE2EEnvironment();
const expect=baseExpect.configure({timeout:30000});
const label=process.env.INVENTORY_BENCHMARK_LABEL;
if(!label||!/^[a-z0-9-]+$/.test(label))throw new Error("Unsafe label");
const db=getFirestore(getApps().find(a=>a.name==="phase1-seed")!);
const existing=await db.collection(INVENTORY_PRODUCT_PATH).get();
for(let i=0;i<existing.docs.length;i+=400){const batch=db.batch();existing.docs.slice(i,i+400).forEach(d=>batch.delete(d.ref));await batch.commit();}
let batch=db.batch();
for(let i=1;i<=1000;i++){
 const productId=`progressive-${String(i).padStart(4,"0")}`;
 batch.set(db.doc(`${INVENTORY_PRODUCT_PATH}/${productId}`),inventoryProductSchema.parse({productId,companyId:"onnuri",name:`순차 검색 상품 ${String(i).padStart(4,"0")}`,manufacturer:`검증 제조사 ${i%5}`,specification:"1kg",origin:"대한민국",note:"비검색코드",unitLabel:"봉",unitsPerBox:8,defaultLocationId:"freezer1",urgent:false,status:"active",revision:1,stockRevision:0,hasHistory:false,quantityByLocation:inventoryLocationMap(0),nearestExpiryByLocation:inventoryLocationMap(null),lastCountByLocation:inventoryLocationMap(null),photo:null,createdAt:"2026-09-10T00:00:00.000Z",updatedAt:"2026-09-10T00:00:00.000Z",createdBy:"EMP-DELIVERY",updatedBy:"EMP-DELIVERY"}));
 if(i%400===0){await batch.commit();batch=db.batch();}
}
await batch.commit();
const browser=await chromium.launch();let release=()=>{};
const held=new Promise<void>(resolve=>{release=resolve;});
try{
 const context=await browser.newContext({viewport:{width:412,height:915},serviceWorkers:"block"});
 await context.grantPermissions(["local-network-access"],{origin:INVENTORY_E2E_ORIGIN});
 const page=await context.newPage();
 let firstPageCount=0,heldRequests=0;
 await page.route("**/listInventoryProducts",async route=>{if(route.request().method()!=="POST")return route.continue();const data=route.request().postDataJSON().data;if(data.afterId){heldRequests++;await held;}const response=await route.fetch();if(!data.afterId){const body=await response.json();firstPageCount=(body.result??body.data).products.length;}await route.fulfill({response});});
 await page.goto(INVENTORY_E2E_ORIGIN);await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);await page.getByRole("button",{name:"급식길 시작하기"}).click();
 const trigger=page.getByRole("button",{name:/^업무 모드 변경, 현재 /});await expect(trigger).toBeVisible();await trigger.click();await page.getByRole("dialog",{name:"업무 모드 선택",exact:true}).locator('button[data-mode="inventory"]').click();
 await expect(page.getByRole("button",{name:/^순차 검색 상품 0001,/})).toBeVisible();await expect.poll(()=>heldRequests).toBeGreaterThan(0);
 await page.getByRole("searchbox",{name:"품목 검색",exact:true}).fill("순차 검색 상품 0080");
 await page.waitForTimeout(500);
 const row=page.getByRole("button",{name:/^순차 검색 상품 0080,/});const availableBeforeRemainingPages=await row.isVisible();release();await expect(row).toBeVisible();
 const search=page.getByRole("searchbox",{name:"품목 검색",exact:true});await search.fill("");await expect(page.getByText("1,000개 품목",{exact:true})).toBeVisible();
 const allIds=Array.from({length:1000},(_,i)=>`progressive-${String(i+1).padStart(4,"0")}`);
 const cases=[{field:"name",query:"순차 검색 상품 0080",expectedIds:["progressive-0080"]},{field:"manufacturer",query:"검증 제조사 0",expectedIds:allIds.filter((_,i)=>(i+1)%5===0)},{field:"specification",query:"1kg",expectedIds:allIds},{field:"origin",query:"대한민국",expectedIds:allIds},{field:"similar-name-prefix",query:"순차 검색 상품 00",expectedIds:allIds.slice(0,99)},{field:"initial-consonants",query:"ㅅㅊ ㄱㅅ ㅅㅍ",expectedIds:allIds},{field:"note-not-searchable",query:"비검색코드",expectedIds:[]},{field:"product-id-not-searchable",query:"progressive-",expectedIds:[]}];
 const fullSearchChecks=[];
 for(const item of cases){
  await search.fill(item.query);await expect(page.getByText(`${item.expectedIds.length.toLocaleString("ko-KR")}개 품목`,{exact:true})).toBeVisible();
  const more=page.getByRole("button",{name:"품목 더 보기",exact:true});while(await more.isVisible())await more.click();
  const actualIds=await page.locator('section[aria-label="재고 관리"] > ul > li').evaluateAll(rows=>rows.map(row=>{const match=row.textContent?.match(/순차 검색 상품 (\d{4})/u);return match?`progressive-${match[1]}`:"unmatched-row";}));
  expect(actualIds.sort()).toEqual([...item.expectedIds].sort());fullSearchChecks.push({field:item.field,query:item.query,expectedCount:item.expectedIds.length,expectedIds:item.expectedIds,actualIds});
 }
 const output=`output/playwright/inventory-benchmark/${label}`;mkdirSync(output,{recursive:true});writeFileSync(`${output}/progressive-search.json`,JSON.stringify({project:"demo-inventory-e2e",firstPageCount,heldRequests,target:"0080",availableBeforeRemainingPages,availableAfterRelease:true,fullSearchChecks},null,2));
 console.log(`Progressive search ${label}: first ${firstPageCount}; target80 before remaining pages=${availableBeforeRemainingPages}`);
}finally{release();await browser.close();}
