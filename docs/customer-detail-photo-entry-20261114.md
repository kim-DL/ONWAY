# 거래처 상세에서 납품사진 기록하기

2026-11-14 구현·운영 반영 완료. 브랜치는 `codex/customer-detail-photo-entry`이며 시작 커밋은 `06d9d96`이다. 후속 사용자 요청으로 재고 유통기한 임박의 붉은 표시를 함께 커밋하고 Hosting에 배포했다. 최종 소스는 `57609a9`, Hosting version은 `82250bed5a37ee46`이다. 최종 후보·배포 결과는 [통합 릴리스 기록](releases/2026-11-14-customer-photo-entry-and-expiry.md)을 따른다.

## 사용자 동작

거래처 상세의 납품 안내 아래에 기존 사진 기록과 새 `납품사진 기록하기` 버튼을 한 카드로 묶었다. 조회와 새 기록은 독립된 버튼이다. 기록 조회 실패나 기록 없음은 새 기록 진입을 막지 않는다. 폐업 거래처는 과거 기록을 조회할 수 있지만 새 기록은 비활성화한다.

새 버튼은 해당 거래처 ID를 기존 납품사진 화면에 전달한다. 화면은 최신 거래처 목록에서 대상을 확인하고 `사진 촬영`, `앨범에서 선택`을 표시한다. 사용자가 직접 누를 때 기존 파일 입력 controller를 연다. 대상이 사라졌거나 비활성 상태이면 다른 거래처로 대체하지 않는다. 저장소 준비 전에는 파일 선택을 비활성화한다.

진입만으로 내 납품처나 오늘 납품처를 저장하지 않는다. 기존 업로드 coordinator, 원본 보관, 복구, request ID와 서버 확인 후 완료 처리를 재사용한다. 서버, Callable, 인증, 사진 보관 DB는 변경하지 않았다.

기록 조회에는 사진과 시계, 새 기록에는 카메라 SVG를 적용했다. SVG gradient ID는 React `useId`로 분리한다. 제목은 기본 16px, 설명과 최근 등록 정보는 14px이다. 기존 서울 기준 formatter로 등록 날짜와 시각을 표시하고 등록자는 별도 줄에 둔다.

## 화면 이동과 소유권

두 독립 설계와 별도 판단을 비교해 기존 사진 workspace를 재사용하는 설계를 선택했다. 상세 안에 별도 촬영 시트를 두면 업로드 완료 영수증을 소비하는 UI가 하나 더 생긴다. 기존 workspace를 유지하면 완료 반영도 한 곳에서 처리한다.

`customer-photo-entry.ts`의 detail/photo-record union은 거래처 ID의 화면 역할을 구분한다. shell이 상태를 소유하고 외부 history 입력은 목적지와 ID 형식을 확인한다. 새 사진 진입에서만 이전 시트 marker를 제거한다. Back, Forward, 상세 복귀 버튼과 상단 거래처 버튼으로 같은 상세에 돌아온다.

전체보기에서 시작한 경우에도 같은 거래처 상세로 돌아온다. 이전 전체보기 시트를 상세 뒤에 자동 재구성하는 동작은 추가하지 않았다.

## 검증

| 범위 | 실행 | 결과 |
|---|---|---|
| 신규 연결과 가독성 | `npx playwright test tests/e2e/customer-photo-entry.spec.ts --workers=2` | 모바일·데스크톱 Chromium 28개 통과 |
| 기존 거래처·사진 화면 | `npx playwright test tests/e2e/customer-ceramic-navigation.spec.ts tests/e2e/delivery-photo-cards.spec.ts --workers=2` | 28개 통과 |
| context와 기존 workspace | `npx vitest run src/features/app-shell/customer-photo-entry.test.ts src/features/delivery-photos/delivery-photo-workspace.test.ts --maxWorkers=2` | 22개 통과 |
| 업로드·복구·보관·캐시 | upload-memory, recovery, outbox, outbox-worker, memory의 관련 Vitest 5파일 | 49개 통과 |
| 타입 | `npm run typecheck`, 마지막 shell 수정 후 `npx tsc --noEmit` | 통과 |
| 관련 lint와 diff | 변경 TypeScript의 ESLint, `git diff --check` | 통과 |

신규 검사는 기록 아래 버튼 위치, 320/390/430/1280px, 긴 한글과 글자 확대, 키보드, 고대비, 조회 로딩·실패·빈 기록, 폐업, 대상 누락, 사진 기능 플래그를 포함한다. 실제 native file chooser에 전달한 합성 파일의 거래처 ID와 카메라/앨범 구분을 확인했다. Back/Forward, 다른 거래처 재진입, 전체보기 출발, 명시적 복귀, 모드 전환도 확인했다.

Aside에서는 합성 데이터의 실제 컴포넌트로 SVG와 320/390px 배치, 새 기록 진입과 동일 상세 복귀를 관찰했다. 미리보기는 `connect-src 'none'`과 I/O 대체로 운영 연결을 차단한다. 부모가 브라우저를 단독 제어했고 구현과 독립 소스 검토를 분리했다.

## 실패와 수정

- 변경 전 검사는 날짜 없는 기존 `마지막 기록` 표시로 새 기대값에 실패했다. 변경 후 날짜를 포함한 `최근 등록` 표시와 버튼 위치를 확인했다.
- 합성 fixture의 첫 빌드에서 history I/O 대체 모듈의 보조 export 3개가 빠졌다. 삭제 repository의 import 경계를 확인한 뒤 fail-closed 대체를 추가해 빌드를 통과했다.
- React Compiler lint는 기존 `todayIds` memo의 snapshot 의존성을 지적했다. 실제 접근과 dependency가 같은 지역 `day`를 사용하도록 정리했다. 규칙을 끄지 않았다.
- 독립 검토에서 `전체 납품사진 → 더보기 → 상세 → 닫기 → 다른 모드 → Back`에 닫았던 상세가 다시 열리는 경로를 찾았다. 새 브라우저 검사에서 실제 재현했다. 기존 상세 열기 경로에는 복귀 context를 저장하지 않고, 새 기록하기의 출발 상세에만 저장하도록 범위를 줄였다. 수정 후 신규 28개 검사와 소스 재검토를 통과했다.

## 근거와 한계

합성 화면 캡처와 독립 설계·검토는 Git 제외 `output/customer-detail-photo-entry/`에 있다. 미리보기 실행기는 같은 폴더의 `preview.ts`이다. 테스트는 `tests/e2e/customer-photo-entry.spec.ts`와 전용 합성 데이터로 재실행한다.

운영 형식 빌드와 PWA·성능·Hosting 검사, 전체 CI와 배포 후 두 주소의 공개 응답·자산 일치 검증이 통과했다. CI의 기존 공유 CSS 경고와 재실행 결과는 통합 릴리스 기록에 구분했다. 운영 시험 쓰기는 수행하지 않았다. 실물 휴대전화의 카메라 앱 전환, 설치 PWA, 실제 운영 계정의 사진 업로드는 이번에 실행하지 않았다.
