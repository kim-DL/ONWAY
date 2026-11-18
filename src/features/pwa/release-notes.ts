export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-19.1",
  date: "2026-11-19",
  changes: [
    { title: "납품사진", text: "날짜를 눌러 그날의 사진을 보고, 전송이 멈춘 사진은 거래처에서 다시 열 수 있어요." },
    { title: "카카오맵", text: "오늘 남은 납품처에서 길안내를 한 번에 시작할 수 있어요." },
    { title: "연속 촬영", text: "같은 거래처를 이어 찍고 ‘연속 촬영 마치기’로 목록에 돌아갈 수 있어요." },
    { title: "납품 순서", text: "저장 응답이 끊겨도 같은 순서로 다시 저장할 수 있어요." },
  ],
};
