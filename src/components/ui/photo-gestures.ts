import { getMotionAllowed } from "@/components/ui/use-motion-permission";
import { containPhoto, fittedPhoto, photoGeometry, zoomPhoto, type PhotoGeometry, type PhotoView } from "./photo-geometry";

type Point = { x: number; y: number };
type Gesture = { view: PhotoView; centre: Point; distance: number };
export function attachPhotoGestures(stage: HTMLElement, report: (view: PhotoView, max: number, zoomed: boolean) => void, onSwipe?: (direction: -1 | 1) => void) {
  const image = stage.querySelector("img")!;
  const pointers = new Map<number, Point>();
  const savedStyle = image.getAttribute("style");
  let geometry: PhotoGeometry | null = null;
  let current = { ...fittedPhoto }, target = current;
  let frame = 0, fallback = 0, stamp = 0, smooth = false, disposed = false;
  let gesture: Gesture | null = null;
  let press: { point: Point; time: number; moved: boolean } | null = null;
  let lastTap: { point: Point; time: number } | null = null;
  let lastTouch = -Infinity;
  let swipeStart: Point | null = null;
  const point = (event: { clientX: number; clientY: number }): Point => {
    const rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
  };
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const centre = (a: Point, b = a): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const reportView = () => {
    if (geometry && !disposed) report(current, geometry.max, Math.max(current.scale, target.scale) > 1.001);
  };
  const paint = () => {
    if (!geometry) return;
    const left = (geometry.width - geometry.imageWidth * current.scale) / 2 + current.x;
    const top = (geometry.height - geometry.imageHeight * current.scale) / 2 + current.y;
    image.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${current.scale})`;
    stage.dataset.scale = String(current.scale);
    stage.dataset.panX = String(current.x); stage.dataset.panY = String(current.y);
    reportView();
  };
  const guardFrame = () => {
    clearTimeout(fallback);
    // Occluded windows can report visible while Chromium suspends animation frames.
    // Retain the requested view even when the compositor is not drawing it yet.
    fallback = window.setTimeout(() => {
      cancelAnimationFrame(frame); frame = 0;
      if (!disposed && geometry) { current = target; paint(); }
    }, 120);
  };
  const tick = (time: number) => {
    frame = 0;
    if (disposed || !geometry) return;
    const blend = smooth && getMotionAllowed() ? 1 - Math.exp(-Math.min(64, stamp ? time - stamp : 16) / 55) : 1;
    stamp = time;
    current = containPhoto({ scale: current.scale + (target.scale - current.scale) * blend,
      x: current.x + (target.x - current.x) * blend, y: current.y + (target.y - current.y) * blend }, geometry);
    const pending = Math.abs(current.scale - target.scale) > .0001 || distance(current, target) > .05;
    if (!pending) current = target;
    paint();
    if (pending) { frame = requestAnimationFrame(tick); guardFrame(); }
    else clearTimeout(fallback);
  };
  const move = (view: PhotoView, animate: boolean) => {
    if (!geometry || disposed) return;
    target = containPhoto(view, geometry); smooth = animate;
    reportView();
    if (!frame) { stamp = 0; frame = requestAnimationFrame(tick); }
    guardFrame();
  };
  const stopMotion = () => {
    cancelAnimationFrame(frame); clearTimeout(fallback); frame = 0; stamp = 0; target = current;
  };
  const rebase = () => {
    const [a, b] = [...pointers.values()];
    gesture = a ? { view: target, centre: centre(a, b), distance: b ? distance(a, b) : 0 } : null;
    stage.dataset.dragging = String(pointers.size > 0);
  };
  const clearPointers = () => {
    const ids = [...pointers.keys()]; pointers.clear(); gesture = null; press = null; lastTap = null; swipeStart = null;
    stage.dataset.dragging = "false";
    for (const id of ids) if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
  };
  const resize = () => {
    if (disposed) return;
    // Computed dimensions retain fractional CSS pixels without including the
    // opening morph transform. clientWidth/Height round and can expose an edge.
    const size = getComputedStyle(stage);
    const next = photoGeometry(parseFloat(size.width) || stage.clientWidth, parseFloat(size.height) || stage.clientHeight,
      image.naturalWidth, image.naturalHeight, window.devicePixelRatio || 1);
    if (!next) return;
    stopMotion(); clearPointers();
    current = containPhoto({ ...current, x: geometry ? current.x * next.imageWidth / geometry.imageWidth : 0,
      y: geometry ? current.y * next.imageHeight / geometry.imageHeight : 0 }, next);
    target = current; geometry = next;
    image.style.width = `${next.imageWidth}px`; image.style.height = `${next.imageHeight}px`;
    paint();
  };
  const zoom = (scale: number, focal: Point = { x: 0, y: 0 }) => {
    if (geometry) move(zoomPhoto(target, scale, focal, geometry), true);
  };
  const toggle = (focal: Point) => target.scale > 1.05 ? move(fittedPhoto, true) : zoom(1.8, focal);
  const wheel = (event: WheelEvent) => {
    if (!geometry || !event.deltaY || stage.dataset.photoMorphState !== "open") return;
    event.preventDefault(); lastTap = null;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? geometry.height : 1;
    zoom(target.scale * Math.exp(-Math.max(-200, Math.min(200, event.deltaY * unit)) * .0025), point(event));
  };
  const down = (event: PointerEvent) => {
    if (!geometry || (event.pointerType === "mouse" && event.button !== 0) || pointers.size >= 2) return;
    event.preventDefault(); stage.focus({ preventScroll: true }); stopMotion();
    const at = point(event); pointers.set(event.pointerId, at);
    try { stage.setPointerCapture(event.pointerId); } catch { /* A cancelled pointer may no longer be active. */ }
    if (event.pointerType !== "mouse") lastTouch = performance.now();
    if (pointers.size === 1) { press = { point: at, time: performance.now(), moved: false }; swipeStart = current.scale <= 1.001 ? at : null; }
    else { press = null; lastTap = null; swipeStart = null; }
    rebase(); reportView();
  };
  const drag = (event: PointerEvent) => {
    if (!geometry || !gesture || !pointers.has(event.pointerId)) return;
    event.preventDefault();
    const at = point(event); pointers.set(event.pointerId, at);
    if (press && distance(at, press.point) > 8) { press.moved = true; lastTap = null; }
    const [a, b] = [...pointers.values()];
    if (!a) return;
    const middle = centre(a, b);
    const scale = b && gesture.distance > 1 ? gesture.view.scale * distance(a, b) / gesture.distance : gesture.view.scale;
    const bounded = Math.max(1, Math.min(geometry.max, scale));
    move({ scale: bounded, x: middle.x - (gesture.centre.x - gesture.view.x) * bounded / gesture.view.scale,
      y: middle.y - (gesture.centre.y - gesture.view.y) * bounded / gesture.view.scale }, false);
  };
  const up = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    const now = performance.now(), at = point(event);
    if (event.type === "pointerup" && event.pointerType !== "mouse" && pointers.size === 1 && press && !press.moved && now - press.time < 280) {
      if (lastTap && now - lastTap.time < 320 && distance(at, lastTap.point) < 28) { toggle(at); lastTap = null; }
      else lastTap = { point: at, time: now };
    } else lastTap = null;
    const swipe = event.type === "pointerup" && pointers.size === 1 && swipeStart && target.scale <= 1.001
      && Math.abs(at.x - swipeStart.x) > 60 && Math.abs(at.x - swipeStart.x) > Math.abs(at.y - swipeStart.y)
      ? (at.x < swipeStart.x ? 1 : -1) : null;
    pointers.delete(event.pointerId); press = null; swipeStart = null;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    rebase();
    if (swipe) onSwipe?.(swipe);
  };
  const doubleClick = (event: MouseEvent) => {
    if (performance.now() - lastTouch < 500) return;
    event.preventDefault(); toggle(point(event));
  };
  const key = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "+" || event.key === "=") zoom(target.scale * 1.2);
    else if (event.key === "-" || event.key === "_") zoom(target.scale / 1.2);
    else if (event.key === "0" || event.key === "Home") move(fittedPhoto, true);
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      if (onSwipe && target.scale <= 1.001 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) onSwipe(event.key === "ArrowLeft" ? -1 : 1);
      else move({ ...target, x: target.x + (event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0),
        y: target.y + (event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0) }, false);
    } else return;
    event.preventDefault();
  };
  const interrupted = () => { const requested = target; clearPointers(); if (geometry) { stopMotion(); current = target = containPhoto(requested, geometry); paint(); } };
  const visibility = () => { if (document.hidden) interrupted(); };
  stage.addEventListener("wheel", wheel, { passive: false });
  stage.addEventListener("pointerdown", down); stage.addEventListener("pointermove", drag);
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up); stage.addEventListener("lostpointercapture", up);
  stage.addEventListener("dblclick", doubleClick); stage.addEventListener("keydown", key);
  image.addEventListener("load", resize);
  window.addEventListener("blur", interrupted); window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", visibility);
  const observer = new ResizeObserver(resize); observer.observe(stage); resize();
  return {
    zoomIn: () => zoom(target.scale * 1.2), zoomOut: () => zoom(target.scale / 1.2),
    quick: () => zoom(1.8), reset: () => move(fittedPhoto, true),
    dispose: () => {
      disposed = true; stopMotion(); clearPointers(); observer.disconnect();
      stage.removeEventListener("wheel", wheel); stage.removeEventListener("pointerdown", down); stage.removeEventListener("pointermove", drag);
      stage.removeEventListener("pointerup", up); stage.removeEventListener("pointercancel", up); stage.removeEventListener("lostpointercapture", up);
      stage.removeEventListener("dblclick", doubleClick); stage.removeEventListener("keydown", key);
      image.removeEventListener("load", resize); window.removeEventListener("blur", interrupted); window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
      if (savedStyle === null) image.removeAttribute("style"); else image.setAttribute("style", savedStyle);
      delete stage.dataset.scale; delete stage.dataset.panX; delete stage.dataset.panY; delete stage.dataset.dragging;
    },
  };
}
