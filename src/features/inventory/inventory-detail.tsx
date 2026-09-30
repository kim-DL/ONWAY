"use client";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { INVENTORY_LOCATION_LABELS, inventoryExpiryDays, type InventoryContext, type InventoryLocation, type InventoryLot, type InventoryProduct, type InventoryProductDetail } from "@/domain/inventory";
import { inventoryRepository, inventoryErrorMessage } from "./inventory-repository";
import { INVENTORY_COUNT_LABELS, inventoryCountBadgeState, inventoryExpiryLabel, inventoryLocationsFor, inventoryLotDateLabel, inventoryUnitDisplayLabel } from "./inventory-model";
import { InventoryCountForm, InventoryLotEditor, InventoryMovementForm, InventoryProductEditor, InventoryStatusForm } from "./inventory-forms";
import { InventoryPhoto } from "./inventory-photo";
import { useInventoryConnection } from "./use-inventory-connection";
import styles from "./inventory.module.css";

const InventoryHistory = lazy(() => import("./inventory-history").then((module) => ({ default: module.InventoryHistory })));

function matchingDetail(product: InventoryProduct | undefined, detail?: InventoryProductDetail): InventoryProductDetail | null {
  return product && detail?.product.productId === product.productId && detail.product.revision === product.revision && detail.product.stockRevision === product.stockRevision ? detail : null;
}

