import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readStylesheet } from "../helpers/read-stylesheet";

const root = fileURLToPath(new URL("../../", import.meta.url));
let script = "";
let css = "";
test.beforeAll(async () => {
  const result = await build({ absWorkingDir: root, stdin: { resolveDir: root, loader: "tsx", contents: `
    import {createRoot} from 'react-dom/client';
    import {useState} from 'react';
    import {InventoryListChunks} from './src/features/inventory/inventory-list-chunks';
    import {InventoryCard} from './src/features/inventory/inventory-card';
    import {restoreInventoryProductFocus} from './src/features/inventory/inventory-focus';
    import {BottomSheet} from './src/components/ui/bottom-sheet';
    import {inventoryLocationMap} from './src/domain/inventory';
    import styles from './src/features/inventory/inventory.module.css';
    const products=Array.from({length:600},(_,index)=>({productId:String(index),name:'목록 검증 '+String(index+1).padStart(4,'0')+' 긴 제품 이름',manufacturer:'검증 제조사',status:'active',unitLabel:'봉',defaultLocationId:'freezer1',quantityByLocation:inventoryLocationMap(0),nearestExpiryByLocation:inventoryLocationMap(null),lastCountByLocation:inventoryLocationMap(null)}));
    function App(){
      const [selected,select]=useState(null);
      const [reversed,reverse]=useState(false);
      const rows=reversed?[...products].reverse():products;
      return <main className="workspace-shell" data-mode="inventory"><div className="workspace-content"><section className={styles.workspace}>
        <h1>재고 목록 검증</h1>
        <InventoryListChunks>{rows.map(product=><li role="listitem" key={product.productId}><InventoryCard product={product} context={null} location="all" onOpen={select}/></li>)}</InventoryListChunks>
        {selected!==null?<BottomSheet open title={products[Number(selected)].name} onClose={()=>{select(null);restoreInventoryProductFocus(selected);}}><p>상세 내용</p><button onClick={()=>reverse(value=>!value)}>목록 순서 변경</button></BottomSheet>:null}
      </section></div></main>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  ` }, outfile: "inventory-list.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"production"' } });
  script = result.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  css = readStylesheet(new URL("../../src/app/globals.css", import.meta.url)) + result.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
});

test("closing a detail restores the same product after a reorder moves it to another group", async ({ page }) => {
  await page.route("https://inventory-list.test/", (route) => route.fulfill({ contentType: "text/html", body: `<html lang="ko"><head><meta charset="utf-8"><title>재고 검증</title><style>${css}</style></head><body><div id="root"></div></body></html>` }));
  await page.goto("https://inventory-list.test/");
  await page.addScriptTag({ content: script });
  const product = page.getByRole("button", { name: /^목록 검증 0001.*상세 보기$/ });
  await product.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "목록 검증 0001 긴 제품 이름", exact: true });
  await dialog.getByRole("button", { name: "목록 순서 변경", exact: true }).click();
  await expect(page.getByRole("listitem").last()).toContainText("목록 검증 0001");
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(product).toBeFocused();
});

test("offscreen inventory groups retain list semantics, keyboard traversal and dialog return", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  // A real document URL is required for the sheet's History API traversal.
  await page.route("https://inventory-list.test/", (route) => route.fulfill({ contentType: "text/html", body: `<html lang="ko"><head><meta charset="utf-8"><title>재고 검증</title><style>${css}</style></head><body><div id="root"></div></body></html>` }));
  await page.goto("https://inventory-list.test/");
  await page.addScriptTag({ content: script });
  await expect(page.getByRole("listitem")).toHaveCount(600);
  const cards = page.getByRole("button", { name: /목록 검증.*상세 보기/ });
  await cards.nth(19).focus();
  await page.keyboard.press("Tab");
  await expect(cards.nth(20)).toBeFocused();
  await expect(cards.nth(20)).toBeInViewport();
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await cards.first().focus();
    await cards.last().focus();
    await expect(cards.last()).toBeInViewport();
    expect(await cards.last().evaluate((button) => getComputedStyle(button).outlineOffset)).toBe("-3px");
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "목록 검증 0600 긴 제품 이름", exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(cards.last()).toBeFocused();
    await expect(cards.last()).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(await page.evaluate(() => (window as unknown as { find: (text: string, matchCase: boolean, backwards: boolean, wrap: boolean) => boolean }).find("목록 검증 0300", false, false, true))).toBe(true);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("목록 검증 0300");
  await cards.nth(299).scrollIntoViewIfNeeded();
  await expect(cards.nth(299)).toBeInViewport();
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
});
