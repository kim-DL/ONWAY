import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { CustomerPhotoPicker } from "../../../src/features/customers/customer-photo-picker";
import { InventoryPhotoPicker } from "../../../src/features/inventory/inventory-photo";
import { prepareCustomerPhoto } from "../../../src/features/customers/customer-photo-preparation";

function Fixture() {
  const inventory = document.documentElement.dataset.fixture === "inventory";
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [changes, setChanges] = useState(0);
  const [result, setResult] = useState("");
  function changed(next: File | null, removal = !next) { setFile(next); setRemoved(removal); setChanges((value) => value + 1); }
  return <main style={{ maxWidth: 520, padding: 16, margin: "auto", background: "white" }} data-reading={busy}>
    <h1>{inventory ? "제품 사진 등록" : "거래처 사진 등록"}</h1>
    {mounted ? inventory
      ? <InventoryPhotoPicker product={null} file={file} removed={removed} disabled={busy} onBusyChange={setBusy} onChange={changed} />
      : <CustomerPhotoPicker customer={null} file={file} removed={removed} disabled={busy} onReadingChange={setBusy} onChange={changed} />
      : <p>사진 선택 화면이 닫혔습니다.</p>}
    <button onClick={() => { setMounted((value) => !value); setBusy(false); }}>선택 화면 열기/닫기</button>
    <button disabled={!file || busy} onClick={() => { if (file) void prepareCustomerPhoto(file).then((prepared) => setResult(`${prepared.type}:${prepared.size}`)); }}>사진 저장 준비 확인</button>
    <output aria-label="검증용 변경 횟수">{changes}</output><output aria-label="검증용 사진 준비 결과">{result}</output>
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
