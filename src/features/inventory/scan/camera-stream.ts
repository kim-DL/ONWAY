import { useEffect, useRef, useState, type RefObject } from "react";

type CameraStatus =
  | { kind: "opening" | "paused" }
  | { kind: "ready"; track: MediaStreamTrack }
  | { kind: "permission" | "unavailable"; message: string };

function cameraErrorStatus(error: unknown): CameraStatus {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return { kind: "permission", message: "촬영하려면 카메라 사용을 허용해주세요." };
  }
  return { kind: "unavailable", message: name === "NotReadableError"
    ? "다른 앱이 카메라를 사용 중이에요. 앱을 닫고 다시 열어주세요."
    : "카메라를 열 수 없어요. 기기 카메라나 앨범을 이용해주세요." };
}

export function useCameraStream(videoRef: RefObject<HTMLVideoElement | null>, onSuspend: () => void) {
  const [status, setStatus] = useState<CameraStatus>({ kind: "opening" });
  const start = useRef<() => void>(() => {});
  const stop = useRef<() => void>(() => {});
  const pauseStream = useRef<() => void>(() => {});
  useEffect(() => {
    let version = 0;
    let stream: MediaStream | null = null;
    const video = videoRef.current;
    function release() {
      version += 1;
      if (stream) {
        for (const track of stream.getTracks()) { track.onended = null; track.stop(); }
        stream = null;
      }
      if (video) { video.pause(); video.srcObject = null; }
    }
    function pause() {
      release();
      onSuspend();
      setStatus(current => current.kind === "permission" ? current : { kind: "paused" });
    }
    async function open() {
      release();
      if (document.hidden) { setStatus({ kind: "paused" }); return; }
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        setStatus({ kind: "unavailable", message: "기기 카메라로 촬영하거나 앨범에서 사진을 선택해주세요." });
        return;
      }
      const requested = version;
      setStatus({ kind: "opening" });
      try {
        const camera = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2400 }, height: { ideal: 1800 } },
        });
        if (requested !== version) { camera.getTracks().forEach((track) => track.stop()); return; }
        stream = camera;
        const [track] = camera.getVideoTracks();
        if (!track) throw new Error("영상 트랙이 없어요.");
        track.onended = pause;
        video.srcObject = camera;
        await video.play();
        if (requested === version) setStatus({ kind: "ready", track });
      } catch (error) {
        if (requested !== version) return;
        release();
        setStatus(cameraErrorStatus(error));
      }
    }
    const hide = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", pause);
    start.current = () => { void open(); };
    stop.current = release;
    pauseStream.current = pause;
    void open();
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", pause);
      start.current = () => {};
      stop.current = () => {};
      pauseStream.current = () => {};
      release();
    };
  }, [videoRef, onSuspend]);
  return { status, start, stop, pause: pauseStream };
}
