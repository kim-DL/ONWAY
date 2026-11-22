export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-22.4",
  date: "2026-11-22",
  changes: [
    { title: "상품 상세의 수량 갱신", text: "다른 기기에서 알림을 읽어도, 열어 둔 상품의 최신 수량을 불러올 때까지 갱신 안내가 남아요." },
    { title: "재고 변경 알림", text: "온누리 로고에 점이 보이면 눌러서 놓친 알림을 확인하세요. 한 기기에서 열면 다른 기기에서도 읽음으로 바뀌어요." },
    { title: "기기 알림", text: "앱 설정에서 이 기기의 알림을 허용하면 급식길을 닫아도 새 재고 알림을 받을 수 있어요." },
  ],
};
