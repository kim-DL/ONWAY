import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { CustomerMap } from "../../../src/features/customers/customer-map";

function Fixture() {
  const [shown, setShown] = useState(true);
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>({ latitude: 36.35, longitude: 127.38 });
  const [editable, setEditable] = useState(false);
  const [pinOpened, setPinOpened] = useState(false);
  return (
    <main className="workspace-shell" data-mode="delivery" id="customer-map-fixture">
      <h1>거래처 지도 검증</h1>
      <div className="fixture-actions">
        <button onClick={() => setPoint({ latitude: 36.36, longitude: 127.39 })}>다른 납품지 선택</button>
        <button onClick={() => setPoint(null)}>좌표 없는 거래처</button>
        <button onClick={() => setEditable((value) => !value)}>지도 편집 전환</button>
        <button onClick={() => setShown((value) => !value)}>지도 표시 전환</button>
      </div>
      <p>출입비번 00123* · 담당자 010-1234-5678</p>
      <a href="tel:01012345678">담당자 전화</a>
      {shown ? <CustomerMap name="테스트 거래처" point={point} editable={editable} onPointChange={setPoint} onMarkerClick={() => setPinOpened(true)} /> : null}
      {pinOpened ? <p role="status">선택한 거래처 핵심 정보</p> : null}
      <output aria-label="좌표 변경 결과">{point ? `${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}` : "미등록"}</output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
