"use client";

import { useRef, useState, type ChangeEvent } from "react";

import { AdminDialog } from "@/features/admin/admin-dialog";

import { customerErrorMessage, customerRepository } from "./customer-repository";
import { customerImportManifestSchema, planCustomerImport, type CustomerImportEntry, type CustomerImportPlan } from "./customer-import-plan";

export default function CustomerImport({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<CustomerImportEntry[]>([]);
  const [plan, setPlan] = useState<CustomerImportPlan | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"ready" | "running" | "complete">("ready");
  const [message, setMessage] = useState("");
  const busy = useRef(false);

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file || busy.current) return;
    setEntries([]); setPlan(null); setProgress(0); setMessage(""); setPhase("ready");
    try {
      if (file.size > 1_000_000) throw new Error("파일이 너무 큽니다.");
      const parsed = customerImportManifestSchema.parse(JSON.parse(await file.text()));
      const fresh = await customerRepository.list();
      setEntries(parsed.entries);
      setPlan(planCustomerImport(parsed.entries, fresh));
    } catch {
      setMessage("등록 자료를 읽거나 최신 거래처 목록을 확인하지 못했습니다. 파일 형식과 연결 상태를 확인해주세요.");
    }
  };

  const start = async () => {
    if (!plan || busy.current || !plan.create.length) return;
    busy.current = true;
    setPhase("running");
    setMessage("");
    let completed = 0;
    try {
      const fresh = await customerRepository.list();
      const checked = planCustomerImport(entries, fresh);
      const ids = (value: CustomerImportEntry[]) => value.map((entry) => entry.sourceId).join(",");
      if (ids(checked.create) !== ids(plan.create) || ids(checked.existing) !== ids(plan.existing) || ids(checked.review) !== ids(plan.review)) {
        setPlan(checked);
        setPhase("ready");
        setMessage("거래처 목록이 바뀌었습니다. 대조 결과를 다시 확인한 뒤 등록을 시작해주세요.");
        return;
      }
      for (const entry of checked.create) {
        await customerRepository.save({ requestId: entry.requestId, customerId: null,
          expectedRevision: null, draft: entry.draft, clearNotice: false });
        completed += 1;
        setProgress(completed);
      }
      const verified = planCustomerImport(entries, await customerRepository.list());
      if (verified.create.length) throw new Error("등록 후 목록에서 확인되지 않은 항목이 있습니다.");
      setPlan(verified);
      setPhase("complete");
      setMessage(`${completed}곳을 등록하고 최신 목록에서 확인했습니다.`);
    } catch (error) {
      setMessage(`${completed}곳까지 저장 결과를 확인했습니다. ${customerErrorMessage(error)} 중복 방지를 위해 목록을 새로 확인한 뒤 재시도해주세요.`);
      setPhase("ready");
    } finally {
      busy.current = false;
    }
  };

  return <AdminDialog title="검토본 일괄 등록" eyebrow="확정된 거래처만 가져오며, 기존 정보는 수정하지 않습니다." onClose={onClose} busy={phase === "running"}>
    <p>검토본에서 만든 등록 자료(JSON)를 선택하세요. 업로드 서버에 파일을 보관하지 않고 현재 관리자 세션에서 기존 거래처와 대조합니다.</p>
    <label>등록 자료 선택 <input type="file" accept=".json,application/json" onChange={selectFile} disabled={phase === "running"} /></label>
    {plan ? <div role="status">
      <p>신규 등록 {plan.create.length}곳 · 이미 등록 {plan.existing.length}곳 · 대조 필요 {plan.review.length}곳</p>
      {plan.existing.length > 0 && <p>이미 등록: {plan.existing.map((entry) => entry.sourceId).join(", ")}</p>}
      {plan.review.length > 0 && <p>대조 필요: {plan.review.map((entry) => entry.sourceId).join(", ")}</p>}
      {phase === "running" && <p>등록 중: {progress} / {plan.create.length}</p>}
      {phase === "complete" && <p>등록 완료: {progress}곳</p>}
    </div> : null}
    {message && <p role={phase === "complete" ? "status" : "alert"}>{message}</p>}
    <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
      <button type="button" onClick={onClose} disabled={phase === "running"}>닫기</button>
      {phase === "ready" && plan && plan.create.length > 0 && <button type="button" onClick={() => void start()}>신규 {plan.create.length}곳 등록 시작</button>}
    </div>
  </AdminDialog>;
}
