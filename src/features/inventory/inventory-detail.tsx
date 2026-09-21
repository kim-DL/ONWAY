"use client";
import { useEffect, useRef, useState } from "react";
import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { INVENTORY_LOCATION_LABELS, inventoryExpiryDays, type InventoryContext, type InventoryLocation, type InventoryLot, type InventoryProduct, type InventoryProductDetail } from "@/domain/inventory";
import { inventoryRepository, inventoryErrorMessage } from "./inventory-repository";
import { INVENTORY_COUNT_LABELS, inventoryCountBadgeState, inventoryExpiryLabel, inventoryLocationsFor, inventoryLotDateLabel, inventoryUnitDisplayLabel } from "./inventory-model";
import { InventoryCountForm, InventoryLotEditor, InventoryMovementForm, InventoryProductEditor, InventoryStatusForm } from "./inventory-forms";
import { InventoryPhoto } from "./inventory-photo";
import { InventoryHistory } from "./inventory-history";
import { useInventoryConnection } from "./use-inventory-connection";
import styles from "./inventory.module.css";

export function InventoryDetail({ productId, initialLocation, context, calendarReady = true, countMode = false, onClose, onSaved }: { productId: string; initialLocation: InventoryLocation; context: InventoryContext; calendarReady?: boolean; countMode?: boolean; onClose: () => void; onSaved: (product: InventoryProduct) => void }) {
  const online = useInventoryConnection();
  const [detail, setDetail] = useState<InventoryProductDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [selectedLocation, setLocation] = useState(initialLocation);
  const [action, setAction] = useState<"receive" | "issue" | "adjust" | "count" | "edit" | "status" | "delete" | "history" | "more" | null>(null);
  const [editingLot, setEditingLot] = useState<InventoryLot | null>(null);
  const [movementLotId, setMovementLotId] = useState<string | undefined>(undefined);
  const savedCallback = useRef(onSaved);
  const pendingMutationRefresh = useRef<{ productId: string } | null>(null);
  const readGeneration = useRef(0);
  useEffect(() => { savedCallback.current = onSaved; }, [onSaved]);
  useEffect(() => {
    let cancelled = false;
    const generation = ++readGeneration.current;
    const pending = pendingMutationRefresh.current;
    const current = () => !cancelled && readGeneration.current === generation;
    void inventoryRepository.detail(productId).then((result) => {
      if (!current()) return;
      if (result.product.productId !== productId) throw new Error("Unexpected inventory product.");
      setDetail(result); setError("");
      // A retry receipt can predate a colleague's changes. Publish only this
      // fresh read to the parent list, and never publish an ordinary opening.
      if (pending?.productId === productId && pendingMutationRefresh.current === pending) {
        pendingMutationRefresh.current = null; savedCallback.current(result.product);
      }
    }).catch((cause) => { if (current()) { setDetail(null); setError(inventoryErrorMessage(cause)); } }).finally(() => { if (current()) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId, version]);
  function saved(product: InventoryProduct, confirmedDetail?: InventoryProductDetail) {
    if (product.productId !== productId) return;
    ++readGeneration.current;
    setAction(null); setEditingLot(null); setMovementLotId(undefined);
    if (product.status === "deleted") { pendingMutationRefresh.current = null; onSaved(product); onClose(); return; }
    // Apply only a server-confirmed product/lot snapshot. Legacy or replayed
    // responses still recheck current lots before enabling another action.
    if (confirmedDetail?.product.productId === product.productId && confirmedDetail.product.revision === product.revision && confirmedDetail.product.stockRevision === product.stockRevision) {
      pendingMutationRefresh.current = null;
      setDetail(confirmedDetail); setError(""); setLoading(false); onSaved(confirmedDetail.product); return;
    }
    pendingMutationRefresh.current = { productId };
    setLoading(true); setVersion((value) => value + 1);
  }
  const product = detail?.product;
  const locations = product ? inventoryLocationsFor(product) : [initialLocation];
  const location = locations.includes(selectedLocation) ? selectedLocation : locations[0]!;
  const lots = detail?.lots.filter((lot) => lot.locationId === location) ?? [];
  const writeAllowed = context.canWrite && product?.status === "active";
  const canWrite = online && writeAllowed && !loading;
  const canCount = canWrite && countMode && calendarReady && (lots.length > 0 || location === product?.defaultLocationId);
  const countHint = !countMode ? "실사 모드에서 사용" : !calendarReady ? "날짜 기준 확인 필요" : !online ? "온라인에서 사용" : loading ? "최신 재고 확인 중" : null;
  const countState = product ? inventoryCountBadgeState(product, location, calendarReady ? context : null, countMode) : null;
  function openMovement(kind: "receive" | "issue" | "adjust", lotId?: string) {
    if (!canWrite || (lotId && !lots.some((lot) => lot.lotId === lotId))) return;
    setEditingLot(null); setMovementLotId(lotId); setAction(kind);
  }
  return <><div className={styles.detailSurface}><BottomSheet open title={product?.name ?? "품목 상세"} onClose={onClose}>
    <div className={`${styles.sheet} ${styles.detailBody}`}>
      {loading ? <p role="status">최신 재고를 확인하고 있어요.</p> : null}
      {error ? <div className={styles.message} role="alert">{error}<GlassButton onClick={() => { setLoading(true); setVersion((value) => value + 1); }}>다시 확인</GlassButton></div> : null}
      {product ? <>
        <div className={styles.detailSummary}>
          <div className={styles.detailPhoto}>{product.photo ? <InventoryPhoto key={product.photo.photoId} product={product} expandable showExpandHint /> : <span className={styles.detailPhotoEmpty}><Icon name="camera" size={28} /><span>제품 사진</span></span>}</div>
          <div className={styles.detailStock}>{locations.length > 1 ? <label className={styles.detailLocation}><span className={styles.detailLocationControl}><select aria-label="상세 보관 장소" value={location} onChange={(event) => setLocation(event.target.value as InventoryLocation)}>{locations.map((item) => <option key={item} value={item}>{INVENTORY_LOCATION_LABELS[item]}</option>)}</select><Icon name="chevron-right" size={14} /></span><span>현재 재고</span></label> : <span>{INVENTORY_LOCATION_LABELS[location]} 현재 재고</span>}<strong>{product.quantityByLocation[location].toLocaleString("ko-KR")}<small>{inventoryUnitDisplayLabel(product.unitLabel)}</small></strong>{countState ? <StatusBadge tone={countState === "done" ? "success" : "neutral"}>{INVENTORY_COUNT_LABELS[countState]}</StatusBadge> : null}</div>
        </div>
        <dl className={styles.productFacts}>{[["제조사", product.manufacturer], ["규격", product.specification], ["원산지", product.origin], ["기준 단위", inventoryUnitDisplayLabel(product.unitLabel)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "미등록"}</dd></div>)}</dl>
        {product.note ? <p className={styles.note}><Icon name="clipboard" size={16} />{product.note}</p> : null}
        {product.status !== "active" ? <StatusBadge tone="neutral">비활성 품목</StatusBadge> : null}
        {lots.length ? <><div className={styles.sectionHeading}><h3>유통기한별 수량 <span>{lots.length}</span></h3></div><div className={styles.dateStockList}>{lots.map((lot) => {
          const days = calendarReady ? inventoryExpiryDays(lot.expiryDate, context.today) : null;
          return <article key={lot.lotId} className={styles.dateStockRow}><div><strong>{inventoryLotDateLabel(lot)}</strong>{lot.label ? <p className={styles.muted}>{lot.label}</p> : null}{days !== null && days <= context.settings.urgentDays ? <span className={styles.expiryBadge} data-urgent>{inventoryExpiryLabel(lot.expiryDate, context.today)}</span> : null}</div><strong className={styles.dateStockQuantity}>{lot.quantity.toLocaleString("ko-KR")} <small>{inventoryUnitDisplayLabel(product.unitLabel)}</small></strong>{canWrite ? <GlassButton className={styles.dateStockEdit} compact variant="quiet" onClick={() => setEditingLot(lot)} aria-label={`${inventoryLotDateLabel(lot)} 유통기한 수정`}>수정</GlassButton> : null}</article>;
        })}</div></> : null}
        {!calendarReady ? <p role="status" className={styles.notice}>날짜 기준 확인이 필요해요. 기준을 확인한 뒤 이번 주 실사를 저장할 수 있어요.</p> : null}
      </> : null}
    </div>
    {product ? <BottomSheetActions className={styles.detailActions ?? ""}>
      {writeAllowed ? <div className={styles.detailStockActions} role="group" aria-label="재고 작업">
        <GlassButton className={styles.detailActionIssue} disabled={!canWrite || !lots.length} onClick={() => openMovement("issue")}><Icon name="arrow-up" size={18} />출고</GlassButton>
        <GlassButton className={styles.detailActionReceive} disabled={!canWrite} onClick={() => openMovement("receive")}><Icon name="arrow-down" size={18} />입고</GlassButton>
        <GlassButton className={styles.detailActionAdjust} disabled={!canWrite || !lots.length} onClick={() => openMovement("adjust")}><Icon name="settings" size={18} />조정</GlassButton>
        <GlassButton className={styles.detailEditAction} aria-label="품목 정보 수정" disabled={!canWrite} onClick={() => setAction("edit")}><Icon name="clipboard" size={18} />정보 수정</GlassButton>
      </div> : null}
      <div className={styles.detailSecondaryActions}>
        {writeAllowed ? <GlassButton className={styles.detailActionCount} aria-label="수량 일치 확인" aria-describedby={countHint ? `inventory-count-hint-${productId}` : undefined} disabled={!canCount} onClick={() => { if (canCount) setAction("count"); }}><Icon name="check" size={18} /><span className={styles.detailActionLabel}>수량 일치 확인{countHint ? <small id={`inventory-count-hint-${productId}`}>{countHint}</small> : null}</span></GlassButton> : null}
        <GlassButton aria-label="더보기" aria-haspopup="dialog" aria-expanded={action === "more"} onClick={() => setAction("more")}><span className={styles.detailMoreIcon} aria-hidden="true">···</span>더보기</GlassButton>
      </div>
    </BottomSheetActions> : null}
  </BottomSheet></div>
    {detail && (action === "receive" || action === "issue" || action === "adjust") ? <InventoryMovementForm detail={detail} location={location} kind={action} {...(movementLotId ? { initialLotId: movementLotId } : {})} {...(countMode && calendarReady ? { inspectionCycleId: context.cycle.cycleId } : {})} onClose={() => { setAction(null); setMovementLotId(undefined); }} onSaved={saved} /> : null}
    {detail && action === "count" ? <InventoryCountForm detail={detail} location={location} context={context} calendarReady={calendarReady} countMode={countMode} onClose={() => setAction(null)} onSaved={saved} /> : null}
    {product && action === "edit" ? <InventoryProductEditor product={product} location={location} canCreateManufacturer={context.canWrite} canManageManufacturers={context.canAdmin} onClose={() => setAction(null)} onSaved={saved} /> : null}
    {detail && editingLot ? <InventoryLotEditor detail={detail} lot={editingLot} onMovement={openMovement} onClose={() => setEditingLot(null)} onSaved={saved} /> : null}
    {product && action === "more" ? <BottomSheet open title="품목 더보기" onClose={() => setAction(null)}><div className={styles.detailMoreActions}>
      <GlassButton onClick={() => setAction("history")}><Icon name="clock" size={18} /><span>입출고·실사 이력</span><Icon name="chevron-right" size={16} /></GlassButton>
      {context.canWrite ? <><GlassButton className={styles.detailStatusAction} disabled={!online || loading} onClick={() => setAction("status")}><Icon name={product.status === "active" ? "close" : "refresh"} size={18} /><span>{product.status === "active" ? "비활성화" : "다시 활성화"}</span><Icon name="chevron-right" size={16} /></GlassButton><GlassButton className={styles.detailDeleteAction} variant="danger" disabled={!online || loading} onClick={() => setAction("delete")}><Icon name="trash" size={18} /><span>품목 삭제</span><Icon name="chevron-right" size={16} /></GlassButton></> : null}
    </div></BottomSheet> : null}
    {product && (action === "status" || action === "delete") ? <InventoryStatusForm product={product} remove={action === "delete"} onClose={() => setAction(null)} onSaved={saved} /> : null}
    {action === "history" ? <BottomSheet open title="입출고·실사 기록" onClose={() => setAction(null)}><InventoryHistory productId={productId} /></BottomSheet> : null}
  </>;
}
