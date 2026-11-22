export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-22.6",
  date: "2026-11-22",
  changes: [
    { title: "목록에서 바로 보는 재고 변경", text: "다른 직원의 입고·출고·조정 알림을 받으면 해당 상품의 최신 수량이 목록에 자동으로 반영돼요." },
    { title: "수량이 비치는 새 품목 버튼", text: "목록이 화면 아래까지 이어져요. 스크롤하면 재고 수량이 오른쪽 아래 유리 버튼을 그대로 통과해 보여요." },
  ],
};
