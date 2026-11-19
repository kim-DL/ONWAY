export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-19.4",
  date: "2026-11-19",
  changes: [
    { title: "납품처 관리", text: "오늘 남은 납품처 수 옆에서 순서 편집, 기본 목록, 송장 등록과 경로 추천을 열 수 있어요." },
    { title: "갤러리 버튼", text: "검색창 오른쪽의 민트색 버튼을 눌러 어제와 오늘의 납품사진을 확인할 수 있어요." },
    { title: "작은 화면에서도 편하게", text: "글자를 크게 설정해도 납품처 관리와 갤러리 버튼을 누를 수 있게 배치를 다듬었어요." },
  ],
};
