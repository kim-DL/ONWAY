import { useState } from "react";
import { createRoot } from "react-dom/client";
import { InventoryProductEditorImpl } from "../../../src/features/inventory/inventory-product-editor";
import { InventoryMovementForm } from "../../../src/features/inventory/inventory-forms";
import { detail, product } from "./inventory-packaging-data";

function App() {
  const [screen, setScreen] = useState("");
  const close = () => setScreen("");
  return <main className="workspace-shell" data-mode="inventory" style={{ padding: 20 }}><h1>박스 수량 입력 검증</h1><p>가상 상품 · 운영 연결 없음</p>
    {[["new", "새 품목 등록"], ["edit", "품목 정보 수정"], ["receive", "입고"], ["issue", "출고"], ["adjust", "수량 조정"], ["transfer", "이동"]].map(([value, label]) => <button key={value} onClick={() => setScreen(value!)}>{label}</button>)}
    {screen === "new" || screen === "edit" ? <InventoryProductEditorImpl product={screen === "edit" ? product : null} location="freezer1" onClose={close} onSaved={close} />
      : screen ? <InventoryMovementForm detail={detail} location="freezer1" kind={screen as "receive" | "issue" | "adjust" | "transfer"} onClose={close} onSaved={close} /> : null}
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
