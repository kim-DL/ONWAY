"use client";

/* eslint-disable @next/next/no-img-element -- Private Callable blobs require revocable object URLs and bypass Next's public image optimizer. */

import {
  useEffect,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FirebaseError } from "firebase/app";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import {
  PHOTO_SLOT_IDS,
  type PhotoSlotId,
  type SchoolPhoto,
} from "@/domain/school";
import { APP_METADATA } from "@/lib/app-metadata";
import {
  PHOTO_UPLOAD_MAX_BYTES,
  PHOTO_UPLOAD_TYPES,
  schoolPhotoRepository,
  type PhotoUploadStage,
} from "./school-photo-repository";
import {
  formatPhotoBytes,
  optimizeSchoolPhoto,
  type OptimizedSchoolPhoto,
} from "./photo-upload-optimizer";
import { useSchoolPhoto } from "./use-school-photo";

const SLOT_LABELS: Record<PhotoSlotId, string> = {
  "01": "학교 · 접근",
  "02": "급식실 출입구",
  "03": "검수 · 하역 위치",
};

function errorMessage(error: unknown) {
  if (error instanceof FirebaseError && error.code === "functions/aborted") {
    return "다른 직원이 먼저 사진을 변경했습니다. 최신 정보를 불러왔습니다.";
  }
  if (error instanceof FirebaseError && error.code === "functions/invalid-argument") {
    return error.message.replace(/^.*?:\s*/, "") || "사진 형식과 크기를 확인해주세요.";
  }
  if (error instanceof Error && error.message) return error.message;
  return navigator.onLine ? "사진 작업을 완료하지 못했습니다." : "인터넷 연결 후 다시 시도해주세요.";
}

function PhotoImage({
  photo,
  sessionNamespace,
  variant,
  enabled,
  onReady,
  onOpen,
}: {
  photo: SchoolPhoto;
  sessionNamespace: string;
  variant: "thumbnail" | "preview";
  enabled: boolean;
  onReady: (() => void) | undefined;
  onOpen: () => void;
}) {
  const state = useSchoolPhoto(photo, sessionNamespace, variant, enabled);
  useEffect(() => {
    if (state.status === "ready") onReady?.();
  }, [onReady, state.status]);
  return (
    <button className="photo-card__image" type="button" onClick={onOpen} aria-label={`${photo.caption ?? SLOT_LABELS[photo.slotId]} 크게 보기`}>
      {state.status === "ready" ? (
        <img
          src={state.url}
          alt={photo.caption ?? SLOT_LABELS[photo.slotId]}
          width={variant === "thumbnail" ? 400 : 800}
          height={variant === "thumbnail" ? 300 : 1_200}
          loading={variant === "preview" ? "eager" : "lazy"}
          fetchPriority={variant === "preview" ? "high" : "auto"}
          decoding="async"
        />
      ) : null}
      {state.status === "idle" || state.status === "loading" ? <span className="photo-card__loading"><i />사진 불러오는 중</span> : null}
      {state.status === "error" ? <span className="photo-card__loading"><Icon name="camera" />사진을 불러오지 못했어요</span> : null}
      <span className="photo-card__zoom"><Icon name="zoom-in" size={17} />크게 보기</span>
    </button>
  );
}

