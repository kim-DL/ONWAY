export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-19.2",
  date: "2026-11-19",
  changes: [
    { title: "납품사진 갤러리", text: "납품사진 검색창 옆 갤러리에서 직원별로 어제와 오늘 사진을 넘겨 볼 수 있어요." },
    { title: "업체별 사진 대조", text: "업체 찾기에서 같은 업체의 두 날짜 사진을 비교하고 확대할 수 있어요." },
    { title: "보던 사진 유지", text: "새 사진이 등록돼도 보고 있던 사진은 제자리에 있어요." },
  ],
};
