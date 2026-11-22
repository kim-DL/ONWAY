"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import type { InventoryProduct, InventoryProductDetail } from "@/domain/inventory";
import type { InventoryNotice } from "@/features/inventory-notices/notice-repository";
import { isInventoryAccessFailure } from "./inventory-access-boundary";
import { inventoryRepository } from "./inventory-repository";

type StockReadProps = {
  productId: string;
  revision: number;
  listed: boolean;
  applyProduct: (product: InventoryProduct, wasListed: boolean) => void;
  refreshList: () => void;
};

function StockRead({ productId, revision, listed, applyProduct, refreshList }: StockReadProps) {
  const pending = useRef<Promise<InventoryProductDetail> | null>(null);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let retryDelay = 1000;
    async function read() {
      const request = pending.current ??= inventoryRepository.detail(productId);
      try {
        const { product } = await request;
        if (!active || !navigator.onLine || document.visibilityState === "hidden") return;
        if (product.productId === productId && product.stockRevision >= revision) {
          applyProduct(product, listed);
          return;
        }
      } catch (error) {
        if (!active || isInventoryAccessFailure(error)) return;
        if (typeof error === "object" && error && "code" in error && String(error.code).endsWith("not-found")) {
          if (listed) refreshList();
          return;
        }
        // A summary read can still succeed when a product's lot detail cannot.
        if (retryDelay === 2000) refreshList();
      } finally {
        if (pending.current === request) pending.current = null;
      }
      if (active) {
        timer = setTimeout(read, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      }
    }
    void read();
    return () => { active = false; clearTimeout(timer); };
  }, [productId, revision, listed, applyProduct, refreshList]);
  return null;
}

export type StockSyncProps = {
  products: InventoryProduct[];
  catalogComplete: boolean;
  applyProduct: StockReadProps["applyProduct"];
  refreshList: StockReadProps["refreshList"];
};

export const InventoryStockReads = memo(function InventoryStockReads({ products, catalogComplete, changes, applyProduct, refreshList }: StockSyncProps & { changes: InventoryNotice[] }) {
  const catalog = useMemo(() => new Map(products.map(product => [product.productId, product.stockRevision])), [products]);
  // Includes already-read changes on reconnect. Only a newer stock revision
  // warrants a read; a single lot's delta cannot determine the product totals.
  const needed = new Map<string, number>();
  for (const { productId, stockRevision } of changes) {
    if (!catalogComplete && !catalog.has(productId)) continue;
    if (stockRevision > (catalog.get(productId) ?? -1) && stockRevision > (needed.get(productId) ?? -1)) {
      needed.set(productId, stockRevision);
    }
  }
  return Array.from(needed, ([productId, revision]) => <StockRead key={productId + ":" + catalog.has(productId)}
    productId={productId} revision={revision} listed={catalog.has(productId)} applyProduct={applyProduct} refreshList={refreshList} />);
});
