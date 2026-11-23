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
    { title: "앱 시작", text: "앱을 열면 온누리종합식품 로고와 로딩바가 보여요. 로그인 전에 내려받는 파일도 줄였어요." },
    { title: "거래처와 재고 목록", text: "마지막 확인 시각을 없애고 재고 목록을 더 빠르게 표시해요. 갱신에 실패하면 기존 정보를 보고 있다는 안내가 나와요." },
  ],
};
