# 재고 제품 사진 Pan & Zoom — 2026-10-18

## 선택과 범위

기준은 `main`의 `e9293120779aa4dfc37d02feecb90d81c7dce230`이다. 기존 고정 2배/스크롤 뷰어를 포인터 기준 연속 확대와 이미지 이동으로 바꾼다. 재고 업무, 인증된 사진 조회, Blob URL 소유권과 회수, App Check/권한 경계는 그대로 사용한다. 이 변경은 클라이언트 UI이므로 운영 반영 대상은 `hosting:onnuriway`다.

동일 PC에서 npm package를 별도 ignored cache에 받고 esbuild minify/ES2020/ESM, React·ReactDOM external 조건으로 비교했다. 애플리케이션 의존성은 설치하거나 변경하지 않았다.

| 방식 | 비교 측정 gzip | 통합 검토 |
| --- | ---: | --- |
| PhotoSwipe 5.4.4 | core JS 17,405B + CSS 1,466B; Lightbox loader 제외 | 줌·핀치·갤러리 기능을 제공한다. 자체 overlay와 기존 중첩 모달·뒤로가기·사진 전환 소유권을 맞추는 통합이 필요하다. |
| react-zoom-pan-pinch 4.2.0 | 전체 exports 16,404B; 필요한 TransformWrapper/TransformComponent만 14,564B | 기존 모달 안에 넣을 수 있다. 이번 단일 사진 제스처보다 넓은 기능과 API가 포함되며 도구 버튼·보안 수명주기 연결은 앱에서 맡는다. |
| 자체 구현 **선택** | 새 조작 경계 약 3.2KiB JS + 약 0.5KiB CSS; 최종 수치는 릴리스 기록 | 기존 BottomSheet, 사진 열기/닫기 전환과 사설 Blob URL을 재사용한다. 필요한 제스처와 해제 수명주기만 소유한다. 새 실행 의존성이 없다. |

