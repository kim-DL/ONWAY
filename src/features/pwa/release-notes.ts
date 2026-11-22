export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-22.5",
  date: "2026-11-22",
  changes: [
    { title: "재고 알림 미리보기", text: "앱을 닫아도 기기 알림에서 상품명, 변경 수량, 보관 장소와 입출고 종류를 확인할 수 있어요. 잠금 화면 미리보기는 기기 설정을 따라요." },
    { title: "알림 카드와 새 품목 버튼", text: "재고 알림 카드에서 상품명과 변화량을 한눈에 볼 수 있어요. 새 품목 버튼은 재고 수량을 가리지 않도록 오른쪽 아래에 두었어요." },
  ],
};
