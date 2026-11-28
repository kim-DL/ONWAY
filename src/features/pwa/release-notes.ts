export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-28.2",
  date: "2026-11-28",
  changes: [
    { title: "카메라 조준음과 AI 제품 추정", text: "제품을 비추고 촬영 버튼을 누르거나 길게 누르세요. AI가 포장 글씨와 제품 모양을 살펴보고 이름을 제안해요." },
    { title: "담당 보관 장소", text: "운영자가 재고 설정에서 담당자를 지정하면 스캔할 때 담당 장소가 먼저 선택돼요. 이번 입고 장소는 바꿀 수 있어요." },
  ],
};
