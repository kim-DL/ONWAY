export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-22.2",
  date: "2026-11-22",
  changes: [
    { title: "재고 변경 알림", text: "다른 직원이 입고·출고·수량 조정을 저장하면 어떤 작업으로 몇 개가 바뀌었는지 알려드려요. 놓친 알림은 상단 종 버튼에서 다시 볼 수 있어요." },
    { title: "직원별 알림 설정", text: "운영 모드의 직원 관리에서 알림을 받을 직원을 지정해요. 지정된 직원은 개인 설정에서 알림을 끄거나 다시 켤 수 있어요." },
  ],
};
