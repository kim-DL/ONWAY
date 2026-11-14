import { useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { SchoolPhoto } from "../../../src/domain/school";
import type { SalesHistoryPage } from "../../../src/features/sales-history/sales-history-repository";
import type { SalesHistoryCursor } from "../../../src/features/sales-history/sales-history-contract";
import { useSchoolPhoto } from "../../../src/features/school-detail/use-school-photo";
import { useSalesHistory } from "../../../src/features/sales-history/use-sales-history";

type PhotoResult = { blob: Blob; source: "network" };
type Pending<T> = { resolve: (value: T) => void; reject: (error: Error) => void };
type HistoryRequest = Pending<SalesHistoryPage> & { schoolId: string; cursor: SalesHistoryCursor | null };
declare global {
  interface Window {
    __asyncReadFixture: {
      photos: Pending<PhotoResult>[];
      history: HistoryRequest[];
      revoked: string[];
      photoFrames: Array<{ session: string; enabled: boolean; status: string; url: string | null }>;
      errors: string[];
      resolvePhoto: (index: number) => void;
      resolveHistory: (index: number, visitId: string, hasMore?: boolean) => void;
      rejectHistory: (index: number) => void;
    };
  }
}

const fixture: Window["__asyncReadFixture"] = {
  photos: [], history: [], revoked: [], photoFrames: [], errors: [],
  resolvePhoto(index) {
    this.photos[index]!.resolve({ blob: new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><path fill="purple" d="M0 0h4v4H0z"/></svg>'], { type: "image/svg+xml" }), source: "network" });
  },
  resolveHistory(index, visitId, hasMore=true) {
    this.history[index]!.resolve({
      visits: [{ visitId, visitedAt: new Date("2026-11-14T00:00:00Z") } as SalesHistoryPage["visits"][number]],
      cursor: hasMore ? { visitedAt: "2026-11-14T00:00:00Z", visitId } : null,
      hasMore,
    });
  },
  rejectHistory(index) { this.history[index]!.reject(new Error("synthetic delayed read failure")); },
};
window.__asyncReadFixture = fixture;
const photo = { schoolId: "SCHOOL", slotId: "01", currentVersionId: "VERSION" } as SchoolPhoto;

function PhotoConsumer({ session, enabled, copy }: { session: string; enabled: boolean; copy: number }) {
  const state = useSchoolPhoto({ ...photo, caption: `caption-${copy}` }, session, "original", enabled);
  useLayoutEffect(() => { fixture.photoFrames.push({ session, enabled, status: state.status, url: state.url }); });
  return <section aria-label="학교 사진"><output aria-label="사진 상태">{state.status}</output>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {state.status === "ready" ? <img src={state.url} alt="합성 학교 사진" onError={() => fixture.errors.push("broken photo URL")} /> : null}
  </section>;
}

function HistoryConsumer({ revision }: { revision: number }) {
  const history = useSalesHistory("SCHOOL", String(revision));
  const load = () => void history.loadMore().catch(error => fixture.errors.push(String(error)));
  return <section aria-label="방문 기록">
    <output aria-label="기록 상태">{history.status}</output>
    <output aria-label="기록 목록">{history.visits.map(item => item.visitId).join(",")}</output>
    <output aria-label="기록 커서">{history.cursor?.visitId ?? "none"}</output>
    <output aria-label="추가 요청 상태">{String(history.loadingMore)}</output>
    <output aria-label="다음 기록 여부">{String(history.hasMore)}</output>
    <button onClick={load}>기록 더 보기</button>
    <button onClick={() => { load(); load(); }}>연속 더 보기</button>
  </section>;
}

function App() {
  const [enabled, setEnabled] = useState(true);
  const [session, setSession] = useState("SESSION-1");
  const [copy, setCopy] = useState(0);
  const [revision, setRevision] = useState(0);
  const [visible, setVisible] = useState(true);
  return <main><h1>비동기 읽기 수명 검증</h1>
    <button onClick={() => setEnabled(value => !value)}>사진 확대 전환</button>
    <button onClick={() => setSession("SESSION-2")}>세션 변경</button>
    <button onClick={() => setCopy(value => value + 1)}>사진 설명 새로고침</button>
    <button onClick={() => setRevision(value => value + 1)}>방문 저장 후 갱신</button>
    <button onClick={() => setVisible(false)}>화면 닫기</button>
    {visible ? <><PhotoConsumer session={session} enabled={enabled} copy={copy} /><HistoryConsumer revision={revision} /></> : null}
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
