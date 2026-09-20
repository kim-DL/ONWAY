"use client";
/* eslint-disable @next/next/no-img-element -- The viewer shares the authenticated preview's private blob URL. */
import { useState } from "react";
import { createPortal } from "react-dom";
import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { usePhotoMorph } from "@/components/ui/photo-morph";
import morphStyles from "@/components/ui/photo-morph.module.css";
import styles from "./inventory.module.css";

export function InventoryPhotoViewer({ url, name, origin, onClose, onImageError }: {
  url: string; name: string; origin: HTMLElement | null; onClose: () => void; onImageError: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const { stageRef, requestClose, beforeClose } = usePhotoMorph({ origin, identity: url, onClose, canReturn: !zoomed });
  return createPortal(<div onKeyDown={(event) => event.stopPropagation()}><BottomSheet open title={`${name} 제품 사진`} onClose={requestClose} beforeClose={beforeClose}>
    <div ref={stageRef} className={`${styles.photoViewerStage} ${morphStyles.stage}`} data-photo-morph-stage data-photo-morph-state="open" data-zoomed={zoomed} role="region" aria-label="제품 사진 보기" tabIndex={zoomed ? 0 : -1}>
      <img src={url} alt={`${name} 제품 사진 확대`} draggable={false} decoding="async" onError={onImageError} />
    </div>
    <BottomSheetActions className={styles.photoViewerActions ?? ""}><GlassButton aria-pressed={zoomed} onClick={() => { setZoomed((value) => !value); stageRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" }); }}><Icon name={zoomed ? "refresh" : "zoom-in"} size={18} />{zoomed ? "전체 보기" : "2배 확대"}</GlassButton><GlassButton onClick={requestClose}><Icon name="check" size={18} />확인</GlassButton></BottomSheetActions>
  </BottomSheet></div>, document.body);
}
