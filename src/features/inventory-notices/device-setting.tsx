"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { changeDevice, deviceEnabled, pushAvailable } from "./device-push";

export function DeviceSetting({ channel }: { channel: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const supported = pushAvailable();
  useEffect(() => {
    let active = true;
    void deviceEnabled(channel)
      .then((value) => {
        if (active) setEnabled(value);
      })
      .catch(() => {
        if (active) setMessage("기기 알림 설정을 확인해주세요.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [channel]);
  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      await changeDevice(channel, !enabled);
      setEnabled(!enabled);
    } catch {
      setMessage(
        Notification.permission === "denied"
          ? "브라우저의 사이트 설정에서 알림을 허용해주세요."
          : "저장하지 못했어요. 알림 권한과 연결 상태를 확인하고 다시 시도해주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <span className="settings-list__icon">
        <Icon name="bell" />
      </span>
      <span>
        <strong>이 기기에서 알림 받기</strong>
        <small role="status">
          {message ||
            (supported
              ? "앱을 닫아도 상품명과 변경 수량을 받습니다. 잠금 화면 표시는 기기 설정을 따릅니다."
              : "지원되는 브라우저로 열어주세요. iPhone은 홈 화면에 추가한 급식길에서 켤 수 있어요.")}
        </small>
      </span>
      <button
        type="button"
        className="pwa-install-action"
        role="switch"
        aria-label="이 기기에서 알림 받기"
        aria-checked={enabled}
        disabled={busy || !supported}
        onClick={() => void toggle()}
      >
        {enabled ? "켜짐" : "꺼짐"}
      </button>
    </div>
  );
}
