"use client";

import { useState } from "react";
import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import type { InventoryLocation, InventoryProduct, InventoryProductDetail } from "@/domain/inventory";
import type { ScanBarcodeLink } from "@/domain/inventory-scan";
import { InventoryMovementForm, InventoryProductEditor, useInventoryAction } from "../inventory-forms";
import type { ExistingReceipt } from "./editor-types";
import { registrationMetrics } from "./metrics";
import { ScanReview } from "./review";
import { scanRepository } from "./repository";
import styles from "./review.module.css";

type Props = { location: InventoryLocation; products: InventoryProduct[]; canAdmin: boolean;
  onClose: () => void; onCommit: (product: InventoryProduct) => void;
  onOpen: (product: InventoryProduct, detail?: InventoryProductDetail) => void };
export default function InventoryScanRegistration(props: Props) {
  const [key, setKey] = useState(0);
  return <Registration key={key} {...props} onNext={() => setKey(v => v + 1)} />;
}
function Registration({ location, products, canAdmin, onClose, onCommit, onOpen, onNext }: Props & { onNext: () => void }) {
  const [metrics] = useState(() => registrationMetrics("scan"));
  const [existing, setExisting] = useState<(ExistingReceipt & { links: ScanBarcodeLink[] }) | null>(null);
  const [movement, setMovement] = useState(false);
  const [complete, setComplete] = useState<{ product: InventoryProduct; detail?: InventoryProductDetail; received: boolean } | null>(null);
  const binding = useInventoryAction();
  function finish(product: InventoryProduct, detail?: InventoryProductDetail) {
    metrics.finish(movement ? "received" : "registered"); onCommit(product);
    setComplete({ product, ...(detail ? { detail } : {}), received: movement });
  }
  function startExisting(item: ExistingReceipt, links: ScanBarcodeLink[]) {
    setExisting({ ...item, links }); setMovement(!links.length);
  }
  function bindExisting() {
    if (!existing) return;
    const { detail: { product }, links } = existing;
    void binding.run({ productId: product.productId, revision: product.revision, links },
      (id, assertCurrent) => { assertCurrent(); return scanRepository.bind(product.productId, product.revision, links, id); },
      () => { setExisting({ ...existing, links: [] }); setMovement(true); });
  }
  if (complete) return <BottomSheet open title={complete.received ? "입고 기록 완료" : "품목 등록 완료"} onClose={onClose}>
    <div className={styles.completion}><Icon name="check" size={28} /><div><strong>{complete.product.name}</strong>
      <p>{complete.received ? "입고 수량을 재고에 반영했어요." : "새 품목과 첫 입고를 저장했어요."}</p></div></div>
    <BottomSheetActions><GlassButton onClick={() => onOpen(complete.product, complete.detail)}>품목 보기</GlassButton>
      <GlassButton variant="primary" onClick={onNext}>다음 품목 스캔</GlassButton></BottomSheetActions></BottomSheet>;
  return <><InventoryProductEditor product={null} location={location} canCreateManufacturer canManageManufacturers={canAdmin}
    onClose={() => { metrics.finish("closed"); onClose(); }} onSaved={finish}
    scanPanel={editor => <ScanReview editor={editor} products={products} metrics={metrics} onExisting={startExisting} />} />
    {existing && (movement ? <InventoryMovementForm detail={existing.detail} location={existing.location} kind="receive"
      initialLotDraft={existing.lot} onClose={() => { setExisting(null); setMovement(false); }} onSaved={finish} /> :
      <BottomSheet open title="기존 품목에 바코드 연결" onClose={() => setExisting(null)} dismissible={!binding.busy}>
        <div className={styles.group}><strong>{existing.detail.product.name}</strong>
          {existing.links.map(link => <span key={link.code}>{link.level === "case" ? "박스" : "기준 단위 포장"} · {link.code}</span>)}
          <p>연결을 저장하면 다음 스캔부터 이 품목을 바로 찾을 수 있어요.</p>
          {binding.error && <p role="alert">{binding.error}</p>}</div>
        <BottomSheetActions busy={binding.busy}><GlassButton disabled={binding.busy} onClick={() => setMovement(true)}>이번 입고만</GlassButton>
          <GlassButton variant="primary" disabled={binding.busy} onClick={bindExisting}>연결 저장 후 입고</GlassButton></BottomSheetActions></BottomSheet>)}
  </>;
}
