"use client";

import { Icon } from "@/components/ui/icon";
import { LoadingStatus } from "@/components/ui/loading-status";
import type { Customer } from "@/domain/customer";

import { DeliveryPhotoActionIcon } from "./delivery-photo-action-icon";
import styles from "./delivery-photo-capture-entry.module.css";

export type DeliveryPhotoCaptureEntryState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; customer: Pick<Customer, "customerId" | "name">; disabled: boolean; preparing: boolean };

export default function DeliveryPhotoCaptureEntry({ state, onCamera, onAlbum, onReturn }: {
  state: DeliveryPhotoCaptureEntryState;
  onCamera: () => void;
  onAlbum: () => void;
  onReturn?: (() => void) | undefined;
}) {
  return <section className={styles.entry} aria-label="납품사진 기록 대상" data-delivery-photo-entry>
    <div className={styles.entryTitle}><DeliveryPhotoActionIcon variant="camera" /><div><h2>납품사진 기록하기</h2>
      {state.status === "ready" ? <strong>{state.customer.name}</strong> : null}</div></div>
    {state.status === "unavailable" ? <p role="alert">이 거래처에는 새 납품사진을 기록할 수 없어요. 거래처 정보를 다시 확인해주세요.</p>
      : state.status === "loading" ? <LoadingStatus label="선택한 거래처 불러오는 중" />
        : <><p className={styles.hint}>촬영하거나 앨범에서 선택해요</p><div className={styles.entrySources}>
          <button type="button" aria-label={`${state.customer.name} 사진 촬영`} disabled={state.disabled} onClick={onCamera}><Icon name="camera" size={20} />사진 촬영</button>
          <button type="button" aria-label={`${state.customer.name} 앨범에서 선택`} disabled={state.disabled} onClick={onAlbum}><Icon name="upload" size={20} />앨범에서 선택</button>
        </div>{state.preparing ? <p role="status" className={styles.hint}>사진 기록을 준비하고 있어요.</p> : null}</>}
    {onReturn ? <button type="button" className={styles.entryReturn} onClick={onReturn}><Icon name="arrow-left" size={17} />거래처 상세로 돌아가기</button> : null}
  </section>;
}
