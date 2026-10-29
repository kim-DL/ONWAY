# 급식길 앱 전체 로딩 경험 개선

기준일: 2026-10-29

상태: 구현·로컬 검증·최종 제품 소스의 전체 CI 완료. 제품 소스 `25c1effb518b03983c307d939e93d2cf6666f4e4`, [PR #6](https://github.com/kim-DL/ONWAY/pull/6), [Quality Gate 40877913374](https://github.com/kim-DL/ONWAY/actions/runs/40877913374) 필수 검사 12개와 최종 verify 모두 SUCCESS다. 2026-10-30 사용자 후속 승인으로 main 병합·동일 파일 내용의 병합 커밋 CI 확인·Hosting 운영 배포를 완료했다. [릴리스 기록](releases/2026-10-30-loading-experience.md)에 최종 운영 결과를 구분한다.

## 결정과 레퍼런스

사용자 선택은 **앱 전체 로딩 교체**, **밝고 정제된 업무 앱**, **업무 화면과 이어지는 상단 브랜드 구성**이다. PIN 입력 방식과 배치는 유지하고 색·글자·장식을 통일한다. 기존 로고·서체·업무별 색상·환영 인사·업무 완료율 차트는 유지한다.

| 공식 자료 | 적용한 원칙 |
| --- | --- |
| [Apple — Launching](https://developer.apple.com/design/human-interface-guidelines/launching) | 앱 시작과 도착 화면 사이의 시각적 연속성, 이전 업무로의 빠른 복귀 |
| [Microsoft Fluent 2 — Wait UX](https://fluent2.microsoft.design/wait-ux) | 짧은 대기에는 움직이는 지표를 생략하고 현재 화면에서 피드백 제공 |
| [Microsoft Fluent 2 — Skeleton](https://fluent2.microsoft.design/components/web/react/core/skeleton/usage) | 고정 UI는 실제 화면을 표시하고 구조를 아는 데이터 영역에 자리 표시자 사용 |
| [Google Material — ProgressIndicator](https://github.com/material-components/material-components-android/blob/master/docs/components/ProgressIndicator.md) | 진행률을 아는 작업과 알 수 없는 작업 구분 |
| [GitHub Primer — Loading](https://primer.style/product/ui-patterns/loading/) | 작업 가까이에 상태를 표시하고 완료·실패·재시도 구분 |
| [IBM Carbon — Loading](https://www.carbondesignsystem.com/building-blocks/core/patterns/loading) | 업무 화면의 구조를 먼저 표시하고 준비된 내용을 점진적으로 표시 |
| [Atlassian — Skeleton](https://atlassian.design/components/skeleton/usage) | 실제 콘텐츠에 맞는 크기, 불필요한 shimmer 억제, 준비 즉시 교체 |

공식 설계 지침과 예시를 급식길에 맞게 종합했다. 각 회사의 최신 로그인 화면을 직접 검증하거나 그대로 재현한 작업이 아니다. Mobbin 검색은 유료 플랜이 필요하다는 응답으로 중단했으며 해당 서비스의 화면 자료를 사용하지 않았다.

## 구현 범위

### 공용 로딩 표현

- 기존 네 캡슐 교차 애니메이션을 제거하고 `LoadingIndicator`, `LoadingStatus`, `LoadingSkeleton`으로 표현을 통일했다. 이전 `OnnuriLoader` 이름은 필요한 호환 경계만 남기며 구형 모션은 제공하지 않는다.
- 영역 로딩은 2px 선형 표시, 버튼은 16px 단색 원형 표시다. 목록·카드·사진 자리 표시자는 정적이며 별도의 사진 shimmer·회전 표현도 정리했다.
- 작업 문구와 제출 잠금은 즉시 반영한다. 움직이는 표시는 1초 이후, 보조 설명은 3초 이후 노출한다. 이 시간은 표시 기준이며 실제 요청이나 완료 전환을 늦추지 않는다.
- 상태 영역은 작업당 한 곳에서 낭독한다. 상태 문구를 가진 영역 내부의 지표는 장식으로 처리한다. `aria-busy` 때문에 진행 안내가 완료까지 억제되지 않도록 상태 영역과 데이터 영역을 구분한다.
- 동작 줄이기, 사용자 모션 일시정지, 백그라운드 정지, 고대비 모드 지원을 보존한다. 새 애니메이션 라이브러리·폰트·영상은 추가하지 않는다.

### 시작 화면과 PIN

- `AuthApplicationLoader`의 코드 준비, 세션 확인, 앱 쉘 준비는 같은 `AuthHeader`와 `AuthLoadingScreen` 구성을 사용한다. 이전 중앙 브랜드·반복 등장·광택 효과와 실제 화면에 맞지 않는 “저장된 업무 화면” 문구를 제거했다.
- 오프화이트 `#F8FAFC`, 흰색 `#FFFFFF`, 먹색 `#191F28`, 강조색 `#0B5A84`를 적용했다. PWA manifest의 시작 배경도 `#f8fafc`로 맞췄다.
- PIN의 데스크톱 2열·모바일 세로 구성을 유지하며 배경 그라데이션과 장식은 정리했다. 입력·버튼·오류·관리자 진입을 실제 기능과 같은 의미로 표시한다.
- 하나의 시작 과정은 표시 시각을 공유해 fallback 재마운트 때 1초/3초 기준을 다시 시작하지 않는다. PIN·Google 제출은 같은 시각을 세션 확인까지 이어간다. 로그아웃·정리 재시도·다른 탭에서 시작된 로그인은 새로운 대기로 처리한다.
- 로그아웃 중에는 “로그아웃 중”을 표시한다. 기존 오프라인 복구 안내는 원문 그대로 유지한다. 인증 상태나 세션 전이 조건은 변경하지 않는다.
- 기존 인증 스타일을 `auth-loading.css`로 정리하고, `base.css`·`field-theme.css`·`brand-motion.css`의 더 이상 사용하지 않는 인증 전용 스타일을 제거했다. 업무 헤더와 welcome 모션은 별개다.

### 업무 화면과 진행 상태

- 모든 기능에 공통 회색 카드 두 개를 보여주던 지연 로딩 화면을 목적 화면의 목록·상세·사진 구조에 맞게 바꿨다. 인증된 고정 헤더·탐색과 이미 표시된 업무 내용은 유지한다.
- 검색·목록 갱신은 필요한 결과 영역에 표시한다. 저장·삭제·계산은 해당 버튼이나 상태 영역에 표시하며 전체 화면 차단막을 새로 추가하지 않는다.
- 사진의 로컬 준비·인코딩을 실제 전송처럼 표현하지 않는다. 사진 전송 API가 바이트 진행률을 제공하지 않으므로 임의의 백분율이나 남은 시간을 추가하지 않는다. 실제 완료 건수가 있는 일괄 등록의 진행률은 유지한다.
- 납품사진의 기기 보관·연결 대기·재시도·날짜 확인·실패 상태를 구분한다. 미리보기나 기기 보관만으로 서버 등록 완료를 표시하지 않는다.

## 보존 계약

- 인증된 Callable, App Check, Rules, 권한 회수, revision, request ID, 감사 이력과 서버 확인 후 완료 조건을 유지한다. 공개 API·서버 데이터 구조·업무 데이터 저장 정책의 변경은 없다.
- PIN 중복 제출 잠금, 오류 후 PIN 초기화·포커스 복구, Google 관리자 검증을 유지한다.
- 연결 복구를 기다리는 인증 상태는 내부 표시용 `waitingForConnection`으로 구분하고 기존 로그인 유지 안내를 정적으로 표시한다. 자동 재연결·세션 판정 로직은 유지하며, 일반 로더를 계속 재생하지 않는다.
- Firebase의 UID 복원 뒤에만 허용되는 직원 세션 복구와 기존 캐시 유효성 조건을 유지한다. 관리자 검증을 캐시로 생략하지 않는다.
- 저장 결과 불확실 상태와 그 결과를 다시 확인하는 동작을 일반 실패·새 요청으로 합치지 않는다. 재고의 같은 request ID 재사용과 납품사진 보관·재시도 계약을 유지한다.
- 기존 정적 내보내기·지연 로딩 구조·PWA/성능 예산을 유지한다. 운영 Firebase 데이터 생성·수정·삭제로 검증하지 않는다.
- 재고 사진 조회와 편집 함수가 한 모듈에 묶여 편집 전용 코드도 첫 화면에 들어오던 구조를 분리했다. `inventory-photo-picker.tsx`는 기존 지연 품목 편집기에서 불러온다. 사진 변환·취소·기기 파일 읽기·base64 처리 내용은 유지한다. 72~95px 사진 슬롯은 정적 상태로 두고 큰 확대 화면에 진행 안내를 제공한다.

## 검증 방법과 결과

| 구분 | 방법과 성공 기준 | 최종 결과 |
| --- | --- | --- |
| 단위·정적 검사 | 로딩 시간 경계·구독 정리, 인증 복구·권한 회수·로그아웃, 사진 처리 단계·저장 결과 계약, typecheck·lint | 새 의존성의 전체 unit 1,826 PASS / 기존 15 SKIP, 이후 최종 연결 대기 표시 보완의 인증 55 PASS. 앱·Functions typecheck, 전체 lint PASS |
| 로딩 브라우저 | 실제 React 컴포넌트를 사용하는 격리 fixture에서 fallback 연속성, 1초 미만 지표 생략, 3초 설명, 완료 즉시 제거, PIN→세션 연속성, 새 인증 대기 시각 확인 | 최초 로딩·헤더·사진 선택 Chromium 82 PASS. 후속 사진 선택 16, 최종 로딩 24·거래처 사진 표현 56 PASS, 재시도 0. 동일 화면의 완료/실패 후 새 요청 시계와 연결 대기에서 로더가 없는 조건 포함 |
| 화면·접근성 | 320/390/768/840/1280px, HTML 기본 글자 200%와 상태 문구의 실제 계산 크기 2배, 동작 줄이기·고대비, axe, 요소 경계로 잘림 확인 | 위 브라우저 묶음에서 PASS. 사용자 모션 정지·합성 visibility 이벤트도 확인 |
| 인증·업무 회귀 | 로컬 emulator/합성 데이터로 PIN 정상·오류·토큰 교환 실패, 기존 세션 복귀, 오프라인 복구, 저장·사진 재시도·완료 확인 | 첫 정적 Phase 17: 79 PASS / 4 FAIL / 기존 18 SKIP. 아래 원인 보완 후 실패했던 4개만 재실행하여 4 PASS(26.1초), 재시도 0 |
| 성능 비교 | 동일한 로컬 요청 경로·브라우저·네트워크/CPU 조건에서 변경 전후 각 5회 비교. 안정된 브랜드 위치와 재고 검색 입력 가능 시점을 구분 | 아래 중앙값·전체 개별값 참조. 인위적인 작업 지연 0 |
| 운영 형식 빌드 | build 후 PWA·성능·Hosting gate, 기존 예산 유지 | build/PWA/성능/Hosting PASS. 사진·재고 ON, Emulator OFF |
| CI | 최종 코드와 로컬 검증을 확정한 커밋으로 전체 필수 job 및 최종 verify 확인 | `25c1eff` / Quality Gate 40877913374 attempt 1: 검사 12개 + verify 전부 SUCCESS. unit 1,826 PASS/기존 15 SKIP, 일반 browser 336 PASS/기존 8 SKIP, Phase 17 browser 83 PASS/기존 18 SKIP, 재고사진 4·transaction 12·납품사진 16 PASS. 실패·내부 flaky 0 |

- 검증 명령: `npm test`, `npm run typecheck`, `npm run lint`, `npx playwright test tests/e2e/loading-experience.spec.ts tests/e2e/header-layout.spec.ts tests/e2e/photo-source-picker.spec.ts --workers=2`, `npm run build`, `npm run verify:pwa:build`, `npm run verify:performance:build`, `npm run verify:hosting:build`.
- 변경 전/후 화면·전환 증거: [개별 측정값과 단계 기록](loading-experience-20261029-metrics.json), [화면 파일](assets/loading-experience-20261029/), ignored 로그 `output/loading-experience-20261029/`.
- 최종 제품 소스 커밋: `25c1effb518b03983c307d939e93d2cf6666f4e4`
- 최종 CI 실행과 결과: [Quality Gate 40877913374](https://github.com/kim-DL/ONWAY/actions/runs/40877913374), 전체 SUCCESS. 결과 문서만 후속 `[skip ci]` 커밋으로 저장하며 제품 소스·lock·빌드 설정은 동일하다.

초기 검사에서 이전 로더 조각 수·광택 효과·문구를 요구하는 테스트가 새 표현과 맞지 않아 실패했다. 관련 기대값을 승인된 디자인과 실제 상태에 맞춰 갱신하되 접근성·재시도·인증·완료 판정 기준을 완화하지 않는다. 격리 브라우저 fixture에는 이미지 경로와 esbuild 가상 모듈의 React 해석 경로 보완이 필요했다. 최종 실패·재실행 내역은 위 결과와 함께 구분해 기록한다.

성능 smoke의 `firstSurface`는 브랜드가 DOM에 나타난 시점, `firstStableSurface`는 브랜드 경계가 연속 3프레임 동안 같은 시점이다. 후자는 시작 배치 안정성의 대리 지표이며 모든 픽셀이나 업무 데이터의 준비 완료를 뜻하지 않는다. `workReady`는 재고 검색 입력이 사용 가능해진 시점이며 실제 입력·지우기도 확인한다. HTTP 캐시를 끈 로컬 요청 라우팅에서 첫 진입과 **같은 세션 반복 복귀**를 비교한다. 최초 실험의 `resume-warm-assets` 표기를 `resume-repeat`로 고치고, 정확한 안정 표시·재고 검색 조건으로 변경 전후 모두 다시 측정했다.

### 동일 조건 비교

390×844 Chromium, CPU 4배 제한, 지연 120ms, 다운로드 200,000B/s, 각 경로 워밍업 1회 제외 후 5회 중앙값이다. 보안 의존성과 연결 대기 표시를 포함한 최종 후보를 새로 빌드하고, 변경 전 5회 다음 변경 후 5회를 직렬 실행했다. baseline은 `4f06e3c`의 보존된 Next 16.3.8/Zod 4.4.3 프런트 산출물, 후보는 Next 16.4.3/Zod 4.6.7이다. 양쪽의 합성 Functions backend는 동일한 현재 소스·의존성을 사용했다. 서비스 워커와 HTTP 캐시는 측정에서 비활성화했다. 별도 세션 복귀 회귀 검사는 실제 서비스 워커를 유지한다.

| 경로·지표 | 변경 전 | 변경 후 | 차이 |
| --- | ---: | ---: | ---: |
| 최초 실행: 브랜드 위치 안정 | 1,665ms | 1,329ms | -336ms |
| 최초 실행: PIN 입력 가능 | 3,863ms | 3,944ms | +81ms |
| 저장 세션 복귀: 브랜드 위치 안정 | 1,104ms | 1,125ms | +21ms |
| 저장 세션 복귀: 재고 검색 입력 가능 | 3,721ms | 3,720ms | -1ms |
| 같은 세션 반복 복귀: 브랜드 위치 안정 | 1,100ms | 1,077ms | -23ms |
| 같은 세션 반복 복귀: 재고 검색 입력 가능 | 3,718ms | 3,717ms | -1ms |

실제 재고 조작 가능 시간은 사실상 같고 최초 PIN 입력 가능 중앙값은 81ms 증가했다. 후보 PIN 표본 범위는 3,828~4,614ms이며 개별값과 모든 범위는 JSON에 남겼다. 이 5회 로컬 측정만으로 통계적으로 유의한 속도 향상이나 운영 p75 개선을 주장하지 않는다. 보안 의존성 변경을 포함한 전체 후보의 비교이므로 디자인만의 인과 효과와도 구분한다. 이번 변화의 핵심은 반복 등장·광택·여러 로더의 동시 움직임을 없애고, 실제 화면 가까이에서 현재 작업을 설명하는 것이다. 이전 후보의 78ms 개선 수치는 최종 결과로 사용하지 않는다.

최종 운영 형식 산출물의 gzip: initial JS 143,611B / 160KiB, customer JS 36,831B / 36KiB, sales workspace 14,334B / 14KiB, inventory JS 22,961B / 25.375KiB. 기존 예산·정적/지연 로딩 경계 검사를 모두 그대로 통과했다. 산출물 113파일, precache 100개다.

동일 제품 소스의 Linux CI 빌드도 같은 상한을 통과했다. initial JS 143,583B, customer JS 36,832B, sales 14,334B, inventory 22,961B로 로컬 산출물 수치와 구분한다.

### 화면 비교

PIN 비교는 이전·이후 정적 demo 앱을 같은 Chromium에서 촬영했다. 시작·업무 자리 표시자는 실제 컴포넌트의 격리 fixture이며 동작 줄이기 상태다.

| 폭 | 이전 PIN | 새 PIN |
| --- | --- | --- |
| 320px | [이전](assets/loading-experience-20261029/before-pin-320.png) | [적용 후](assets/loading-experience-20261029/after-pin-320.png) |
| 390px | [이전](assets/loading-experience-20261029/before-pin-390.png) | [적용 후](assets/loading-experience-20261029/after-pin-390.png) |
| 1280px | [이전](assets/loading-experience-20261029/before-pin-1280.png) | [적용 후](assets/loading-experience-20261029/after-pin-1280.png) |

[새 시작 화면](assets/loading-experience-20261029/after-launch-390.png) · [재고 구조 자리 표시자](assets/loading-experience-20261029/after-skeleton-390.png)

### 실패와 보완 이력

- 옛 캡슐·광택·문구 기대값과 직접 함수를 호출하는 스크롤 테스트의 새 context mock 누락을 보완했다. 제품의 기존 인증·입력 복구·스크롤 보존 assertion은 유지했다.
- fixture React 모듈 해석 경로·이미지 경로, 고정 px 글자 확대의 타입 검사와 0.01ms 전환 직후 계산값 읽기를 보완했다. 최종 검사는 실제 28/26px 도달을 확인하며 기준을 완화하지 않는다.
- 거래처 36,961B(36KiB), 영업 14,340B(14KiB), 재고 26,137B(25.375KiB) 초과 후보는 배포·CI에 올리지 않았다. 중복 아이콘/문구 정리와 재고 사진 편집 코드의 기존 지연 경계 분리로 해결했다.
- Next build와 별도 typecheck를 동시에 실행한 중간 검사에서 생성 중인 `.next/types` 파일을 찾지 못했다. 소스 오류와 구분하고, 최종 typecheck는 build 완료 후 순차 실행했다.
- 초기 측정 도구의 baseline worktree Functions 의존성 경로, 새 도구의 기다리기 설정과 searchbox 선택자를 보완했다. 최종 비교는 수정한 동일 도구로 전후를 재측정한 값만 사용했다.
- 실제 정적 인증 회귀에서 오프라인 안내가 숨김 h1과 상태 본문에 중복되는 문제를 발견했다. 숨김 제목은 앱 이름으로 두고 실제 상태는 한 곳에서 제공한다. 지연 영업 도구 2개 검사는 이전 긴 문구 대신 새 상태 문구를 정확히 검사하며 3초 설명은 별도 로딩 테스트에서 검증한다. 기존 청크 요청 수·지연 중 닫기·포커스 복귀 조건은 유지한다.
- 첫 사진 목록 검사는 로컬 Emulator worker 준비에 약 4.95초가 걸려 카메라의 기존 5초 assertion 전에 목록 응답이 끝나지 못했다. 실제 조회는 이어서 331~439ms에 완료됐다. 제품 데이터 준비 조건·카메라 접근명은 변경되지 않았다. 같은 demo 환경에서 조회 4개에 인증 없는 빈 요청의 **401**을 확인해 worker만 준비하고, 이 검사와 위 3개 실패를 같은 assertion·timeout으로 재실행했다. 임시 준비/선택 runner와 로그는 ignored `output/loading-experience-20261029/`에 있고 저장소 CI의 검사 범위·시간·재시도 설정은 변경하지 않았다.
- 첫 시간 측정 이후 숨김 h1의 중복 복구 문구 제거, 연결 대기 상태의 정적 표시, 보안 의존성 갱신이 추가되어 최종 비교를 다시 측정했다. baseline 프런트 산출물은 기존 커밋이고 양쪽의 합성 backend는 같은 현재 의존성을 사용한다. 소스·lock·측정 도구와 산출물 hash도 개별 측정 자료에 명시하며 디자인 변경만의 효과로 해석하지 않는다.
- 재고 사진 파일 분리 뒤 단위·제품 typecheck에서 제외되는 브라우저 fixture의 옛 import가 남아 사진 테스트 준비 단계가 실패했다. fixture import만 새 경로로 연결하고 실제 파일 읽기·취소·재시도·바이트 스냅샷 16개를 그대로 재검증해 통과했다.
- 최초 소스 `ccd028f`의 [Quality Gate 40873497573](https://github.com/kim-DL/ONWAY/actions/runs/40873497573)는 audit·browser와 최종 verify가 실패했다. unit 1,826·정적 인증 83·재고사진 4/transaction 12·납품사진 16 PASS, typecheck/lint/Functions/운영 빌드/성능/지연 영업 도구는 통과했다. 일반 browser는 329 PASS/2 FAIL/3 flaky/기존 8 SKIP이었다. 실패 2개는 손상 JPEG 오류를 이전 `status` 역할로 찾던 mobile/desktop 검사다. 실제 오류 `alert`를 검사하고 오류 뒤 `사진 준비 중` status가 0개인지 확인하도록 보완했다. 기존 미리보기·재시도·44px·복구·timeout 조건은 유지한다. 별도 flaky 3개는 screenshot 프로토콜 오류 1개와 기존 환영 장식의 정지 직후 프레임 차이 2개이며 성공으로 숨기지 않는다.
- 같은 CI의 audit는 기존 lock에서 critical 1/high 7/moderate 14를 보고했다. [Next 보안 권고](https://github.com/advisories/GHSA-673q-mjm6-r5xr), [Zod 보안 권고](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)에 따라 Next 16.3.8→16.4.3, root/Functions Zod 최소 4.6.7, body-parser·re2js·undici의 호환 범위 내 lock 갱신을 적용했다. Serwist 9.5.12는 유지하고 Zod를 정확히 고정하던 next/build/webpack-plugin 세 패키지만 root Zod 버전을 참조하도록 override했다. `npm audit fix --force`의 Serwist 다운그레이드는 사용하지 않았으며 high/critical 기준도 유지한다. 새 lock의 `npm ci --engine-strict=true`·전체 unit·타입·린트·운영 빌드/PWA/성능/Hosting 검증을 통과했다. 최종 로컬과 CI audit는 high/critical 0, moderate 14다.

## 증거의 한계와 배포

- 격리 fixture, 인위적으로 지연한 청크, emulator, CPU/네트워크 제한은 로컬 재현 조건이다. 인증된 운영 환경이나 실제 직원 휴대폰의 측정 결과와 구분한다.
- 글자 확대 검사는 HTML 기본 크기를 200%로 조정하고 px로 정의된 상태 문구는 확대 전 계산 크기의 2배를 직접 적용한다. 실제 브라우저 확대 메뉴를 200%로 조작하거나 실제 기기 접근성 설정을 인수한 결과는 아니다. 시각 자료는 로딩 지표·보조 문구의 노출을 확인한 뒤 fixture 조작 버튼을 제외한 `main` 영역을 촬영한다.
- `appBootDuration`은 앱 쉘 준비와 실제 업무 데이터 준비가 다를 수 있으므로 이 값 하나로 체감 속도 개선을 주장하지 않는다. 실측 수치는 측정한 조건과 함께 제시한다.
- 실제 iPhone·Android 설치 PWA의 OS 시작 화면, OS가 앱을 종료한 후의 복귀, 실제 스크린리더 낭독과 현장 사용자 체감은 별도 인수 항목이다.
- 구현 단계에서는 운영 배포를 하지 않았다. 2026-10-30 사용자 후속 승인으로 Hosting만 배포했고 [릴리스 기록](releases/2026-10-30-loading-experience.md)에 검증·복구 정보를 남겼다. 실제 설치 기기의 확인 범위는 위 한계를 유지한다.
