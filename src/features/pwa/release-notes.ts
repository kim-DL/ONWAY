export interface AppReleaseNotes {
  id: string;
  date: string;
  changes: readonly { title: string; text: string }[];
}

// A waiting worker must describe its own build, including when two releases
// arrive before a device reopens the app.
export const releaseNotesRequest = "ONNURIWAY_RELEASE_NOTES";
export const appRelease: AppReleaseNotes = {
  id: "2026-11-28.3",
  date: "2026-11-28",
  changes: [
    { title: "어두운 창고와 작은 글씨 촬영", text: "지원하는 카메라에서 손전등을 켜거나 글씨를 눌러 초점을 맞출 수 있어요. 작은 바코드는 사진 해상도를 살려 확인해요." },
    { title: "원산지와 이번 입고 기한", text: "포장에 표시된 원산지와 소비·유통기한을 초안에 채워요. 이미 찍은 사진에서 작은 표시만 골라 다시 읽을 수 있어요." },
  ],
};
