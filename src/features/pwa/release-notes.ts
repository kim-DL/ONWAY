export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-23.2",
  date: "2026-11-23",
  changes: [
    { title: "납품사진 촬영", text: "사진 보관함을 일시적으로 읽지 못했을 때 앱으로 돌아오면 다시 확인해요. 촬영을 기다려야 하는 이유도 거래처 카드에서 볼 수 있어요." },
    { title: "카메라에서 돌아올 때", text: "이전 촬영 결과가 아직 도착하지 않았으면 원래 거래처의 사진을 기다리거나 새 촬영을 시작할 수 있어요." },
    { title: "납품사진 목록", text: "남은 납품처가 먼저 열리고, 사진이 기기에 보관 중인지 서버에 저장됐는지 확인하기 쉬워졌어요." },
  ],
};
