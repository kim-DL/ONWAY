export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-21.1",
  date: "2026-11-21",
  changes: [
    { title: "업무 모드 버튼", text: "거래처·학교·영업·재고 버튼을 옅은 푸른빛의 원형 버튼으로 바꿨어요. 버튼이 눌리는 모습이 보인 뒤 화면이 전환돼요." },
  ],
};
