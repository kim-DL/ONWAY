"use client";
/* eslint-disable @next/next/no-img-element -- The viewer shares the authenticated preview's private blob URL. */
import { useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { usePhotoMorph } from "@/components/ui/photo-morph";
import morphStyles from "@/components/ui/photo-morph.module.css";
import styles from "./inventory.module.css";

const PhotoPanZoom = dynamic(() => import("@/components/ui/photo-pan-zoom").then((module) => module.PhotoPanZoom), { ssr: false,
  loading: () => <p role="status">사진 확대 조작을 준비하고 있어요.</p> });

export function InventoryPhotoViewer({ url, name, origin, onClose, onImageError }: {
  url: string; name: string; origin: HTMLElement | null; onClose: () => void; onImageError: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const { stageRef, requestClose, beforeClose } = usePhotoMorph({ origin, identity: url, onClose, canReturn: !zoomed });
  return createPortal(<div onKeyDown={(event) => event.stopPropagation()}><BottomSheet open title={`${name} 제품 사진`} onClose={requestClose} beforeClose={beforeClose}>
    <div ref={stageRef} className={`${styles.photoViewerStage} ${morphStyles.stage}`} data-photo-morph-stage data-photo-morph-state="open" data-zoomed={zoomed} role="region" aria-label="제품 사진 보기" tabIndex={0}>
      <img src={url} alt={`${name} 제품 사진 확대`} draggable={false} decoding="async" onError={onImageError} />
    </div>
    <PhotoPanZoom stageRef={stageRef} origin={origin} onZoomedChange={setZoomed} />
  </BottomSheet></div>, document.body);
}
