export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-25.2",
  date: "2026-11-25",
  changes: [
    { title: "영업 모드 작업 버튼", text: "학교 찾기와 방문 동선 등 작업 버튼을 학교 범위 탭 아래 가운데에 맞췄어요." },
    { title: "학교·영업 모드 스크롤", text: "화면 오른쪽에 겹쳐 보이던 큰 스크롤바를 없앴어요. 긴 목록은 본문 안에서 스크롤할 수 있어요." },
  ],
};
