import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { frameFromFile, frameToFile } from "./camera-frame";
import { Thumbnail, type ScanPhoto } from "./photo-strip";
import styles from "./region.module.css";

type Box = { left: number; top: number; width: number; height: number };
type Point = { x: number; y: number };
const initial: Box = { left: .15, top: .32, width: .7, height: .36 };
const bound = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
function center(box: Box, x: number, y: number): Box {
  return { ...box, left: bound(x - box.width / 2, 0, 1 - box.width), top: bound(y - box.height / 2, 0, 1 - box.height) };
}
function point(event: PointerEvent<HTMLButtonElement>): Point {
  const box = event.currentTarget.getBoundingClientRect();
  return { x: bound((event.clientX - box.left) / box.width), y: bound((event.clientY - box.top) / box.height) };
}
function selection(a: Point, b: Point, previous: Box): Box {
  const width = Math.abs(a.x - b.x), height = Math.abs(a.y - b.y);
  if (width < .04 && height < .04) return center(previous, b.x, b.y);
  return center({ ...previous, width: Math.max(.05, width), height: Math.max(.05, height) }, (a.x + b.x) / 2, (a.y + b.y) / 2);
}

export default function ScanRegion({ photos, onClose, onRead }: {
  photos: ScanPhoto[]; onClose: () => void; onRead: (photo: ScanPhoto, file: File) => void;
}) {
  const [id, setId] = useState(photos.at(-1)!.id);
  const photo = photos.find(item => item.id === id)!;
  const [box, setBox] = useState(initial);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const task = useRef<AbortController | null>(null);
  const drag = useRef<{ id: number; start: Point; previous: Box } | null>(null);
  useEffect(() => () => task.current?.abort(), []);
  function close() { task.current?.abort(); onClose(); }
  function size(factor: number) {
    setBox(old => center({ ...old, width: bound(old.width * factor, .05), height: bound(old.height * factor, .05) }, old.left + old.width / 2, old.top + old.height / 2));
  }
  function key(event: KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-.04, 0], ArrowRight: [.04, 0], ArrowUp: [0, -.04], ArrowDown: [0, .04] };
    const step = moves[event.key];
    if (step) { event.preventDefault(); setBox(old => center(old, old.left + old.width / 2 + step[0], old.top + old.height / 2 + step[1])); }
  }
  async function read() {
    if (task.current) return;
    const controller = new AbortController(); task.current = controller;
    setPreparing(true); setError("");
    try {
      const source = await frameFromFile(photo.file, controller.signal);
      const canvas = document.createElement("canvas");
      const x = Math.min(source.width - 1, Math.floor(box.left * source.width)), y = Math.min(source.height - 1, Math.floor(box.top * source.height));
      canvas.width = Math.max(1, Math.min(source.width - x, Math.round(box.width * source.width)));
      canvas.height = Math.max(1, Math.min(source.height - y, Math.round(box.height * source.height)));
      const context = canvas.getContext("2d");
      if (!context) throw new Error();
      context.drawImage(source, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      const file = await frameToFile(canvas);
      if (!controller.signal.aborted) onRead(photo, file);
    } catch { if (!controller.signal.aborted) setError("사진을 열지 못했어요. 다시 선택해 주세요."); }
    finally { if (!controller.signal.aborted) { task.current = null; setPreparing(false); } }
  }
  return <BottomSheet open title="날짜·원산지 영역 선택" onClose={close}>
    <div className={styles.body}>
      {photos.length > 1 && <label>촬영 사진 <select value={id} disabled={preparing} onChange={event => { setId(event.target.value); setBox(initial); }}>
        {photos.map(item => <option key={item.id} value={item.id}>{item.ordinal}번 사진</option>)}</select></label>}
      <p>한 제품의 ‘소비기한’이나 ‘원산지’ 표시와 값이 함께 들어오도록 사진을 누르거나 드래그해 주세요.</p>
      <button type="button" className={styles.image} aria-label="판독 영역 위치, 방향키로 이동" disabled={preparing} onKeyDown={key}
        onPointerDown={event => { if (!event.isPrimary || event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, start: point(event), previous: box }; }}
        onPointerMove={event => { const move = drag.current; if (move?.id === event.pointerId) setBox(selection(move.start, point(event), move.previous)); }}
        onPointerUp={event => { const move = drag.current; if (move?.id === event.pointerId) { setBox(selection(move.start, point(event), move.previous)); drag.current = null; } }}
        onLostPointerCapture={() => { if (drag.current) { setBox(drag.current.previous); drag.current = null; } }}>
        <Thumbnail file={photo.file} label="표시를 선택할 원본 사진" />
        <span aria-hidden="true" style={{ left: box.left * 100 + "%", top: box.top * 100 + "%", width: box.width * 100 + "%", height: box.height * 100 + "%" }} />
      </button>
      <div className={styles.sizes}><GlassButton compact disabled={preparing} onClick={() => size(.75)}>범위 좁히기</GlassButton>
        <GlassButton compact disabled={preparing} onClick={() => size(1.35)}>범위 넓히기</GlassButton></div>
      {error && <p role="alert">{error}</p>}
    </div>
    <BottomSheetActions><GlassButton onClick={close}>취소</GlassButton>
      <GlassButton variant="primary" disabled={preparing} onClick={() => void read()}>{preparing ? "사진 준비 중" : "이 영역 읽기"}</GlassButton></BottomSheetActions>
  </BottomSheet>;
}
