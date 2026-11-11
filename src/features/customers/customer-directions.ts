import type { Customer } from "@/domain/customer";
import { buildKakaoDirectionsUrlToCoordinate } from "@/features/school-detail/kakao-directions";
import { isCustomerPoint } from "./customer-point";
import type { MouseEvent } from "react";
import type { CustomerPoint } from "@/domain/customer";

type DirectionCustomer = Pick<Customer, "name" | "deliveryAddress" | "officialAddress">;
const addressOf = (customer: DirectionCustomer) => customer.deliveryAddress.trim() || customer.officialAddress.trim();

/** The normal anchor fallback searches the displayed address, never a stale pin or a shop name. */
export function customerDirectionsHref(customer: DirectionCustomer): string | null {
  const address = addressOf(customer);
  return address ? `https://map.kakao.com/link/search/${encodeURIComponent(address)}` : null;
}

const pending = new WeakSet<HTMLAnchorElement>();
export async function openCustomerDirections(event: MouseEvent<HTMLAnchorElement>, customer: DirectionCustomer,
  resolve: (address: string, popup: Window | null) => Promise<CustomerPoint | null> = async (address, popup) => {
    const api = await import("./customer-directions-repository");
    if (popup && !popup.closed) api.renderDirectionsLoading(popup);
    return api.resolveDirectionsPoint(address);
  }) {
  if (event.defaultPrevented || (event.button !== undefined && event.button !== 0 && event.button !== 1)) return;
  event.preventDefault();
  const anchor = event.currentTarget; const originalHref = anchor.href;
  if (pending.has(anchor)) return;
  pending.add(anchor); anchor.setAttribute("aria-busy", "true");
  // Reserve the window during the user's gesture so async geocoding does not trigger a popup block.
  let popup: Window | null = null;
  try {
    popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    const point = await resolve(addressOf(customer), popup);
    if (!anchor.isConnected || anchor.href !== originalHref) { popup?.close(); return; }
    if (!isCustomerPoint(point)) throw new Error("unresolved-address");
    const href = buildKakaoDirectionsUrlToCoordinate(customer.name, point.latitude, point.longitude);
    if (popup) { if (!popup.closed) popup.location.replace(href); }
    else window.location.assign(href);
  } catch {
    popup?.close();
    if (anchor.isConnected && anchor.href === originalHref) window.alert("주소를 확인하지 못했어요. 인터넷 연결과 등록 주소를 확인한 뒤 다시 시도해주세요.");
  } finally { pending.delete(anchor); anchor.removeAttribute("aria-busy"); }
}
