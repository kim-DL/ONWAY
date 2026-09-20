import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDeliveryPointMap, hasLoadedMapTiles, isDeliveryMapPoint, type KakaoLatLng, type KakaoMapsSdk } from "./kakao-sdk";

class TestScript extends EventTarget {
  id = "";
  src = "";
  async = false;
  referrerPolicy = "";
  removed = false;
  remove() { this.removed = true; }
}

function mockSdk() {
  class LatLng {
    constructor(private latitude: number, private longitude: number) {}
    getLat() { return this.latitude; }
    getLng() { return this.longitude; }
  }
  const map = {
    setCenter: vi.fn(),
    getCenter: vi.fn(() => new LatLng(36.351, 127.381)),
    setLevel: vi.fn(),
    getLevel: vi.fn(() => 3),
    setDraggable: vi.fn(),
    setZoomable: vi.fn(),
    relayout: vi.fn(),
  };
  const marker = {
    setPosition: vi.fn(),
    getPosition: vi.fn(() => new LatLng(36.361, 127.391)),
    setMap: vi.fn(),
    setDraggable: vi.fn(),
  };
  const maps = {
    load: vi.fn((callback: () => void) => callback()),
    LatLng,
    Map: vi.fn(function () { return map; }),
    Marker: vi.fn(function () { return marker; }),
    event: { addListener: vi.fn(), removeListener: vi.fn() },
  };
  return { maps, sdk: maps as unknown as KakaoMapsSdk, map, marker, LatLng };
}

function mockBrowser() {
  const scripts: TestScript[] = [];
  const browser = { kakao: undefined as { maps?: Partial<KakaoMapsSdk> } | undefined };
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", {
    getElementById: (id: string) => scripts.find((item) => item.id === id && !item.removed) ?? null,
    createElement: () => new TestScript(),
    head: { appendChild: (script: TestScript) => scripts.push(script) },
  });
  return { browser, scripts };
}

