import { afterEach, describe, expect, it, vi } from "vitest";
import type { MouseEvent } from "react";
import { customerDirectionsHref, openCustomerDirections } from "./customer-directions";
const customer = { name: "예시식품", officialAddress: "예전 주소", deliveryAddress: "대전 대덕구 예시로 38" };
afterEach(() => vi.unstubAllGlobals());
function setup(popupBlocked = false) {
  const popup = { opener: {}, closed: false, document: { title: "", body: { textContent: "" } }, location: { replace: vi.fn() }, close: vi.fn() };
  const browser = { open: vi.fn(() => popupBlocked ? null : popup), location: { assign: vi.fn() }, alert: vi.fn() };
  vi.stubGlobal("window", browser);
  const anchor = { href: customerDirectionsHref(customer)!, isConnected: true, setAttribute: vi.fn(), removeAttribute: vi.fn() };
  const event = { defaultPrevented: false, preventDefault: vi.fn(), button: 0, currentTarget: anchor } as unknown as MouseEvent<HTMLAnchorElement>;
  return { popup, browser, anchor, event };
}
describe("address-based Kakao directions", () => {
  it("opens a window during the gesture then uses the resolved displayed address", async () => {
    const { popup, browser, event } = setup(); let finish!: (point: { latitude: number; longitude: number }) => void;
    const resolve = vi.fn(() => new Promise<{ latitude: number; longitude: number }>((done) => { finish = done; }));
    const task = openCustomerDirections(event, customer, resolve);
    expect(browser.open).toHaveBeenCalledOnce(); expect(resolve).toHaveBeenCalledWith(customer.deliveryAddress, popup);
    expect(popup.opener).toBeNull(); expect(popup.location.replace).not.toHaveBeenCalled();
    finish({ latitude: 36.4, longitude: 127.5 }); await task;
    expect(popup.location.replace).toHaveBeenCalledWith(`https://map.kakao.com/link/to/${encodeURIComponent(customer.name)},36.4,127.5`);
    expect(browser.alert).not.toHaveBeenCalled();
  });
  it("uses the same tab when a popup is blocked", async () => {
    const { browser, event } = setup(true);
    await openCustomerDirections(event, customer, async () => ({ latitude: 36.4, longitude: 127.5 }));
    expect(browser.location.assign).toHaveBeenCalledOnce();
  });
  it("does not reopen a reserved window that the user closed during address lookup", async () => {
    const { popup, browser, event } = setup();
    await openCustomerDirections(event, customer, async () => { popup.closed = true; return { latitude: 36.4, longitude: 127.5 }; });
    expect(popup.location.replace).not.toHaveBeenCalled();
    expect(browser.location.assign).not.toHaveBeenCalled(); expect(browser.alert).not.toHaveBeenCalled();
  });
  it("repeated clicks during lookup do not open duplicate windows or repeat the lookup", async () => {
    const { browser, event } = setup(); let finish!: (point: { latitude: number; longitude: number }) => void;
    const resolve = vi.fn(() => new Promise<{ latitude: number; longitude: number }>((done) => { finish = done; }));
    const first = openCustomerDirections(event, customer, resolve);
    await openCustomerDirections(event, customer, resolve);
    expect(browser.open).toHaveBeenCalledOnce(); expect(resolve).toHaveBeenCalledOnce();
    finish({ latitude: 36.4, longitude: 127.5 }); await first;
  });
  it.each([null, { latitude: NaN, longitude: 127 }])("closes the blank window and shows an error for an unresolved address", async (point) => {
    const { popup, browser, event } = setup(); await openCustomerDirections(event, customer, async () => point);
    expect(popup.close).toHaveBeenCalledOnce(); expect(popup.location.replace).not.toHaveBeenCalled(); expect(browser.alert).toHaveBeenCalledOnce();
  });
  it("ignores a late result after the displayed customer address changes", async () => {
    const { popup, anchor, event } = setup();
    await openCustomerDirections(event, customer, async () => { anchor.href = "https://map.kakao.com/link/search/changed"; return { latitude: 36.4, longitude: 127.5 }; });
    expect(popup.close).toHaveBeenCalledOnce(); expect(popup.location.replace).not.toHaveBeenCalled();
  });
  it("does not open when closed-customer confirmation was cancelled", async () => {
    const { browser, event } = setup(); await openCustomerDirections({ ...event, defaultPrevented: true }, customer, vi.fn());
    expect(browser.open).not.toHaveBeenCalled();
  });
});
