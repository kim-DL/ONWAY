"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import { GlassButton } from "@/components/ui/glass-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { AdminDialog } from "./admin-dialog";
import { useAdminInteraction } from "./admin-interaction";
import { adminErrorMessage } from "./admin-repository";
import { googleAdminRepository, type GoogleAdminAccessData, type GoogleAdminEntry } from "./google-access-repository";
import styles from "./google-admin-access.module.css";

const statusLabels = { pending: "첫 로그인 대기", active: "사용 중", disabled: "해제됨" };
function errorMessage(error: unknown) {
  if (error instanceof FirebaseError && ["functions/already-exists", "functions/invalid-argument"].includes(error.code)) return error.message;
  return adminErrorMessage(error);
}

export function GoogleAdminAccess({ currentEmployeeId, onReload, refreshToken }: { currentEmployeeId: string; onReload: () => Promise<void>; refreshToken: string }) {
  const [data, setData] = useState<GoogleAdminAccessData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadedRefreshToken, setLoadedRefreshToken] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"register" | GoogleAdminEntry | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const generation = useRef(0);
  const requestId = useRef<string | null>(null);
  const interaction = useAdminInteraction();
  const { showToast } = useToast();
  const requestList = useCallback(() => {
    const ticket = ++generation.current;
    return googleAdminRepository.list().then((result) => {
      if (ticket === generation.current) { setData(result); setLoadError(""); }
    }).catch((failure: unknown) => {
      if (ticket === generation.current) setLoadError(errorMessage(failure));
    }).finally(() => {
      if (ticket === generation.current) { setLoading(false); setLoadedRefreshToken(refreshToken); }
    });
  }, [refreshToken]);
  const load = useCallback(() => { setLoading(true); return requestList(); }, [requestList]);
  useEffect(() => {
    void requestList();
    const requests = generation;
    return () => { ++requests.current; };
  }, [requestList]);
  const refreshing = loading || loadedRefreshToken !== refreshToken;

  const open = (next: "register" | GoogleAdminEntry) => {
    if (!interaction.canNavigate()) return;
    requestId.current = null;
    setError(""); setName(""); setEmail(""); setReason(""); setDialog(next);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || !data || !dialog) return;
    const release = interaction.begin();
    if (!release) return;
    pending.current = true; setSaving(true); setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const common = { expectedRevision: data.revision, requestId: requestId.current };
      if (dialog === "register") await googleAdminRepository.register({ ...common, email: email.trim(), displayName: name.trim() });
      else await googleAdminRepository.disable({ ...common, employeeId: dialog.employeeId, reason: reason.trim() });
      showToast(dialog === "register" ? "운영자 계정을 등록했습니다. 해당 Google 계정으로 로그인할 수 있습니다." : "운영자 접근 권한을 해제했습니다.");
      setDialog(null);
      await load();
      await onReload();
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof FirebaseError && failure.code === "functions/failed-precondition") {
        requestId.current = null;
        await load();
      }
    } finally {
      pending.current = false; setSaving(false); release();
    }
  };
  const edit = (setter: (value: string) => void, value: string) => {
    setter(value); requestId.current = null; setError("");
  };
  return (
    <div className={styles.access}>
      <div className={styles.heading}>
        <div><h2>Google 운영자</h2><p>등록한 Google 계정으로 로그인하면 운영 모드를 사용할 수 있습니다.</p></div>
        <GlassButton compact variant="primary" disabled={!data || refreshing || Boolean(loadError) || saving} onClick={() => open("register")}>운영자 등록</GlassButton>
      </div>
      {loadError ? <div className={styles.notice} role="alert"><p>운영자 목록을 갱신하지 못했습니다. {loadError}</p><GlassButton compact variant="quiet" onClick={() => void load()}>다시 불러오기</GlassButton></div> : null}
      {refreshing ? <p role="status">운영자 목록을 불러오는 중입니다.</p> : null}
      {data ? <ul className={styles.list} aria-label="Google 운영자 목록">{data.entries.map((entry) => (
        <li key={entry.employeeId}>
          <div><strong>{entry.displayName}{entry.employeeId === currentEmployeeId ? " · 나" : ""}</strong><span>{entry.email}</span></div>
          <StatusBadge tone={entry.status === "active" ? "info" : "neutral"}>{statusLabels[entry.status]}</StatusBadge>
          {entry.status !== "disabled" && entry.employeeId !== currentEmployeeId ? <button className={styles.remove} type="button" disabled={refreshing || Boolean(loadError) || saving} onClick={() => open(entry)} aria-label={`${entry.displayName} 운영 권한 해제`}>권한 해제</button> : null}
        </li>
      ))}</ul> : null}
      <p className={styles.help}>직원의 PIN 계정과 별도로 관리합니다. 본인 계정과 마지막 운영자의 접근 권한은 이곳에서 해제할 수 없습니다.</p>
      {dialog ? <AdminDialog title={dialog === "register" ? "Google 운영자 등록" : "운영 권한을 해제할까요?"} eyebrow="" onClose={() => setDialog(null)} busy={saving}>
        <form className="admin-dialog-body admin-form" onSubmit={(event) => void submit(event)}>
          {dialog === "register" ? <>
            <p>회사 운영을 맡을 책임자의 이름과 Google 로그인 이메일을 입력해주세요.</p>
            <label><span>이름</span><input name="operator-name" autoComplete="name" required minLength={2} maxLength={100} disabled={saving} value={name} onChange={(event) => edit(setName, event.target.value)} /></label>
            <label><span>Google 이메일</span><input name="operator-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} disabled={saving} value={email} onChange={(event) => edit(setEmail, event.target.value)} /></label>
            <p className="admin-field-help">등록된 계정의 첫 Google 로그인에서 본인을 확인합니다. 기존 직원의 로그인 상태는 유지됩니다.</p>
          </> : <>
            <p><strong>{dialog.displayName}</strong><br />{dialog.email}</p>
            <p>이 계정의 운영 접근과 기존 로그인이 종료됩니다. 다른 직원의 로그인에는 영향을 주지 않습니다.</p>
            <label><span>해제 사유</span><input name="disable-reason" required minLength={2} maxLength={200} disabled={saving} value={reason} onChange={(event) => edit(setReason, event.target.value)} /></label>
          </>}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <footer><GlassButton type="button" variant="quiet" disabled={saving} onClick={() => setDialog(null)}>취소</GlassButton><GlassButton type="submit" variant={dialog === "register" ? "primary" : "danger"} disabled={saving || (dialog === "register" ? name.trim().length < 2 || !email.trim() : reason.trim().length < 2)}>{saving ? "반영 중…" : dialog === "register" ? "계정 등록" : "권한 해제"}</GlassButton></footer>
        </form>
      </AdminDialog> : null}
    </div>
  );
}
