export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-28.1",
  date: "2026-11-28",
  changes: [
    { title: "카메라로 새 품목 등록", text: "재고에서 AI 스캔 등록을 누르고 포장이나 상자를 찍어보세요. 읽은 내용을 고치고 실제 입고 수량을 확인한 뒤 저장할 수 있어요." },
    { title: "바코드로 품목 찾기", text: "연결해 둔 바코드는 기존 품목으로 입고할 수 있어요. 처음 보는 제품은 바코드나 제품명으로 식품안전나라 후보를 확인하세요." },
  ],
};
