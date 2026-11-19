export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-19.7",
  date: "2026-11-19",
  changes: [
    { title: "갤러리 날짜와 요일", text: "날짜를 11월 19일 (목)처럼 표시해 사진의 요일도 확인할 수 있어요." },
    { title: "업체 찾기 버튼", text: "납품처 관리와 어울리는 둥근 버튼으로 다듬었어요." },
    { title: "갤러리 버튼", text: "갤러리 버튼을 하늘색으로 바꾸고 글자를 가운데에 맞췄어요." },
  ],
};
