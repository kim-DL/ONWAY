"use client";

import { Icon } from "@/components/ui/icon";
import type { ReactNode, RefObject } from "react";
import { LoadingStatus } from "@/components/ui/loading-status";
import type { Customer } from "@/domain/customer";

import { deliveryPhotoCaptureHints, type DeliveryPhotoCaptureBlock } from "./delivery-photo-capture-hint";
import { DeliveryPhotoActionIcon } from "./delivery-photo-action-icon";
import styles from "./delivery-photo-capture-entry.module.css";

export type DeliveryPhotoCaptureEntryState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; customer: Pick<Customer, "customerId" | "name">; blocked: DeliveryPhotoCaptureBlock | null };

export function ContinuousCapture({ customerId, completed, origin, onFinish, children }: {
  customerId: string; completed: boolean; origin: RefObject<Element | null>; onFinish: () => void; children: ReactNode;
}) {
  const finish = () => {
    onFinish();
    requestAnimationFrame(() => {
      const selector = `[data-camera-customer="${CSS.escape(customerId)}"]`;
      const candidates = [origin.current?.querySelector<HTMLElement>(selector), ...document.querySelectorAll<HTMLElement>(selector)];
      const camera = candidates.find((el) => el?.matches(":enabled") && el.getClientRects().length && !el.closest("details:not([open])"));
      const heading = document.querySelector<HTMLElement>(completed
        ? "[data-photo-list=completed] summary" : "#delivery-photo-remaining-heading");
      (camera ?? heading)?.focus();
    });
  };
  return <section className={styles.continuous} aria-label="추가 촬영 납품처"><header><h2>촬영 중인 납품처</h2>
    <button type="button" onClick={finish}>연속 촬영 마치기</button></header>{children}</section>;
}

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
        : state.status === "ready" ? <><p className={styles.hint} id="delivery-photo-source-hint">{state.blocked ? deliveryPhotoCaptureHints[state.blocked] : "촬영하거나 앨범에서 선택해요"}</p><div className={styles.entrySources}>
          <button type="button" aria-label={`${state.customer.name} 사진 촬영`} disabled={Boolean(state.blocked)} aria-describedby={state.blocked ? "delivery-photo-source-hint" : undefined} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onCamera(); }}><Icon name="camera" size={20} />사진 촬영</button>
          <button type="button" aria-label={`${state.customer.name} 앨범에서 선택`} disabled={Boolean(state.blocked)} aria-describedby={state.blocked ? "delivery-photo-source-hint" : undefined} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onAlbum(); }}><Icon name="upload" size={20} />앨범에서 선택</button>
        </div></> : null}
    {onReturn ? <button type="button" className={styles.entryReturn} onClick={onReturn}><Icon name="arrow-left" size={17} />거래처 상세로 돌아가기</button> : null}
  </section>;
}