function PhotoUploader({
  schoolId,
  slotId,
  photo,
  onDone,
}: {
  schoolId: string;
  slotId: PhotoSlotId;
  photo: SchoolPhoto | null;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [photoInfo, setPhotoInfo] = useState<OptimizedSchoolPhoto | null>(null);
  const [caption, setCaption] = useState(photo?.caption ?? SLOT_LABELS[slotId]);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [uploadStage, setUploadStage] = useState<PhotoUploadStage | null>(null);
  const selectionId = useRef(0);
  const galleryInputId = useId();
  const cameraInputId = useId();
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => { selectionId.current += 1; }, []);

  const selectFile = async (candidate: File | null) => {
    if (!candidate) return;
    const requestId = selectionId.current + 1;
    selectionId.current = requestId;
    setOptimizing(true);
    setPhotoInfo(null);
    try {
      const optimized = await optimizeSchoolPhoto(candidate);
      if (selectionId.current !== requestId) return;
      if (!PHOTO_UPLOAD_TYPES.includes(optimized.file.type as typeof PHOTO_UPLOAD_TYPES[number])) {
        throw new Error("JPEG, PNG 또는 WebP 사진으로 변환하지 못했습니다.");
      }
      if (optimized.file.size <= 0 || optimized.file.size > PHOTO_UPLOAD_MAX_BYTES) {
        throw new Error("최적화한 사진도 10MB를 넘습니다. 다른 사진을 선택해주세요.");
      }
      setFile(optimized.file);
      setPhotoInfo(optimized);
    } catch (error) {
      if (selectionId.current !== requestId) return;
      setFile(null);
      showToast(error instanceof Error ? error.message : "사진을 준비하지 못했습니다.");
    } finally {
      if (selectionId.current === requestId) setOptimizing(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return showToast("촬영하거나 선택한 사진이 필요합니다.");
    setSaving(true);
    setUploadStage("preparing");
    try {
      await schoolPhotoRepository.upload({
        schoolId,
        slotId,
        expectedRevision: photo?.photoRevision ?? 0,
        requestId: crypto.randomUUID(),
        appVersion: APP_METADATA.buildVersion,
        caption: caption.trim() || null,
        file,
        onStage: setUploadStage,
      });
      showToast(photo ? "새 버전의 사진으로 교체했습니다." : "현장 사진을 등록했습니다.", "success");
      onDone();
    } catch (error) {
      showToast(errorMessage(error));
      if (error instanceof FirebaseError && error.code === "functions/aborted") onDone();
    } finally {
      setSaving(false);
      setUploadStage(null);
    }
  };

  const savingLabel = uploadStage === "preparing"
    ? "업로드 준비 중…"
    : uploadStage === "encoding"
      ? "사진 전송 중…"
      : uploadStage === "processing"
        ? "서버에서 마무리 중…"
        : "저장 중…";

  return (
    <form className="photo-uploader" onSubmit={submit}>
      <div
        className="photo-dropzone"
        data-has-file={Boolean(file)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); void selectFile(event.dataTransfer.files.item(0)); }}
      >
        {previewUrl ? <img src={previewUrl} alt="업로드할 사진 미리보기" width={800} height={1_200} decoding="async" /> : <span><Icon name="camera" size={30} /><strong>{optimizing ? "사진을 빠르게 최적화하는 중" : "등록할 현장 사진"}</strong><small>{optimizing ? "해상도와 전송 용량을 안전하게 줄이고 있어요." : "앨범 또는 카메라를 선택해주세요. PC에서는 끌어놓기도 가능합니다."}</small></span>}
        {optimizing ? <span className="photo-dropzone__progress"><i />모바일 전송 크기로 줄이는 중…</span> : null}
      </div>
      <div className="photo-source-actions" aria-label="사진 가져오기 방법">
        <label htmlFor={galleryInputId}><Icon name="upload" /><span><strong>앨범에서 선택</strong><small>휴대폰 갤러리 · 파일</small></span></label>
        <input id={galleryInputId} className="sr-only" type="file" accept="image/*" aria-label="앨범에서 사진 선택" onChange={(event) => { const selected = event.target.files?.item(0) ?? null; event.currentTarget.value = ""; void selectFile(selected); }} />
        <label htmlFor={cameraInputId}><Icon name="camera" /><span><strong>카메라로 촬영</strong><small>후면 카메라 바로 열기</small></span></label>
        <input id={cameraInputId} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="카메라로 사진 촬영" onChange={(event) => { const selected = event.target.files?.item(0) ?? null; event.currentTarget.value = ""; void selectFile(selected); }} />
      </div>
      {photoInfo ? <p className="photo-optimization-result"><Icon name="check" />{photoInfo.optimized ? `${formatPhotoBytes(photoInfo.originalBytes)} → ${formatPhotoBytes(photoInfo.file.size)}로 최적화` : `${formatPhotoBytes(photoInfo.file.size)} · 추가 압축 없이 사용`}<span>{photoInfo.width} × {photoInfo.height}</span></p> : null}
      <label className="photo-caption-field"><span>사진 설명</span><input value={caption} maxLength={2_000} onChange={(event) => setCaption(event.target.value)} placeholder={SLOT_LABELS[slotId]} /></label>
      <div className="photo-privacy-note"><Icon name="sparkles" /><p><strong>개인정보를 한 번 더 확인해주세요.</strong><small>학생 얼굴, 차량번호, 연락처, 문서가 보이는 사진은 등록하지 않습니다.</small></p></div>
      <GlassButton variant="primary" type="submit" disabled={saving || optimizing || !file}>{saving ? savingLabel : photo ? "새 사진으로 교체" : "현장 사진 등록"}</GlassButton>
    </form>
  );
}

