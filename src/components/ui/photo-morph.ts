import { useCallback, useEffect, useRef } from "react";

import { getMotionAllowed, subscribeToMotionAllowed } from "./use-motion-permission";

type PhotoRect = Pick<DOMRect, "left" | "top" | "width" | "height">;
export const PHOTO_MORPH_DURATION = 300;
export const PHOTO_CLOSE_DURATION = 260;
type PhotoAnimation = { finished: Promise<void>; cancel: () => void; pause: () => void };

function retainAnimation(animation: Animation, duration: number): PhotoAnimation {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finished = Promise.race([
    animation.finished.then(() => {}, () => {}),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, duration + 100); }),
  ]).finally(() => { clearTimeout(timer); });
  return {
    finished,
    cancel: () => { clearTimeout(timer); animation.cancel(); },
    pause: () => { clearTimeout(timer); animation.pause(); },
  };
}

/** Uniform scaling and a crop preserve the photograph's aspect ratio in flight. */
export function photoMorphGeometry(source: PhotoRect, target: PhotoRect, image?: { width: number; height: number }) {
  const values = [source.left, source.top, source.width, source.height, target.left, target.top, target.width, target.height];
  if (values.some((value) => !Number.isFinite(value)) || source.width <= 1 || source.height <= 1 || target.width <= 1 || target.height <= 1) return null;
  const fit = image && Number.isFinite(image.width) && Number.isFinite(image.height) && image.width > 0 && image.height > 0
    ? Math.min(target.width / image.width, target.height / image.height) : null;
  const contentWidth = fit && image ? image.width * fit : target.width;
  const contentHeight = fit && image ? image.height * fit : target.height;
  const scale = Math.max(source.width / contentWidth, source.height / contentHeight);
  // Extremely narrow/panoramic assets should open immediately, not create a
  // huge temporary compositor layer merely to match a very different crop.
  if (scale < .04 || scale > 8) return null;
  const x = source.left + source.width / 2 - target.left - target.width * scale / 2;
  const y = source.top + source.height / 2 - target.top - target.height * scale / 2;
  const insetX = Math.max(0, (target.width - source.width / scale) / 2);
  const insetY = Math.max(0, (target.height - source.height / scale) / 2);
  return { transform: `translate(${x}px, ${y}px) scale(${scale})`, scale, insetX, insetY };
}

export function animatePhotoMorph(stage: HTMLElement, origin: HTMLElement | null | undefined, closing: boolean): PhotoAnimation | null {
  if (!origin?.isConnected || !stage.isConnected || typeof stage.animate !== "function") return null;
  const source = origin.getBoundingClientRect();
  if (source.top + source.height <= 0 || source.left + source.width <= 0 || source.top >= window.innerHeight || source.left >= window.innerWidth) return null;
  const targetImage = stage.querySelector("img");
  const sourceImage = origin.querySelector("img");
  const image = targetImage?.naturalWidth ? targetImage : sourceImage;
  const geometry = photoMorphGeometry(source, stage.getBoundingClientRect(), image ? { width: image.naturalWidth, height: image.naturalHeight } : undefined);
  if (!geometry) return null;
  const sourceRadius = Number.parseFloat(getComputedStyle(origin).borderRadius) || 0;
  const endRadius = getComputedStyle(stage).borderRadius;
  const start = { transform: geometry.transform, clipPath: `inset(${geometry.insetY}px ${geometry.insetX}px round ${sourceRadius / geometry.scale}px)`, borderRadius: `${sourceRadius / geometry.scale}px` };
  const end = { transform: "none", clipPath: `inset(0px 0px round ${endRadius})`, borderRadius: endRadius };
  let animation: Animation;
  try {
    animation = stage.animate(closing ? [end, start] : [start, end], {
      duration: closing ? PHOTO_CLOSE_DURATION : PHOTO_MORPH_DURATION,
      easing: closing ? "cubic-bezier(.4,0,.2,1)" : "cubic-bezier(.18,.82,.24,1)",
      fill: "both",
    });
  } catch { return null; }
  return retainAnimation(animation, closing ? PHOTO_CLOSE_DURATION : PHOTO_MORPH_DURATION);
}

