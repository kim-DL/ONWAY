import type { Customer, CustomerPoint } from "@/domain/customer";
import type { MouseEvent } from "react";
import { registeredCustomerAddress } from "./customer-address";

type Addresses = Pick<Customer, "deliveryAddress" | "officialAddress">;
type DirectionCustomer = Addresses & Pick<Customer, "name" | "customerId" | "revision">;
const loadDirections = () => import("./customer-directions-repository");

/** The normal anchor fallback searches the displayed address, never a stale pin or a shop name. */
export function customerDirectionsHref(customer: Addresses): string | null {
  const address = registeredCustomerAddress(customer);
  return address ? `https://map.kakao.com/link/search/${encodeURIComponent(address)}` : null;
}

export function preloadCustomerDirections(customer: Customer) {
  const address = registeredCustomerAddress(customer);
  if (address && customer.status === "active") void loadDirections()
    .then((api) => api.resolveDirectionsPoint(address, customer)).catch(() => undefined);
}
export async function openCustomerDirections(event: MouseEvent<HTMLAnchorElement>, customer: DirectionCustomer,
  resolve?: (address: string, popup: Window | null) => Promise<CustomerPoint | null>) {
  if (event.defaultPrevented || event.button > 1) return;
  event.preventDefault();
  const anchor = event.currentTarget;
  if (anchor.ariaBusy === "true") return;
  const originalHref = anchor.href;
  const version = anchor.dataset.directionsVersion;
  const current = () => anchor.isConnected && anchor.href === originalHref && anchor.dataset.directionsVersion === version;
  anchor.ariaBusy = "true";
  // Reserve the window during the user's gesture so async geocoding does not trigger a popup block.
  let popup: Window | null = null;
  try {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!mobile) popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    const navigation = await loadDirections();
    await navigation.navigateToCustomer(customer, registeredCustomerAddress(customer), popup, mobile, current, resolve);
  } catch {
    popup?.close();
    if (current()) window.alert("주소를 확인하지 못했어요. 인터넷 연결과 등록 주소를 확인한 뒤 다시 시도해주세요.");
  } finally { anchor.ariaBusy = null; }
}
