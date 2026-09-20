export interface DeliveryMapPoint {
  latitude: number;
  longitude: number;
}

export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

export interface KakaoMapInstance {
  setCenter(point: KakaoLatLng): void;
  getCenter(): KakaoLatLng;
  setLevel(level: number): void;
  getLevel(): number;
  setDraggable(enabled: boolean): void;
  setZoomable(enabled: boolean): void;
  relayout(): void;
}

export interface KakaoMarkerInstance {
  setPosition(point: KakaoLatLng): void;
  getPosition(): KakaoLatLng;
  setMap(map: KakaoMapInstance | null): void;
  setDraggable(enabled: boolean): void;
}

type MapListener = (event?: { latLng?: KakaoLatLng }) => void;

export interface KakaoMapsSdk {
  load(callback: () => void): void;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  Map: new (container: HTMLElement, options: {
    center: KakaoLatLng;
    level: number;
    draggable: boolean;
    scrollwheel: boolean;
    tileAnimation: boolean;
    keyboardShortcuts: boolean;
  }) => KakaoMapInstance;
  Marker: new (options: {
    map: KakaoMapInstance;
    position: KakaoLatLng;
    title: string;
    draggable: boolean;
    clickable: boolean;
  }) => KakaoMarkerInstance;
  event: {
    addListener(target: object, event: string, listener: MapListener): void;
    removeListener(target: object, event: string, listener: MapListener): void;
  };
}

type KakaoWindow = Window & { kakao?: { maps?: Partial<KakaoMapsSdk> } };

export type KakaoSdkErrorCode = "configuration" | "network" | "timeout" | "unavailable";

export class KakaoSdkError extends Error {
  constructor(readonly code: KakaoSdkErrorCode) {
    // Only a fixed error code is retained; never expose a URL, key or customer data.
    super(`customer-map/${code}`);
    this.name = "KakaoSdkError";
  }
}

const SDK_SCRIPT_ID = "onnuriway-kakao-map-sdk";
const SDK_TIMEOUT_MS = 15_000;
let pendingSdk: Promise<KakaoMapsSdk> | null = null;

function isReady(maps: Partial<KakaoMapsSdk> | undefined): maps is KakaoMapsSdk {
  return typeof maps?.Map === "function"
    && typeof maps.LatLng === "function"
    && typeof maps.Marker === "function"
    && typeof maps.event?.addListener === "function"
    && typeof maps.event?.removeListener === "function";
}

/** One shared SDK request survives concurrent mounts; a failed request can be retried. */
export function loadKakaoMapsSdk(): Promise<KakaoMapsSdk> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new KakaoSdkError("unavailable"));
  }
  const kakaoWindow = window as KakaoWindow;
  if (pendingSdk) return pendingSdk;
  if (isReady(kakaoWindow.kakao?.maps)) return Promise.resolve(kakaoWindow.kakao.maps);

  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY?.trim();
  if (!key) return Promise.reject(new KakaoSdkError("configuration"));

  const request = new Promise<KakaoMapsSdk>((resolve, reject) => {
    let settled = false;
    let bootstrapStarted = false;
    let bootstrapMaps: Partial<KakaoMapsSdk> | undefined;
    const existing = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    function finish(error?: KakaoSdkError) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (error) {
        script.remove();
        // The SDK's failed bootstrap otherwise keeps an unresolvable load queue.
        // Do not touch an unrelated SDK or a namespace that has become ready.
        if (bootstrapMaps && kakaoWindow.kakao?.maps === bootstrapMaps && !isReady(bootstrapMaps)) {
          delete kakaoWindow.kakao.maps;
        }
        reject(error);
      } else if (isReady(kakaoWindow.kakao?.maps)) {
        resolve(kakaoWindow.kakao.maps);
      } else {
        script.remove();
        reject(new KakaoSdkError("unavailable"));
      }
    }

    function onLoad() {
      if (settled || bootstrapStarted) return;
      bootstrapMaps = kakaoWindow.kakao?.maps;
      if (isReady(bootstrapMaps)) {
        finish();
        return;
      }
      if (typeof bootstrapMaps?.load !== "function") {
        finish(new KakaoSdkError("unavailable"));
        return;
      }
      bootstrapStarted = true;
      try {
        bootstrapMaps.load(() => finish());
      } catch {
        finish(new KakaoSdkError("unavailable"));
      }
    }

    function onError() { finish(new KakaoSdkError("network")); }
    const timeout = setTimeout(() => finish(new KakaoSdkError("timeout")), SDK_TIMEOUT_MS);
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);

    if (typeof kakaoWindow.kakao?.maps?.load === "function") {
      onLoad();
    } else if (!existing) {
      script.id = SDK_SCRIPT_ID;
      script.async = true;
      script.referrerPolicy = "strict-origin-when-cross-origin";
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
      try {
        document.head.appendChild(script);
      } catch {
        finish(new KakaoSdkError("unavailable"));
      }
    }
  });
  pendingSdk = request.catch((error: unknown) => {
    pendingSdk = null;
    throw error;
  });
  return pendingSdk;
}

