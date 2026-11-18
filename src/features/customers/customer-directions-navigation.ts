import type { CustomerPoint } from "@/domain/customer";
import { buildKakaoDirectionsUrlToCoordinate } from "../school-detail/kakao-directions";
import { isCustomerPoint } from "./customer-point";

export function deliverCustomerRoute(name: string, point: CustomerPoint | null, popup: Window | null, mobile: boolean, current: () => boolean) {
  if (!current()) { popup?.close(); return; }
  if (!isCustomerPoint(point)) throw new Error("Unresolved address");
  const web = buildKakaoDirectionsUrlToCoordinate(name, point.latitude, point.longitude);
  if (mobile) return openMobileCarRoute(window, point, web, current);
  if (!popup) window.location.assign(web);
  else if (!popup.closed) popup.location.replace(web);
}

/** A hidden document already handed off to the map app. Never redirect on its return. */
export function openMobileCarRoute(target: Window, point: CustomerPoint, web: string, current: () => boolean) {
  const doc = target.document;
  if (doc.hidden || !current()) return Promise.resolve();
  return new Promise<void>((done) => {
    const finish = () => {
      target.clearTimeout(timer);
      target.removeEventListener("pagehide", finish);
      doc.removeEventListener("visibilitychange", visibility);
      done();
    };
    const visibility = () => { if (doc.hidden) finish(); };
    const fallback = () => {
      finish();
      if (!doc.hidden && current()) target.location.assign(web);
    };
    const timer = target.setTimeout(fallback, 1500);
    target.addEventListener("pagehide", finish, { once: true });
    doc.addEventListener("visibilitychange", visibility);
    try { target.location.assign(`kakaomap://route?ep=${point.latitude},${point.longitude}&by=car`); }
    catch { fallback(); }
  });
}