export function InventoryDetail({ productId, initialProduct, initialDetail, initialLocation, openingSequence = 0, context, calendarReady = true, countMode = false, onClose, onSaved, onCountSaved }: { productId: string; initialProduct?: InventoryProduct; initialDetail?: InventoryProductDetail; initialLocation: InventoryLocation; openingSequence?: number; context: InventoryContext; calendarReady?: boolean; countMode?: boolean; onClose: () => void; onSaved: (product: InventoryProduct) => void; onCountSaved?: (product: InventoryProduct, location: InventoryLocation, detail: InventoryProductDetail) => void }) {
  const online = useInventoryConnection();
  const seed = matchingDetail(initialProduct, initialDetail);
  const [storedDetail, setDetail] = useState<InventoryProductDetail | null>(seed);
  const [error, setError] = useState("");
  const [storedLoading, setLoading] = useState(!seed);
  const [version, setVersion] = useState(0);
  const [selectedLocation, setLocation] = useState(initialLocation);
  const [action, setAction] = useState<"receive" | "issue" | "adjust" | "count" | "edit" | "status" | "delete" | "history" | "more" | null>(null);
  const [editingLot, setEditingLot] = useState<InventoryLot | null>(null);
  const [movementLotId, setMovementLotId] = useState<string | undefined>(undefined);
  const openingKey = productId + ":" + initialLocation + ":" + openingSequence;
  const [openedKey, setOpenedKey] = useState(openingKey);
  const [readSeed, setReadSeed] = useState(seed);
  const savedCallback = useRef(onSaved);
  const countCallback = useRef(onCountSaved);
  const pendingMutationRefresh = useRef<{ productId: string; countLocation?: InventoryLocation } | null>(null);
  const readGeneration = useRef(0);
  const readOpening = useRef(openingKey);
  const detail = openedKey === openingKey ? storedDetail : seed;
  const loading = openedKey === openingKey ? storedLoading : !seed;
  // Keep the same dialog/history slot while retiring the previous product's
  // private state before any action on the next product can be rendered.
  if (openedKey !== openingKey) {
    setReadSeed(seed);
    setOpenedKey(openingKey); setDetail(seed); setLoading(!seed); setError(""); setVersion(0);
    setLocation(initialLocation); setAction(null); setEditingLot(null); setMovementLotId(undefined);
  }
  useEffect(() => { savedCallback.current = onSaved; countCallback.current = onCountSaved; }, [onSaved, onCountSaved]);
  useEffect(() => {
    let cancelled = false;
    const generation = ++readGeneration.current;
    if (readOpening.current !== openingKey) { readOpening.current = openingKey; pendingMutationRefresh.current = null; }
    const pending = pendingMutationRefresh.current;
    const current = () => !cancelled && readGeneration.current === generation;
    if (version === 0 && readSeed?.product.productId === productId) return () => { cancelled = true; };
    void inventoryRepository.detail(productId).then((result) => {
      if (!current()) return;
      if (result.product.productId !== productId) throw new Error("Unexpected inventory product.");
      setDetail(result); setError("");
      // A retry receipt can predate a colleague's changes. Publish only this
      // fresh read to the parent list, and never publish an ordinary opening.
      if (pending?.productId === productId && pendingMutationRefresh.current === pending) {
        pendingMutationRefresh.current = null; savedCallback.current(result.product);
        if (pending.countLocation) countCallback.current?.(result.product, pending.countLocation, result);
      }
    }).catch((cause) => { if (current()) { setDetail(null); setError(inventoryErrorMessage(cause)); } }).finally(() => { if (current()) setLoading(false); });
    return () => { cancelled = true; };
  }, [openingKey, productId, version, readSeed]);
  function saved(product: InventoryProduct, confirmedDetail?: InventoryProductDetail, countLocation?: InventoryLocation) {
    if (product.productId !== productId) return;
    ++readGeneration.current;
    setAction(null); setEditingLot(null); setMovementLotId(undefined);
    if (product.status === "deleted") { pendingMutationRefresh.current = null; savedCallback.current(product); onClose(); return; }
    // Apply only a server-confirmed product/lot snapshot. Legacy or replayed
    // responses still recheck current lots before enabling another action.
    const confirmed = matchingDetail(product, confirmedDetail);
    if (confirmed) {
      pendingMutationRefresh.current = null;
      setDetail(confirmed); setError(""); setLoading(false); savedCallback.current(confirmed.product);
      if (countLocation) countCallback.current?.(confirmed.product, countLocation, confirmed);
      return;
    }
    pendingMutationRefresh.current = { productId, ...(countLocation ? { countLocation } : {}) };
    setLoading(true); setVersion((value) => value + 1);
  }
  // List data gives an immediate shell, never authority for a write or photo.
  // A failed/deleted read must not reveal the old snapshot again on retry.
  const product = detail?.product ?? (loading && !error && initialProduct?.productId === productId ? initialProduct : undefined);
  const locations = product ? inventoryLocationsFor(product) : [initialLocation];
  const location = locations.includes(selectedLocation) ? selectedLocation : locations[0]!;
  const lots = detail?.lots.filter((lot) => lot.locationId === location) ?? [];
  const writeAllowed = context.canWrite && product?.status === "active";
  const confirmed = detail?.product.productId === productId && !loading;
  const canWrite = online && writeAllowed && confirmed;
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
          <div className={styles.detailPhoto}>{detail?.product.photo ? <InventoryPhoto key={`${productId}:${detail.product.photo.photoId}`} product={detail.product} expandable /> : <span className={styles.detailPhotoEmpty}><Icon name="camera" size={28} /><span>제품 사진</span></span>}</div>
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
    {confirmed && detail && (action === "receive" || action === "issue" || action === "adjust") ? <InventoryMovementForm detail={detail} location={location} kind={action} {...(movementLotId ? { initialLotId: movementLotId } : {})} {...(countMode && calendarReady ? { inspectionCycleId: context.cycle.cycleId } : {})} onClose={() => { setAction(null); setMovementLotId(undefined); }} onSaved={saved} /> : null}
    {confirmed && detail && action === "count" ? <InventoryCountForm detail={detail} location={location} context={context} calendarReady={calendarReady} countMode={countMode} continueAfterSave={!!onCountSaved} onClose={() => setAction(null)} onSaved={(product, next) => saved(product, next, location)} /> : null}
    {confirmed && product && action === "edit" ? <InventoryProductEditor product={product} location={location} canCreateManufacturer={context.canWrite} canManageManufacturers={context.canAdmin} onClose={() => setAction(null)} onSaved={saved} /> : null}
    {confirmed && detail && editingLot ? <InventoryLotEditor detail={detail} lot={editingLot} onMovement={openMovement} onClose={() => setEditingLot(null)} onSaved={saved} /> : null}
    {product && action === "more" ? <BottomSheet open title="품목 더보기" onClose={() => setAction(null)}><div className={styles.detailMoreActions}>
      <GlassButton onClick={() => setAction("history")}><Icon name="clock" size={18} /><span>입출고·실사 이력</span><Icon name="chevron-right" size={16} /></GlassButton>
      {context.canWrite ? <><GlassButton className={styles.detailStatusAction} disabled={!online || loading} onClick={() => setAction("status")}><Icon name={product.status === "active" ? "close" : "refresh"} size={18} /><span>{product.status === "active" ? "비활성화" : "다시 활성화"}</span><Icon name="chevron-right" size={16} /></GlassButton><GlassButton className={styles.detailDeleteAction} variant="danger" disabled={!online || loading} onClick={() => setAction("delete")}><Icon name="trash" size={18} /><span>품목 삭제</span><Icon name="chevron-right" size={16} /></GlassButton></> : null}
    </div></BottomSheet> : null}
    {confirmed && product && (action === "status" || action === "delete") ? <InventoryStatusForm product={product} remove={action === "delete"} onClose={() => setAction(null)} onSaved={saved} /> : null}
    {action === "history" ? <BottomSheet open title="입출고·실사 기록" onClose={() => setAction(null)}><Suspense fallback={<p role="status">기록을 준비하고 있어요.</p>}><InventoryHistory productId={productId} /></Suspense></BottomSheet> : null}
  </>;
}
