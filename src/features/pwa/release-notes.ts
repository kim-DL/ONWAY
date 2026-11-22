export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-22.7",
  date: "2026-11-22",
  changes: [
    { title: "재고 목록의 새 품목 버튼", text: "오른쪽 아래 버튼의 여백을 줄이고, 더하기 표시와 글자를 가운데 맞췄어요." },
  ],
};
