export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-19.3",
  date: "2026-11-19",
  changes: [
    { title: "납품처 관리", text: "오늘 순서 편집, 기본 목록, 송장 등록과 경로 추천을 한 곳에서 열 수 있어요." },
    { title: "깔끔해진 납품사진", text: "거래처 이름에서 사진 기록을 열고, 오른쪽에서 바로 촬영하거나 더보기 메뉴를 이용할 수 있어요." },
    { title: "거래처 검색", text: "검색할 때는 일치하는 업체만 목록에 보이고, 거래처 더보기에서 오늘 목록에 추가할 수 있어요." },
  ],
};
