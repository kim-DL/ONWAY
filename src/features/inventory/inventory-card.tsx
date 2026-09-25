import { useId } from "react";
import { INVENTORY_LOCATION_LABELS, type InventoryContext, type InventoryProduct } from "@/domain/inventory";
import { INVENTORY_COUNT_LABELS, inventoryCountBadgeState, inventoryExpiryGroupCount, inventoryExpiryLabel, inventoryScopeIsUrgent, inventoryScope, inventoryUnitDisplayLabel, type InventoryLocationFilter } from "./inventory-model";
import { InventoryThumbnail } from "./inventory-thumbnail";
import styles from "./inventory.module.css";

export function InventoryCard({ product, location, context, countMode = false, onOpen }: { product: InventoryProduct; location: InventoryLocationFilter; context: InventoryContext | null; countMode?: boolean; onOpen: (productId: string) => void }) {
  const statusId = useId();
  const countState = inventoryCountBadgeState(product, location, context, countMode);
  const { quantity, expiryDate, locations } = inventoryScope(product, location);
  const urgent = !!context && inventoryScopeIsUrgent(product, location, context.today, context.settings.urgentDays);
  const expiryGroups = inventoryExpiryGroupCount(product, location);
  const unitLabel = inventoryUnitDisplayLabel(product.unitLabel);
  const metadata = [locations.map((item) => INVENTORY_LOCATION_LABELS[item]).join("/"), product.manufacturer].filter(Boolean).join(" · ");
  const showIndicator = !!context && (countMode || context.today === context.cycle.startDate);
  return <article data-count-state={countState ?? undefined} data-count-indicator={showIndicator && countState ? countState : undefined}>
    <button type="button" className={styles.productButton} onClick={() => onOpen(product.productId)} aria-label={`${product.name}, ${quantity} ${unitLabel}, 상세 보기`} aria-describedby={context || product.status !== "active" ? statusId : undefined}>
      {showIndicator ? <span className={styles.countIndicator} data-state={countState ?? "none"} aria-hidden="true">{countState === "done" ? "✓" : countState === "changed" ? "↻" : null}</span> : null}
      {product.photo ? <InventoryThumbnail product={product} /> : null}
      <span className={styles.productBody} id={statusId}>
        <span className={styles.cardTitle}>{product.name}</span>
        <span className={styles.cardMeta}>{metadata}</span>
        <span className={styles.cardDetails}>
          <span>{expiryDate ? `유통기한 ${expiryDate.replaceAll("-", ".")}` : quantity > 0 ? "유통기한 미등록" : "재고 없음"}</span>
          {expiryGroups !== null && expiryGroups > 1 ? <span>유통기한별 수량 {expiryGroups}</span> : null}
          {urgent && context ? <span className={styles.rowUrgent}>{inventoryExpiryLabel(expiryDate, context.today)}</span> : null}
          {countState ? <span className={styles.rowStatus} data-state={countState}>{INVENTORY_COUNT_LABELS[countState]}</span> : product.status !== "active" ? <span>비활성 품목</span> : null}
        </span>
      </span>
      <span className={styles.cardStock}><strong>{quantity.toLocaleString("ko-KR")}</strong><span>{unitLabel}</span></span>
    </button>
  </article>;
}
