"use client";
/* eslint-disable @next/next/no-img-element -- The outbox owns this private local Blob URL. */
import dynamic from "next/dynamic";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { LoadingStatus } from "@/components/ui/loading-status";
import styles from "./delivery-photo-local-preview.module.css";

const PhotoPanZoom = dynamic(() => import("@/components/ui/photo-pan-zoom").then((module) => module.PhotoPanZoom), { ssr: false,
  loading: () => <LoadingStatus label="사진 확대 준비 중" detail="확대·이동 기능을 준비하고 있습니다." /> });
const retainZoom = () => {};

export function DeliveryPhotoLocalPreview({ url, origin, onClose }: { url: string; origin: HTMLElement; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  return createPortal(<div onKeyDown={(event) => event.stopPropagation()}><BottomSheet open title="촬영 사진 확인" onClose={onClose}>
    <div ref={stageRef} className={styles.stage} role="region" aria-label="촬영 사진 크게 보기" tabIndex={0} data-photo-morph-state="open">
      <img src={url} alt="방금 촬영한 사진 크게 보기" draggable={false} decoding="async" />
    </div>
    <PhotoPanZoom stageRef={stageRef} origin={origin} onZoomedChange={retainZoom} />
    <button type="button" className={styles.close} onClick={onClose}>확인</button>
  </BottomSheet></div>, document.body);
}
