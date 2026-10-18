/* eslint-disable @next/next/no-img-element -- Synthetic inline image; this fixture must never contact a photo proxy. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { InventoryPhotoViewer } from "../../../src/features/inventory/inventory-photo-viewer";

function Fixture() {
  const [open, setOpen] = useState<HTMLElement | null>(null);
  const [shape, setShape] = useState("landscape");
  const [width, height] = shape === "portrait" ? [1800, 3000] : shape === "panorama" ? [3000, 300] : shape === "small" ? [320, 240] : [2400, 1800];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1200 900"><defs><pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="60" fill="#e8f2ec"/><path d="M60 0H0V60" fill="none" stroke="#8caba0" stroke-width="2"/></pattern></defs><rect width="1200" height="900" fill="url(#grid)"/><rect x="160" y="200" width="880" height="500" rx="30" fill="#fffaf0" stroke="#235c48" stroke-width="8"/><rect x="160" y="200" width="880" height="120" fill="#235c48"/><text x="220" y="280" fill="white" font-family="sans-serif" font-size="44">SAMPLE · INVENTORY PHOTO</text><text x="220" y="410" font-family="sans-serif" font-size="38">제품 라벨 확대 확인 · 합성 이미지</text><text x="220" y="490" font-family="sans-serif" font-size="28">EXP 2027.10.18 · LOT A-1234</text><text x="220" y="550" font-family="sans-serif" font-size="22">원재료 · 보관 방법 · 제조번호</text><path d="M230 600v55m10-55v55m18-55v55m8-55v55m20-55v55m10-55v55m24-55v55m8-55v55m14-55v55" stroke="#17352c" stroke-width="6"/></svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return <main style={{ padding: 24 }}><h1>재고 사진 Pan &amp; Zoom 검증</h1><p>실제 뷰어 컴포넌트와 합성 사진을 사용하는 로컬 검증 화면입니다.</p>
    <label>사진 비율 <select value={shape} onChange={(event) => setShape(event.target.value)}><option value="landscape">가로 사진</option><option value="portrait">세로 사진</option><option value="panorama">넓은 사진</option><option value="small">낮은 해상도</option></select></label>
    <p><button onClick={(event) => setOpen(event.currentTarget)} aria-label="샘플 제품 사진 크게 보기"><img src={url} alt="합성 제품 라벨" width="160" height="120" /></button></p>
    {open ? <InventoryPhotoViewer url={url} name="샘플" origin={open} onClose={() => setOpen(null)} onImageError={() => { throw Error("Synthetic image failed"); }} /> : null}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