function PhotoViewer({
  photos,
  initialIndex,
  sessionNamespace,
  onClose,
}: {
  photos: SchoolPhoto[];
  initialIndex: number;
  sessionNamespace: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const photo = photos[index] ?? photos[0] ?? null;
  const preview = useSchoolPhoto(photo, sessionNamespace, "preview");
  const original = useSchoolPhoto(photo, sessionNamespace, "original", scale > 1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gestureStart = useRef<{ x: number; y: number; distance: number | null } | null>(null);
  const imageUrl = original.status === "ready" ? original.url : preview.status === "ready" ? preview.url : null;

  const navigate = useCallback((direction: -1 | 1) => {
    setScale(1);
    setIndex((value) => (value + direction + photos.length) % photos.length);
  }, [photos.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && photos.length > 1) { setScale(1); setIndex((value) => (value - 1 + photos.length) % photos.length); }
      if (event.key === "ArrowRight" && photos.length > 1) { setScale(1); setIndex((value) => (value + 1) % photos.length); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, onClose, photos.length]);

  if (!photo) return null;

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gestureStart.current ??= { x: event.clientX, y: event.clientY, distance: null };
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      if (first && second && gestureStart.current) gestureStart.current.distance = Math.hypot(first.x - second.x, first.y - second.y);
    }
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && gestureStart.current?.distance) {
      const [first, second] = [...pointers.current.values()];
      if (first && second) setScale(Math.max(1, Math.min(4, Math.hypot(first.x - second.x, first.y - second.y) / gestureStart.current.distance)));
    }
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button")) return;
    const start = gestureStart.current;
    pointers.current.delete(event.pointerId);
    if (start && scale === 1) {
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) && photos.length > 1) {
        navigate(deltaX < 0 ? 1 : -1);
      } else if (deltaY > 90 && Math.abs(deltaY) > Math.abs(deltaX)) onClose();
    }
    if (pointers.current.size === 0) gestureStart.current = null;
  };

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label="현장 사진 크게 보기">
      <header><button type="button" onClick={onClose} aria-label="사진 닫기"><Icon name="close" /></button><span>{index + 1} / {photos.length}</span></header>
      <div className="photo-viewer__stage" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onDoubleClick={() => setScale((value) => value > 1 ? 1 : 2.5)}>
        {imageUrl ? <img src={imageUrl} alt={photo.caption ?? SLOT_LABELS[photo.slotId]} width={800} height={1_200} decoding="async" style={{ transform: `scale(${scale})` }} draggable={false} /> : <span className="photo-viewer__loading"><i />사진을 불러오는 중</span>}
        {photos.length > 1 && scale === 1 ? <><button className="photo-viewer__previous" type="button" onClick={() => navigate(-1)} aria-label="이전 사진"><Icon name="arrow-left" /></button><button className="photo-viewer__next" type="button" onClick={() => navigate(1)} aria-label="다음 사진"><Icon name="chevron-right" /></button></> : null}
      </div>
      <footer><div><span>{SLOT_LABELS[photo.slotId]}</span><strong>{photo.caption ?? "설명 없는 현장 사진"}</strong><small>두 번 탭하거나 손가락으로 확대 · 아래로 밀어 닫기</small></div><button type="button" onClick={() => setScale((value) => value > 1 ? 1 : 2.5)}><Icon name="zoom-in" />{scale > 1 ? "크기 복귀" : "원본 확대"}</button></footer>
    </div>
  );
}

