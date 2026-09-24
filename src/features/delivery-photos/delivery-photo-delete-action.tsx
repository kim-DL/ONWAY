"use client";

import { useEffect, useRef, useState } from "react";

import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import { removeDeliveryPhotoFromToday, type DeliveryPhotoDeleteUpdate } from "./delivery-photo-delete-model";
import { canDeleteDeliveryPhoto } from "./delivery-photo-delete-policy";
import { deliveryPhotoDeleteErrorKind, deliveryPhotoDeleteRepository } from "./delivery-photo-delete-repository";
import { deliveryPhotoRegisteredAt } from "./delivery-photo-history-model";
import styles from "./delivery-photo-history.module.css";

export function DeliveryPhotoDeleteAction({ photo, session, onDeleted }: {
  photo: DeliveryPhotoMetadata;
  session: AuthenticatedSession;
  onDeleted: (photoId: string, update: DeliveryPhotoDeleteUpdate) => void;
}) {
  const requestId = useRef<string | null>(null);
  const pending = useRef(false);
  const active = useRef(true);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const remove = async () => {
    if (pending.current) return;
    pending.current = true;
    setState({ busy: true, error: "" });
    try {
      requestId.current ??= crypto.randomUUID();
      await deliveryPhotoDeleteRepository.remove(photo.photoId, requestId.current, session);
      if (active.current) onDeleted(photo.photoId, removeDeliveryPhotoFromToday(photo));
    } catch (error) {
      if (!active.current) return;
      const kind = deliveryPhotoDeleteErrorKind(error);
      if (kind === "unavailable") onDeleted(photo.photoId, removeDeliveryPhotoFromToday(photo));
      else setState({ busy: false, error: kind === "permission" ? "이 사진을 삭제할 권한이 없습니다."
        : kind === "auth" ? "로그인 정보를 다시 확인해주세요."
          : "삭제하지 못했습니다. 다시 시도해 주세요." });
    } finally {
      pending.current = false;
    }
  };

  if (!canDeleteDeliveryPhoto(photo, session)) return null;
  return <><button type="button" className={styles.danger} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>사진 삭제</button>
    {open ? <BottomSheet open title="이 납품사진을 삭제할까요?" description="삭제한 사진은 다시 볼 수 없습니다."
    onClose={() => setOpen(false)} dismissible={!state.busy}>
    <div className={styles.metadata}><strong>{deliveryPhotoRegisteredAt(photo.createdAt, true)}</strong><span>등록자 {photo.createdByName}</span></div>
    {state.error ? <div className={styles.error} role="alert"><p>{state.error}</p></div> : null}
    <BottomSheetActions className={styles.confirmActions ?? ""} busy={state.busy}>
      <GlassButton disabled={state.busy} onClick={() => setOpen(false)}>취소</GlassButton>
      <GlassButton variant="danger" disabled={state.busy} onClick={() => void remove()}>{state.busy ? "삭제 중…" : "사진 삭제"}</GlassButton>
    </BottomSheetActions>
  </BottomSheet> : null}</>;
}
