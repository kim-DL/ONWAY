"use client";

import { Icon } from "@/components/ui/icon";
import type { UpdateNotice } from "./app-updates";

export default function UpdateNoticeCard({ notice, onApply, onDismiss }: {
  notice: UpdateNotice; onApply: () => void; onDismiss: () => void;
}) {
  const installed = notice.kind === "installed";
  const busy = notice.kind === "applying";
  return <aside className="pwa-update" aria-labelledby="pwa-update-title" data-testid={installed ? "pwa-update-installed" : "pwa-update-ready"}>
    <header className="pwa-update__header">
      <span className="pwa-update__icon"><Icon name={installed ? "check" : "images"} size={23} /></span>
      <div>
        {notice.notes && <time dateTime={notice.notes.date}>{notice.notes.date.replaceAll("-", ". ")}</time>}
        <h2 id="pwa-update-title" aria-live="polite">{installed ? "급식길을 업데이트했어요" : "급식길 업데이트"}</h2>
      </div>
    </header>
    {notice.notes && <dl className="pwa-update__notes" aria-label="릴리스 노트">
      {notice.notes.changes.map((item) => <div key={item.title}><dt>{item.title}</dt><dd>{item.text}</dd></div>)}
    </dl>}
    {!installed && <p className="pwa-update__hint">작성 중인 내용을 저장한 뒤 업데이트해 주세요.</p>}
    <div className="pwa-update__actions">
      {!installed && <button type="button" className="pwa-update__later" disabled={busy} onClick={onDismiss}>나중에</button>}
      <button type="button" className="pwa-update__apply" disabled={busy} onClick={installed ? onDismiss : onApply}>
        <Icon name={installed ? "check" : "refresh"} size={17} />{installed ? "확인" : busy ? "적용 중…" : "지금 업데이트"}
      </button>
    </div>
  </aside>;
}
