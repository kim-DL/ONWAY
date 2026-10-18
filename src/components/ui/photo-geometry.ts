export type PhotoView = { scale: number; x: number; y: number };
export type PhotoGeometry = { width: number; height: number; imageWidth: number; imageHeight: number; max: number };
export const fittedPhoto: PhotoView = { scale: 1, x: 0, y: 0 };
export function photoGeometry(width: number, height: number, naturalWidth: number, naturalHeight: number, pixelRatio = 1): PhotoGeometry | null {
  if (![width, height, naturalWidth, naturalHeight, pixelRatio].every((n) => Number.isFinite(n) && n > 0)) return null;
  const fit = Math.min(width / naturalWidth, height / naturalHeight);
  return { width, height, imageWidth: naturalWidth * fit, imageHeight: naturalHeight * fit,
    max: 1 / (fit * pixelRatio) >= 3 ? 3 : 2.5 };
}
export function containPhoto(view: PhotoView, geometry: PhotoGeometry): PhotoView {
  const scale = Math.max(1, Math.min(geometry.max, view.scale));
  const x = Math.max(0, (geometry.imageWidth * scale - geometry.width) / 2);
  const y = Math.max(0, (geometry.imageHeight * scale - geometry.height) / 2);
  return { scale, x: x ? Math.max(-x, Math.min(x, view.x)) : 0, y: y ? Math.max(-y, Math.min(y, view.y)) : 0 };
}
/** Coordinates are relative to the viewport centre, in CSS pixels. */
export function zoomPhoto(view: PhotoView, scale: number, point: { x: number; y: number }, geometry: PhotoGeometry): PhotoView {
  const next = Math.max(1, Math.min(geometry.max, scale));
  return containPhoto({ scale: next, x: point.x - (point.x - view.x) * next / view.scale,
    y: point.y - (point.y - view.y) * next / view.scale }, geometry);
}
