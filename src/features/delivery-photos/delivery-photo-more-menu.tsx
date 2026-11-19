"use client";

import { useRef } from "react";

import { BottomSheet, useBottomSheetClose } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import type { Customer } from "@/domain/customer";
import styles from "./photo.module.css";

function MenuActions({ customer, albumDisabled, onAlbum, onDetail, onAdd }: {
  customer: Customer; albumDisabled: boolean; onAlbum: (customer: Customer) => void;
  onDetail?: (() => void) | undefined; onAdd?: (() => void) | undefined;
}) {
  const close = useBottomSheetClose();
  return <div className={styles.moreActions}>
    <button type="button" disabled={albumDisabled} onClick={() => { onAlbum(customer); close?.(); }}>
      <Icon name="images" size={20} />앨범에서 사진 추가
    </button>
    {onAdd && <button type="button" onClick={() => { onAdd(); close?.(); }}>
      <Icon name="plus" size={20} />오늘 목록에 추가
    </button>}
    {onDetail && <button type="button" onClick={() => { onDetail(); close?.(); }}>
      <Icon name="building" size={20} />거래처 상세정보
    </button>}
  </div>;
}

export function DeliveryPhotoMoreMenu({ customer, albumDisabled, onAlbum, onOpenCustomerDetail, onAdd, onClose }: {
  customer: Customer; albumDisabled: boolean; onAlbum: (customer: Customer) => void;
  onOpenCustomerDetail?: ((customerId: string) => void) | undefined;
  onAdd?: ((customerId: string) => void) | undefined; onClose: () => void;
}) {
  const selection = useRef<"detail" | "add" | null>(null);
  return <BottomSheet open title={`${customer.name} 더보기`} onClose={() => {
    onClose();
    if (selection.current === "detail") onOpenCustomerDetail?.(customer.customerId);
    if (selection.current === "add") onAdd?.(customer.customerId);
  }}>
    <MenuActions customer={customer} albumDisabled={albumDisabled} onAlbum={onAlbum}
      onDetail={onOpenCustomerDetail && (() => { selection.current = "detail"; })}
      onAdd={onAdd && (() => { selection.current = "add"; })} />
  </BottomSheet>;
}

export default DeliveryPhotoMoreMenu;