describe("Kakao SDK loading lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY", "fixture-javascript-key");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not access browser APIs during server rendering", async () => {
    const { loadKakaoMapsSdk } = await import("./kakao-sdk");
    await expect(loadKakaoMapsSdk()).rejects.toMatchObject({ code: "unavailable" });
  });

  it("reports missing configuration without making a network request", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY", " ");
    const { scripts } = mockBrowser();
    const { loadKakaoMapsSdk } = await import("./kakao-sdk");
    await expect(loadKakaoMapsSdk()).rejects.toMatchObject({ code: "configuration" });
    expect(scripts).toHaveLength(0);
  });

  it("deduplicates concurrent and StrictMode requests and waits for maps.load", async () => {
    const { browser, scripts } = mockBrowser();
    const { sdk } = mockSdk();
    const { loadKakaoMapsSdk } = await import("./kakao-sdk");
    const first = loadKakaoMapsSdk();
    const second = loadKakaoMapsSdk();
    expect(first).toBe(second);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.src).toBe("https://dapi.kakao.com/v2/maps/sdk.js?appkey=fixture-javascript-key&autoload=false");
    expect(scripts[0]!.async).toBe(true);
    expect(scripts[0]!.referrerPolicy).toBe("strict-origin-when-cross-origin");
    let loaded: (() => void) | undefined;
    browser.kakao = { maps: { load: (callback) => { loaded = callback; } } };
    scripts[0]!.dispatchEvent(new Event("load"));
    expect(loaded).toBeTypeOf("function");
    browser.kakao.maps = sdk;
    loaded?.();
    await expect(first).resolves.toBe(sdk);
    await expect(loadKakaoMapsSdk()).resolves.toBe(sdk);
    expect(scripts).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reuses an already initialized SDK even without a new configured key", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY", "");
    const { browser, scripts } = mockBrowser();
    const { sdk } = mockSdk();
    browser.kakao = { maps: sdk };
    const { loadKakaoMapsSdk } = await import("./kakao-sdk");
    await expect(loadKakaoMapsSdk()).resolves.toBe(sdk);
    expect(scripts).toHaveLength(0);
  });

  it("removes failed scripts and allows a fresh network retry", async () => {
    const { browser, scripts } = mockBrowser();
    const { sdk } = mockSdk();
    const { loadKakaoMapsSdk } = await import("./kakao-sdk");
    const failed = expect(loadKakaoMapsSdk()).rejects.toMatchObject({ code: "network" });
    scripts[0]!.dispatchEvent(new Event("error"));
    await failed;
    expect(scripts[0]!.removed).toBe(true);
    const retried = loadKakaoMapsSdk();
    expect(scripts).toHaveLength(2);
    browser.kakao = { maps: sdk };
    scripts[1]!.dispatchEvent(new Event("load"));
    await expect(retried).resolves.toBe(sdk);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out stalled bootstrap, ignores late callback and does not keep its failed queue", async () => {
    const { browser, scripts } = mockBrowser();
    const { sdk } = mockSdk();
    const { loadKakaoMapsSdk } = await import("./kakao-sdk");
    const first = loadKakaoMapsSdk();
    const failed = expect(first).rejects.toMatchObject({ code: "timeout" });
    let lateCallback: (() => void) | undefined;
    browser.kakao = { maps: { load: (callback) => { lateCallback = callback; } } };
    scripts[0]!.dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(15_000);
    await failed;
    expect(browser.kakao.maps).toBeUndefined();
    const retry = loadKakaoMapsSdk();
    expect(retry).not.toBe(first);
    lateCallback?.();
    browser.kakao.maps = sdk;
    scripts[1]!.dispatchEvent(new Event("load"));
    await expect(retry).resolves.toBe(sdk);
  });

  it("fails safely when a script loads but does not provide the SDK", async () => {
    const { scripts } = mockBrowser();
    const { loadKakaoMapsSdk } = await import("./kakao-sdk");
    const result = expect(loadKakaoMapsSdk()).rejects.toMatchObject({ code: "unavailable" });
    scripts[0]!.dispatchEvent(new Event("load"));
    await result;
    expect(scripts[0]!.removed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("delivery map point validation", () => {
  it.each([null, undefined, { latitude: NaN, longitude: 127 }, { latitude: 36, longitude: Infinity }, { latitude: 91, longitude: 127 }, { latitude: 36, longitude: 181 }])("rejects missing or invalid point %j", (point) => {
    expect(isDeliveryMapPoint(point)).toBe(false);
  });

  it("accepts real numeric coordinates without inventing a fallback", () => {
    expect(isDeliveryMapPoint({ latitude: 36.351, longitude: 127.381 })).toBe(true);
  });
});

describe("single delivery-point map controller", () => {
  const point = { latitude: 36.35, longitude: 127.38 };
  function setup(editable = false) {
    const fixture = mockSdk();
    const container = { replaceChildren: vi.fn() };
    const onMarkerClick = vi.fn();
    const onPointChange = vi.fn();
    const controller = createDeliveryPointMap({
      container: container as unknown as HTMLElement,
      sdk: fixture.sdk,
      point,
      name: "지도 테스트 거래처",
      editable,
      interactive: editable,
      onMarkerClick,
      onPointChange,
    });
    return { ...fixture, container, onMarkerClick, onPointChange, controller };
  }

  it("creates one centered marker and exposes only a name as its title", () => {
    const { maps } = setup();
    expect(maps.Map).toHaveBeenCalledTimes(1);
    expect(maps.Marker).toHaveBeenCalledTimes(1);
    const markerOptions = (maps.Marker.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]![0];
    expect(Object.keys(markerOptions).sort()).toEqual(["clickable", "draggable", "map", "position", "title"]);
    expect(markerOptions.title).toBe("지도 테스트 거래처");
    expect((markerOptions.position as KakaoLatLng).getLat()).toBe(point.latitude);
    expect((markerOptions.position as KakaoLatLng).getLng()).toBe(point.longitude);
  });

  it("moves the same marker when selection changes and recenters without recreating it", () => {
    const { maps, marker, map, controller } = setup();
    controller.update({ latitude: 36.37, longitude: 127.4 });
    expect(marker.setPosition).toHaveBeenCalledTimes(1);
    expect(map.setCenter).toHaveBeenCalledTimes(1);
    controller.recenter();
    expect(map.setCenter).toHaveBeenCalledTimes(2);
    expect(maps.Marker).toHaveBeenCalledTimes(1);
    expect(marker.setPosition.mock.calls[0]![0].getLat()).toBe(36.37);
    controller.update({ latitude: 36.37, longitude: 127.4 });
    expect(marker.setPosition).toHaveBeenCalledTimes(1);
  });

  it("supports zoom controls, scroll-safe interaction toggle and view-preserving relayout", () => {
    const { map, controller } = setup();
    controller.zoom("in");
    expect(map.setLevel).toHaveBeenLastCalledWith(2);
    controller.zoom("out");
    expect(map.setLevel).toHaveBeenLastCalledWith(4);
    map.getLevel.mockReturnValue(1);
    controller.zoom("in");
    expect(map.setLevel).toHaveBeenLastCalledWith(1);
    map.getLevel.mockReturnValue(14);
    controller.zoom("out");
    expect(map.setLevel).toHaveBeenLastCalledWith(14);
    controller.setInteractive(true);
    expect(map.setDraggable).toHaveBeenLastCalledWith(true);
    expect(map.setZoomable).toHaveBeenLastCalledWith(true);
    controller.relayout();
    expect(map.relayout).toHaveBeenCalledTimes(1);
    expect(map.setCenter).toHaveBeenLastCalledWith(map.getCenter.mock.results[0]!.value);
  });

  it("opens app-owned info on marker click without allowing staff map edits", () => {
    const { maps, onMarkerClick, onPointChange } = setup();
    expect(maps.event.addListener).toHaveBeenCalledTimes(1);
    const [, event, listener] = maps.event.addListener.mock.calls[0]!;
    expect(event).toBe("click");
    listener();
    expect(onMarkerClick).toHaveBeenCalledOnce();
    expect(onPointChange).not.toHaveBeenCalled();
  });

  it("emits numeric coordinates for administrator marker drag and map click", () => {
    const { maps, marker, map, LatLng, onPointChange } = setup(true);
    const drag = maps.event.addListener.mock.calls.find(([target, event]) => target === marker && event === "dragend");
    drag?.[2]();
    expect(onPointChange).toHaveBeenLastCalledWith({ latitude: 36.361, longitude: 127.391 });
    const click = maps.event.addListener.mock.calls.find(([target, event]) => target === map && event === "click");
    click?.[2]({ latLng: new LatLng(36.39, 127.42) });
    expect(onPointChange).toHaveBeenLastCalledWith({ latitude: 36.39, longitude: 127.42 });
  });

  it("does not accidentally move the editable pin while the page-scroll lock is enabled", () => {
    const { maps, marker, map, LatLng, onPointChange, controller } = setup(true);
    controller.setInteractive(false);
    expect(marker.setDraggable).toHaveBeenLastCalledWith(false);
    const click = maps.event.addListener.mock.calls.find(([target, event]) => target === map && event === "click");
    click?.[2]({ latLng: new LatLng(36.39, 127.42) });
    expect(onPointChange).not.toHaveBeenCalled();
    controller.setInteractive(true);
    expect(marker.setDraggable).toHaveBeenLastCalledWith(true);
    click?.[2]({ latLng: new LatLng(36.39, 127.42) });
    expect(onPointChange).toHaveBeenCalledOnce();
  });

  it("cleans every listener and marker once and ignores stale callbacks after unmount", () => {
    const { maps, marker, container, onPointChange, onMarkerClick, controller, map } = setup(true);
    const oldCallbacks = [...maps.event.addListener.mock.calls];
    controller.destroy();
    controller.destroy();
    expect(maps.event.removeListener).toHaveBeenCalledTimes(3);
    expect(marker.setMap).toHaveBeenCalledExactlyOnceWith(null);
    expect(container.replaceChildren).toHaveBeenCalledOnce();
    for (const [, , listener] of oldCallbacks) listener();
    controller.update({ latitude: 36.36, longitude: 127.39 });
    controller.recenter();
    controller.relayout();
    controller.zoom("in");
    expect(onPointChange).not.toHaveBeenCalled();
    expect(onMarkerClick).not.toHaveBeenCalled();
    expect(map.setCenter).not.toHaveBeenCalled();
    expect(map.relayout).not.toHaveBeenCalled();
    expect(map.setLevel).not.toHaveBeenCalled();
  });

  it("subscribes to official tilesloaded events and ignores tile completions after disposal", () => {
    const { sdk, maps, map } = mockSdk();
    const onTilesLoaded = vi.fn();
    const controller = createDeliveryPointMap({
      container: { replaceChildren: vi.fn() } as unknown as HTMLElement,
      sdk, point, name: "지도 테스트 거래처", onTilesLoaded,
    });
    const loaded = maps.event.addListener.mock.calls.find(([target, name]) => target === map && name === "tilesloaded");
    loaded?.[2]();
    expect(onTilesLoaded).toHaveBeenCalledOnce();
    controller.destroy();
    loaded?.[2]();
    expect(onTilesLoaded).toHaveBeenCalledOnce();
    expect(maps.event.removeListener).toHaveBeenCalledWith(map, "tilesloaded", loaded?.[2]);
  });
});

describe("cached initial map tiles", () => {
  function box(width = 256, height = 256, left = 0) {
    return { width, height, left, right: left + width, top: 0, bottom: height };
  }
  function tile(overrides: Record<string, unknown> = {}) {
    return { complete: true, naturalWidth: 256, naturalHeight: 256, getBoundingClientRect: () => box(), ...overrides };
  }
  function canvas(images: unknown[], width = 320) {
    return { querySelectorAll: () => images, getBoundingClientRect: () => box(width, 240) } as unknown as HTMLElement;
  }

  it("accepts already loaded visible square tiles without depending on another load event", () => {
    expect(hasLoadedMapTiles(canvas([tile(), tile({ getBoundingClientRect: () => box(256, 256, 256) })]))).toBe(true);
  });
  it("does not mistake a marker, attribution, missing images or hidden canvas for loaded tiles", () => {
    expect(hasLoadedMapTiles(canvas([]))).toBe(false);
    expect(hasLoadedMapTiles(canvas([tile({ getBoundingClientRect: () => box(40, 44) })]))).toBe(false);
    expect(hasLoadedMapTiles(canvas([tile({ getBoundingClientRect: () => box(180, 36) })]))).toBe(false);
    expect(hasLoadedMapTiles(canvas([tile()], 0))).toBe(false);
  });
  it("requires every visible tile to finish successfully but ignores retired offscreen tiles", () => {
    expect(hasLoadedMapTiles(canvas([tile(), tile({ complete: false })]))).toBe(false);
    expect(hasLoadedMapTiles(canvas([tile(), tile({ naturalWidth: 0 })]))).toBe(false);
    expect(hasLoadedMapTiles(canvas([tile(), tile({ naturalWidth: 0, getBoundingClientRect: () => box(256, 256, 700) })]))).toBe(true);
  });
});
