export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-27.1",
  date: "2026-11-27",
  changes: [
    { title: "납품사진 검색 길안내", text: "검색한 업체 카드에서 길안내를 누르면 카카오맵으로 바로 연결돼요." },
    { title: "회사명 자간", text: "로고 아래 온누리종합식품의 글자 간격을 조금 줄였어요." },
    { title: "학교 범위 탭과 로고", text: "내 학교와 전체 보기의 선택 밑줄을 짧게 다듬고, 로고 아래 회사 이름의 글자 간격을 맞췄어요." },
    { title: "재고 새 품목 버튼", text: "새 품목 버튼의 배경 투명도를 75%로 높이고 흐림 효과를 없애 뒤에 있는 수량을 볼 수 있어요." },
    { title: "영업 모드 작업 버튼", text: "학교 찾기와 방문 동선 등 작업 버튼을 학교 범위 탭 아래 가운데에 맞췄어요." },
    { title: "학교·영업 모드 스크롤", text: "화면 오른쪽에 겹쳐 보이던 큰 스크롤바를 없앴어요. 긴 목록은 본문 안에서 스크롤할 수 있어요." },
  ],
};
