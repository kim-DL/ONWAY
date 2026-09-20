"use client";

import { useEffect, useRef, useState } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";

import {
  createDeliveryPointMap,
  hasLoadedMapTiles,
  isDeliveryMapPoint,
  KakaoSdkError,
  loadKakaoMapsSdk,
  type DeliveryMapPoint,
  type DeliveryPointMapController,
} from "./kakao-sdk";
import styles from "./customer-map.module.css";

const INITIAL_TILES_TIMEOUT_MS = 15_000;

export interface CustomerMapProps {
  point: DeliveryMapPoint | null;
  name: string;
  editable?: boolean;
  hideHeading?: boolean;
  onPointChange?: (point: DeliveryMapPoint) => void;
  onMarkerClick?: () => void;
}

export function CustomerMap(props: CustomerMapProps) {
  if (!isDeliveryMapPoint(props.point)) {
    return (
      <div className={styles.empty} role="status">
        <Icon name="location" size={26} />
        <strong>실제 납품 위치가 등록되지 않았습니다.</strong>
      </div>
    );
  }
  return <InteractiveCustomerMap key={`${props.name}:${Boolean(props.editable)}`} {...props} point={props.point} />;
}

function InteractiveCustomerMap({
  point, name, editable = false, hideHeading = false, onPointChange, onMarkerClick,
}: CustomerMapProps & { point: DeliveryMapPoint }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<DeliveryPointMapController | null>(null);
  const callbacksRef = useRef({ onPointChange, onMarkerClick });
  const pointRef = useRef(point);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "configuration">("loading");
  const [tileStatus, setTileStatus] = useState<"checking" | "ready" | "slow">("checking");
  const [attempt, setAttempt] = useState(0);
  const [interactive, setInteractive] = useState(editable);

  useEffect(() => { callbacksRef.current = { onPointChange, onMarkerClick }; }, [onPointChange, onMarkerClick]);
  useEffect(() => {
    pointRef.current = point;
    controllerRef.current?.update(point);
  }, [point]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let active = true;
    let controller: DeliveryPointMapController | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let tileObserver: MutationObserver | null = null;
    let frame = 0;
    let tileTimer: ReturnType<typeof setTimeout> | undefined;
    let visibleSince: number | null = null;
    let remaining = INITIAL_TILES_TIMEOUT_MS;
    let tilesReady = false;
    let tileWarningShown = false;

    function finishTiles() {
      if (!active || tilesReady) return;
      tilesReady = true;
      clearTimeout(tileTimer);
      tileObserver?.disconnect();
      container?.removeEventListener("load", checkTiles, true);
      setTileStatus("ready");
    }

    function checkTiles() {
      if (!active || !controller || tilesReady || !container) return;
      clearTimeout(tileTimer);
      const now = performance.now();
      if (visibleSince !== null) remaining = Math.max(0, remaining - (now - visibleSince));
      visibleSince = null;
      // A closed sheet/background tab must not consume the initial loading deadline.
      if (document.visibilityState !== "visible" || container.clientWidth <= 0 || container.clientHeight <= 0) return;
      if (hasLoadedMapTiles(container)) {
        finishTiles();
        return;
      }
      if (tileWarningShown) return;
      if (remaining <= 0) {
        tileWarningShown = true;
        setTileStatus("slow");
        return;
      }
      visibleSince = now;
      tileTimer = setTimeout(checkTiles, remaining);
    }

    function relayout() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (active && container && container.clientWidth > 0 && container.clientHeight > 0) controller?.relayout();
        checkTiles();
      });
    }
    function onVisibility() {
      checkTiles();
      if (document.visibilityState === "visible") relayout();
    }

    void loadKakaoMapsSdk().then((sdk) => {
      if (!active) return;
      controller = createDeliveryPointMap({
        container,
        sdk,
        point: pointRef.current,
        name,
        editable,
        interactive: editable,
        onPointChange: (next) => callbacksRef.current.onPointChange?.(next),
        onMarkerClick: () => callbacksRef.current.onMarkerClick?.(),
        onTilesLoaded: finishTiles,
      });
      controllerRef.current = controller;
      if (!tilesReady) {
        container.addEventListener("load", checkTiles, true);
        tileObserver = new MutationObserver(checkTiles);
        tileObserver.observe(container, { childList: true, subtree: true });
      }
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(relayout);
        resizeObserver.observe(container);
      }
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("resize", relayout);
      relayout();
      setStatus("ready");
      checkTiles();
    }).catch((error: unknown) => {
      if (!active) return;
      clearTimeout(tileTimer);
      tileObserver?.disconnect();
      container.removeEventListener("load", checkTiles, true);
      controller?.destroy();
      container.replaceChildren();
      controllerRef.current = null;
      setStatus(error instanceof KakaoSdkError && error.code === "configuration" ? "configuration" : "error");
    });

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      clearTimeout(tileTimer);
      resizeObserver?.disconnect();
      tileObserver?.disconnect();
      container.removeEventListener("load", checkTiles, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", relayout);
      controller?.destroy();
      controllerRef.current = null;
    };
  }, [attempt, editable, name]);

  function toggleInteraction() {
    const next = !interactive;
    setInteractive(next);
    controllerRef.current?.setInteractive(next);
  }

  function retryMap() {
    setStatus("loading");
    setTileStatus("checking");
    setInteractive(editable);
    setAttempt((value) => value + 1);
  }

  return (
    <section aria-label={`${name} 납품 지점 지도`} className={styles.mapSection}>
      {!hideHeading ? <header className={styles.heading}>
        <strong><Icon name="location" size={18} />실제 납품 지점</strong>
        {onMarkerClick ? <GlassButton compact onClick={onMarkerClick} variant="quiet">핀 정보</GlassButton> : null}
      </header> : null}
      <div className={styles.frame}>
        <div
          aria-label="카카오 지도"
          className={styles.canvas}
          data-customer-map-canvas
          data-interactive={interactive}
          ref={containerRef}
          role="region"
        />
        {status !== "ready" ? (
          <div className={styles.status} role="status" aria-live="polite">
            <Icon name={status === "loading" ? "location" : "wifi-off"} size={26} />
            <strong>{status === "loading" ? "지도를 불러오고 있어요." : status === "configuration" ? "지도 연결 설정이 필요합니다." : "지도를 불러오지 못했습니다."}</strong>
            {status !== "loading" ? <span>거래처 정보와 전화는 계속 이용할 수 있어요.</span> : null}
            {status === "error" ? (
              <GlassButton compact onClick={retryMap}>
                <Icon name="refresh" size={16} />지도 다시 불러오기
              </GlassButton>
            ) : null}
          </div>
        ) : null}
      </div>
      {status === "ready" && tileStatus === "slow" ? (
        <div className={styles.tileNotice} role="status" aria-live="polite">
          <span><strong>지도 표시가 지연되고 있어요.</strong>거래처 정보와 전화는 계속 이용할 수 있어요.</span>
          <GlassButton compact onClick={retryMap} variant="quiet"><Icon name="refresh" size={16} />지도 다시 불러오기</GlassButton>
        </div>
      ) : null}
      <div className={styles.controls} role="group" aria-label="지도 조작 도구">
        <GlassButton
          aria-label="지도 직접 조작"
          aria-pressed={interactive}
          compact disabled={status !== "ready"} onClick={toggleInteraction}
          variant={interactive ? "primary" : "glass"}
        >{interactive ? <Icon name="check" size={16} /> : null}지도 조작</GlassButton>
        <div className={styles.zoomControls}>
          <GlassButton aria-label="지도 확대" compact disabled={status !== "ready"} onClick={() => controllerRef.current?.zoom("in")}>
            <Icon name="plus" size={19} />
          </GlassButton>
          <GlassButton aria-label="지도 축소" compact disabled={status !== "ready"} onClick={() => controllerRef.current?.zoom("out")}>
            <span aria-hidden="true">−</span>
          </GlassButton>
        </div>
        <GlassButton aria-label="납품 지점으로 지도 이동" compact disabled={status !== "ready"} onClick={() => controllerRef.current?.recenter()}>
          <Icon name="location" size={17} />납품 지점
        </GlassButton>
        {hideHeading && onMarkerClick ? <GlassButton compact onClick={onMarkerClick} variant="quiet">핀 정보</GlassButton> : null}
      </div>
      {editable ? <p className={styles.hint}>핀을 끌거나 지도를 눌러 물건을 내릴 지점을 맞춰주세요.</p> : null}
    </section>
  );
}
