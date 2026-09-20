import type { InventoryProduct } from "@/domain/inventory";

/** Protect only writes committed during an in-flight catalog read. This is
 * session memory, not a durable cache or an offline write queue. A subsequent
 * fresh read is authoritative again; metadata and stock revisions are never
 * compared as though they were one shared version counter. */
export class InventoryListReconciler {
  private readonly changes = new Map<string, InventoryProduct>();
  private reading = false;
  private disposed = false;

  constructor(private readonly sessionKey: string) {}

  begin(): boolean {
    if (this.disposed) return false;
    this.changes.clear();
    this.reading = true;
    return true;
  }

  record(sessionKey: string, product: InventoryProduct): boolean {
    if (this.disposed || this.sessionKey !== sessionKey) return false;
    if (this.reading) this.changes.set(product.productId, product);
    return true;
  }

  reconcile(snapshot: InventoryProduct[], baseline: InventoryProduct[] = []): InventoryProduct[] | null {
    if (this.disposed || !this.reading) return null;
    const products = new Map(baseline.filter((product) => product.status !== "deleted").map((product) => [product.productId, product]));
    for (const product of snapshot) {
      if (product.status === "deleted") products.delete(product.productId);
      else products.set(product.productId, product);
    }
    for (const product of this.changes.values()) {
      if (product.status === "deleted") products.delete(product.productId);
      else products.set(product.productId, product);
    }
    return [...products.values()];
  }

  finish() {
    this.reading = false;
    this.changes.clear();
  }

  dispose() {
    this.disposed = true;
    this.finish();
  }
}
