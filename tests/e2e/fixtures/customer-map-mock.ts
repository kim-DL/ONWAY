/** Test-only Kakao contract mock. It must never be imported by application code. */
export function installCustomerMapMock(mockOptions: { tiles?: "ready" | "missing" | "cached"; readyAfterMs?: number } = {}) {
  type Point = { getLat(): number; getLng(): number };
  type Handler = (event?: { latLng?: Point }) => void;
  type Target = { listeners: Map<string, Set<Handler>> };
  class LatLng {
    constructor(private latitude: number, private longitude: number) {}
    getLat() { return this.latitude; }
    getLng() { return this.longitude; }
  }
  function emit(target: Target, name: string, event?: { latLng?: Point }) {
    for (const listener of target.listeners.get(name) ?? []) listener(event);
  }
  class MapInstance {
    listeners = new Map<string, Set<Handler>>();
    center: Point;
    level: number;
    constructor(readonly container: HTMLElement, options: { center: Point; level: number; draggable: boolean; scrollwheel: boolean }) {
      this.center = options.center;
      this.level = options.level;
      container.dataset.mockMap = "ready";
      container.dataset.mockRelayouts = "0";
      this.setCenter(options.center);
      this.setLevel(options.level);
      this.setDraggable(options.draggable);
      this.setZoomable(options.scrollwheel);
      container.addEventListener("click", () => emit(this, "click", { latLng: new LatLng(this.center.getLat() + .001, this.center.getLng() + .001) }));
      container.addEventListener("mock-tilesloaded", () => emit(this, "tilesloaded"));
      if (mockOptions.tiles === "cached") {
        const tile = document.createElement("img");
        tile.alt = "";
        tile.width = tile.height = 256;
        tile.style.cssText = "position:absolute;left:0;top:0;width:256px;height:256px;pointer-events:none;";
        tile.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eef2f6"/></svg>');
        container.appendChild(tile);
      } else if (mockOptions.tiles !== "missing") {
        setTimeout(() => emit(this, "tilesloaded"), mockOptions.readyAfterMs ?? 0);
      }
    }
    setCenter(point: Point) {
      this.center = point;
      this.container.dataset.mockCenter = `${point.getLat()},${point.getLng()}`;
    }
    getCenter() { return this.center; }
    setLevel(level: number) { this.level = level; this.container.dataset.mockLevel = String(level); }
    getLevel() { return this.level; }
    setDraggable(value: boolean) { this.container.dataset.mockDraggable = String(value); }
    setZoomable(value: boolean) { this.container.dataset.mockZoomable = String(value); }
    relayout() { this.container.dataset.mockRelayouts = String(Number(this.container.dataset.mockRelayouts) + 1); }
  }
  class MarkerInstance {
    listeners = new Map<string, Set<Handler>>();
    point: Point;
    element: HTMLButtonElement;
    constructor(options: { map: MapInstance; position: Point; title: string }) {
      this.point = options.position;
      this.element = document.createElement("button");
      this.element.type = "button";
      this.element.dataset.mockMarker = "true";
      this.element.setAttribute("aria-label", "지도 핀");
      this.element.title = options.title;
      this.element.textContent = "📍";
      this.element.style.cssText = "position:absolute;left:45%;top:40%;width:44px;height:44px;font-size:26px;background:white;border:1px solid #ddd;border-radius:10px;";
      this.element.addEventListener("click", (event) => { event.stopPropagation(); emit(this, "click"); });
      options.map.container.appendChild(this.element);
      this.setPosition(options.position);
    }
    setPosition(point: Point) { this.point = point; this.element.dataset.mockPosition = `${point.getLat()},${point.getLng()}`; }
    getPosition() { return this.point; }
    setMap(map: MapInstance | null) { if (!map) this.element.remove(); }
    setDraggable(value: boolean) { this.element.dataset.mockDraggable = String(value); }
  }
  const sdk = {
    LatLng, Map: MapInstance, Marker: MarkerInstance,
    load(callback: () => void) { callback(); },
    event: {
      addListener(target: Target, name: string, handler: Handler) {
        if (!target.listeners.has(name)) target.listeners.set(name, new Set());
        target.listeners.get(name)!.add(handler);
      },
      removeListener(target: Target, name: string, handler: Handler) { target.listeners.get(name)?.delete(handler); },
    },
  };
  Object.assign(window, { kakao: { maps: sdk } });
}