패키지 비교 수치는 통제된 번들 실험이며 해당 라이브러리를 실제 Next 앱에 통합한 최종 크기와 같다고 단정하지 않는다. [PhotoSwipe zoom levels](https://photoswipe.com/adjusting-zoom-level/), [PhotoSwipe options](https://photoswipe.com/options/), [react-zoom-pan-pinch 공식 저장소](https://github.com/BetterTyped/react-zoom-pan-pinch)를 검토했다. 원시 결과는 로컬 `output/inventory-pan-zoom-20261018/library-comparison.json`에 있다.

## 조작 계약

- 초기 화면 맞춤을 100%로 삼는다. 빠른 확대와 더블클릭/더블탭은 1.8배이며 확대 상태의 두 번 누르기는 중앙 화면 맞춤으로 돌아온다.
- 기본 최대는 2.5배다. 현재 제공받은 이미지의 실제 natural dimensions가 화면 맞춤 크기 × devicePixelRatio × 3 이상인 경우만 3배를 허용한다. 추가 원본 조회나 새 서버 API를 만들지 않는다.
- PC 휠은 deltaMode를 정규화하고 지수 배율로 연속 확대한다. 커서 아래 이미지 좌표를 유지하되 이동 경계를 우선한다. 이미지가 뷰포트보다 작은 축은 중앙에 유지한다.
- mouse/pen/touch Pointer Events와 pointer capture로 드래그를 처리한다. 두 손가락 중점과 거리로 핀치/동시 이동을 계산하고 한 손가락을 떼면 남은 포인터에서 이동 기준을 다시 잡는다. tap 거리·시간 제한, pinch 후 tap 억제, touch의 호환 dblclick 억제로 중복 확대를 피한다.
- 맞춤/확대·축소/1.8배/상단 닫기와 현재 배율을 제공한다. 이미지에 포커스한 상태의 `+`, `-`, `0`/Home, 방향키를 지원하고 Escape·브라우저 Back·모달 포커스 제한은 기존 BottomSheet를 사용한다. Safari의 클릭 포커스 차이를 고려해 닫힌 뒤 연결된 사진 버튼으로 포커스를 복원한다.
- transform은 이미지 안에서만 적용한다. `touch-action:none`과 non-passive wheel listener는 사진 영역에만 한정한다. 앱 전체의 브라우저 확대나 페이지 제스처 설정은 바꾸지 않는다.
- 확대/버튼은 requestAnimationFrame으로 보간하며 reduced motion은 즉시 맞춘다. 이미지 이동 중에는 React 상태를 매 픽셀 다시 렌더하지 않는다. 배율 정수/한도/확대 여부가 달라질 때만 제어부 상태를 갱신한다.
- 가려진 창의 compositor frame 정지에도 마지막 요청을 보존하는 120ms frame watchdog을 둔다. blur/visibility interruption, pointer cancellation과 resize를 정리한다. 모든 frame/timer/observer/listener/capture는 뷰어 해제 시 함께 해제한다.
- 소수점 CSS 뷰포트 크기와 좌상단 원점 transform으로 WebKit의 백분율 중심 정렬 오차를 피한다. resize 때 현재 배율과 상대 위치를 다시 제한한다.

## 지연 로딩과 성능 경계

기존 `inventory-photo-viewer` 지연 경계를 유지하고 그 안에서만 `inventory-photo-pan-zoom`을 요청한다. 사진과 닫기 조작은 먼저 표시하고 새 조작 경계 준비 중에는 짧은 상태 문구를 표시한다. 새 모듈은 로그인·재고 workspace의 초기 실행 경로에 포함하지 않는다. PWA에서는 기존 정책대로 background precache해 오프라인에서도 사용할 수 있게 한다.

기존 initial 160KiB, 재고 JS 25KiB, 뷰어 2.25KiB, 재고 CSS 6.5KiB 등 모든 상한을 유지한다. 새 경계에는 JS 6KiB, CSS raw 2KiB/gzip .75KiB의 별도 상한을 두고 전체 재고+사진 흐름도 JS 31KiB로 검사한다. 새 CSS는 정확히 한 번 계산하고 다른 모드·초기 페이지로 새어 들어가지 않는지 검사한다. 최종 source의 production-mode build/manifest 수치는 릴리스 기록에 보존한다.

## 검증 결과와 한계

- geometry 단위 10개: 비율 유지, 해상도·DPR 최대 배율, 잘못된 크기 대기, 연속 배율의 커서 좌표 보존, 가로/세로/파노라마 이동 경계, 축소 복원을 검증했다.
- 전체 unit 1,746 PASS / 기존 emulator 조건 15 SKIP. 최초 build 동시 실행에서 기존 runtime identity 동적 import의 5초 timeout 1회 후, 테스트 변경 없이 단독 4개와 전체 순차 실행을 통과했다.
- Chromium PC/모바일 새 브라우저 회귀 8 PASS / 반대 플랫폼 전용 2 SKIP: 실제 mouse wheel/drag/double click, CDP native touch의 핀치·남은 손가락 pan·더블탭·취소/재조작, 배율 한도·여러 비율·resize·Back·Escape·재열기, 320px/200% 글자/axe, compositor frame 정지를 검사한다. 두 SKIP은 해당 조작을 다른 프로젝트에서 실제 실행한 플랫폼 분리다.
- Windows Playwright WebKit desktop 4 PASS / Chromium native touch 전용 1 SKIP. 실제 iPhone Safari나 설치 PWA 터치 합격으로 보고하지 않는다.
- 재고 static PWA/실제 demo Auth·Callable·Firestore·Storage 업무 회귀 18 PASS, transaction integration 12 PASS. 등록/사진·입출고·실사·교체/삭제·권한 회수·viewer 거절·1,000품목 paging을 포함한다.
- `aside-browser`로 별도 localhost 합성 사진 화면의 실제 뷰어 컴포넌트를 열고 확대 버튼, 휠, 드래그, 더블클릭 확대/복원, 상태 문구와 화면을 직접 확인했다. Aside는 새 viewport API를 제공하지 않아 모바일 검증은 별도 네이티브 입력 회귀와 구분한다. 일부 Aside 전체 화면 캡처가 CDP timeout/clip 오류를 냈으며 이를 제품 사진 오류로 취급하지 않는다.
- 실제 기기의 핀치·OS 제스처·설치 PWA lifecycle은 별도 현장 인수다. 운영 업무 데이터 생성·변경·삭제를 테스트에 사용하지 않는다.

검증 중간 빌드의 `out`에는 식별자 `inventory-pan-zoom-local-validation`을 사용했으므로 이를 배포하면 안 된다. 승인된 이번 Hosting 릴리스는 Git에 저장한 정확한 source, 해당 CI 성공, 비공개 운영 설정과 production flags, 새 source revision으로 다시 build한 manifest를 확인한 후 진행한다. 기존 Functions·Rules·MCP 전용 Hosting은 배포 대상이 아니다.
