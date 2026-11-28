/* eslint-disable @next/next/no-img-element -- Session-owned local camera frames. */
import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { LabelReading } from "@/domain/inventory-scan";
import { registerPrivateBlobUrl, forgetPrivateBlobUrl } from "@/features/auth/private-client-state";
import styles from "./review.module.css";
export type ScanPhoto = { id: string; ordinal: number; file: File; visual?: LabelReading["visual"] };
export function Thumbnail({ file, label }: { file: File; label: string }) {
  const element = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file); registerPrivateBlobUrl(next);
    if (element.current) element.current.src = next;
    return () => forgetPrivateBlobUrl(next);
  }, [file]);
  return <img ref={element} alt={label} />;
}
export function ScanPhotos({ photos, cover, disabled, onCover, onRemove }: { photos: ScanPhoto[]; cover: string | null;
  disabled: boolean; onCover: (shot: ScanPhoto) => void; onRemove: (shot: ScanPhoto) => void }) {
  const [view, setView] = useState<ScanPhoto | null>(null);
  if (!photos.length) return null;
  return <details className={styles.photos}><summary>촬영 사진 {photos.length}장 · {cover ? "대표 사진 선택됨" : "대표 사진 선택"}</summary>
    <div>{photos.map(shot => <div key={shot.id} className={styles.shot}>
      <button type="button" onClick={() => setView(shot)} aria-label={shot.ordinal + "번 사진 확대"}><Thumbnail file={shot.file} label={"촬영 " + shot.ordinal} /></button>
      <button type="button" aria-pressed={cover === shot.id} disabled={disabled} onClick={() => onCover(shot)}>
        {cover === shot.id ? "대표 사진 해제" : shot.ordinal + "번 대표로 선택"}</button></div>)}</div>
    <small>선택한 한 장만 품목 사진으로 저장해요.</small>
    {view && <BottomSheet open title={"촬영 사진 " + view.ordinal} onClose={() => setView(null)}>
      <div className={styles.enlarged}><Thumbnail file={view.file} label="포장 글자 확인" />
        <button type="button" disabled={disabled} onClick={() => { onRemove(view); setView(null); }}>이 사진 제외</button></div></BottomSheet>}
    </details>;
}
