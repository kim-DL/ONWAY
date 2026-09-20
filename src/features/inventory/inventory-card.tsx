import { useId } from "react";
import { Icon } from "@/components/ui/icon";
import { INVENTORY_LOCATION_LABELS, type InventoryContext, type InventoryProduct } from "@/domain/inventory";
import { INVENTORY_COUNT_LABELS, inventoryCountBadgeState, inventoryExpiryGroupCount, inventoryExpiryLabel, inventoryScopeIsUrgent, inventoryScope, type InventoryLocationFilter } from "./inventory-model";
import { InventoryThumbnail } from "./inventory-thumbnail";
import styles from "./inventory.module.css";

export function InventoryCard({ product, location, context, countMode = false, onOpen }: { product: InventoryProduct; location: InventoryLocationFilter; context: InventoryContext | null; countMode?: boolean; onOpen: (productId: string) => void }) {
  const statusId = useId();
  const countState = inventoryCountBadgeState(product, location, context, countMode);
  const { quantity, expiryDate, locations } = inventoryScope(product, location);
  const urgent = !!context && inventoryScopeIsUrgent(product, location, context.today, context.settings.urgentDays);
  const expiryGroups = inventoryExpiryGroupCount(product, location);
  const metadata = [locations.map((item) => INVENTORY_LOCATION_LABELS[item]).join("/"), product.manufacturer, product.unitLabel].filter(Boolean).join(" · ");
  return <article className={styles.product} data-count-state={countState ?? undefined} data-count-highlight={countState === "done" ? "done" : countState ? "pending" : "neutral"}>
    <button type="button" className={styles.productButton} onClick={() => onOpen(product.productId)} aria-label={`${product.name}, ${quantity} ${product.unitLabel}, 상세 보기`} aria-describedby={context || product.status !== "active" ? statusId : undefined}>
      <InventoryThumbnail product={product} />
      <span className={styles.productBody} id={statusId}>
        <span className={styles.cardTitle}>{product.name}</span>
        <span className={styles.cardMeta}>{metadata || product.unitLabel}</span>
        <span className={styles.cardDate}>{expiryDate ? `유통기한 ${expiryDate.replaceAll("-", ".")}` : quantity > 0 ? "유통기한 미등록" : "재고 없음"}</span>
        <span className={styles.cardBadges}>
          {expiryGroups !== null && expiryGroups > 1 ? <span className={styles.lotSummaryBadge}><Icon name="calendar" size={12} />유통기한별 수량 <strong>{expiryGroups}</strong></span> : null}
          {urgent && context ? <span className={styles.expiryBadge} data-urgent><Icon name="clock" size={12} />{inventoryExpiryLabel(expiryDate, context.today)}</span> : null}
          {countState ? <span className={styles.countBadge} data-state={countState}><Icon name={countState === "done" ? "check" : countState === "changed" ? "refresh" : "clipboard"} size={12} />{INVENTORY_COUNT_LABELS[countState]}</span> : product.status !== "active" ? <span className={styles.countBadge}>비활성 품목</span> : null}
        </span>
      </span>
      <span className={styles.cardStock}><strong>{quantity.toLocaleString("ko-KR")}</strong><span>{product.unitLabel}</span></span>
    </button>
  </article>;
}
