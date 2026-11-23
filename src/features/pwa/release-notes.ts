export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-23.1",
  date: "2026-11-23",
  changes: [
    { title: "앱 시작", text: "작은 배송 지도와 함께 앱이 열려요. 첫 화면에서 받는 이미지와 스타일 파일을 가볍게 했어요." },
    { title: "거래처와 재고 목록", text: "마지막 확인 시각을 없애고 재고 목록을 더 빠르게 표시해요. 갱신에 실패하면 기존 정보를 보고 있다는 안내가 나와요." },
  ],
};