/** The sheet surface fades with the photograph, rather than disappearing after it. */
function animatePhotoExit(stage: HTMLElement, origin: HTMLElement | null | undefined, canReturn: boolean): PhotoAnimation | null {
  const layer = stage.closest<HTMLDialogElement>("dialog.bottom-sheet-layer");
  let fade: PhotoAnimation | null = null;
  if (layer?.isConnected && typeof layer.animate === "function") {
    try {
      fade = retainAnimation(layer.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: PHOTO_CLOSE_DURATION, easing: "cubic-bezier(.4,0,.2,1)", fill: "both",
      }), PHOTO_CLOSE_DURATION);
    } catch { /* Retain the safe immediate fallback on unsupported browsers. */ }
  }
  const morph = canReturn ? animatePhotoMorph(stage, origin, true) : null;
  if (!fade && !morph) return null;
  return {
    finished: Promise.all([fade?.finished, morph?.finished]).then(() => {}),
    cancel: () => { fade?.cancel(); morph?.cancel(); },
    pause: () => { fade?.pause(); morph?.pause(); },
  };
}

export function usePhotoMorph({ origin, identity, onClose, canReturn = true }: {
  origin?: HTMLElement | null;
  identity: string;
  onClose: () => void;
  canReturn?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const mounted = useRef(false);
  const closing = useRef(false);
  const completed = useRef(false);
  const active = useRef<ReturnType<typeof animatePhotoMorph>>(null);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const finishClose = useCallback(() => {
    if (!mounted.current || completed.current) return;
    completed.current = true;
    closeRef.current();
  }, []);

  const settle = useCallback(() => {
    active.current?.cancel();
    active.current = null;
    if (stageRef.current) stageRef.current.dataset.photoMorphState = "open";
  }, []);

  useEffect(() => {
    mounted.current = true;
    closing.current = false;
    completed.current = false;
    const unsubscribe = subscribeToMotionAllowed(() => {
      if (getMotionAllowed()) return;
      // Never expose the full-size underlying stage between exit and React's
      // unmount. Its retained frame is released only by the cleanup below.
      if (closing.current) finishClose();
      else settle();
    });
    return () => {
      mounted.current = false;
      unsubscribe();
      settle();
    };
  }, [settle, finishClose]);

  useEffect(() => {
    const stage = stageRef.current;
    const frame = requestAnimationFrame(() => {
      if (!mounted.current || closing.current || !stage || !getMotionAllowed()) return;
      const animation = animatePhotoMorph(stage, origin, false);
      if (!animation) return;
      active.current = animation;
      stage.dataset.photoMorphState = "opening";
      void animation.finished.then(() => {
        if (active.current === animation && !closing.current) settle();
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      // A preview resolving, a refreshed URL or a keyboard photo change must
      // not cancel an already-requested exit or reveal its unanimated frame.
      if (!closing.current) settle();
    };
  }, [identity, origin, settle]);

  const requestClose = useCallback(() => {
    if (!mounted.current || closing.current) return;
    closing.current = true;
    const opening = active.current;
    const stage = stageRef.current;
    if (!stage || !getMotionAllowed()) { finishClose(); return; }
    // A rapid close keeps its in-flight geometry while the layer fades. A
    // zoomed/different photograph also fades, never jumping to a wrong crop.
    opening?.pause();
    stage.dataset.photoMorphState = "closing";
    const animation = animatePhotoExit(stage, origin, !opening && canReturn);
    if (!animation) { finishClose(); return; }
    const exit = { ...animation, cancel: () => { animation.cancel(); opening?.cancel(); } };
    active.current = exit;
    void exit.finished.then(() => {
      if (!mounted.current || active.current !== exit) return;
      // Keep fill:both and the closing overflow until the dialog is removed.
      // Cancelling here flashes the expanded image for a frame on mobile.
      finishClose();
    });
  }, [canReturn, origin, finishClose]);
  const beforeClose = useCallback(() => !closing.current, []);
  return { stageRef, requestClose, beforeClose };
}
