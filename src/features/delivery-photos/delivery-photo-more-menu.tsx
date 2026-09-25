"use client";

import { useRef } from "react";

import { BottomSheet, useBottomSheetClose } from "@/components/ui/bottom-sheet";
import type { Customer } from "@/domain/customer";

function MenuActions({ customer, albumDisabled, onAlbum, onDetail, className }: {
  customer: Customer; albumDisabled: boolean; onAlbum: (customer: Customer) => void;
  onDetail: () => void; className: string;
}) {
  const close = useBottomSheetClose();
  return <div className={className}>
    <button type="button" disabled={albumDisabled} onClick={() => { onAlbum(customer); close?.(); }}>앨범에서 사진 추가</button>
    <button type="button" onClick={() => { onDetail(); close?.(); }}>거래처 상세정보</button>
  </div>;
}

export function DeliveryPhotoMoreMenu({ customer, albumDisabled, onAlbum, onOpenCustomerDetail, onClose, className }: {
  customer: Customer; albumDisabled: boolean; onAlbum: (customer: Customer) => void;
  onOpenCustomerDetail?: ((customerId: string) => void) | undefined; onClose: () => void; className: string;
}) {
  const openDetail = useRef(false);
  return <BottomSheet open title={`${customer.name} 더보기`} onClose={() => {
    onClose();
    if (openDetail.current) onOpenCustomerDetail?.(customer.customerId);
  }}>
    <MenuActions customer={customer} albumDisabled={albumDisabled} onAlbum={onAlbum}
      onDetail={() => { openDetail.current = true; }} className={className} />
  </BottomSheet>;
}

export default DeliveryPhotoMoreMenu;