export function SchoolPhotoGallery({
  schoolId,
  photos,
  sessionNamespace,
  canEdit,
  onRefresh,
}: {
  schoolId: string;
  photos: SchoolPhoto[];
  sessionNamespace: string;
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const { showToast } = useToast();
  const [editorSlot, setEditorSlot] = useState<PhotoSlotId | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [workingSlot, setWorkingSlot] = useState<PhotoSlotId | null>(null);
  const [revealedPriorityPhotoKey, setRevealedPriorityPhotoKey] = useState<string | null>(null);
  const activePhotos = useMemo(() => photos.filter((photo) => photo.status === "active").sort((left, right) => left.slotId.localeCompare(right.slotId)), [photos]);
  const photoBySlot = useMemo(() => new Map(activePhotos.map((photo) => [photo.slotId, photo])), [activePhotos]);
  const priorityPhoto = activePhotos[0] ?? null;
  const priorityPhotoKey = priorityPhoto
    ? `${priorityPhoto.slotId}:${priorityPhoto.currentVersionId}`
    : null;
  const secondaryPhotosEnabled = priorityPhotoKey === null || priorityPhotoKey === revealedPriorityPhotoKey;
  const enableSecondaryPhotos = useCallback(() => {
    setRevealedPriorityPhotoKey(priorityPhotoKey);
  }, [priorityPhotoKey]);

  const deletePhoto = async (photo: SchoolPhoto) => {
    setWorkingSlot(photo.slotId);
    try {
      const deleted = await schoolPhotoRepository.delete({
        schoolId,
        slotId: photo.slotId,
        expectedRevision: photo.photoRevision,
        requestId: crypto.randomUUID(),
        appVersion: APP_METADATA.buildVersion,
        reason: "현장 사진 사용자 삭제",
      });
      onRefresh();
      showToast("사진을 삭제했습니다.", "default", {
        label: "실행 취소",
        onSelect: async () => {
          try {
            await schoolPhotoRepository.restore({
              schoolId,
              slotId: photo.slotId,
              expectedRevision: deleted.revision,
              requestId: crypto.randomUUID(),
              appVersion: APP_METADATA.buildVersion,
            });
            onRefresh();
            showToast("사진을 다시 복구했습니다.", "success");
          } catch (error) {
            showToast(errorMessage(error));
            onRefresh();
          }
        },
      });
    } catch (error) {
      showToast(errorMessage(error));
      onRefresh();
    } finally {
      setWorkingSlot(null);
    }
  };

  return (
    <section id="school-photo-summary" className="school-photo-gallery" aria-labelledby="detail-photo-title">
      <div className="school-photo-gallery__heading"><div><p>FIELD PHOTO · {activePhotos.length}/3</p><h2 id="detail-photo-title">도착 전에 보는 현장</h2><small>접근로부터 하역 위치까지, 사진 3장으로 이어집니다.</small></div><StatusBadge tone={activePhotos.length === 3 ? "success" : "attention"}>{activePhotos.length === 3 ? "사진 준비 완료" : `${3 - activePhotos.length}개 슬롯 비어 있음`}</StatusBadge></div>
      <div className="photo-gallery-grid">
        {PHOTO_SLOT_IDS.map((slotId, slotIndex) => {
          const photo = photoBySlot.get(slotId) ?? null;
          const photoIndex = photo ? activePhotos.findIndex((candidate) => candidate.slotId === slotId) : -1;
          const isPriorityPhoto = photoIndex === 0;
          return (
            <article className="photo-card" data-primary={slotIndex === 0} data-empty={!photo} key={slotId}>
              {photo ? <PhotoImage photo={photo} sessionNamespace={sessionNamespace} variant={isPriorityPhoto ? "preview" : "thumbnail"} enabled={isPriorityPhoto || secondaryPhotosEnabled} onReady={isPriorityPhoto ? enableSecondaryPhotos : undefined} onOpen={() => setViewerIndex(photoIndex)} /> : <button className="photo-card__empty" type="button" disabled={!canEdit} onClick={() => setEditorSlot(slotId)}><Icon name="camera" /><strong>{SLOT_LABELS[slotId]}</strong><small>{canEdit ? "첫 사진 추가" : "등록된 사진이 없습니다."}</small></button>}
              <div className="photo-card__meta"><span>{slotId} · {SLOT_LABELS[slotId]}</span><strong>{photo?.caption ?? "아직 등록되지 않았어요."}</strong>{photo ? <small>사진 개정 {photo.photoRevision}</small> : null}</div>
              {canEdit && photo ? <div className="photo-card__actions"><button type="button" onClick={() => setEditorSlot(slotId)}><Icon name="upload" size={16} />교체</button><button type="button" disabled={workingSlot === slotId} onClick={() => void deletePhoto(photo)}><Icon name="trash" size={16} />삭제</button></div> : null}
            </article>
          );
        })}
      </div>
      <p className="school-photo-gallery__policy"><Icon name="sparkles" />Preview를 먼저 표시하고, 확대할 때만 Original을 불러옵니다. 사진은 서버에서 EXIF를 제거한 WebP로 변환됩니다.</p>
      {editorSlot ? <BottomSheet open title={`${SLOT_LABELS[editorSlot]} 사진 ${photoBySlot.has(editorSlot) ? "교체" : "추가"}`} description="새 버전으로 안전하게 저장하며, 이전 파일을 덮어쓰지 않습니다." onClose={() => setEditorSlot(null)}><PhotoUploader key={`${editorSlot}:${photoBySlot.get(editorSlot)?.photoRevision ?? 0}`} schoolId={schoolId} slotId={editorSlot} photo={photoBySlot.get(editorSlot) ?? null} onDone={() => { setEditorSlot(null); onRefresh(); }} /></BottomSheet> : null}
      {viewerIndex !== null ? <PhotoViewer photos={activePhotos} initialIndex={viewerIndex} sessionNamespace={sessionNamespace} onClose={() => setViewerIndex(null)} /> : null}
    </section>
  );
}
