import { afterEach, expect, it, vi } from "vitest";
import { openMobileCarRoute } from "./customer-directions-navigation";

afterEach(() => vi.useRealTimers());
it.each(["pagehide", "hidden", "unhandled", "address-changed"])("handles mobile route handoff: %s", async (outcome) => {
  vi.useFakeTimers();
  const document = Object.assign(new EventTarget(), { hidden: false });
  const assign = vi.fn();
  const target = Object.assign(new EventTarget(), { document, location: { assign }, setTimeout, clearTimeout });
  let current = true;
  const web = "https://map.kakao.com/link/to/test,36.4,127.5";
  const handoff = openMobileCarRoute(target as unknown as Window, { latitude: 36.4, longitude: 127.5 }, web, () => current);
  expect(assign.mock.calls).toEqual([["kakaomap://route?ep=36.4,127.5&by=car"]]);
  if (outcome === "pagehide") target.dispatchEvent(new Event("pagehide"));
  if (outcome === "hidden") {
    document.hidden = true; document.dispatchEvent(new Event("visibilitychange"));
    document.hidden = false; document.dispatchEvent(new Event("visibilitychange"));
  }
  if (outcome === "address-changed") current = false;
  await vi.advanceTimersByTimeAsync(3_000); await handoff;
  expect(assign.mock.calls.slice(1)).toEqual(outcome === "unhandled" ? [[web]] : []);
});
