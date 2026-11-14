"use client";

import { useRef, useState, type FormEvent } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { changeEmployeePin, pinChangeErrorMessage } from "./pin-change-repository";
import styles from "./pin-change.module.css";

export function PinChangeDialog({ isOnline, onClose }: { isOnline: boolean; onClose: () => void }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"editing" | "saving" | "saved">("editing");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const requestId = useRef<string | null>(null);

  const edit = (set: (value: string) => void, value: string) => {
    if (pending.current) return;
    set(value.replace(/\D/g, "").slice(0, 6));
    requestId.current = null;
    setError("");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || !isOnline) return;
    if (newPin !== confirmation) { setError("새 PIN이 서로 다릅니다. 다시 확인해주세요."); return; }
    if (newPin === currentPin) { setError("현재 PIN과 다른 번호를 입력해주세요."); return; }
    pending.current = true;
    setStatus("saving");
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      await changeEmployeePin({ currentPin, newPin, requestId: requestId.current });
      setCurrentPin(""); setNewPin(""); setConfirmation("");
      setStatus("saved");
    } catch (failure) {
      setError(pinChangeErrorMessage(failure));
      setStatus("editing");
    } finally {
      pending.current = false;
    }
  };
  return (
    <BottomSheet open title="PIN 변경" description="현재 로그인은 유지됩니다." dismissible={status !== "saving"} onClose={onClose}>
      {status === "saved" ? (
        <div className={styles.form} role="status">
          <p className={styles.result}>PIN을 변경했습니다.</p>
          <p className={styles.help}>다음 로그인부터 새 PIN을 사용해주세요.</p>
          <GlassButton variant="primary" onClick={onClose}>확인</GlassButton>
        </div>
      ) : (
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <p className={styles.help} id="pin-change-help">숫자 6자리를 사용해주세요. 같은 숫자의 반복이나 연속된 번호는 사용할 수 없습니다.</p>
          <fieldset disabled={status === "saving"} aria-describedby="pin-change-help">
            <label>현재 PIN<input autoComplete="current-password" name="current-pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={currentPin} onChange={(event) => edit(setCurrentPin, event.target.value)} /></label>
            <label>새 PIN<input autoComplete="new-password" name="new-pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={newPin} onChange={(event) => edit(setNewPin, event.target.value)} /></label>
            <label>새 PIN 확인<input autoComplete="new-password" name="confirm-pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={confirmation} onChange={(event) => edit(setConfirmation, event.target.value)} /></label>
          </fieldset>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {!isOnline ? <p className={styles.error} role="status">인터넷에 연결하면 PIN을 변경할 수 있습니다.</p> : null}
          <p className={styles.help}>현재 PIN을 잊으셨다면 운영자에게 임시 PIN 발급을 요청해주세요.</p>
          <GlassButton variant="primary" type="submit" disabled={!isOnline || status === "saving" || [currentPin, newPin, confirmation].some((value) => value.length !== 6)}>{status === "saving" ? "변경 중…" : "PIN 변경하기"}</GlassButton>
        </form>
      )}
    </BottomSheet>
  );
}