export function isDeliveryMapPoint(point: DeliveryMapPoint | null | undefined): point is DeliveryMapPoint {
  return Boolean(point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && point.latitude >= -90 && point.latitude <= 90
    && point.longitude >= -180 && point.longitude <= 180);
}

/** A cached map may not emit tilesloaded. Inspect rendered images, never SDK internals. */
export function hasLoadedMapTiles(container: HTMLElement): boolean {
  const bounds = container.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  const tiles = Array.from(container.querySelectorAll("img")).filter((image) => {
    const box = image.getBoundingClientRect();
    // Square map tiles are larger than the marker and attribution images.
    return box.width >= 128 && box.height >= 128 && Math.abs(box.width - box.height) <= 2
      && box.right > bounds.left && box.left < bounds.right && box.bottom > bounds.top && box.top < bounds.bottom;
  });
  return tiles.length > 0 && tiles.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

export interface DeliveryPointMapController {
  update(point: DeliveryMapPoint): void;
  setInteractive(interactive: boolean): void;
  recenter(): void;
  zoom(direction: "in" | "out"): void;
  relayout(): void;
  destroy(): void;
}

/** This boundary intentionally accepts no password, contact, address or customer document. */
export function createDeliveryPointMap({
  container,
  sdk,
  point,
  name,
  editable = false,
  interactive = false,
  onPointChange,
  onMarkerClick,
  onTilesLoaded,
}: {
  container: HTMLElement;
  sdk: KakaoMapsSdk;
  point: DeliveryMapPoint;
  name: string;
  editable?: boolean;
  interactive?: boolean;
  onPointChange?: (point: DeliveryMapPoint) => void;
  onMarkerClick?: () => void;
  onTilesLoaded?: () => void;
}): DeliveryPointMapController {
  if (!isDeliveryMapPoint(point)) throw new KakaoSdkError("unavailable");
  let selected = new sdk.LatLng(point.latitude, point.longitude);
  const map = new sdk.Map(container, {
    center: selected,
    level: 3,
    draggable: interactive,
    scrollwheel: interactive,
    tileAnimation: false,
    keyboardShortcuts: false,
  });
  const marker = new sdk.Marker({
    map,
    position: selected,
    title: name,
    draggable: editable && interactive,
    clickable: true,
  });
  const listeners: Array<{ target: object; event: string; callback: MapListener }> = [];
  let disposed = false;
  let isInteractive = interactive;

  function listen(target: object, event: string, callback: MapListener) {
    sdk.event.addListener(target, event, callback);
    listeners.push({ target, event, callback });
  }

  function selectEditedPoint(position: KakaoLatLng) {
    const next = { latitude: position.getLat(), longitude: position.getLng() };
    if (disposed || !isInteractive || !isDeliveryMapPoint(next)) return;
    selected = position;
    marker.setPosition(position);
    onPointChange?.(next);
  }

  listen(marker, "click", () => { if (!disposed) onMarkerClick?.(); });
  if (onTilesLoaded) listen(map, "tilesloaded", () => { if (!disposed) onTilesLoaded(); });
  if (editable) {
    listen(marker, "dragend", () => selectEditedPoint(marker.getPosition()));
    listen(map, "click", (event) => {
      if (event?.latLng) selectEditedPoint(event.latLng);
    });
  }

  return {
    update(next) {
      if (disposed || !isDeliveryMapPoint(next)) return;
      if (selected.getLat() === next.latitude && selected.getLng() === next.longitude) return;
      selected = new sdk.LatLng(next.latitude, next.longitude);
      marker.setPosition(selected);
      map.setCenter(selected);
    },
    setInteractive(enabled) {
      if (disposed) return;
      isInteractive = enabled;
      map.setDraggable(enabled);
      map.setZoomable(enabled);
      marker.setDraggable(editable && enabled);
    },
    recenter() {
      if (!disposed) map.setCenter(selected);
    },
    zoom(direction) {
      if (!disposed) map.setLevel(Math.max(1, Math.min(14, map.getLevel() + (direction === "in" ? -1 : 1))));
    },
    relayout() {
      if (disposed) return;
      const center = map.getCenter();
      map.relayout();
      map.setCenter(center);
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      for (const { target, event, callback } of listeners) sdk.event.removeListener(target, event, callback);
      marker.setMap(null);
      map.setDraggable(false);
      map.setZoomable(false);
      container.replaceChildren();
    },
  };
}
