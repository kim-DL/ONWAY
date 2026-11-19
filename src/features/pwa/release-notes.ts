export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-19.6",
  date: "2026-11-19",
  changes: [
    { title: "갤러리 날짜와 요일", text: "날짜를 11월 19일 (목)처럼 표시해 사진의 요일도 확인할 수 있어요." },
    { title: "업체 찾기 버튼", text: "납품처 관리와 어울리는 둥근 버튼으로 다듬었어요." },
    { title: "갤러리 버튼", text: "납품사진 검색창 오른쪽의 갤러리 버튼에 옅은 분홍빛을 적용했어요." },
  ],
};
