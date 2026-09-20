"use client";

/* eslint-disable @next/next/no-img-element -- Reuse authenticated in-memory bytes, never a public image proxy. */

import { useState } from "react";
import { createPortal } from "react-dom";

import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { usePhotoMorph } from "@/components/ui/photo-morph";
import morphStyles from "@/components/ui/photo-morph.module.css";
import styles from "./customer-overview-photo.module.css";

export function CustomerPhotoViewer({ url, name, origin, onClose, onImageError }: {
  url: string; name: string; origin?: HTMLElement | null; onClose: () => void; onImageError: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const { stageRef: stage, requestClose, beforeClose } = usePhotoMorph({ origin: origin ?? null, identity: url, onClose, canReturn: !zoomed });
  const toggleZoom = () => {
    setZoomed((current) => !current);
    stage.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  };
  // Keep the top-layer dialog outside the parent sheet's keyboard focus trap.
  return createPortal(<div onKeyDown={(event) => event.stopPropagation()}><BottomSheet open title={`${name} 전경사진`} onClose={requestClose} beforeClose={beforeClose}>
    <div ref={stage} className={`${styles.viewerStage} ${morphStyles.stage}`} data-photo-morph-stage data-photo-morph-state="open" data-zoomed={zoomed} tabIndex={zoomed ? 0 : -1} aria-label="전경사진 보기" role="region">
      <img src={url} alt={`${name} 전경 사진 확대`} draggable={false} decoding="async" onError={onImageError} />
    </div>
    <p className={styles.viewerHint}>{zoomed ? "사진을 밀어 좌우와 위아래를 살펴보세요." : "건물과 출입구를 확대해서 확인할 수 있어요."}</p>
    <BottomSheetActions className={styles.viewerActions ?? ""}>
      <button type="button" aria-pressed={zoomed} onClick={toggleZoom}><Icon name={zoomed ? "refresh" : "zoom-in"} size={19} />{zoomed ? "전체 보기" : "2배 확대"}</button>
      <button type="button" onClick={requestClose}><Icon name="check" size={19} />확인</button>
    </BottomSheetActions>
  </BottomSheet></div>, document.body);
}
