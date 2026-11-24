export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-24.1",
  date: "2026-11-24",
  changes: [
    { title: "학교·영업 모드 스크롤", text: "화면을 스크롤하는 동안 얇은 막대가 보이고, 멈추면 자연스럽게 사라져요." },
  ],
};
