# 급식길 개발 인수인계

기준일: 2026-10-05
대상: 이전 대화 없이 이어서 작업할 새 Codex 스레드

## 1. 먼저 알아야 할 상태

### 2026-10-05 인증 저장소 일치 수정 운영 Hosting 반영 완료

- 사용자 요청 범위를 새 창 로그인 유지 수정으로 한정했다. 최신 main/source `37cf2e9c972c3acd0f124c5c713d53a1803fe269`와 live `b5b031dbcf146a3b`를 대조해 미반영을 확인했다. 해당 source의 [Quality Gate 37179011488](https://github.com/kim-DL/ONWAY/actions/runs/37179011488)는 전체 SUCCESS다. 아래 10월 4일의 “미배포/실기기 미확인”은 당시 기록이며 이 항목이 최신 상태다.
- 로컬 설치 Next 16.3.3과 lockfile 16.3.8의 불일치를 발견해 첫 후보를 사용하지 않고 기존 lockfile로 npm ci를 완료했다. Next 16.3.8, 사진/재고 기능 ON, emulator OFF 및 기존 비공개 설정으로 production build와 PWA·성능·Hosting gate PASS. Export/shipped 102개, precache 89개, initial assets 9개다. 제품 코드나 의존성 파일은 추가 변경하지 않았다.
- 사용자가 명시적으로 승인한 Hosting만 한 번 배포했다(프로젝트 onnuriway, 대상 hosting:onnuriway). Live version `57fef6f82bf25e8d`, release `1791152317653000`, release time **2026-10-05 07:18:37.653 KST**, rollback version `b5b031dbcf146a3b`. Functions·Rules·backend Auth·운영 업무 데이터는 변경하지 않았다.
- apex와 기본 Hosting origin의 canonical 공개 HTTP 검사 각 25개 PASS. 두 origin의 worker SHA-256은 후보 `b2d41262dc2136dbf78f79de59be726e194dbecd498032c5b4b9457a60fb603f`와 일치한다. www는 HTTPS 301로 apex에 이동한다. 기존 비공개 env 파일의 전후 digest는 동일하다.
- 실제 운영 apex의 기존 인증 browser session에서 앱의 업데이트 버튼으로 새 버전을 적용하고 로드된 layout/page/webpack 자산이 후보와 일치함을 확인했다. A 창의 빈 거래처 등록 화면에 합성 문자열만 입력한 뒤 B 창을 열어 양쪽 인증 유지와 A 편집 내용 보존을 확인했다. B에도 별도 임시 입력을 넣어 동시 편집 유지 PASS, B 새로고침 뒤 A 입력 유지/B 로그인 복원 PASS, 반대로 A 새로고침 뒤 B 입력 유지/A 로그인 복원 PASS. 저장은 제출하지 않았으며 기존 거래처 수정이나 동시 저장 충돌 검사는 운영에서 실행하지 않았다. 실제 동시 저장 회귀의 근거는 source의 전체 CI다.
- 마지막 B 임시 입력의 취소 확인창에서 브라우저 도구가 응답하지 않아 사용자에게 해당 확인창 닫기를 요청했다. 따라서 최종 창 정리·console/SW 최종 재검사는 완료로 주장하지 않는다. 핵심 인증/새 창/양방향 새로고침 검증은 이 확인창 전에 통과했다. 업무 화면/개인정보/인증정보는 증거에 저장하지 않는다.
- 사용자는 실제 iPhone 상품사진 촬영·미리보기·저장, 설치 PWA 및 현장 실사 흐름을 직접 확인했고 모두 PASS라고 보고했다. 이는 사용자 실기기 확인 결과이며 이번 desktop 자동 검증과 구분한다. 해당 기능을 이번 범위에서 수정하거나 다시 검증하지 않았다.
- 배포·빌드·후보 manifest·공개 HTTP·비식별 browser 판정은 ignored `output/auth-hosting-20261005/`에 보관한다. 이 배포 기록은 docs-only 후속 커밋으로 main에 저장·동기화하며 제품 source는 37cf2e9와 같아 문서 커밋을 중복 배포하지 않는다.

### 2026-10-04 새 창 로그인 저장소 이동으로 편집 화면이 닫히는 문제 — 로컬 수정 검증

- `e3264ef`의 [Quality Gate `37176011731`](https://github.com/kim-DL/ONWAY/actions/runs/37176011731)는 두 시도 모두 Phase 17의 `phase7-school-detail.spec.ts` 동시 수정 검사에서 실패했다. 두 번째 창의 저장 후 첫 번째 편집 dialog가 없었으며 각 시도는 업무 여정 75 PASS/18 conditional SKIP였다. 앞서 수정한 영업 버튼 접근성 검사는 통과했다. 상품사진 마지막 검사는 선행 실패 때문에 실행되지 않았다.
- 설치된 Firebase SDK의 `getAuth`는 IndexedDB를 우선하지만 현재 AuthProvider는 browserLocalPersistence를 명시한다. 새 창에서 초기화 중 기존 localStorage 사용자 정보를 IndexedDB로 옮겼다 다시 돌리는 과정이 다른 창에 일시적인 사용자 없음 이벤트를 만들 수 있다. demo 환경에서 그 SDK 저장소 이동을 500ms 지연시키자 기존 창의 PIN 화면 노출·편집 dialog 소실과 같은 실패를 5회 중 4회 재현했다. 단순 CPU4 반복에서는 5회 PASS였으므로 timing 조건을 구분한다.
- Client는 `initializeAuth`의 저장소 순서를 Local → IndexedDB → Session으로 지정해 기존 AuthProvider와 처음부터 일치시킨다. 기존 IndexedDB/Session 사용자의 복원·이동 경로와 Google popup resolver를 유지하고, 이미 초기화된 인스턴스는 재사용하며 다른 초기화 오류는 숨기지 않는다. AuthProvider의 토큰/권한 검증·App Check·Rules·backend Auth 설정은 바꾸지 않았다.
- 수정 후 같은 production-mode demo 환경/저장소 이동 지연/CPU4 동시 수정 여정 5회 연속 PASS. 인증·PWA 관련 단위 55 PASS, 전체 lint 및 app/Functions typecheck PASS. 최종 source의 원격 Quality Gate 결과를 별도로 확인한다. 일시적인 probe·CPU 설정·저장소 지연·반복 launcher·진단용 timeout 변경은 최종 diff에서 모두 제거했다. 원래 Phase 7 여정과 모든 assertion/timeout/접근성 규칙/budget을 유지한다.
- 이 수정은 아직 운영 Hosting에 배포하지 않았다. 현재 live는 아래의 `b5b031dbcf146a3b`이며 재확인한 PIN/worker/reload 결과를 이번 로그인 저장소 수정의 운영 증거로 사용하지 않는다. 사용자는 이번 상품사진의 실제 iPhone 촬영 → 미리보기 → 저장을 아직 확인하지 않았다고 답했다. 설치 iPhone PWA 업데이트도 사람 확인이 남는다.

### 2026-10-04 공유 인수문서 재개 점검 및 영업 버튼 접근성 검사 안정화

- 공유 `ONWAY-HANDOFF-2026-10-04.md`는 상품사진 Hosting 배포 전의 기록이다. 최신 Git와 Hosting API를 읽기 전용으로 재확인했다. main은 `f217828`까지 동기화돼 있었고 live version `b5b031dbcf146a3b`와 release `1791083477808000`은 아래 배포 기록과 같았다. 두 origin의 canonical HTTP 검사 각 25개가 다시 PASS했다. 상품사진 수정을 중복 배포하지 않았다.
- Codex in-app browser에서 apex의 기존 인증 세션 복원과 controlled reload 후 인증 업무 화면 복원을 확인했다. 기본 origin에서는 PIN 입력 화면 및 reload 후 화면 유지를 확인했다. 두 origin 모두 `/sw.js`가 activated/controller 상태였고 관찰한 console warning/error는 각각 0개였다. PIN 로그인을 새로 제출하거나 운영 업무 데이터를 쓰지 않았다. 이 desktop browser 결과는 실제 iPhone/native HEIC/설치 PWA 업데이트의 증거가 아니다. 비공개 화면·계정·출입정보는 검증 산출물에 저장하지 않는다.
- 문서 기록 커밋 `f217828`의 [Quality Gate 첫 시도 `37173462612`](https://github.com/kim-DL/ONWAY/actions/runs/37173462612)는 Phase 17의 `phase9-sales-cycle.spec.ts` 학교 일괄 담당 지정 접근성 검사에서 실패했다. 선택 직후 enabled 버튼이 disabled opacity 0.55에서 1로 전환되는 170ms 중에 axe가 측정해 흰 글자/합성 배경 `#82aaeb` 대비 2.35를 보고했다. 배포 source `1029938`과 제품 코드는 같았다. 로컬 진단에서도 enabled=true 직후 opacity 0.679065와 running animation을 확인했고 종료 후 opacity는 1이었다.
- 해당 E2E는 담당 지정 버튼이 enabled인지 단언하고 실제 실행 중/대기 중 CSS transition이 0이 된 뒤 기존 axe 및 터치 크기 검사를 수행하도록 최소 수정했다. 접근성 규칙·assertion·timeout·CSS·제품 코드·budget은 변경하지 않았다. 일시적인 진단 출력·반복 launcher 변경은 최종 diff에서 제거했다. 기존 CSS가 만드는 전환 중간 상태와 검사 시점의 경합을 해결하며 버튼의 최종 색 대비 검사는 그대로 유지한다.
- production-mode demo Emulator 집중 여정 5회 연속 PASS, 집중 lint와 app/Functions typecheck PASS. 기존 main의 같은 HEAD 원격 재실행과 이번 기록/테스트 변경을 포함한 [main Quality Gate](https://github.com/kim-DL/ONWAY/actions/workflows/ci.yml?query=branch%3Amain)를 별도로 확인한다. 최종 판정은 해당 HEAD의 실제 CI 결과다. 로컬 첫 시도는 함수 발견의 10초 초기화 제한으로 로그인 전에 막혔으며 도구의 `FUNCTIONS_DISCOVERY_TIMEOUT=60`만 세션 환경에 설정해 재실행했다. 이 환경 조정과 5회 반복/기존 demo build 재사용 설정은 저장소에 포함하지 않았다.
- 새 테스트 검증은 별도 managed worktree의 demo 프로젝트와 demo export에서 실행해 기본 PC의 운영 export·기존 비공개 env를 보존했다. 로그는 ignored `output/git-hosting-sync-20261004/contrast-*.log`, `resume-*.json`에 있다. 실제 iPhone 촬영·native decoder·설치 PWA 및 Android 실기기 회귀는 사람 확인이 남는다.

### 2026-10-04 Codex·Work Git 정리, 로컬 동기화 및 상품사진 Hosting 배포 완료

- Codex의 납품사진/PR #2 배포 기록과 Work의 PR #2 회귀·audit 및 PR #3 상품사진 작업을 대조했다. PR #3는 main에 병합됐고, 배포 source `10299384ce31a5c14f6984482696841a54637774`의 [Quality Gate `37145617080`](https://github.com/kim-DL/ONWAY/actions/runs/37145617080)는 모든 단계가 성공했다. 클라우드에서 남았던 Hosting 인증 차단을 기존 로컬 Firebase 인증으로 해소했다.
- 기본 PC 저장소 `C:\Users\HOME\Desktop\onnuriway`에서 `git pull --ff-only origin main`을 완료했다. 작업 시작 시 main은 5커밋 뒤였으나 pull 후 원격과 일치했다. 이 배포 기록 이후의 제품 코드 차이는 없으며, 최종 main은 기록 커밋까지 push/pull해 동기화한다.
- 6개 등록 worktree를 모두 점검했다. 미커밋 OPT-3B/3C 실험을 각각 `f75763c`(`codex/opt3b-inventory-photo-experiment`), `2aaebb2`(`codex/opt3c-initial-icon-experiment`)로 checkpoint하고 GitHub에 push했다. 이전 거래처 속성 제거 stash `042e243`도 `codex/archive-customer-attributes-20261004`로 원격 보존했다. 원본 stash는 유지한다. 이 세 보관본은 미채택 작업이며 main/운영에는 반영하지 않았다. OPT-3A·baseline과 이전 PR #2 worktree의 파일·ignored 산출물도 보존했다.
- main에 포함된 것을 확인한 완료 브랜치 field-speed, iphone-delivery-photo, mobile-action-reach, phase7-school-editor-sync의 로컬 4개/원격 4개와 PR #3의 원격 브랜치를 삭제했다. 각 커밋은 main 이력에 남는다. 사용 중인 worktree 브랜치와 미채택 보관 브랜치는 유지한다. 점검한 worktree는 모두 clean이며, 원격 참조에서 도달할 수 없는 로컬 브랜치 커밋은 0개다. 비공개 env·개인정보·빌드/검증 로그는 Git 저장 대상에서 제외한다.
- source `1029938`에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`, `NEXT_PUBLIC_ENABLE_INVENTORY=true`, emulator OFF와 기존 비공개 설정으로 운영 빌드했다. 로컬 사진 집중 unit 56/56, app/Functions typecheck, lint, build 및 기존 PWA·성능·Hosting gate PASS. Export/shipped 102개, precache 89개, initial assets 9개이며 거래처 JS gzip 36,830B, 재고 JS gzip 25,537B다. 전체 회귀의 근거는 위 검증된 source의 원격 Quality Gate이며 문서 기록 변경에 대해 전체 회귀를 다시 통과했다고 주장하지 않는다.
- 기존 Work 채팅의 명시적 배포 승인을 확인하고 `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project onnuriway --only hosting:onnuriway --non-interactive`를 완료했다. Live version `b5b031dbcf146a3b`, release `1791083477808000`, release time **2026-10-04 12:11:17.808 KST**이며 rollback version은 `f56636dafdacfe14`다. Functions, Rules, Auth와 운영 업무 데이터는 변경하지 않았다.
- `https://onnuriway.com`과 `https://onnuriway.web.app`의 canonical Hosting verifier가 각각 25개 공개 HTTP 검사를 통과했다. 두 origin의 worker는 후보 SHA-256 `d90cdbdcfe34049979011c30467e4bcf4f452dc0fa93f741fb650b05fa080426`와 일치한다. apex/www는 Hosting API에서 HOST/OWNERSHIP/CERT ACTIVE, issue 0이며 www HTTPS는 301로 apex에 이동한다. 후보 manifest·전후 release metadata·로그는 ignored `output/git-hosting-sync-20261004/`에 있다. 기존 비공개 env 파일은 수정하지 않았다.
- 최신 상품사진 수정의 실제 iPhone 촬영·native decoder·설치 PWA 업데이트/세션 유지는 사람 확인이 남는다. 공개 HTTP 검사나 Chromium/Emulator 회귀를 실기기 검증으로 표현하지 않는다.

### 2026-10-04 상품사진 iPhone HEIC 전처리 — 구현·main 병합 완료, 당시 Hosting 인증 대기 기록

아래 인증 대기는 위 로컬 PC 배포로 해소됐다. 다음 항목들은 구현과 배포 전 검증의 역사적 기록이다.

- 최신 `origin/main` `b2e435f`에서 별도 `codex/iphone-inventory-photo` worktree/branch를 만들었다. 기존 clean PR #2 checkout의 브랜치와 파일은 보존했다.
- 재고 `InventoryPhotoPicker`가 사용하는 공통 `customer-photo-preparation`은 HEIC MIME/빈 MIME의 HEIC 파일명과 실제 HEIC/HEIF `ftyp` 헤더를 모두 사전 거부했다. 실패는 preview 및 `uploadInventoryPhoto` 이전이다. 상품등록의 실제 iPhone 실패 화면은 전달되지 않았으므로 코드상 차단과 실기기 관찰을 구분한다.
- HEIC/HEIF를 파일명 대신 실제 바이트로 식별해 독립된 File로 복사한 뒤 기존 브라우저 decoder/optimizer로 넘긴다. Safari 17의 native HEIC 지원은 [WebKit 공식 문서](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)에 근거한다. 작은 HEIC도 반드시 변환하며 Safari가 WebP 요청에 PNG를 반환하면 실제 PNG 형식으로 전송한다. 10MB를 넘는 PNG는 동일 2560px/품질 0.82에서 JPEG로 재인코딩한다. 최종 MIME와 0 < bytes <= 10MB를 준비 단계에서 확인해 늦은 저장 실패를 막는다. 서버는 기존 JPEG/PNG/WebP 계약과 final WebP를 유지한다. native decoder가 지원하지 않는 기기는 준비 오류로 끝나고 HEIC를 서버로 보내지 않는다.
- 재고의 직접 촬영 전용 UI, Android JPEG의 불필요한 재인코딩 생략, provider bytes 복사 전 input 유지, 30MB 원본/10MB 전송 제한, request ID, revision, 인증/App Check, Rules와 감사 계약을 유지한다. 공통 전처리를 쓰는 거래처 사진도 영향을 받으므로 관련 테스트를 함께 검증한다. 납품사진 전용 전처리는 변경하지 않았다.
- 로컬 Node 22 clean `npm ci --engine-strict=true`, lint, app/Functions typecheck, 전체 unit 1,706 PASS/15 conditional SKIP, 사진 전처리/10MB 경계 9 PASS 및 거래처 presentation browser 56/56 PASS. 기존 HEIC 사전 거부 browser 기대를 실제 canvas 변환 검증으로 갱신했다. audit High/Critical 0, Moderate 8. production 설정 build와 변경 없는 PWA/성능/Hosting build gate PASS. 기존 성능 검사 본문은 Node `--import tsx`로 실행해 5,000건 검색 p95 1.20ms/50ms PASS(기본 tsx CLI는 이 환경의 Unix socket 제한으로 시작하지 못했다).
- 새 browser 회귀는 HEIC decoder만 Chromium에서 모델링하고 실제 canvas encoder, PIN 인증, Callable, Storage/Firestore Emulator를 사용해 HEIC→WebP, Safari식 PNG 반환과 oversized PNG→JPEG를 검증한다. 기존 JPEG 등록·입출고·교체·제거 여정도 함께 선택한다. CI에 `Inventory photo regression` 단계를 추가했고 guarded inventory launcher의 기본 전체 실행은 유지했다. 로컬 인증 E2E는 Functions Emulator의 Unix socket `EPERM` 때문에 실행 환경에서 차단되어 [PR #3](https://github.com/kim-DL/ONWAY/pull/3) 최신 Quality Gate 결과를 최종 판정으로 사용한다. 실제 iPhone의 카메라·설치 PWA 검증은 별도 사람 확인이 필요하다.
- 이번 작업의 Git 반영과 Hosting 배포는 사용자가 승인했다. 최신 운영 앱의 공개 client 설정을 재사용해 배포 후보를 준비하며, 키는 출력/커밋하지 않는다. Firebase 배포 인증은 현재 클라우드에 없고 연결된 Desktop Commander PC는 offline이다. 운영 업무 데이터와 Functions/Rules/Auth는 변경하지 않는다. 배포 완료를 기록하기 전에는 이 수정이 production에 반영됐다고 주장하지 않는다.
- PR #3 `f562102` Quality Gate `37142014254`의 첫 시도는 `verify` → `Phase 17 emulator and production journey` → `delivery-photo-field.spec.ts:848`의 새로고침 후 완료 수 assertion(5초)에서 실패했다. 동일 테스트의 독립 실행 및 기존 납품사진 전체 11개는 로컬에서 PASS했고 서버도 저장된 당일 override/완료 1곳을 반환했다. 확정 원인을 얻지 못해 납품사진 운영 코드를 추측 수정하지 않았으며 동일 HEAD를 원격 재실행했다. 로컬 Functions Emulator는 설치된 도구의 내부 통신만 loopback TCP로 바꿔 실행했고, 이 환경 보정은 저장소/배포 코드에 포함하지 않는다.
- 로컬 신규 재고 회귀에서 HEIC 3개 경로와 실제 Emulator 통합 12개는 PASS했다. 기존 JPEG 전체 여정은 BottomSheet의 260ms `sheet-rise` 도중 좌표를 재서 고정 action의 y가 0.31px 달라지는 실패를 재현했다. `verifyDetailActions`가 실제 sheet 애니메이션 종료를 기본 timeout 안에 확인한 뒤 측정하게 수정했다. 기존 좌표 오차 0.05px, 터치 크기, assertion 및 timeout은 유지한다. 최종 최신 HEAD의 전체 CI 통과 전에 병합하지 않는다.
- 최종 `5c2ab76f7f6b3ebe2745fe67deb41ac468b7dd8f`의 [Quality Gate #43](https://github.com/kim-DL/ONWAY/actions/runs/37144343949)는 설치·audit·lint·typecheck·unit·Functions/production build·PWA·JS/CSS budget·기존 browser·Deferred sales tools·Phase 17·Inventory photo regression까지 모두 PASS했다. HEIC 3개, 기존 JPEG 전체 여정 1개 및 재고 Emulator 통합 12개는 로컬에서도 PASS했다. 이전 HEAD의 원격 재실행은 Phase 17을 통과한 뒤 동일 좌표 문제(0.27px)에서 실패했으며 최종 HEAD의 애니메이션 측정 동기화로 해결됐다. 납품사진 운영 코드는 변경하지 않았다.
- 해결된 리뷰 스레드 2개, 최신 Vercel Preview 성공 및 mergeability `clean`을 확인하고 [PR #3](https://github.com/kim-DL/ONWAY/pull/3)을 main `9505bf752aa73d7620b8d0af9931a3880bce34dd`에 병합했다. 이 merge의 Git tree는 검증된 PR HEAD와 동일하다. 이 인수인계 기록을 포함한 최신 main의 [Quality Gate](https://github.com/kim-DL/ONWAY/actions/workflows/ci.yml?query=branch%3Amain)를 종료까지 확인한다.
- production 후보의 변경 없는 build/PWA/성능/Hosting gate는 PASS했고 export/shipped 100개, 거래처 JS gzip 36,830B, 재고 JS gzip 25,537B다. Hosting 배포 명령은 Firebase CLI 인증 오류로 운영 반영 전에 중단됐다. 두 공개 origin의 worker는 기존 배포 SHA-256 `6811509ea8d9211989f6337626275a3be556b0dfb9b8d654b790d81a76bfd6b9`와 일치한다. 기존 Firebase 로그인 PC의 Desktop Commander 연결은 여전히 offline이며, 이 작업에 대한 Hosting 배포 승인은 유지된다. 인증 연결 후 최신 main의 production 후보를 검증하고 `--project onnuriway --only hosting:onnuriway`로 배포한 뒤 두 origin을 검증해야 한다. 실제 iPhone 촬영·설치 PWA는 아직 사람 확인하지 않았다.

### 2026-10-03 PR #2 main 반영 및 production Hosting 배포 완료

- PR #2의 최종 source `321431b`는 GitHub Actions `Quality Gate / verify` 전체를 통과했다(`37123859583`). PR을 `main`에 병합한 `4487dbfbacb1f4e1270e516e82d37b5a6560715d`는 검증된 PR HEAD와 파일 내용이 동일하며, 이 source로 운영 빌드했다.
- `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`, `NEXT_PUBLIC_ENABLE_INVENTORY=true`와 기존 비공개 운영 설정을 사용한 Next.js 16.3.8 build, PWA·성능·Hosting artifact gate PASS. Export/shipped 102개, precache 89개, initial assets 9개다. 기존 용량 기준은 유지했다.
- 사용자의 명시적 Hosting 배포 요청에 따라 `npx firebase deploy --project onnuriway --only hosting:onnuriway --non-interactive`를 완료했다. Live version `f56636dafdacfe14`, release `1791037353240000`, release time `2026-10-03 23:22:33.240 KST`이며 rollback version은 `fd6dc3961b8aac38`다.
- `https://onnuriway.com`과 `https://onnuriway.web.app`의 canonical Hosting verifier가 각각 25개 공개 HTTP 검사를 통과했다. 두 origin의 worker가 후보와 SHA-256 `6811509ea8d9211989f6337626275a3be556b0dfb9b8d654b790d81a76bfd6b9`로 일치하며, Hosting API의 새 live version을 확인했다. 로그·후보 manifest·전후 release metadata는 ignored `output/pr2-hosting-release/`에 있다.
- 이번 배포 대상은 Hosting이다. Functions, Rules, Auth, 운영 업무 데이터는 변경하지 않았다. 설치 PWA의 실제 사용자 업데이트·인증 세션·운영 업무 조작을 자동 검증으로 PASS 처리하지 않는다. 운영 빌드에 임시 복사한 비공개 env 파일은 검증 후 제거하고 원본 설정은 보존한다.

### 2026-10-03 PR #2 lockfile 및 braces 의존성 복구

- 작업 전 원본 `main`의 clean 상태와 최신 원격 기준 `131e574`를 확인하고 fetch했다. 별도 clean managed worktree에서 PR 브랜치 `codex/phase7-school-editor-sync`의 `1d8644b`를 추적해 수정했다.
- GitHub Actions `verify`는 `npm ci`에서 실패했다. PR의 `package-lock.json`에는 JSON 대신 잘린 도구 출력이 들어 있었다. 정상 `origin/main` lockfile을 기준으로 기존 버전을 유지하고, 독립 임시 디렉터리에서 npm 10.9.8로 PR의 Next.js·보안 패치·로컬 braces 의존성을 반영한 lockfile v3를 재생성했다.
- `braces`를 root devDependency로 명시했다. 보안 테스트는 자신의 require와 실제 `micromatch` 소비 경로 모두 `vendor/braces/index.js`로 해석되는지 검증하며, 기존 정상 확장과 깊이 100/101 경계를 유지한다. 로컬 패키지에 복사되어 있던 upstream 개발용 mocha·gulp 등의 의존성과 실행 스크립트를 제거했다.
- 공유된 간접 의존성에도 패치가 적용되도록 override를 직접 부모 기준으로 지정했다: `@firebase/firestore`→gRPC 1.13.6, `google-gax`→gRPC 1.14.5, `get-uri`→basic-ftp 6.2.1. 기존 Firebase·Firebase CLI 등의 버전은 보존했다.
- Node 22.23.2 / npm 10.9.8의 `npm ci --engine-strict=true`, lint, app/Functions typecheck, 전체 unit 1,693 PASS/15 conditional SKIP, braces 집중 테스트 3/3 PASS. root/micromatch require의 실제 파일 경로가 동일한 패치 소스임을 확인했다. audit는 High/Critical 0, Moderate 8이며 기존 high gate 기준을 유지한다. 전체 원격 CI의 최종 판정은 PR #2 최신 HEAD의 `Quality Gate / verify` 결과를 따른다. 운영 배포와 운영 데이터 변경은 이번 작업에 포함하지 않는다.

### 2026-09-30 현장 체감 속도 개선 1차 — production Functions·Hosting 배포 완료, 이번 변경의 실기기 확인 대기

- 사용자는 앞선 9/29 iPhone 납품사진 수정의 실제 기기 요청 항목이 모두 해결되어 PASS라고 보고했다. 이번 자동 이동·등록·버튼 개선의 실제 iPhone/PWA 체감은 별도 확인 대상이다.
- 실사 저장을 서버가 확정하면 현재 검색·필터·장소 순서의 다음 미확인 대상을 같은 상세 창에서 자동으로 연다. 같은 품목의 남은 장소는 확정 상세를 재사용하고, 다른 품목은 최신 상세가 준비될 때까지 쓰기를 막는다. 목록 추가 로딩 중 전체 완료를 주장하지 않는다. 등록은 새 품목 저장에만 opt-in 확정 상세를 반환하여 후속 detail GET 한 번을 없앤다. 거래처의 내 납품처 편집·오늘 순서 편집은 저장/취소를 중앙에 놓고 누름·포커스·비활성 상태와 깊이 있는 버튼 스타일을 적용한다.
- Chrome DevTools MCP 412×915·CPU4·Slow4G 합성 1,000품목 실험: 사진 없는 등록 click→상세 사용 가능 p50 1,448.4ms(N3)→972.8ms(N10), 약32.8% 감소·추가GET0/10. 실사 저장확정 p50 753.4→813.9ms로 저장 자체의 가속 근거는 없지만 수동 닫기/다음선택 2→0회이며 다음 최신 상세 p50 1,411.9ms다. 실제 현장 시간이나 INP의 보장값이 아니다. 대용량 사진 업로드와 입출고·유통기한·거래처 서버 지연 전반은 이번 변경의 해결 범위 밖이다.
- 최종 canonical acceptance10/10·내부 Emulator12/12 PASS(`output/field-speed/acceptance-final-5.log`, `output/acceptance/phase17-report.json`). Unit1,690 PASS/15 conditional SKIP, 일반 browser290 PASS, Rules50 PASS. 별도 재고 browser15/15·transaction12/12 PASS(`inventory-e2e-final-3.log`), 거래처 browser11/11 및 두 편집 창 320/360/390/412×글자100/200 레이아웃16개 캡처 PASS다. 저장 실패·요청ID 재시도·revision·늦은 조회·연속 이동·Back·최신 날짜 기준 콜백 경계를 검증했다. 보안 audit는 같은 major patch 후 High0/Moderate8이며 직접 dependencies와 기존 budget/verifier 기준을 변경하지 않았다.
- 제품 source commit `16bc3fd48eb4ae492fd2f4da3d5b727347a7cdaa`를 브랜치와 `main`에 push했다. 운영 설정 build 후 `--project onnuriway --only functions:saveInventoryProduct`를 먼저 배포하고 `--only hosting`을 배포했다. 해당 함수는 ACTIVE, revision `saveinventoryproduct-00009-pon`다. Hosting live version `fd6dc3961b8aac38`, release `1790772595154000`, release time `2026-09-30T12:49:55.154Z`이며 직전 version `2e95ad3ebb435246`가 rollback 지점이다. 두 origin의 canonical Hosting byte/worker 검증과 비로그인 PIN·활성 worker·controlled reload smoke는 PASS다. 운영 업무 데이터 쓰기·삭제, 다른 Functions·Rules·Auth·비밀 값 변경은 하지 않았다.
- 자세한 계약·검증·측정 한계는 [현장 체감 속도 개선 1차](field-speed-phase-one.md)를 따른다. 현장 확인은 이번 배포본으로 연속 수량 일치 확인, 등록 직후 다음 조작, 두 편집 창 버튼, 설치 PWA 업데이트 후 로그인 유지를 평가한다.

### 2026-09-29 iPhone 납품사진 업로드 수정 — production Hosting 배포 완료, iPhone 실기기 확인 대기

- 최신 `origin/main` `8573f94`에서 별도 `codex/iphone-delivery-photo` worktree/branch를 만들었다. 원본 `main`은 깨끗했고 기존 다른 worktree는 수정하지 않았다. 제품 commit `0329302570173a7953f7d8e57cf0b5b592a2616c`를 브랜치와 `main`에 push했다.
- 코드상 확인된 업로드 전 차단점은 세 가지다. 납품사진 전처리는 iPhone의 HEIC/HEIF 선택을 MIME·파일명·헤더에서 거부했다. Safari가 `canvas.toBlob("image/webp")` 요청에 PNG를 반환하면 WebP 전용 검사에서 실패했다. 파일 선택 뒤 창 focus가 `change`보다 먼저 돌아오면 750ms 타이머가 선택 상태를 폐기했다. 이 경로들은 `createDeliveryPhoto` 호출 전에 끝나므로 Storage·Firestore에 기록이 생기지 않는다. 사용자 iPhone의 OS 버전과 오류 문구는 확인할 수 없었으므로 실제 기기에서 어느 차단점이 발동했는지는 구분하지 못했다.
- 납품사진 전용 계층에서 실제 바이트로 HEIC/HEIF를 식별해 브라우저 디코더로 열고, 새 캔버스 WebP를 우선 사용하되 WebP 인코딩이 불가능하면 새 JPEG로 전송하도록 수정했다. 서버의 기존 JPEG/WebP 입력 계약과 최종 evidence/thumbnail WebP, 인증 Callable·request ID·감사·Storage 경계는 그대로다. 선택기 focus 기반 취소를 없애고 늦은 `change`를 수용하면서 중복 선택 차단을 유지했다. 고정 날짜의 납품사진 테스트와 Emulator gate는 두 번째 만료 확인 시계를 fixture 기준으로 명시했다. 감사 gate에서 발견된 개발 도구 경로의 High 취약점은 `fast-uri`만 3.1.6→3.1.8로 갱신했다.
- 납품사진 집중 unit/계약 121/121, 인증 demo Emulator 납품사진 browser 11/11, 서비스 gate PASS. Safari식 PNG 반환과 focus 후 850ms 지연된 카메라·앨범 선택은 Chromium 자동화에서 JPEG 전송→Callable→서버 WebP 저장→기록 1→2장 표시까지 검증했다. 전체 release acceptance 10/10, 내부 Emulator 12/12 PASS (`output/acceptance/phase17-report.json`, 2026-09-29 14:38 KST): unit 1,663 PASS/14 SKIP, 공통 browser 290 PASS, Rules 50 PASS, 사용자 여정 76 PASS/13 SKIP. 최종 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` build와 PWA·성능·Hosting gate PASS; 101개 export/shipped, precache 88개, 납품사진 JS gzip 10,201/10,240B다.
- `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했다. 두 production origin의 Hosting verifier PASS, 후보와 두 origin의 `/sw.js` SHA-256 일치(`ea1f6e0ba0a93603703ce8d85cf2b81f06238d95093918b7e1c894d46dfa2e17`). Functions, Rules, Auth, Storage 설정과 production 업무 데이터는 변경하지 않았다.
- iPhone 실기기의 실제 카메라 촬영·앨범 선택·PWA 세션 검증은 수행할 수 없었다. 위 HEIC 경로의 자동화는 구성한 파일 헤더와 mock 디코더를 사용했고 실제 iPhone 사진/디코더 시험이 아니다. 상품등록 사진은 별도 `customer-photo-preparation`/`photo-upload-optimizer` 계층을 사용하며 이번 변경으로 영향받지 않는다. 그 계층의 기존 HEIC 거부는 별도 과제로 남는다.

### 2026-09-27 재고 즉각성 최적화 — 로컬 구현·반복 측정·회귀 검증 완료, 운영 미배포

- 기준 source는 `082a6c0`다. 변경 전 source/export와 최종 측정 버전 `final-v3-source`/`final-v3-built`는 ignored `output/playwright/inventory-benchmark/`에 보존했다. 이번 변경은 로컬 작업 트리에 있으며 commit·push·운영 배포는 하지 않았다. 사용자 운영 데이터와 자격 증명도 변경하지 않았다.
- 목록 사진·사진 유무 표시 제거, snapshot 기반 상세 즉시 표시와 최신 확인 전 수정 차단, 접근 상실·늦은 응답 정리, 검색 파생 계산 재사용, idle 코드 준비와 등록 폼 첫 paint 분리, 비동기 Base64 변환, 재고에서 소비하지 않는 original encode 생략을 적용했다. 기존 thumbnail/preview 바이트·품질과 학교 original 경로, Auth/App Check·revision·request ID·감사·재시도 계약은 유지했다.
- 동일 CPU 4배·RTT 120ms·모바일 회선 조건에서 변경 전/후 각각 100개·1,000개 상품 20회씩 측정했다. 1,000개 p75는 중간 검색 123→19ms, 상세 첫 표시 2,028→160ms, 최신 상세 2,036→285ms, 첫 등록 입력 준비 797→346ms다. 첫 목록 행은 1,521→1,512ms로 사실상 유지됐다. 목록 사진 POST 18→0, 사진 수신 749,682→0B; 전체 목록 수신량은 100개 86.3%·1,000개 46.6% 감소했다.
- lab INP 추정 p75는 1,000개 224→176ms지만 100개는 152→192ms로 악화됐다. 두 조건 모두 200ms 이하며 실제 field INP는 아니다. 제한 회선의 상세 사진 약 7.1초·사진 포함 저장 확정 약 19.1초가 남는다. 저장 첫 paint의 일관된 개선으로 주장하지 않는다.
- page size 40은 초기 검색 completeness 실패로 폐기하고 기본 100건을 유지했다. 60초 TTL·검색/필터/스크롤 복원과 warm context/list 0요청을 유지했으며 실제 61초 뒤 재조회도 확인했다. idle import·준비된 컴포넌트 사용·폼 mount gate는 일반 및 설치/제어 SW 비교의 결합 효과를 근거로 채택했다. Save-Data에서 speculative code import를 생략하고 선행 데이터/사진 요청은 없다.
- 최종 canonical acceptance 10/10 및 내부 Emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-27 13:14:09 KST): unit 1,661 PASS/14 조건부 SKIP, 공통 browser 290 PASS, Rules 50 PASS, full user journey 75 PASS/재고 별도 실행 대상 13 SKIP. 재고 static browser 13/13와 Functions integration 11/11는 별도 최종 실행에서도 PASS했다. 320·360·390·412px 및 실제 브라우저 200% 확대의 경계·캡처를 확인했다. 48px DOMRect의 미세한 부동소수점 오차만 검사에서 허용했으며 실제 layout subpixel 미달은 계속 실패한다.
- 마지막 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` build와 기존 PWA·성능·Hosting build gate PASS. Export/shipped 101개·precache 88개·initial assets 9개, 재고 JS gzip 25,590/25,600B다. 기존 verifier·ceiling은 변경하지 않았다. 남은 JS 여유가 10B이므로 후속 변경에도 같은 gate가 필요하다. 전체 측정 이후의 작은 중복/용량 정리는 보고서에 구분했고 최종 제품 SHA-256 manifest로 마지막 build 이후 소스 불변을 확인했다.
- 전체 수치·방법·실패한 후보·안전성 근거·한계는 `docs/inventory-responsiveness.md`. 최종 로그는 `output/inventory-performance/acceptance-final-2.log`, `inventory-e2e-final-4.log`, `release-*.log`다. 실제 Galaxy 카메라·설치 PWA·OS 키보드·Cloud Functions cold start는 미측정이다. 운영 배포는 별도 명시적 승인 후 별도 작업으로만 진행한다.

### 2026-09-26 검토본 거래처 이전 준비 — 운영 데이터 등록 대기

- 사용자 검토 파일 `온누리_거래처_통합검토_20260926(자동 복구됨).xlsx`는 228행 중 확정 209, 제외 15, 보류 2, 미검토 2다. 사용자는 같은 이름·주소인데 출입번호와 메모가 다른 C-035·C-200을 보류하고, C-084·107·157·161의 `확인 필요` 출입번호는 빼고 `미확인`으로 거래처를 등록하라고 결정했다.
- 검토본의 확정 행 207개를 기존 `customerDraftSchema`로 검증한 비공개 JSON 등록 자료를 대화 작업 공간의 ignored `outputs/01a0da91/온누리_거래처_급식길_등록자료_20260926.json`에 만들었다. 원본 메모에는 번호가 재기록된 경우가 있어 JSON의 납품 안내에는 최종 위치 안내·함께 표기된 상호·검토 메모만 넣었다. 미확인 74개 행의 출입번호는 비어 있다. 개인정보가 담긴 JSON 자체는 이 저장소에 복사하거나 커밋하지 않았다.
- 관리자 전용 일괄 등록 UI를 commit `8a342ae`로 추가하고 production Hosting site `onnuriway`에 배포했다. 각 행은 기존 인증·App Check가 적용된 `listCustomers`/`saveCustomer` Callable을 거치며, 등록 전 최신 목록 대조, 충돌 보류, 요청 ID, 저장 후 재조회가 있다. 앱/Functions typecheck, focused lint·unit 3/3, PWA·성능·Hosting build gate, `git diff --check`가 통과했다. backend/Rules/Auth는 변경하지 않았다.
- 운영 관리자 화면의 현재 거래처는 16곳이다. 사전 이름·주소 대조는 신규 196, 기존과 일치 7(C-005·064·082·087·165·180·198), 추가 대조 4(C-048·095·146·157)다. 이는 실제 등록 전의 사전 결과다. Chrome 확장 프로그램이 로컬 JSON 자동 파일 선택을 차단했고 사용자는 현재 직접 선택하기 어렵다고 답했다. **운영 거래처는 아직 한 건도 등록하지 않았다.**
- 재개할 때 관리자 화면 `거래처 관리 → 일괄 등록`에서 위 JSON을 직접 선택하고, 화면의 최신 대조 결과를 확인한 뒤 신규 건만 등록한다. 완료 전후 서버 목록을 확인하고, 4개 충돌 건은 별도 검토한다. C-035·C-200은 사용자 결정대로 계속 보류한다.

### 확인된 사실

- 저장소: `C:\Users\HOME\Desktop\onnuriway`
- Git branch: `codex/mobile-action-reach`
- Phase 3D 운영 배포 당시 제품 코드 commit은 `b4831ff4d24b8956e327ea806f1ca6bba1651d9c` (`Add delivery photo deletion`)다. 현재 production frontend는 아래 최신 HEAD에서 생성했으며 재고 목록 리뉴얼과 거래처·납품사진 버튼 리뉴얼을 모두 포함한다.
- 초기 HANDOFF 정리 시점에 기록된 대규모 dirty worktree는 이후 P0~P2, 재고 제조사 M1~M3, inventory mobile controls checkpoint로 정리되었다. 이 문서의 각 시점별 기록은 역사적 검증 결과로 유지한다.
- 2026-09-21 HANDOFF 마감은 documentation-only로 진행하며 제품 코드·dependency·테스트·설정을 변경하지 않는다.
- 운영 Frontend는 Next.js static export → Firebase Hosting site `onnuriway`다. 운영 주소는 `https://onnuriway.com`, 기본 주소는 `https://onnuriway.web.app`이다.
- Backend는 Firebase Auth, App Check, Firestore Standard/Native(서울), Storage, Cloud Functions 2nd gen(Node 22, `asia-northeast3`)이다.
- 거래처, 학교납품, 영업/홍보, 재고에 더해 납품사진 field workspace가 production feature flag로 활성화돼 있다.
- 현재 Firebase Hosting live release는 `1790370192765000`, version은 `b781fb1f1aa7b0c2`, 배포 시각은 `2026-09-26 06:03:12.765 KST`다. 실제 Service Worker 경로는 `/sw.js`이고 SHA-256은 `652df0a18bbd3ca09a53f4530f5e9179eef354adb5cc2e1a3112be91f5704306`이다. 직전 rollback 지점은 release `1790342901611000`, version `909242c5e854c0e3`이다.
- 납품사진 Phase 3D 운영 기능과 Galaxy S20+ 실사용 확인은 완료됐다. 실기기에서 과거 기록 진입점을 찾기 어려웠다는 후속 피드백을 반영한 기록 접근 UX는 production Hosting에 배포됐다. 새 UX의 Galaxy 실기기 smoke는 아직 남아 있다. 아래 과거 FEATURE FREEZE 기록은 당시 결정이며 이 후속 범위를 제한하지 않는다.
- 2026-09-21 release `1789983232326000`, version `2c48893eab60f919`와 worker `2129650a8800dedc5239af91185d3310ba735fe0fd9d8dffb3d3910e84f48594`는 당시 inventory/manufacturer production 기록이며 현재 live baseline이 아니다.

### 2026-09-26 최신 HEAD Hosting 승격 — 재고·거래처·납품사진 UI, Galaxy smoke 대기

- 사용자가 Galaxy S20+의 이전 재고 리뉴얼 결과를 PASS로 보고한 뒤, 운영 `onnuriway.com`의 인증된 거래처 홈·상세와 납품사진 목록·기록 날짜를 읽기 전용으로 관찰했다. 운영 사진 촬영·편집·저장은 실행하지 않았다. 검증된 제품 source commit은 `0c04dd47022025f5426d3f2db7c79006a1af0e60`이며, 버튼 관찰·디자인 결정과 전후 캡처는 `docs/customer-button-design-renewal.md`에 기록했다.
- 기존 화면 배경을 유지하며 거래처 검색·상세 길찾기와 납품사진 카메라·선택 날짜를 남색 주 행동으로, 보조 버튼은 흰색 면·청색 테두리·하단 그림자로 통일했다. 카메라 아이콘과 중앙 정렬을 수정하고 사진 기록 날짜의 둥근 pill을 각진 탭으로 교체했다. 거래처 홈의 `마지막 확인` 표시만 제거했다. 기능·backend·Rules·feature flag·운영 데이터 계약은 변경하지 않았다.
- 전후 브라우저 캡처는 ignored `output/playwright/button-renewal/before/`와 `after/`에 있다. Galaxy S20+에서 새 배포본의 재고 행 밀도·조사 상태·사진 유무·고정 `새 품목` 간섭, 거래처 버튼 색·강조 단계와 검색/전체보기/등록, 납품사진 카메라 중심·정보/더보기·날짜 탭 스와이프·viewer/Back을 확인해야 한다. 설치 PWA의 기존 session 유지, 한 손 터치, 200% 확대, 하단 탐색 간섭·가로 overflow와 실제 현장 속도/혼동 여부도 사람 확인으로 남는다.
- 거래처 static browser 28/28, 인증 demo Emulator 거래처 16/16·납품사진 10/10 PASS. Canonical acceptance 10/10 gate와 내부 Emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-26 00:37:45 KST): unit 1,584 PASS/14 SKIP, 공통 browser 290 PASS, Rules 50 PASS, full user journey 75 PASS/12 SKIP, 검색 5,000건 p95 1.24ms. 최종 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` build와 PWA·성능·Hosting gate가 다시 PASS했고 export/shipped 100개·precache 87개·initial assets 9개다. Customer CSS raw 48,132/49,152B·JS gzip 36,798/36,864B, Delivery-photo CSS raw 6,121/6,144B·JS gzip 10,222/10,240B, History dates CSS raw 1,013/1,024B다. 기존 ceiling·verifier는 변경하지 않았다.
- **운영 승격:** clean HEAD `9109d58bf0a1e7b372030691e83e1e68bfc95b62`는 재고 제품 commit `4b778e6c895adba083816569fa349321a6e2a2ee`와 버튼 제품 commit `0c04dd47022025f5426d3f2db7c79006a1af0e60`을 계보에 포함한다. 버튼 제품 commit 뒤 HEAD까지 제품 diff는 없다. `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 명시한 production build에서 기존 PWA·성능·Hosting gate를 재통과했고 navigation bundle의 납품사진 기본값은 `true`다. 후보 `out` 100개 파일 집합 SHA-256은 `3e777093dc9678390ca41329ca304ab28b9b3f1b0c8ae2a231929e6357e6f363`이다. `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했다. Functions, Firestore, Storage, Rules, Auth, Vercel, 기타 Firebase/GCP 설정과 production 데이터는 변경하지 않았다.
- **운영 검증:** Hosting API에서 위 live/rollback release·version을 확인했다. 두 운영 origin의 canonical Hosting verifier가 PASS했고 각각 후보의 `_next/static` 전체와 주요 설치 자원 등 90개를 SHA-256으로 대조해 불일치 0건이다. `/sw.js`와 precache 87개가 후보와 일치하고 재고 상태·거래처/납품사진 새 버튼 bundle이 배포본에 포함된다. 새 비로그인 Chromium에서 두 origin 모두 PIN, root scope 활성 worker, `registration.update()`와 controlled reload 뒤 PIN 복귀, 앱 page error 0건을 확인했다. 콘솔은 각 origin에서 reCAPTCHA storage access 거부와 App Check attestation 403을 남긴다. 직전 release에서도 기록된 headless 환경 현상이며 이번 제품 diff의 회귀 증거는 확인되지 않았다. 인증된 production 내부 조작과 설치 PWA의 기존 session 유지·실기기 체감은 Codex PASS 처리하지 않는다.

### 2026-09-25 재고 목록 모바일 UI/UX 리뉴얼 — production Hosting 승격, Galaxy PASS 보고

- 재고 카드를 기존 `field-list` 구분선 행으로 치환하고 사진이 없는 품목의 빈 thumbnail 자리를 없앴다. 사진이 있을 때만 기존 인증 미리보기를 40×44px로 표시한다. 조사 상태는 지정 조사일에 개인 조사모드 OFF여도 왼쪽에 표시하고 일반 날짜·모드 OFF에서는 숨긴다. 빈 원·체크·순환 화살표의 형태와 기존 `미확인`·`이번 주 확인`·`변동 후 미확인` 텍스트를 함께 사용하며 indicator 자체에는 동작이 없다. 상세 버튼은 행 전체에 유지하고 넓은 화면의 2열도 유지한다. 계산·저장·conflict·audit·PWA·backend 계약은 변경하지 않았다.
- 전후 실제 인증 demo Emulator 캡처는 ignored `output/playwright/ui-renewal/inventory/before/`와 `after/`에 있다. 360×800 지정 조사일의 보이는 품목은 기존 약 3개에서 5개로 늘었고, 320px에서도 최소 4개가 보인다. 320·360·390·412px, 768·1280px, 긴 한국어 품명·큰 수량, 200% 유효 확대를 확인했다. 가로 overflow가 없고 1280px은 2열이다. 320px의 다섯 번째 행은 고정 `새 품목` action 아래에 일부 가려지지만 네 번째 행까지 보이며 마지막 행까지 스크롤할 하단 여백은 유지된다.
- 최종 production 설정 build의 실제 bundle은 재고 CSS raw 29,062/29,184B·gzip 6,624/6,656B, 재고 JS gzip 25,031/25,600B다. 변경 전 29,095B·6,614B·25,029B에서 재측정했다. Customer CSS raw 49,055/49,152B·JS gzip 36,863/36,864B, Delivery-photo CSS raw 6,051/6,144B·JS gzip 10,238/10,240B는 전후 동일하다. 기존 ceiling·verifier·test 기준은 변경하지 않았다.
- 재고 unit/model 405/405, 재고 static browser 12/12, 재고 demo Emulator 통합 11/11, app/Functions typecheck, lint, `git diff --check` PASS. Canonical acceptance 10/10 gate 및 내부 Emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-25 22:17:57 KST): 전체 unit 1,584 PASS/14 SKIP, 공통 browser 290 PASS, Rules 50 PASS, full user journey 87 PASS/472,686ms, 검색 5,000건 p95 1.23ms다. 마지막 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` production 설정 build와 PWA·성능·Hosting gate가 다시 PASS했고 export/shipped 100개·precache 87개·initial assets 9개다.
- **당시 운영 승격:** clean source `4b778e6c895adba083816569fa349321a6e2a2ee`에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 명시해 정적 build와 변경 없는 PWA·성능·Hosting gate를 재통과했다. 생성 navigation chunk의 납품사진 기본값은 `true`다. 당시 후보 `out` 100개 파일 집합 SHA-256은 `04e781f0c71e36f19fe070403c3ac10eba5872600fb1724bd0ca08d151a49423`이다. `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했고 당시 live release/version은 `1790342901611000` / `909242c5e854c0e3`, rollback은 `1790330480187000` / `9e8223c7cd55fe7e`이었다. 직전과 Hosting 설정의 의미도 동일하다. Functions, Firestore, Storage, Rules, Auth, Vercel, 기타 Firebase/GCP 설정과 production 데이터는 변경하지 않았다.
- **운영 검증:** `https://onnuriway.com`과 `https://onnuriway.web.app`의 canonical Hosting verifier가 각각 PASS했다. 각 origin에서 후보의 전체 `_next/static`과 주요 설치 자원·SW 등 90개를 SHA-256으로 대조해 불일치 0건이며, `/sw.js`와 precache 87개도 후보와 일치한다. 새 재고 상태 chunk가 배포본에 포함된다. 비로그인 Chromium에서 양쪽 PIN 화면, root scope의 활성 worker, `registration.update()`와 controlled reload 뒤 PIN 복귀를 확인했고 앱 page error는 0건이다. 새 headless 세션의 Google reCAPTCHA Enterprise는 storage access 거부 및 App Check attestation 403을 console에 남겼다. 관련 App Check chunk 3개는 직전 live version과 byte 단위로 동일하므로 이번 재고 bundle 회귀의 증거는 없지만, 인증된 production 내부 UI와 설치 PWA의 실제 업데이트·세션 유지는 PASS 처리하지 않는다.
- **Galaxy S20+ 사람 확인:** 2026-09-26 사용자가 재고 리뉴얼 결과를 PASS로 보고했다. 세부 항목별 기록은 전달되지 않았으므로 아래 개발자 검증과 구분한다. 거래처를 reference list로 확정할지와 후속 화면 순서는 아직 결정하지 않았다.

### 2026-09-25 거래처·납품사진 현장 UX — production Hosting 승격, Galaxy smoke 대기

- 거래처 목록은 연락처가 없는 행에서도 `길안내`를 독립된 48px action으로 배치해 320·360·390·412px과 200% 글자 확대에서 한 줄로 유지한다. 거래처 상세에는 `납품사진 기록` 요약과 기존 history 진입을 추가했다. 납품사진 목록은 별도 `기록` 버튼과 장식 세로선을 없애고 정보 영역→기존 history, 카메라→촬영, `⋯`→기존 BottomSheet의 앨범/거래처 상세로 정리했다. 날짜 pill은 변경하지 않았다.
- 상세 요약은 기존 인증된 `listDeliveryPhotos({ scope: "customer", customerId, limit: 30 })` 결과만 사용한다. 서버가 적용하는 최근 168시간·active/만료 필터의 projection이며, 30장 한도에 닿으면 `30장 이상`으로 표시한다. History를 열 때 같은 결과를 전달해 중복 조회를 피하고 삭제 후에는 기존 history 경로로 갱신한다. 전체 기간 count, 요약용 Storage 조회, 거래처 목록 N+1 요청은 없다. Schema, Rules, backend 권한·retention, 운영 데이터는 변경하지 않았다.
- 실제 browser 캡처는 ignored `output/playwright/ui-renewal/customer-photo-field/`에 있다. 두 화면의 320·360·390·412px 각각 100%/200%와 거래처 상세/history를 저장했다. 길안내 한 줄·가로 overflow 없음·48px 터치 크기, 정보/카메라/더보기 중심점의 독립 hit target, 상세에서 customer scope 요청 1회와 history 재사용을 검증했다. 설치 Galaxy S20+의 현장 체감은 아직 사람 확인이 필요하다.
- Focused unit 55 PASS, 납품사진 인증 demo Emulator 10/10 PASS. Canonical acceptance는 10/10 gate 및 내부 Emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-25 18:52:44 KST): 전체 unit 1,583 PASS/14 SKIP, safe-config browser 290 PASS, Rules 50 PASS, full user journey 87 PASS/466,022ms, 검색 5,000건 p95 1.24ms다. 최종 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` production candidate build에서 PWA·기존 성능·Hosting verifier PASS, export/shipped 100개·precache 87개·initial assets 9개다. Customer CSS raw 49,055/49,152B·JS gzip 36,863/36,864B, 납품사진 CSS raw 6,051/6,144B·JS gzip 10,238/10,240B, 초기 JS gzip 139,797B다. Ceiling/verifier/테스트 기준은 변경하지 않았다.
- **운영 승격:** clean source `ccaa4d13a9b918093f728d6560d59479d6a5239f`에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 build 프로세스에 명시하고 위 gate를 재통과했다. `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했다. 새 live release/version은 위와 같고 직전 release/version이 rollback 지점이다. Functions, Firestore, Storage, Rules, Auth, 기타 Firebase/GCP 설정과 production 데이터는 변경하지 않았다.
- **운영 검증:** `https://onnuriway.com`과 `https://onnuriway.web.app`의 canonical Hosting verifier가 각각 PASS했다. 두 origin의 `/sw.js`가 후보 SHA-256과 일치하고 각각 precache 87개가 후보 파일과 byte 단위로 일치했다(불일치 0). 새 거래처 상세 사진 기록·납품사진 앨범/거래처 상세 chunk는 precache에 포함된다. 비로그인 브라우저에서 양쪽 PIN 화면, PWA `업데이트` 적용 뒤 PIN 복귀, console error 0건을 확인했다. 인증된 production session이 없어 내부 거래처·납품사진 조작과 기존 로그인 유지·실기기 체감은 PASS 처리하지 않는다.
- **남은 Galaxy S20+ 사람 확인:** 설치 PWA 업데이트 후 기존 로그인/session 유지; 연락처 없는 거래처의 한 줄 길안내; 긴 거래처명·주소·출입비번과 200% 확대; row 상세/전화/길안내 touch 분리; 납품사진 정보 영역→기록, 카메라 촬영, `⋯`→앨범/거래처 상세, history→viewer→Back; 한 손 사용 시 오작동, 하단 navigation·keyboard 간섭과 가로 overflow를 확인한다. 원하는 거래처와 action을 더 빠르고 덜 헷갈리게 찾는지 평가한 뒤 reference list 채택과 다음 화면 순서를 결정한다.

### 2026-09-25 거래처 목록 UI/UX 리뉴얼 1차 — production Hosting 승격, Galaxy smoke 대기

- 거래처 홈의 장식 제목을 압축하고 최근 목록·검색 결과·전체보기를 공통 구분선 행으로 정리했다. 이름·상태·주소·출입비번·납품위치·연락처 순서, 상세 진입 화살표와 별도 전화·길안내 action, 48px 조작 영역을 적용했다. 인증·Callable·데이터 계약과 PWA 동작은 변경하지 않았다. 설계·비교와 Galaxy 확인 항목은 `docs/customer-list-ui-renewal.md`를 따른다.
- 변경 전 390px 및 변경 후 320·360·390·412·768·1280px, 200% 확대 캡처는 ignored `output/playwright/ui-renewal/`에 있다. 실제 demo Emulator의 PIN 로그인, 거래처 빈/최근 목록, 검색·상세·Back·하단 탐색 캡처도 `after/emulator-*.png`에 모았다. fixture는 긴 한국어 이름·출입비번, 행·action 크기와 가로 넘침을 측정한다.
- 거래처 unit 21 files/271 PASS, 거래처 demo Emulator 16/16 PASS. canonical acceptance 10/10 gate 및 내부 emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-25 15:09:50 KST). 전체 unit 1,583 PASS/14 SKIP, safe-config browser 282 PASS, Rules 50 PASS, full user journey 86 PASS/462,982ms, 검색 5,000건 p95 1.24ms다. production candidate build에서 기존 verifier를 수정하지 않고 customer CSS raw 49,101/49,152B, gzip 9,830/9,984B, JS gzip 36,804/36,864B, 초기 JS gzip 139,768B를 확인했다. PWA 및 Hosting build verifier는 PASS, export/shipped 98개·precache 85개·initial assets 9개다.
- **운영 승격:** clean source `4a8f170360bb7d8e4679899c0f07d0853bcae26c`에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 build 프로세스에 지정했다. production build 및 변경 없는 PWA·성능·Hosting gate PASS, export/shipped 98개·precache 85개·initial assets 9개다. 후보 `out` 파일 집합 SHA-256은 `67fb3442ee2863ab93459e8383675b94834326f8370aa9f388f4393f69e02209`이고 `/sw.js` SHA-256은 위와 같다. 생성된 navigation bundle의 납품사진 기본값은 활성(`true`)이다. `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했다. Functions, Firestore, Storage, Rules, Auth, Vercel, production 데이터는 변경하지 않았다.
- **운영 검증:** Hosting API에서 새 live release/version과 직전 rollback 지점을 확인했다. `https://onnuriway.com`과 `https://onnuriway.web.app`의 canonical Hosting verifier가 각각 PASS했고 두 origin 각각 85개 precache 파일이 후보와 byte 단위로 일치한다(불일치 0). 두 origin의 worker hash·manifest·connectivity·초기 asset·cache/scope header·비공개/없는 경로 404를 확인했다. 새 거래처 행 및 납품사진 navigation chunk가 precache에 포함되며 후보와 일치한다. 비로그인 브라우저에서 두 origin 모두 PIN 화면, PWA `업데이트` 적용 뒤 PIN 복귀, console error 0건을 확인했다. Codex는 인증된 production session이 없어 거래처 내부 UI나 기존 로그인 유지·실기기 체감을 PASS 처리하지 않는다.
- **남은 Galaxy S20+ 사람 확인:** 설치 PWA 업데이트 뒤 기존 로그인/session 유지; 거래처 첫 화면의 정보 밀도와 최근 5개; 긴 거래처명·주소·출입비번 줄바꿈; 전체 row 상세 진입; 별도 전화·길안내와 세 touch target의 오작동 여부; 한 손 엄지 사용성; 검색→키보드→결과→상세→Back; 전체보기; 200% 글자 확대; 하단 navigation과 콘텐츠/키보드 간섭; 가로 overflow; 스크롤 정보 scanning을 확인한다. 핵심 판단은 원하는 거래처와 action을 이전보다 빠르고 덜 헷갈리게 찾을 수 있는지다. 이 결과를 사람이 확인한 뒤 reference list 채택 여부와 다음 화면 순서를 결정한다.

### 2026-09-25 OPT-4 release regression — 로컬 PASS, 미배포

- 검증 코드 commit `570a46caaeee2b36963695ba997eac8621c227a0`에서 acceptance의 demo 환경을 고정하고 납품사진 flag를 해당 demo build에만 활성화했다. 원인은 acceptance launcher가 build-time `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS`를 설정하지 않아 납품사진 메뉴가 빠진 것이었다. production 기본값과 제품 코드는 변경하지 않았다.
- 추가 harness 오류 두 건도 수정했다. safe-config 브라우저 runner는 HTTP 200 뒤 실제 클라이언트 설정 화면이 준비될 때까지 기다리고, PIN 로그아웃 테스트는 Firestore auditLogs의 모든 page에서 이번 로그아웃 기록을 확인한다. 단언 완화, 테스트 skip/retry, 성능 예산 증가는 없다.
- 수정 후 canonical acceptance 10/10 gate와 내부 emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-25 09:34:36 KST). OPT-4는 clean commit에서 처음부터 다시 실행해 app/Functions typecheck, lint, unit 1,581 PASS/14 SKIP, 검색 성능 5,000건 p95 1.11ms/50ms, Rules 50/50, 납품사진 backend emulator, production build, PWA/성능/Hosting verifier, safe-config browser 262/262, 재고 static browser 12/12·emulator 11/11, 납품사진 frontend 8/8, 마지막 canonical acceptance 10/10·내부 emulator 12/12를 모두 PASS했다. 마지막 acceptance의 full user journey gate는 469,990ms였다.
- production build의 초기 JS gzip은 139,733B, customer 36,821B, inventory 25,029B, 납품사진 10,230/3,559/2,918/1,662B로 기존 ceiling 안이다. Hosting export/shipped 96개, precache 83개, 초기 asset 9개다. 재고 격리 E2E 전후 기존 production `out` 96개 파일 집합 SHA-256은 `539e34efc16def7a83e8ab2801e82771b5b09f1d9584b42755b5812aca40564d`로 동일했고 `static-app-*` 잔여는 0이다. 마지막 acceptance의 demo build 뒤 production `out`을 다시 생성해 성능/PWA/Hosting verifier를 재통과했다.
- Emulator gate는 순차 실행했고 각 종료 후 공유 포트와 관련 프로세스가 0임을 확인했다. production deploy와 운영 Firebase/GCP mutation은 하지 않았다. audit에는 high 이상 0건, moderate 7건이 남아 있다. 로컬 구조 검증은 통과했지만 설치 PWA의 실제 업데이트·offline 복구, 운영 Kakao 경로와 현장망, 운영 환경의 새 candidate 배포 후 브라우저 확인은 이번 미배포 검증 범위 밖이다.

### 2026-09-25 검증된 RC의 Firebase Hosting 승격 — 완료

- 검증된 HEAD `21bf5bd7358490eb12ed246c3e80a4cfeef1caa6`의 clean tree에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 빌드 프로세스에만 지정해 정적 `out`을 생성했다. flag는 ignored production env 파일에 정의돼 있지 않아 명시적 지정이 필요했고, 이전 운영 Hosting build도 같은 방식이었다. 생성된 navigation bundle의 납품사진 기본값은 활성(`true`)이다. 제품 코드, flag 기본값, dependency, budget, Firebase 설정 파일은 변경하지 않았다.
- production build·성능·PWA·Hosting verifier PASS. 정적 export/shipped 96개, precache 83개, 초기 asset 9개다. 배포 후보 `out`의 파일 집합 SHA-256은 `12dcbb7e4c1a035f86c1ed93d237e02a6233c3c68db8f8ea789d714251f3151e`이고 `/sw.js` SHA-256은 `095e171afb361969b91684702f94ef99c08aaa94208683d1eca16c377dcc9845`다.
- 저장소의 canonical 명령 `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했다. 새 live release `1790297267844000`, version `a85d184f5184fcec`, time `2026-09-25 09:47:47.844 KST`를 Hosting API로 확인했다. 직전 release `1790217833155000` / version `79b66cdeae0b2036`가 rollback 지점이며 그 이전 version은 `e603258b088093f0`이다. Functions, Rules, Auth, Firestore, Storage, IAM, Scheduler, Vercel은 변경하지 않았다.
- `https://onnuriway.web.app`과 `https://onnuriway.com`에서 canonical Hosting verifier가 각각 PASS했다. 두 origin의 worker hash, manifest, connectivity, 초기 asset, cache/scope header, 비공개·존재하지 않는 경로의 404를 확인했고, 두 origin 각각 83개 precache 자원을 후보 파일과 byte 단위로 대조해 불일치 0건이었다.
- 운영 브라우저에서 기본 URL의 비로그인 PIN 화면을 확인했다. 기존 관리자 세션이 있는 custom domain에서는 새 버전 알림의 `업데이트` 적용 뒤 로그인 유지, 운영 개요·거래처 관리·재고 관리의 읽기 전용 진입과 console error 0건을 확인했다. 운영 데이터 저장·수정·삭제나 사진 업로드는 수행하지 않았다.
- Galaxy S20+ 자체를 Codex 환경에서 조작하지 못했다. 사람이 설치 PWA에서 업데이트 적용 뒤 로그인 유지, 직원 계정의 거래처 `납품사진` 메뉴·오늘 경로/기록·viewer/Back, 재고 진입을 최소 확인해야 한다. 이는 이번 desktop browser 및 byte-level 검증으로 대체하지 않는다. 운영 Kakao 지도 타일/길찾기와 현장망 체감도 이번 배포 smoke에서 미확인이다.

### 2026-09-25 납품사진 과거 기록 접근 UX — production Hosting 배포, Galaxy smoke 대기

- **원인:** Phase 3C history/viewer와 `listDeliveryPhotos` customer scope는 존재했지만, 오늘 사진이 있는 거래처의 접힌 `기록완료` 영역에서 버튼처럼 보이지 않는 왼쪽 정보 블록을 눌러야만 열렸다. 오늘 사진이 없는 납품처 및 검색 결과에는 history 진입 자체가 연결되지 않았다. 서버 list는 `deliveryDateKey`, `createdAt`, `expiresAt`, `fromDateKey`를 제공하고 168시간·만료·active 범위와 30장 제한을 이미 적용한다.
- **변경:** 오늘 남은 납품처, 기록완료 납품처, 검색 결과 각각에 명시적 `기록` 버튼을 제공한다. 기록완료 정보 블록의 기존 진입과 history thumbnail/evidence viewer, 삭제·Back 경로는 유지한다. 기존 customer list 결과만 사용해 `전체`(기본), `오늘`, `어제`, 최근 날짜 가로 선택지를 제공하며 전체 기록은 날짜별로 묶는다. 빈 날짜 안내와 `사진은 최근 7일간 보관됩니다.` 문구를 표시한다. 서버의 rolling 168시간은 서울 달력 날짜로 최대 8개 날짜에 걸치므로, 칩은 서버 `fromDateKey`부터 오늘까지 8개로 구성하고 서버가 반환하지 않은 기록은 표시하지 않는다.
- **범위:** 검증된 commit `0d3d5913ebf332282a8735656369b9a579ad4cd5`를 production Hosting site `onnuriway`에 배포했다. Functions, Firestore/Storage/Auth 데이터·정책, production feature flag 기본값과 기존 performance ceiling은 변경하지 않았다. 날짜 UI는 history를 열 때만 로드하는 별도 chunk이며 자체 CSS/JS 계측 한도를 추가했다. Galaxy 실기기의 새 진입 UX는 아직 확인하지 않았다.
- **검증:** 납품사진 관련 unit/contract 19 files·119 PASS(서버의 167h 포함/169h 제외와 만료 evidence 거부 포함), demo Emulator Chromium 9/9 PASS(남은 납품처·검색의 진입, 전체/오늘/어제/빈 날짜, 과거 날짜 thumbnail·viewer·Back, 기존 삭제/업로드 회귀). Canonical acceptance 10/10 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-25 10:46:19 KST), unit 1,583 PASS/14 SKIP, Rules 50/50, safe-config browser 262/262, full user journey 469,807ms다. 최종 production 설정 static build와 PWA/성능/Hosting verifier PASS, export/shipped 98개·precache 85개·initial assets 9개. Initial JS 139,766B gzip, 납품사진 workspace 10,236/10,240B, history 2,683/3,584B, viewer 2,918/3,072B, 날짜 chunk 2,091/2,304B 및 CSS 1,003/1,024B(raw)다. Lint/typecheck와 `git diff --check`도 PASS했다.
- **운영 승격:** clean source commit `0d3d5913ebf332282a8735656369b9a579ad4cd5`에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 빌드 프로세스에만 주입해 `npm run build` 및 PWA/성능/Hosting gate를 통과했다. navigation bundle의 납품사진 flag는 활성이고, `기록`·날짜 선택·보관 안내가 생성된 lazy chunk에 포함된다. 후보 `out` 98개 파일 집합 SHA-256은 `336555eff6e0669f5f74514d5a04143a71bae5a899a382d3652f6bde4e6e47e1`이다. `npx firebase deploy --project onnuriway --only hosting`으로 Hosting만 배포했으며 live release `1790311854498000` / version `8e847575f9771450` (`2026-09-25 13:50:54.498 KST`), rollback release `1790297267844000` / version `a85d184f5184fcec`을 Hosting API에서 확인했다.
- **운영 검증:** `https://onnuriway.com`과 `https://onnuriway.web.app`의 canonical Hosting verifier가 각각 PASS했고, 두 origin 각각 85개 precache 파일을 후보와 byte 단위로 비교해 불일치 0건이다. `/sw.js` SHA-256은 양쪽 모두 후보의 `9cfc045822a77c4f6da6e3717b176f8540818c0bc646eef2ae95e7a6c4b99492`와 일치한다. 두 origin의 비로그인 PIN 초기 화면, PWA 업데이트 적용 뒤 정상 복귀, console error 0건을 확인했다. 이 브라우저에는 인증 세션이 없어 거래처·재고·납품사진의 운영 데이터 화면과 기존 session 유지는 직접 확인하지 못했다. 운영 데이터 write는 수행하지 않았다.
- **남은 Galaxy S20+ 확인:** 설치 PWA 업데이트 후 로그인/session 유지, 오늘 사진 유무가 다른 거래처와 검색 결과의 `기록` 진입, `전체`/`오늘`/`어제`/과거 날짜·빈 날짜·보관 안내, 사진 viewer와 Back, 거래처·재고 read-only 진입을 사람이 확인한다. 이 항목은 Codex의 정적 파일 및 비로그인 브라우저 검증으로 PASS 처리하지 않는다.

### 미확인 또는 다시 확인할 사실

- 8명 동시 사용 환경의 실제 read 비용과 현장망 T2/T3는 아직 계측하지 않았다. 이는 이번 inventory mobile UI release의 배포·사용성 확인과는 별도의 운영 계측 항목이다.
- 납품사진 network 장애/retry는 구현·Emulator 검증 범위는 있으나 production fault injection 결과가 명확히 기록돼 있지 않다. Web Share와 GPS nearby suggestion은 freeze 범위 밖의 후속 후보이며 실제 업무 필요성이 확인될 때 별도 Phase로 판단한다.

### 2026-09-23 납품사진 Phase 2A/2B production backend — 완료 당시 기록

- Project `onnuriway` (`347044588399`)의 `asia-northeast3`에 납품사진 Functions 9개만 targeted deploy했다: `getDeliveryPhotoRoute`, `saveDeliveryPhotoRoute`, `getDeliveryPhotoDay`, `saveDeliveryPhotoDay`, `createDeliveryPhoto`, `listDeliveryPhotos`, `getDeliveryPhoto`, `deleteDeliveryPhoto`, `expireDeliveryPhotos`. 모두 ACTIVE, Gen2, Node.js 22이며 전용 runtime SA `delivery-photo-runtime@onnuriway.iam.gserviceaccount.com`을 사용한다. `createDeliveryPhoto`는 1GiB/concurrency 1/maxInstances 4/timeout 120초, `expireDeliveryPhotos`는 maxInstances 1/timeout 120초다. 배포 전후 비교에서 기존 production Functions 62개의 이름·상태·runtime·service account·updateTime은 불변이다.
- Scheduler job `firebase-schedule-expireDeliveryPhotos-asia-northeast3`는 ENABLED, `every 60 minutes`, `Asia/Seoul`이다. OIDC identity는 위 전용 SA이고, 정확한 scheduled Cloud Run service에 이 SA의 service-specific `roles/run.invoker`가 확인됐다. 실제 scheduled invocation은 Batch C에서 수동 실행하지 않았으며 당시 `lastAttemptTime`은 없었다.
- 전용 Standard bucket `prod-delivery-photos-an3-68e5c4d72a90`은 같은 project/region에 있으며 UBLA ON, Public Access Prevention enforced, Soft Delete OFF, Versioning OFF, Autoclass OFF, retention/default hold 없음, bucket 전체에 적용되는 Lifecycle Delete age 8일이다. Batch C 후 object count는 0이다. 기존 업무 bucket `onnuriway.firebasestorage.app`은 변경하지 않았다.
- 전용 SA의 project role은 `roles/datastore.user`뿐이다. 전용 bucket의 custom role `projects/onnuriway/roles/deliveryPhotoObjectRuntime`은 `storage.objects.create/get/delete`만 포함한다. 전용 bucket create/get/delete는 GRANTED, list/update는 DENIED이며, 기존 업무 bucket의 create/get/delete/list/update는 모두 DENIED로 검증했다. M2 legacy ACL baseline 대조에서도 새 SA의 기존 bucket 접근 경로는 확인되지 않았다.
- `deliveryPhotos` COLLECTION composite index 2개는 `deliveryDateKey ASC, createdAt DESC` (`CICAgJjmiJEK`) 및 `customerId ASC, createdAt DESC` (`CICAgNi47oMK`)로 모두 READY다. 기존 index 5개는 불변이고 `deliveryPhotos`·`deliveryPhotoDays` TTL은 없다. Git에서 제외된 `functions/.env.onnuriway`에 production deploy용 `DELIVERY_PHOTO_BUCKET`·`DELIVERY_PHOTO_SERVICE_ACCOUNT`가 설정돼 있다.
- Batch C에서 9개 runtime/options, 기존 62개 불변, Scheduler·Cloud Run invoker를 확인했다. 무인증 `getDeliveryPhotoRoute` Callable smoke는 HTTP 401, `application/json`, `error.status=UNAUTHENTICATED`였다. 인증된 운영 납품사진 Callable 호출, 사진/문서 write, Hosting/frontend deploy는 하지 않았다. 버킷 객체는 0개이며 Firestore 업무 collection의 document count는 직접 조회하지 않았다. rollback은 필요하지 않았다.
- **당시 경계:** backend infrastructure는 production에 있지만 delivery-photo feature flag는 OFF이고 UI는 production에 노출되지 않았다. 아래 2026-09-24 Phase 3 기록이 이 과거 경계를 대체한다.

### 2026-09-24 납품사진 Phase 3A/3B/3C — production 완료

- **Phase 3A field workspace:** 오늘 남은 납품처와 기록완료 projection, 기본 route, today override, 내 납품처 편집, 오늘 거래처 추가/제외, 순서 편집, 거래처 검색, 최근 거래처 20 활용을 구현했다. route/day/photo metadata repository를 연결하고 화면 상태는 Memory-only로 유지하며 revision conflict를 처리한다. 별도 completion boolean은 저장하지 않고 server-confirmed photo metadata count에서 기록완료를 투영한다.
- **Phase 3B capture/upload:** camera capture와 album selection, max long edge 2560, fresh WebP re-encode, orientation normalize, crop/upscale 금지, EXIF/GPS 제거를 적용했다. upload coordinator와 job은 Memory-only이고 customer당 active job 1개, preparation concurrency 1, Callable relay 최대 2개로 제한한다. duplicate tap을 막고 같은 사진 retry는 동일 request ID/payload를 유지한다. `createDeliveryPhoto`가 반환한 server-confirmed metadata 이후에만 기록완료로 이동하며 persistent/offline upload queue와 Client direct Storage write는 없다.
- **Phase 3C history/viewer:** 기록완료 customer history를 `listDeliveryPhotos` customer scope로 읽고 최근 기록 N장, metadata-first, viewport thumbnail lazy load, 선택 evidence lazy load, 등록자/등록 시각을 제공한다. viewer는 previous/next, Arrow keys, Escape, Android Back, dependency 없는 pointer swipe를 지원한다. Blob/Object URL은 Memory-only이며 viewer close/logout/session 변경 시 정리하고 persistent photo cache는 두지 않는다.
- **Galaxy 실기기:** Galaxy S20+ production에서 camera upload, album upload, 기록완료 이동, 기록완료 customer의 추가 사진, 여러 장 순차 촬영/저장, history, thumbnail, evidence viewer, previous/next, Back 뒤 history 유지가 모두 PASS했다.
- **Card UX (당시):** 기존 `Customer.accessPassword`를 추가 조회 없이 in-memory catalog에서 재사용하고 `accessPasswordState === "registered"`일 때만 `행정동 · 출입비번 1234#` 형태로 표시한다. 당시에는 기록완료의 독립 `사진 보기` 버튼을 제거하고 왼쪽 customer 정보 block 전체를 History를 여는 native button으로 만들었다. 이후 명시적인 `기록` 버튼은 위 2026-09-25 로컬 후보를 따른다. camera와 album은 각각 capture/album picker를 여는 독립 sibling control이며 당시 Galaxy 최종 UX 확인이 PASS했다.
- **Backend 불변:** Phase 2B의 delivery-photo Functions 9개 ACTIVE, dedicated runtime SA/bucket/custom Storage IAM, composite indexes 2개 READY, hourly expiration Scheduler, bucket lifecycle Delete age 8일과 기존 business bucket 격리를 유지한다. Phase 3 frontend와 Hosting release 때문에 Functions, Firestore, Storage, IAM, Scheduler resource를 변경하지 않았다.
- **Production frontend:** `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` candidate를 Hosting site `onnuriway`에만 배포했다. live release `1790211742342000`, version `e603258b088093f0`, time `2026-09-24 10:02:22.342 KST`, `/sw.js` SHA-256 `20520cc6aaa7d8b1ca5ee67522e41b9dc4f691429e8b940b7c154ecb52d5291d`다. 두 production origin verifier와 candidate/live worker 및 precache asset 대조가 PASS했다.
- **Bundle ceiling:** Workspace JS는 10,239B gzip / 10,240B로 headroom이 1B뿐이다. Workspace CSS는 6,066B raw / 1,584B gzip, History JS는 3,459B gzip, Viewer JS는 2,811B gzip, Initial JS는 141,040B gzip이다. 앞으로 delivery-photo workspace에 코드를 직접 늘리지 말고 가능한 기능을 event-loaded/lazy chunk로 분리하며 budget 완화보다 split을 우선한다.
- **최종 검증:** app/Functions typecheck, backend contract/Functions 54 tests, frontend 12 files/50 tests, Demo Emulator Chromium 6/6, lint, production build, PWA/performance/Hosting gate, `git diff --check`, 320/360/200% overflow 0, 접근성, production Galaxy 실기기가 PASS했다.
- **당시 후속 범위:** Phase 3A/3B/3C 완료 시점에는 delete UI, Web Share, GPS nearby suggestion을 완료로 기록하지 않았다. delete UI의 이후 완료 상태는 아래 Phase 3D 기록을 따른다. network 장애/retry도 production fault injection 완료로 과장하지 않는다.

### 2026-09-24 납품사진 Phase 3D Delete — production·Galaxy 완료

- **삭제 계약·권한:** 기존 `deleteDeliveryPhoto` Callable의 `requestId`/`photoId` 입력과 `photoId`/`deletedAt` 응답을 재사용했다. 일반 직원은 본인 UID·직원 ID로 등록한 서울 기준 당일 사진만, verified admin은 retention 만료 전 사진을 삭제할 수 있다. Frontend의 action 노출 조건은 UX용이며 최종 권한 판단은 backend다. Functions 제품 코드는 변경하지 않았다.
- **확인·재시도:** 삭제 확인 UI에서 취소, Escape, Android Back은 write 0이다. 첫 delete intent에서 만든 requestId를 동일 photoId의 retry에 재사용하고 rapid double tap은 하나의 logical request로 제한한다. Server-confirmed success 후에만 local metadata를 제거하며 authoritative not-found/already deleted는 reconcile한다. Permission/transport failure에서는 local remove를 하지 않는다.
- **기록완료 projection·privacy:** 사진 수는 삭제 성공에 따라 `3 → 2 → 1 → 0`으로 감소한다. 0장이 되면 오늘 customer photo summary와 기록완료에서 제거되고 오늘 남은 납품처로 즉시 복귀한다. 별도 completion boolean은 저장하지 않는다. 삭제한 사진의 thumbnail/evidence Object URL을 즉시 revoke하고 늦게 도착한 응답은 UI에 반영하지 않는다. Persistent photo cache는 추가하지 않았다.
- **검증·bundle:** delete focused 10/10, delivery-photo frontend 62/62, demo Emulator Chromium 8/8, app/Functions typecheck, lint, production static build, PWA/performance/Hosting gate 및 `git diff --check`가 PASS했다. Workspace JS `10,230/10,240B` gzip(잔여 10B), History `3,559/3,584B`(25B), Viewer `2,918/3,072B`(154B), Delete `1,662/1,792B`(130B), History/viewer CSS `5,548B` raw/`1,418B` gzip, Initial JS `141,056B` gzip이다. 기존 budget 완화 없이 delete는 Viewer 내부 nested dynamic boundary로 유지했다.
- **Production Hosting:** 제품 코드 commit `b4831ff4d24b8956e327ea806f1ca6bba1651d9c`를 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`로 build해 Firebase project/site `onnuriway`/`onnuriway`의 Hosting에만 배포했다. Release `1790217833155000`, version `79b66cdeae0b2036`, time `2026-09-24 11:43:53.155 KST`, `/sw.js` SHA-256 `ebd4c57444b5437ba3f2fe4947a7b54d694ad02e7d56a22718f93fa5694d1a51`다. 두 production origin verifier와 candidate/live worker 및 83개 precache asset hash 대조가 PASS했다. Rollback target은 직전 version `e603258b088093f0`다. Functions/Firestore/Storage/IAM/Scheduler 변경은 0이다.
- **Galaxy S20+ 사용자 실기기 확인:** 사용자가 production에서 본인 당일 사진 delete action, 확인 UI, 취소, 실제 삭제, 사진 수 감소, 마지막 사진 삭제 뒤 기록완료에서 오늘 남은 납품처로 복귀, history/viewer reconciliation, Back/Escape를 모두 PASS로 확인했다. 기존 camera/album/history/viewer 회귀도 없었다. 이는 사용자의 실기기 확인 결과이며 Codex의 production authenticated photo read/write/delete 결과가 아니다.

### 납품사진 FEATURE FREEZE와 다음 작업

1. Core 범위인 route/day, camera, album, upload/retry model, 기록완료 projection, history, thumbnail, evidence viewer, delete, 출입비번 표시를 현재 상태에서 **FEATURE FREEZE**한다.
2. Web Share와 GPS nearby suggestion은 freeze 범위 밖이다. 실제 업무 필요성이 확인되면 별도 Phase로 진행한다.
3. 다음 새 Codex 스레드의 첫 단계는 repository cleanup/optimization을 위한 **OPT-0 READ-ONLY AUDIT**다. 파일과 테스트를 `KEEP`, `CONSOLIDATE`, `DELETE CANDIDATE`, `GENERATED / SAFE TO CLEAN`으로 분류하고 근거와 영향을 기록한다. OPT-0에서는 삭제·수정하지 않는다.
4. 감사 결과를 검토한 후 실제 cleanup 범위를 결정한다. security, Rules, Auth, revision, requestId, upload replay, Emulator, PWA, performance, Hosting regression tests는 중요한 안전망이며 단순히 테스트 파일이라는 이유로 삭제하지 않는다.

## 2. 확정 요구사항과 현재 코드 대조

| 영역 | 확정 요구 | 현재 코드 상태 | 판정 |
| --- | --- | --- | --- |
| 호스팅 | Firebase Hosting과 `onnuriway.com` 사용 | `output: "export"`, `firebase.json` public=`out`, site=`onnuriway`; apex와 www 전환 기록 존재 | 구현·운영 기록 있음 |
| 모드 선택 | 회사명/로고 옆에서 네 모드를 인지 가능하게 선택, 모션과 터치 영역 유지 | 4개면 compact trigger + picker, 적으면 segmented control; 권한 없는 모드는 제외 | 구현됨 |
| 거래처 | 전 직원 조회·등록·수정, 주소/좌표·전화·출입정보·전경사진·전체보기 | Callable 기반 목록/저장/검색/역지오코딩/사진, 지역 directory, 최근 5개 ID 기록 | 구현됨 |
| 학교납품 | compact 카드와 리뉴얼된 field brief, 학교급 아이콘, 사진 확대 | 학교 검색/상세 cache, delivery field brief와 photo viewer 모듈 존재 | 구현됨 |
| 영업/홍보 | 방문 기록, 전화, 현장 사진, route planner, 배송 불필요 정보 제외 | 월별 assignment/profile/visit/history 및 route planner가 분리돼 있음 | 구현됨 |
| 재고 기본 | 냉장·냉동1·냉동2·샘플, 최대 수백 품목, D-100, 제품 사진 1개 | 독립 inventory contract/service/workspace와 네 장소, urgentDays 기본 100 | 구현됨 |
| 재고 입력 | 사진은 등록/수정 모두 촬영 전용, 초기 수량을 한 화면에서 저장 | camera capture 입력과 제품+초기 lot 저장 흐름 존재 | 구현됨; 실기기 미확인 |
| 재고 조사 | 직원별 ON/OFF, 지정일 미완료 강조, 조작한 유통기한만 확인 | sessionStorage preference, per-lot inspection, match-only 확인과 충돌 검증 | 구현됨 |
| 재고 상세 | 2행 고정 action, 더보기에 이력·비활성·삭제, 사진 확대 힌트 | 상세 footer와 more dialog, `showExpandHint`, lot 카드 `수정` 텍스트 존재 | 로컬·운영 실제 Chromium 확인됨 |
| 납품사진 | 오늘 route/day, camera/album upload, 기록완료 projection, customer history/viewer/delete | Memory-only workspace/upload, private Callable relay, thumbnail/evidence lazy load, delete reconciliation, Galaxy Phase 3D production 검증; 기록 진입·날짜 필터는 Hosting 배포·정적 검증 완료 | Phase 3A/3B/3C/3D 운영 완료, 후속 UX Galaxy smoke 대기 |
| 오프라인 | 조회 cache만 제한 허용, 민감 쓰기 queue 금지 | 검색/학교만 namespace IndexedDB, 거래처·재고는 Memory, 쓰기 queue 없음 | 구현됨 |
| 보안 | Client 직접 쓰기 금지, App Check/권한/revision/request ID/audit 유지 | Callable service와 Rules 경계, private no-store 응답 | 구현됨 |

## 3. 현재 아키텍처와 데이터 흐름

### Frontend

- Next.js 16.3.3 App Router, React 19.2.8, TypeScript strict, CSS Modules/전역 token을 사용한다.
- `src/features/app-shell/app-shell.tsx`가 인증된 session의 role scope와 feature flag로 모드를 구성한다. 거래처·영업·재고 Workspace는 동적 import로 분리된다.
- 공유 계약은 `src/domain/*`가 `functions/src/*/*-contract.ts`를 다시 export하는 방식이 많다. Client와 Functions의 Zod 응답 계약을 동시에 변경해야 한다.
- Firebase Web SDK의 Firestore는 `memoryLocalCache()`다. 영속성이 필요한 제한된 데이터는 별도 idb 모듈이 담당한다.

### 쓰기 경계

```text
UI form
  → client repository + Zod input parse
  → Firebase authenticated Callable + App Check
  → authorization/session/role 재검증
  → service transaction(revision + request ID)
  → Firestore/Storage + audit/event/receipt
  → Zod response parse
  → 현재 화면 Memory만 갱신
```

- 거래처: `companies/onnuri/customers/{customerId}`. 목록은 250개 이하 page schema와 cursor로 조회하며 5,000개에서 방어적으로 중단한다. 전경 사진은 Callable과 비공개 WebP variant를 사용한다.
- 재고: `companies/onnuri/inventoryProducts/{productId}` 아래 `lots`, `events`; 별도 `inventorySettings/current`, `inventoryCountCycles`, `inventoryRequests`. 목록은 100개 page, 상세에서 활성 lot와 이력을 읽는다.
- 재고 수량 작업은 metadata revision과 stock revision을 구분한다. `lotSummary`는 `includeSummary: true`인 새 Client에만 포함하도록 호환 배포가 적용됐다.
- 학교·영업 흐름은 기존 `schools`, `schoolFieldProfiles`, 월별 sales cycle/assignment/profile/visit 구조를 유지한다.

## 4. 현재 캐싱과 PWA 경계

| 데이터 | Memory | IndexedDB/local storage | Service Worker |
| --- | --- | --- | --- |
| 학교 검색 Catalog/최근 학교 | Memory index | IndexedDB, session/role/version namespace | 업무 응답 cache 안 함 |
| 학교 상세 공용정보 | 즉시 표시 | IndexedDB | 업무 응답 cache 안 함 |
| 학교 영업정보 | 활성 탭 | 저장하지 않음 | cache 안 함 |
| 학교 thumbnail/preview | Blob Memory | IndexedDB 24개/36MiB | 명시적 thumbnail route만 허용 |
| 학교 original | Memory | 저장하지 않음 | cache 안 함 |
| 거래처 목록/사진 | Memory | 최근 거래처 ID 저장 용량 20개, 기존 홈 표시는 최대 5개인 namespaced localStorage | cache 안 함 |
| 재고 목록/상세/사진/draft | Memory | 실사 모드 preference만 날짜·session 기준 sessionStorage | cache 안 함 |

- Serwist runtime cache version은 코드상 `phase35`다. App Shell navigation은 NetworkFirst(3초), public asset과 학교 thumbnail은 CacheFirst다.
- Firebase, Callable, Storage relay, `/api`, CSV, 거래처·재고·영업 응답은 runtime cache에 넣지 않는다.
- 로그아웃/세션 무효화는 `onnuriway:private:` storage, Blob URL, 검색·학교 상세·학교 사진 IndexedDB와 영업 Memory를 정리한다.
- 업데이트는 자동 `skipWaiting`하지 않고 사용자의 `업데이트` 선택 뒤 적용한다.

## 5. 마지막 확인 결과

### Phase 49에 문서화된 전체 검증 — 확인됨

- 단위 테스트 1,364개 통과, 일반 실행에서 통합환경 전용 13개 제외.
- 정적 운영 유사 UI E2E 10/10 통과.
- 실제 Firestore Emulator 통합 10/10 통과.
- ESLint, 앱/Functions TypeScript, 정적 운영 build, PWA/성능/Hosting gate 통과.
- 360/768/1280px와 1,000개 품목 목록 확인.
- 2026-09-13 09:28 KST Firebase Hosting 반영 후 두 공개 origin에서 GET/HEAD 25개씩 통과. 당시 worker SHA-256은 `1dfd4de1253236f806553930dab9432816eeb32c7443d3aff232b7777ec73d9f`.

### Phase 49 이후 마지막 작업 — 확인 범위 제한

- 임박 상품 필터를 검색창 아래 중앙 checkbox로 이동하고 검색창을 확장했다.
- 실사 토글 문구를 `재고조사` + 아래 `on/off`로 바꿨다.
- 상품 상세 사진 오른쪽 아래 확대 돋보기 힌트를 추가했다.
- 유통기한별 수량 카드의 `정보 수정`을 `수정`으로 바꿨다.
- 마지막 명령 `npm run build && npx firebase deploy --project onnuriway --only hosting`은 성공했다.
- 이 작은 변경 뒤 전체 단위/E2E/Emulator suite와 원격 worker hash 검사는 재실행하지 않았다.

### 초기 HANDOFF 문서 정리 당시 실행하지 않은 것

- 앱/Functions 코드 수정 없음.
- 테스트, typecheck, lint, build, bundle/PWA/Hosting verifier 실행 없음.
- 배포 및 운영 데이터 접근 없음.

### 2026-09-20 P0 회귀 확인 — 로컬

- 실제 Chromium에서 수정 전 360×800 화면을 캡처해 필터 세 개는 한 행의 3열이지만 `재고조사 off`가 가로로 표시되는 것을 재현했다. 원인은 `.countToggleLabel { display: inline-grid; }` 뒤의 `.countToggle > span:last-child { display: inline-flex; }`가 같은 요소의 display를 덮는 cascade였다.
- `src/features/inventory/inventory.module.css`에서 뒤쪽 범용 selector의 `display: inline-flex` 선언만 제거했다. 다른 간격·정렬·토글 동작은 바꾸지 않았다.
- 수정 후 production static export를 쓰는 격리 Chromium에서 `재고조사` 아래 `on/off`, 검색창 아래 3열, 44px 이상 터치 높이, 360px 가로 범위, 1,000개 목록을 computed style과 geometry로 확인했다. flex item인 label의 computed display는 CSS blockification에 따라 `grid`이며 상태 text의 top이 label top보다 아래다.
- 격리된 현재 소스 build는 기존 production `out`/worker를 바꾸지 않았고 98개 파일을 내보냈다. 이 로컬 build의 worker SHA-256은 `00cea3474b853a27b5ddff1091c5137e3333aa40e01ed82518dbdd57ee82cf54`이며 운영 worker와 다르므로 아직 배포되지 않은 build임이 명확하다.
- 제품 상세의 확대 힌트는 사진 버튼 우하단의 23×23 absolute element로 확인했다. 상세 하단은 스크롤 body와 분리된 footer에서 1행 `출고/입고/조정/정보 수정`, 2행 `수량 일치 확인/더보기`가 스크롤 전후 같은 위치를 유지했다.
- 최종 검증: 재고 UI 단위 40/40, 정적 production UI E2E 10/10, Firestore emulator 통합 10/10, 앱/Functions typecheck 통과. 변경 TypeScript 파일 ESLint는 오류 없이 통과했고 CSS 파일은 현재 ESLint 설정상 대상이 아니라 ignore 경고 1건만 발생했다.
- E2E의 이전 2열 geometry, `switch`로 남은 임박 checkbox role, 오래된 `유통기한 정보 수정` 접근성 이름도 현재 렌더링/코드에 맞춰 P0 테스트 기대만 갱신했다.

### 2026-09-20 P0 회귀 확인 — 운영 배포/PWA

- 새 배포는 실행하지 않았다. `https://onnuriway.com`과 `https://onnuriway.web.app`에서 공개 GET/HEAD 25개씩 통과했고, 두 origin의 worker SHA-256은 `35a673947f19f04005c71bcbb67400db6375e07a517055d078643de8bd3e9fcb`로 일치했다. worker는 `no-store`, root scope를 유지한다.
- Firebase Hosting live release는 `1789262169443000`, version `1274c8c40b063e3f`, release time `2026-09-13T01:16:09.443Z`로 조회됐다. 이는 이번 로컬 CSS 수정 전 배포다.
- 기존 Chrome 세션에서 실제 `새 버전이 준비되었습니다` 알림을 확인하고 `업데이트`를 적용했다. 로그인은 유지됐고 재고 화면이 다시 열렸으며, 운영 데이터 저장·실사 완료·상태 변경·사진 업로드는 하지 않았다.
- 운영 360×800 화면에서도 검색창 아래 필터 3열은 확인됐지만 `재고조사 off`는 가로였다. 반면 제품 사진 확대 힌트는 `display: grid`, `position: absolute`로 사진 우하단에 있었고, 상세 body는 `overflow-y: auto`, 2행 footer는 body 아래 별도 영역으로 viewport 하단을 유지했다.
- 확인 후 상세를 닫고 임시 viewport override를 원래대로 복원했다. 브라우저 warning/error log는 0건이었다. 이번 브라우저 확인은 기존 로그인 세션의 읽기만 사용했으며 운영 레코드를 생성·수정·삭제하지 않았다.

### 2026-09-20 P0 배포 준비 검증 — 미배포/차단

- 배포 후보는 `codex/mobile-action-reach`의 `fb173f13d5f1e271b6a34674253d88a4d903bc31`와 dirty worktree 전체로 만든 `out` 98개 파일 및 현재 `firebase.json` Hosting 설정이다. 대상은 Firebase project/site `onnuriway`/`onnuriway`, 산출물은 `out`이다. Functions·Rules·운영 데이터는 이 Hosting 후보에 포함되지 않는다.
- worktree에는 런타임 프런트 파일 100개와 Hosting/build 설정 3개의 미커밋 변경이 있으므로 소스 기준으로 “CSS 한 줄만 배포”되는 후보가 아니다. 다만 직전 운영 `out`과 이번 후보를 내용 비교한 결과, 공개 CSS의 실질 차이는 inventory 후행 rule의 `display:inline-flex` 제거와 그에 따라 생성된 `.inline-grid{display:inline-grid}` rule 추가였다. HTML/RSC, build manifest, webpack runtime, worker의 경로·hash 변경은 새 build ID, CSS hash, PWA revision 참조 갱신이다.
- 후보 식별값: `out` manifest SHA-256 `d17332b727c4ab008305069159e8e7719cb7ef24e66a3e20ee8b48f5a080eeee`, worker SHA-256 `4d0e468fd65b0f3d9b7cf434b045934e4b8f25b29816afd1c1df69093cf2d710`. 직전 운영 worker `35a673947f19f04005c71bcbb67400db6375e07a517055d078643de8bd3e9fcb`와 다르다.
- 새 실행: `npm run build` 통과, PWA build gate 통과, Hosting build gate 통과(98 exported/shipped, 69 precached, 초기 asset 9개). 최종 inventory CSS에는 `.countToggleLabel`의 `display:inline-grid`가 있고 후행 `span:last-child`에는 `align-items`/`gap`만 남았다. worker는 `skipWaiting: false`와 `SKIP_WAITING`, 새 CSS precache를 유지해 기존 사용자 승인형 업데이트 절차와 일치한다.
- 재사용: 직전 P0와 대상 소스/테스트가 바뀌지 않아 재고 UI 단위 40/40, 정적 production UI E2E 10/10, Firestore emulator 10/10, 앱/Functions typecheck와 변경 TypeScript ESLint 통과 결과를 재사용했다. 운영 두 origin/기존 worker/live release 및 실제 업데이트 알림 확인도 현 운영 기준 결과로만 재사용했으며 후보 배포 완료 근거로 사용하지 않는다.
- 차단: `npm run verify:performance:build`가 inventory CSS raw 29,349B로 28.5KiB(29,184B) 예산을 165B 초과해 실패했다. 예산을 완화하거나 코드를 추가 수정하지 않았다. 또한 실행 Node `22.12.0`은 `package.json`의 `>=22.13 <23` 요구보다 낮다. 호환 Node에서 동일 후보를 다시 만들고 성능 gate 실패 원인을 최소 범위로 해소하기 전에는 배포 승인 요청이 불가하다.
- 미확인: 후보는 배포하지 않았으므로 두 운영 origin의 후보 worker/hash 일치, 실제 설치 PWA의 후보 업데이트 알림·적용, 운영 360×800의 세로 `on/off`는 확인하지 않았다.
- 배포 후 확인 절차: 두 origin에 `verify-firebase-hosting-build.mjs --url`을 실행하고 worker hash/no-store/root scope를 대조한 뒤, 기존 로그인 세션에서 업데이트 알림을 사용자 동작으로 적용하고 로그인 유지·재고 3열·세로 `on/off`만 읽기 전용으로 확인한다. 이상 시 Firebase Hosting Release history에서 직전 version `1274c8c40b063e3f`로 rollback하고 두 origin verifier 및 worker `35a673947f19f04005c71bcbb67400db6375e07a517055d078643de8bd3e9fcb` 복원을 확인한다.

### 2026-09-20 P0 차단 해소 시도 — 미배포/Node 차단 유지

- inventory CSS에서는 선언 집합이 같던 `.photoOpen > span`과 `.photoExpandHint`를 한 규칙으로만 합쳤다. 선택자별 specificity와 모든 값은 유지되며 확대 힌트의 UI·동작·접근성은 바뀌지 않는다. 생성 inventory CSS는 29,349B에서 29,175B로 174B 감소해 28.5KiB 예산보다 9B 작아졌고 performance gate가 통과했다. budget/verifier는 변경하지 않았다.
- 현재 설치 확인 결과 nvm에는 Node `22.12.0`, `20.10.0`만 있고 Codex 번들 Node는 `24.19.0`이었다. `package.json`의 `>=22.13 <23`을 만족하는 기존 런타임이 없어 설치·다운로드·영구 환경 변경은 하지 않았다.
- Node `22.12.0`에서 한 잠정 검증은 inventory 단위 313/313, production static inventory E2E 10/10, runner의 demo emulator 통합 10/10, `npm run build`, PWA/performance/Hosting build gate 모두 통과했다. 이 결과는 엔진 요구를 만족하는 실행을 대체하지 않는다.
- 잠정 후보는 `out` 98개, manifest SHA-256 `25b5214dd9c22426fe27ac28b580c172dc5c38a9bcd4de4c68b5882d5c4a27f8`, worker SHA-256 `ee34c666cae3d0c45c84e5a74f0736ad24eed57a7c71afa88d8a0ede9974aa70`이다. 실제 배포와 운영 확인은 실행하지 않았다.
- 남은 차단은 호환 Node 부재 하나다. 기존 변경을 건드리지 않고 Node `22.13` 이상 `23` 미만 런타임을 제공한 뒤 같은 여섯 검증을 재실행해 모두 통과해야 `배포 승인 요청 가능`으로 전환한다.

### 2026-09-20 P0 호환 Node 최종 재검증 — 배포 승인 요청 가능/미배포

- 기존 nvm으로 LTS Node `22.23.2`를 설치·선택했다. npm은 `10.9.8`, 실제 Node binary는 `C:\nvm4w\nodejs\node.exe`이며 `package.json`의 `>=22.13 <23`을 만족한다. package/lockfile/engine은 변경하지 않았다.
- 호환 Node에서 inventory 단위 313/313, production static inventory E2E 10/10, demo Firestore Emulator 통합 10/10, `npm run build`, PWA/performance/Hosting build gate가 모두 통과했다.
- 최종 inventory CSS는 29,175B로 예산 이내다. `out`은 98개 파일, manifest SHA-256은 `852f72c1e5cb139791179a7c083cb5e9507a133fcb3152346fc92b5e9dac80ea`, worker SHA-256은 `df389ad66ac037b57cf4515f764a3a371bfb40fdd19ef8871d2856e9d7410d07`이다. Node 변경에 따른 PWA revision/hash 갱신 외 예상 밖 소스·기능 차이는 확인되지 않았다.
- P0 상태: **배포 승인 요청 가능 — 아직 미배포**. Firebase deploy와 운영 데이터 접근·변경은 실행하지 않았다.

### 2026-09-20 P0 운영 배포 및 검증 — 완료

- 승인된 `out` 98개 파일을 Node `22.23.2` 환경에서 Firebase project/site `onnuriway`/`onnuriway`의 Hosting에만 배포했다. Functions, Firestore/Storage Rules, Extensions와 운영 데이터는 변경하지 않았다.
- 새 live release는 `1789837912426000`, version은 `f1517baef9f1657f`, release time은 `2026-09-19T17:11:52.426Z`다.
- `https://onnuriway.web.app`과 `https://onnuriway.com`에서 기존 Hosting verifier가 각각 공개 GET/HEAD 25개 검사를 통과했다. 두 origin은 worker `df389ad66ac037b57cf4515f764a3a371bfb40fdd19ef8871d2856e9d7410d07`로 후보와 일치했고 `no-store`, root scope를 유지했다.
- 기존 로그인 Chrome 세션에서 `새 버전이 준비되었습니다` 알림을 확인하고 사용자 동작으로 업데이트를 적용했다. 로그인은 유지됐고 재고 화면이 정상 복귀했다.
- 운영 360×800에서 검색 아래 필터 세 개가 같은 행의 3열이고 `재고조사` 아래 `off`가 세로로 표시됨을 computed geometry/style로 확인했다. 상품 사진 확대 힌트는 우하단 23×23 absolute grid였고, 상세 body는 `overflow-y: auto`, 별도 footer는 하단에서 4개+2개의 두 행 버튼을 유지했다.
- 브라우저 console warning/error는 0건이었다. 상세를 닫고 임시 viewport override를 복원했으며 운영 레코드를 생성·수정·삭제하지 않았다.
- P0 상태: **완료 — 운영 배포 및 검증 완료**.

### 2026-09-20 P1 dirty worktree checkpoint 검증 — checkpoint 차단

- Node `22.23.2`/npm `10.9.8`, branch `codex/mobile-action-reach`, HEAD `fb173f13d5f1e271b6a34674253d88a4d903bc31`에서 확인했다. checkpoint 후보는 tracked 65개와 untracked 211개, 합계 276개 파일이며 tracked diff는 2,821 insertions/1,811 deletions다.
- 변경은 거래처 Callable·Rules·도메인·UI·관리자·지도/사진, 학교납품 현장정보·사진·검색, 영업/홍보 배정·경로·방문·내보내기, 재고 Callable·도메인·UI·감사, 공통 모드/모션/사진 UI, PWA/캐시, Firebase Hosting·Rules·Indexes, 테스트·검증 스크립트와 Phase 32~49 문서로 묶인다. `functions/src/index.ts`, app shell, Rules/Indexes와 테스트가 새 untracked 모듈을 직접 참조하므로 일부 그룹만 떼어 checkpoint하면 현재 운영 상태를 재현할 수 없다. typecheck/build/전체 검증에서 소스 누락 신호는 없었다.
- 현재 확정 UX와 어긋난 E2E 기대값만 최소 수정했다. 모바일 compact mode picker, 4모드/기능 플래그 차이, `납품 현장정보` 접근 이름, 영업 coral 색, 보이는 mode control의 touch target/motion 상태를 현재 구현에 맞췄다. 앱 기능 코드는 변경하지 않았다. `.env.example`의 재고 플래그 설명은 배포 완료 후에도 안전한 기본값 `false`를 유지한다는 뜻으로 바로잡았다.
- PASS: typecheck(app/Functions), lint, unit 1,364/1,364(13 skip), performance unit/gate 18/18, `git diff --check`, production build, PWA build gate(worker 41,238B), performance build gate(initial gzip 140,763B), Hosting build gate(98 exported/shipped, 69 precached), inventory static production E2E 10/10과 Firestore Emulator integration 10/10. 전체 `test:acceptance:emulator`도 12개 gate가 모두 통과했고 production user journey는 65 pass/10 skip이다.
- FAIL: `npm run test:acceptance`의 첫 dependency audit가 19건(critical 1, high 2, moderate 16)으로 중단된다. 직접 의존 Next `16.3.2`에 critical Windows-hosted server/Image Optimization advisory가 있고 `js-yaml`, `sharp`는 high다. 현재 앱은 Firebase static export라 Next 서버 경로 노출은 제한되지만 audit gate 실패 자체는 해소되지 않았다. 의존성 업그레이드 금지에 따라 `npm audit fix`는 실행하지 않았다. Emulator는 `firebase-functions` 구버전 경고도 출력했다.
- checkpoint에는 위 8개 기능/인프라 그룹의 소스·설정·Rules/Indexes·테스트·문서와 P1 E2E 기대값 수정을 함께 포함해야 한다. `output/`의 Playwright/acceptance/security/runtime 자료와 `customer-security-analysis.md`, `phase32-kakao-sdk-mobile.png`, `.next`, `out`, Functions 빌드, 로그·cache·로컬 env는 제외한다. 최종 확인 시점 `output/`은 10,805개/약 2.75GB였고 두 가시 파일도 `.gitignore`에 명시했다.
- P1 최종 상태: **checkpoint 차단**. dependency audit 차단을 별도 승인된 의존성 작업으로 해소하고 동일 audit·typecheck·lint·unit·Emulator acceptance·inventory integration·build 3종 gate를 다시 통과하기 전에는 checkpoint 승인이나 P2 시작이 안전하지 않다. commit, push, deploy, 운영 데이터 접근·변경은 실행하지 않았다.

### 2026-09-20 P1 dependency audit 최소 보안 패치 — checkpoint 차단

- Node `22.23.2`/npm `10.9.8`에서 root cause와 설치 경로를 확인한 뒤 직접 의존성만 최소 변경했다. `next`는 `16.3.2`에서 advisory 최소 수정판 `16.3.3`으로 정확히 고정했고, `sharp`는 `0.35.3 → 0.35.4`, `firebase-admin`은 `14.3.0 → 14.4.0`, 개발용 `firebase-tools`는 `15.28.1 → 15.30.2`로 올렸다. Functions manifest도 공유하는 `firebase-admin`/`sharp` 범위만 맞췄으며 `firebase-functions 7.3.2`, React/React DOM과 앱 코드는 변경하지 않았다.
- lockfile에서는 상위 의존성 갱신에 따라 15개 추가·8개 제거·17개 변경이 발생했고 최종 diff는 465 insertions/336 deletions다. `firebase-admin 14.4.0`이 `@google-cloud/storage 8.2.0`/Firestore 9 계열을 선택했고, 취약한 동일-major transitive는 `js-yaml 4.3.2`, `hono 4.13.8`, `morgan 1.12.1`, `qs 6.16.0`으로 해소됐다. direct dependency 추가나 `overrides`는 사용하지 않았다.
- audit는 변경 전 critical 1/high 2/moderate 16, 합계 19건에서 변경 후 moderate 7건으로 줄었다. Next·sharp·js-yaml 및 기존 firebase-admin storage 계열의 critical/high는 해소됐고 `npm run audit`의 high 이상 acceptance 임계치는 통과하지만, 일반 `npm audit`/`npm audit --json`은 여전히 실패한다.
- 남은 개발 경로는 `firebase-tools 15.30.2 → @google-cloud/pubsub 5.3.1 → @opentelemetry/core 1.30.1`, `csv-parse 5.6.0`, `stream-json 1.9.1`, `gaxios 6.7.1 → uuid 9.0.1`이다. production audit에도 `firebase-admin 14.4.0 → @google-cloud/storage 8.2.0 → gaxios 6.7.1 → uuid 9.0.1`의 moderate 2건이 남는다. 현재 최신 상위 direct 버전으로는 해소되지 않으며 각각 Pub/Sub 6/OpenTelemetry 2, csv-parse 7, stream-json 3, gaxios 7+/uuid 11+ 등 transitive major 변경 또는 호환성 미확인 override가 필요하다. npm의 자동 제안인 `firebase-tools 10.1.1` 강제 downgrade도 breaking 변경이므로 적용하지 않았다.
- 일반 audit가 통과하지 않아 지시된 stop condition에 따라 dependency 변경 후 전체 typecheck/lint/unit/acceptance/Emulator/E2E/build gate 재실행은 시작하지 않았다. `git diff --check`는 통과했고 예상 밖 앱/테스트 코드 변경은 없다. commit, push, deploy, 운영 데이터 접근·변경은 실행하지 않았다.
- P1 최종 상태: **checkpoint 차단**. upstream에서 안전한 상위 dependency 패치를 제공하거나 별도 승인 아래 transitive major/override 호환성을 검증하기 전에는 checkpoint 승인 요청이 불가하다.

### 2026-09-20 P1 moderate dependency graph 확정 — dependency 정책 결정 필요

- 일반 audit의 moderate 7개 노드 중 production 포함은 `gaxios`와 `uuid` 2개다. 경로는 `firebase-admin 14.4.0 → @google-cloud/storage 8.2.0 → gaxios 6.7.1 → uuid 9.0.1`이며, 같은 root `gaxios 6.7.1/uuid 9.0.1`은 개발용 `firebase-tools 15.30.2`에서도 공유된다. `npm audit --omit=dev`는 이 2건으로 실패한다.
- dev-only 5개는 `firebase-tools 15.30.2`를 root로 하는 집계 노드 `firebase-tools`, `@google-cloud/pubsub 5.3.1 → @opentelemetry/core 1.30.1`, `csv-parse 5.6.0`, `stream-json 1.9.1`이다. 안전 범위는 각각 Pub/Sub `6.0.1+`/OpenTelemetry Core `2.8.0+`, csv-parse `7.0.2+`, stream-json `3.5.0+`이지만 firebase-tools의 선언 범위는 Pub/Sub `^5.2.0`, csv-parse `^5.0.4`, stream-json `^1.7.3`이어서 모두 transitive major 변경이다. 설치된 firebase-tools `15.30.2`가 현재 최신이고 같은 major 내 상위 direct 업데이트도 없다.
- gaxios advisory 집계 범위는 `6.4.0–6.7.1`, uuid 영향 범위는 `<11.1.1`이다. gaxios v6의 마지막 릴리스가 `6.7.1`이고 firebase-tools는 `^6.7.0`, 최신 Storage `8.2.0`은 `^6.0.2`를 선언한다. 안전한 gaxios 7은 uuid 의존성을 제거했지만 두 부모 범위 밖의 major이며, uuid `11.1.1+` 강제 적용도 gaxios의 `^9.0.1` 범위 밖이다. 최신 firebase-admin은 `14.4.0`, 최신 Storage는 `8.2.0`이라 A/B 해법이 없고, gaxios 7 또는 uuid 11 override는 검증되지 않은 D 단계라 적용하지 않았다.
- 이번 조사에서는 dependency, lockfile, security override와 audit 정책을 변경하지 않았다. 기존 `@serwist/next → browserslist 4.28.9` override만 그대로다. 최종 결과는 일반 `npm audit` moderate 7건, `npm audit --omit=dev` moderate 2건으로 동일하다.
- 기존 high 이상 audit 정책은 변경 없이 통과하므로 전체 P1 회귀 검증을 실행했다. PASS: 앱/Functions typecheck, lint, unit 1,364/1,364(13 skip), Emulator acceptance 12/12 gate와 production journey 65 pass/10 skip, inventory production E2E 10/10, inventory Emulator integration 10/10, production build, PWA gate(worker 41,238B), performance gate(initial gzip 140,763B), Hosting gate(98 exported/shipped, 69 precached), `git diff --check`.
- FAIL: `npm run test:acceptance`의 정적 브라우저 단계는 224 pass/38 fail로 종료됐다. 34건은 `admin-navigation` fixture가 `운영 개요` heading을 만들지 못하는 공통 초기화 실패이며 1개를 단독 worker로 재실행해도 재현됐다. 나머지는 auth shell 색 대비 2건과 welcome particle geometry 2건이다. React/React DOM, esbuild, Playwright, axe-core에는 이번 dependency patch의 lockfile 변경이 없어 명백한 dependency 호환 회귀로 볼 근거가 없으며 앱 코드·테스트·기대값을 수정하지 않았다. inventory demo build 직후 Hosting gate가 demo project 값으로 한 차례 실패했지만 정상 production rebuild 후 세 build gate가 모두 통과해 생성 산출물 문제로 분리됐다.
- P1 최종 상태: **checkpoint 차단 — dependency 정책 결정 필요**. upstream의 호환 패치가 나오거나 transitive major/override를 별도 승인하고 Firebase Admin/Storage 및 CLI 호환성까지 검증해야 하며, 정적 브라우저 38건의 기존 구현/fixture 실패도 별도 최소 범위로 확인하기 전에는 checkpoint 승인 요청이 불가하다.

### 2026-09-20 P1 static acceptance 38건 해소 — dependency 정책 결정만 남음

- `admin-navigation` 34건은 제품 route/auth 회귀가 아니라 esbuild 공통 fixture가 브라우저용 `process.env`를 초기화하지 않아 import 시 `process is not defined`로 mount가 중단된 테스트 환경 문제(C)였다. `tests/e2e/admin-navigation.spec.ts`의 공통 define만 보완했고 그룹 34/34가 통과했다.
- auth shell 2건은 10.08px 브랜드 보조문구가 `#768b84`/`#fbfcf8`에서 3.51:1로 4.5:1 기준에 미달한 제품 스타일 회귀(A)였다. `src/app/globals.css`에서 기존 `--ink-soft`를 직접 사용해 4.71:1로 복구했다. particle 2건은 390×844, no-preference motion의 고정 animation fraction에서 orbit가 제목과 약 5.6px 겹친 제품 geometry 회귀(A)였고, `src/features/app-shell/welcome-greeting.module.css`의 중심만 6px 위로 옮겼다. threshold·허용 범위·retry는 바꾸지 않았으며 두 그룹은 각각 2/2 통과했다.
- 전체 재실행에서 드러난 200% 확대 mobile admin dock/320px settings overflow는 `src/features/admin/admin-navigation.module.css`의 고정 높이를 최소 높이로, `src/features/admin/admin-workspace.module.css`의 grid child를 `min-width: 0`으로 고쳤다. safe-config boundary의 동적 chunk 완료 경쟁은 `tests/e2e/app-shell.spec.ts`에서 `networkidle` 상태를 기다리게 했다. 변경 파일은 위 6개 코드/fixture 파일과 이 문서이며 앱 기능·dependency/package/lockfile/audit 정책은 변경하지 않았다.
- 최종 정적 browser suite는 262/262 통과했다. 전체 P1 회귀도 앱/Functions typecheck, lint, unit 1,364 pass(13 skip), `test:acceptance`, Emulator acceptance 12/12 및 production journey 65 pass/10 skip, inventory production E2E 10/10, inventory Emulator integration 10/10, production build, PWA gate(worker 41,238B), performance gate(initial gzip 140,764B), Hosting gate(98 exported/shipped, 69 precached), `git diff --check`가 모두 통과했다.
- P1 상태: **static acceptance 해결 — dependency 정책 결정만 남음**. 일반 audit moderate 7건과 production audit moderate 2건은 그대로이며 commit, push, deploy, 운영 데이터 접근·변경은 실행하지 않았다.

### 2026-09-20 P1 dependency security exception — checkpoint 승인 요청 가능

- audit 7개 node는 고유 Moderate advisory 4개(`uuid` CVE-2026-41907, OpenTelemetry Core CVE-2026-54285, `csv-parse` CVE-2026-85063, `stream-json` CVE-2026-71429)와 부모 aggregate 3개다. production 2개 node는 `firebase-admin → @google-cloud/storage → gaxios 6.7.1 → uuid 9.0.1`의 동일 uuid advisory이고 나머지 5개 node는 `firebase-tools` 개발 경로다. 상세 경로·버전·패치 범위는 `docs/phase-17-completion.md`에 기록했다.
- 설치 소스에서 gaxios는 `uuid.v4()`를 buffer/offset 없이 호출하며 advisory 대상 v3/v5/v6을 사용하지 않았다. 급식길의 인증된 Storage save/download/delete 경로도 UUID API나 buffer/offset을 제어하지 못해 production 취약 동작은 reachable하지 않다. dev 항목은 Pub/Sub emulator, Auth/Database import, CLI의 Next dependency 분석에만 있고 production runtime/bundle이나 untrusted production request에는 포함되지 않는다.
- `firebase-admin 14.4.0`, `firebase-tools 15.30.2`, `@google-cloud/storage 8.2.0`은 2026-09-20 현재 최신 stable이고 안전한 동일-major 경로가 없다. 범위 밖 major override는 특히 stream-json subpath 호환성을 깨뜨릴 수 있어 적용하지 않았다. dependency/package/lockfile/audit gate와 제품 코드는 변경하지 않았고 직전 전체 P1 PASS를 유지한다.
- Moderate 7건을 숨기지 않고 **2026-10-20까지 known accepted transitive risk**로 일시 수용한다. 새 Firebase stable, Storage의 gaxios 7+ 이동, severity High/Critical 상향, Storage/HTTP 구조 변경 시 즉시 재검토하며 High/Critical은 계속 checkpoint 차단이다.
- P1 상태: **checkpoint 승인 요청 가능 — moderate 7건 문서화된 일시적 예외, 아직 미커밋**. commit, push, deploy, 운영 데이터 접근·변경은 실행하지 않았다.

## 6. 실행·검증 명령

```powershell
# 개발
npm install
npm run dev

# 기본 정적 검증
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run verify:pwa:build
npm run verify:performance:build
npm run verify:hosting:build

# 재고 집중 검증
npm run test:inventory
npm run test:e2e:inventory

# 전체 기존 수용 검증(시간과 Emulator 필요)
npm run test:acceptance
npm run test:acceptance:emulator

# 빌드된 Firebase Hosting 정적 export 로컬 실행
npm start -- --port 3000
```

배포가 명시적으로 요청된 경우에만 실행한다.

```powershell
npx firebase deploy --project onnuriway --only hosting
node scripts/verify-firebase-hosting-build.mjs --url https://onnuriway.web.app
node scripts/verify-firebase-hosting-build.mjs --url https://onnuriway.com
```

Functions는 전체 무차별 배포를 피하고 변경된 Callable 목록과 배포 순서를 Phase 문서에서 확인한다. Phase 49 이후 schema를 롤백해야 할 때는 `.cache/deploy/inventory-compat-phase49-20260913-0910` 호환 패키지를 기준으로 하며, 엄격한 구 parser로 바로 되돌리지 않는다.

## 7. 주의점

- `.env.local`, `.env.production.local`은 무시되는 실제 설정이다. 값 또는 Firebase/Kakao 키를 문서/로그/commit에 넣지 않는다.
- `.firebaserc` 기본 project는 `demo-onnuriway`이고 staging/production alias만 `onnuriway`다. 운영 명령은 반드시 `--project onnuriway`를 명시한다.
- 운영 데이터로 기능 검증을 하지 않는다. 제품/수량/실사/사진/거래처를 테스트 목적으로 저장·수정·삭제하지 않는다.
- 현재 worktree에는 서로 연관된 대규모 미커밋 변경이 있다. 새 스레드는 자동 포맷/대량 정리 전에 diff를 확인하고 unrelated 변경을 되돌리지 않는다.
- `AGENTS.md`의 Next.js 생성 블록을 유지하고, Next API/구조를 바꿀 때는 설치된 `node_modules/next/dist/docs/`의 관련 문서를 먼저 읽는다.
- 실제 Galaxy S20+ 카메라, 설치 PWA 키보드/뒤로가기, 사진 촬영 저장 체감은 자동 브라우저 검증으로 대체할 수 없다.

## 8. 다음 작업 우선순위

### P0 — 최신 UI의 짧은 회귀 확인

1. 로컬 360×800 실제 Chromium에서 재고 필터 3열, `재고조사` 아래 `on/off`, 확대 힌트와 상세 고정 버튼을 확인했다.
2. `.countToggle > span:last-child`의 `display: inline-flex` 덮어쓰기를 실제 재현했고 해당 선언만 제거했다. 격리 production E2E와 computed style 검증이 통과했다.
3. 최신 Hosting의 두 origin, worker hash, live release, 로그인 유지와 PWA 업데이트를 읽기 전용으로 확인했다.
4. inventory CSS 성능 차단과 Node 환경 차단을 해소하고 승인된 후보를 Hosting에 배포했다. 두 origin, worker/PWA 업데이트, 360×800 재고 UI와 console을 확인했으며 현재 상태는 **완료 — 운영 배포 및 검증 완료**다.

### P1 — 현재 dirty worktree 전체 검증과 checkpoint

1. `typecheck`, `lint`, 단위, 재고 E2E/Emulator, build와 세 verifier를 현 소스에서 다시 실행한다.
2. 실패가 없으면 변경을 기능 단위로 검토하고 사용자의 commit 지시를 받아 checkpoint를 만든다. 현재 HEAD만으로는 운영 코드가 재현되지 않는다.

### P2 — 성능과 캐싱

1. 재고의 explicit refresh/reconnect가 모든 100개 page를 다시 읽는 비용과 500개 실사용 규모의 체감 시간을 계측한다. 증거 없이 persistent cache나 realtime listener를 추가하지 않는다.
2. 거래처의 가시 상태 60초 재검증이 8명 사용 환경에서 필요한지 read 수와 stale 허용 시간을 계측한다. 민감 거래처 문서를 durable cache로 옮기지 않는다.
3. Service Worker cache version `phase35` 명명과 현재 Phase 49+ 릴리스의 관계를 정리하되, cache key 변경은 업데이트/오프라인 회귀 검증과 함께 수행한다.
4. 기존 bundle budget(초기·거래처·재고 lazy chunk)과 1,000개 목록 progressive rendering을 최신 코드에서 다시 측정한다.

### 2026-09-20 P2-A 체감속도 연구 — 완료/구현 전

- 격리 production static export + Chromium 360×800 + demo Firebase Emulator에서 100/500/1,000개 재고를 계측했다. 목록 Callable은 1/5/10회, 논리 문서 read는 query cursor sentinel을 포함해 약 100/504/1,009개다.
- warm normal first usable 목록은 500개 약 1.34초, 1,000개 약 1.84초였다. 1,000개 각 page에 300ms를 더하면 약 4.84초였고, 같은 세션 모드 재진입도 context+10 page를 다시 읽어 약 4.35초였다. 첫 100개 run은 callable cold start가 섞여 절대시간 비교에서 제외했다.
- 재고 검색/장소/필터는 1,000개에서도 약 27ms·추가 요청 0회였다. 상세→목록 복귀도 목록 재조회 0회다. 실제 병목은 모든 page 완료 전 목록을 숨기는 구조와 모드 재진입 시 Memory/UI 상태를 버리는 구조다.
- 거래처는 background 성공 중 기존 목록을 유지하지만 250개 전체 page를 60초 timer 및 focus/online/visibility에서 재검증한다. refresh 실패와 retry는 기존 목록을 숨긴다. 8명 실제 활성시간·focus 빈도·현재 거래처 수는 미확인이다.
- `phase35` cache 이름은 namespace일 뿐 현재 Phase와 맞출 필요가 없다. navigation/public asset/학교 thumbnail 정책과 사용자 승인형 worker update를 유지하며 업무 데이터 cache는 추가하지 않는다.
- P2-B 권장 순서: (1) session Memory revalidation coordinator와 in-flight/event dedupe·freshness UI, (2) 인증 namespace별 목록/필터/scroll snapshot 복원, (3) 재고 첫 100개 page progressive publish. durable cache, realtime listener, offline write queue는 범위 밖이다.
- 임시 계측 코드는 제거했다. 제품 최적화, dependency, deploy, commit/push, 운영 데이터 접근·변경은 하지 않았다. 실제 Galaxy S20+ 설치 PWA/현장 네트워크는 미확인이다.

### 2026-09-20 P2-B revalidation coordinator/freshness — 완료/미배포

- 범위는 inventory/customer의 session Memory revalidation만이다. `uid:sessionVersion:permissionsVersion`별 coordinator가 in-flight 요청을 합치고 last-success 60초 TTL로 focus/visibility/online 연속 이벤트를 coalescing한다. logout·권한/session 변경과 인증 실패에서는 coordinator와 민감 화면 상태를 폐기한다. IndexedDB, persistent Firestore cache, Service Worker 업무 cache, realtime listener, offline write queue는 추가하지 않았다.
- background 갱신은 기존 목록을 유지하며 `최신 정보 확인 중 · 마지막 확인 HH:MM`, 성공 후 `마지막 확인 HH:MM`, 일시 실패 후 `갱신 실패 · 기존 정보 표시 · 마지막 확인 HH:MM`을 작은 status text로 표시한다. 인증/권한 실패는 기존대로 목록과 편집 상태를 비운다. 거래처의 기존 offline clear 정책과 재고의 in-memory draft 유지 정책도 바꾸지 않았다.
- 대표 순차 이벤트 기준 revalidation batch 수는 customer가 최초 성공 뒤 TTL 안 visibility+focus+online에서 기존 총 4회(최초 1+추가 3) → 총 1회, TTL 이후 같은 연속 이벤트에서 총 4회 → 총 2회(최초 1+갱신 1)다. inventory는 TTL 안 기존 총 2회(online이 1회 추가) → 총 1회, TTL 이후 기존 총 3회(visibility+online) → 총 2회다. 동시에 들어온 이벤트/in-flight는 한 promise만 사용한다. 한 inventory batch는 context 1회와 전체 100개 page 요청을 포함하므로 1,000개에서는 억제한 batch당 Callable 11회(context 1+list 10)를 피한다.
- write의 authoritative 성공/실패 처리는 변경하지 않았다. 거래처 저장 뒤 `retry`, 재고 설정 저장 뒤 `refresh`는 force revalidation으로 TTL을 우회한다. 재고 수량/lot/상품 write는 기존 mutation 응답과 `InventoryListReconciler`를 계속 사용하며 불필요한 전체 목록 read를 새로 만들지 않는다.
- PASS: coordinator/customer/inventory 집중 34/34, customer 전체 265/265, inventory unit/Functions 315/315, performance 18/18, PWA 17/17, typecheck(app/Functions), lint, `git diff --check`, production static build, PWA/Hosting build gate, inventory production UI E2E 10/10 + demo Emulator integration 10/10, customer mobile Chromium E2E 24/24. 성능 build gate도 통과했다(initial gzip 140,763B, customer lazy 36,705B/36KiB, inventory lazy 25,028B/25KiB). P2-B의 lazy-only 증가만 customer +0.5KiB/inventory +1KiB 예산으로 기록했고 초기·CSS·다른 feature 예산은 바꾸지 않았다.
- 남은 위험: 실제 8명 사용 환경의 focus 빈도/read 감소량과 Galaxy S20+ 설치 PWA 체감은 아직 미측정이다. 60초 TTL 안에는 다른 사용자의 최신 write가 늦게 보일 수 있지만 강제 refresh/write 후 최신화는 억제하지 않는다. 이번 단계는 mode unmount 뒤 목록/필터/scroll을 복원하지 않으므로 모드 재진입은 여전히 전체 목록을 읽는다.
- 다음 단계는 같은 session namespace와 invalidation 경계를 재사용해 **Memory snapshot 복원**을 진행해도 된다. 다만 재고 첫-page progressive publish는 그 다음 단계로 분리하고, snapshot 단계에서 logout/session 변경·offline 정책·write reconcile을 다시 회귀 검증한다. deploy, commit, push, dependency, P3 디자인 변경은 실행하지 않았다.

### 2026-09-20 P2-B2 session Memory snapshot 복원 — 완료/미배포

- customer와 inventory에 각각 작은 module Memory snapshot store를 두고 namespace당 feature snapshot을 최대 1개만 보관한다. namespace는 기존 coordinator의 `uid:sessionVersion:permissionsVersion`을 그대로 쓰며 다른 namespace가 들어오면 이전 coordinator·snapshot·reconciler를 먼저 폐기한다. durable cache, IndexedDB, local/sessionStorage 업무 snapshot, 사진/Blob cache는 추가하지 않았다.
- customer snapshot은 authoritative 목록·freshness/last-success와 검색어·검색창 상태·scroll만 저장한다. inventory snapshot은 authoritative context/전체 목록·기준일·freshness/last-success와 검색어·장소·임박/비활성 필터·표시 limit·scroll만 저장하며 기존 `InventoryListReconciler`도 같은 namespace에서 유지한다. editor/form draft, modal, busy/error, mutation 중간값은 저장하지 않는다.
- warm 재진입은 snapshot을 첫 render부터 사용한다. TTL 안에는 customer/list와 inventory context/list 요청이 모두 0회이며, TTL 만료 시에도 snapshot을 먼저 표시한 뒤 기존 coordinator로 background revalidation한다. 1,000개 inventory 대표 시나리오는 이전 context 1 + list 10 = 11회에서 TTL 안 context 0 + list 0 = 0회로 줄었다. P2-A의 약 4.35초 전체 재조회 loader 대신 동기 Memory render/다음 paint에 기존 목록을 사용할 수 있게 됐으며 별도 절대시간 필드 계측값은 만들지 않았다.
- 모드 재진입 때 customer 검색어·검색창·scroll, inventory 검색어·장소·임박/비활성 필터·표시 limit·scroll을 복원한다. scroll은 목록 commit 뒤 유효 최대 범위로 clamp하며 layout-effect cleanup으로 DOM 축소 전 위치를 보존한다. 데이터가 줄면 범위를 벗어난 위치로 강제 이동하지 않는다.
- logout은 두 store를 즉시 clear하고, uid/sessionVersion/permissionsVersion 변경은 snapshot 반환 전에 이전 entry를 폐기하며, 인증/권한 실패도 catalog/UI를 비운다. customer offline clear와 inventory write/draft 정책은 유지했다. customer authoritative save에는 write generation을, inventory에는 기존 reconciler와 authoritative product update를 적용해 늦은 목록 응답이나 재진입 snapshot이 write 결과를 되돌리지 못하게 했다.
- PASS: snapshot/coordinator 집중 39/39, customer 전체 270/270, inventory unit/Functions 320/320, auth 28/28와 logout snapshot 직접 회귀 1/1, performance 18/18, PWA 17/17, typecheck(app/Functions), lint, production static build와 performance/PWA/Hosting gate, inventory production UI E2E 10/10 + demo Emulator integration 10/10, customer mobile E2E 전체 24/24 및 snapshot remount 집중 4/4. 최신 build gate는 initial gzip 140,764B, customer lazy 36,812B/36KiB, inventory lazy 24,926B/25KiB, worker 41,238B, exported/shipped 98개·precache 69개로 통과했다.
- 남은 위험은 snapshot이 탭 reload/종료에서 사라지는 의도된 Memory 범위, 60초 TTL 동안 다른 사용자의 write가 늦게 보일 수 있는 점, 실제 Galaxy S20+·현장 네트워크 T2 미계측이다. P2-B3 첫-page progressive publish는 진행 가능하지만, page 중간 publish가 retained reconciler/write generation을 우회해 authoritative write를 되돌리지 않도록 결합해야 한다. deploy, commit, push, dependency, P3 및 progressive publish는 실행하지 않았다.

### 2026-09-20 P2-B3 inventory first-page progressive publish — 완료/미배포

- 기존 `listInventoryProducts` 100개 cursor 계약과 5,000개 방어 한계는 그대로다. repository가 각 page 뒤 dedupe된 누적 목록과 page count/complete만 callback으로 내보내고, workspace가 기존 coordinator task 안에서 snapshot listener로 publish한다. 별도 서버 contract, durable cache, 상태관리 계층은 추가하지 않았다.
- cold load는 첫 page가 오기 전까지만 기존 loading을 유지하고 첫 page부터 실제 카드·검색·장소/필터를 사용할 수 있다. 이후 page는 `최신 정보 확인 중` freshness 아래 비차단으로 합쳐진다. stale refresh는 기존 full snapshot을 baseline으로 유지하면서 도착한 page만 덮어쓰고, final page에서 baseline을 제거해 전체 서버 catalog를 authoritative하게 확정한다. 표시 limit·scroll은 B2 snapshot 정책을 유지한다.
- 모든 partial/final publish는 현재 coordinator generation과 namespace 및 retained reconciler identity를 검사한다. `InventoryListReconciler`는 매 page마다 기존 baseline/누적 page 위에 in-flight write 결과를 마지막으로 적용하므로 입고·출고·조정·lot/product write 직후 늦은 page가 값을 되돌리지 않는다. final reconcile에서는 서버에서 사라진 기존 row도 정상 제거된다.
- 통제된 300ms/page 기준 pagination T2는 500개 1,500ms(5 page 완료) → 300ms(첫 page), 1,000개 3,000ms(10 page 완료) → 300ms다. T4는 각각 1,500ms/3,000ms로 동일하다. 요청은 5/10회, 논리 read는 약 504/1,009개로 변경 전과 같으며 E2E의 150ms/page 1,000개에서도 terminal page 전에 60개 카드와 검색이 usable함을 확인했다.
- page 실패는 이미 publish된 목록을 `stale-error`로 유지하고, 인증/권한 실패는 partial catalog까지 폐기한다. refresh 중 모드 재진입은 같은 in-flight를 join하고 현재 partial snapshot을 즉시 복원하며 이후 page 알림을 이어받는다. logout/session/permissions/offline invalidation 뒤의 늦은 callback은 generation/reconciler guard로 snapshot에 들어오지 않는다.
- PASS: progressive 집중 44/44, inventory unit/Functions 328/328, auth/logout 29/29, performance 18/18, PWA 17/17, typecheck(app/Functions), lint, production build와 performance/PWA/Hosting gate, inventory production UI E2E + demo Emulator 10/10. 최신 build gate는 initial gzip 140,765B, inventory lazy 25,163B/25KiB, worker 41,238B, exported/shipped 98개·precache 69개다. `git diff --check`도 통과했다.
- P2의 coordinator/freshness, session snapshot 복원, inventory progressive publish 3단계는 모두 완료됐다. 다음은 실제 Galaxy S20+ 설치 PWA와 현장망에서 T2/T3/read 감소를 재측정한 뒤 상세 cache 또는 제한적 JS prefetch가 필요한지 판단한다. customer progressive, inventory detail cache, JS prefetch, persistent cache, realtime listener, offline queue, dependency, deploy, commit/push, P3는 실행하지 않았다.

### 2026-09-20 P2 checkpoint 통합 검증 — 승인 요청 가능/미커밋·미배포

- P1 checkpoint `0766882` 이후 dirty worktree 28개 파일은 revalidation/freshness, customer·inventory session Memory snapshot, inventory first-page progressive publish와 그 테스트·성능 budget·두 P2 문서뿐이다. unrelated 변경은 확인되지 않았다.
- PASS: lint, app/Functions typecheck, 전체 unit 1,395/1,408(13 skip), `npm run test:acceptance`, `npm run test:acceptance:emulator`, safe-config/customer mobile 포함 browser 262/262, production full user journey 65/75(10 skip), inventory production UI E2E + demo Emulator 10/10, P2 집중 55/55, production build, PWA/performance/Hosting gate, `git diff --check`. 첫 acceptance의 safe-config mobile 1건은 cold compile 중 5초 assertion을 넘긴 일시 실패였고 동일 브라우저 전체 및 acceptance 전체 재실행에서 통과했다. acceptance emulator가 마지막에 demo `out/`을 만든 뒤 production build를 다시 생성해 세 build gate를 최종 확인했다.
- 핵심 계약은 1,000개 TTL 내 재진입 context/list 0회, stale snapshot 즉시 표시 뒤 background revalidation, 첫 100개 page의 terminal 이전 usable publish, 500/1,000개 요청 5/10회·논리 read 약 504/1,009개 유지, write/reconciler 우선, namespace/logout/auth·permission invalidation, refresh/page 실패 시 usable 목록 유지로 모두 통과했다.
- 최종 build 수치는 initial gzip 140,765B, customer lazy 36,812B/36KiB, inventory lazy 25,163B/25KiB, worker 41,238B, exported/shipped 98개, precache 69개다. 성능 gate는 5,000개 index 109.59ms, search p95 1.25ms·max 5.22ms, typing network 0회로 통과했다.
- 남은 위험은 실제 Galaxy S20+·현장망 및 8명 동시 사용에서의 T2/T3/read 감소 미계측, 의도된 탭 Memory 수명, 60초 TTL 내 타 사용자 write 지연 가능성, customer lazy budget 잔여 52B와 inventory lazy 잔여 437B다. npm audit의 firebase-tools 계열 moderate 7건은 P1의 문서화된 일시 예외이며 dependency는 변경하지 않았다.
- **P2 checkpoint 승인 요청 가능 — 아직 미커밋/미배포**

### 2026-09-20 P2 운영 배포·Galaxy S20+ 체감 검증 — 완료

- checkpoint `4f0407c10eacc2b219ab805c543148f8f63efa96`을 Firebase Hosting release `1789911750990000`, version `86903327ba3c41a4`로 배포했다. 두 production origin verifier와 worker SHA가 일치했고, PWA 업데이트 뒤 로그인 유지가 정상이며 console warning/error는 0건이었다. rollback은 필요하지 않다.
- 실제 Galaxy S20+에서 모드 재진입 시 이전처럼 전체 loading을 다시 기다리는 느낌이 사라졌고, 방금 보던 목록 위치·scroll 위치·검색/필터 상태가 즉시 복원됐다. 사용자는 이전 버전보다 체감속도가 명확히 빨라졌다고 확인했다. 이는 사용자 체감 확인이며 ms 기반 T2/T3 현장 계측 결과는 아니다.
- 기존 last-success 60초 TTL과 인증 namespace별 Memory-only 경계는 유지한다. 8명 동시 사용의 실제 read 비용은 아직 미측정이다.
- 현 시점에서는 inventory detail cache나 제한적 JS prefetch를 추가할 필요성이 확인되지 않았다. **P2 완료 — checkpoint/운영 배포/실기기 체감 검증 완료**

### 2026-09-21 재고 제조사 Master M1 — 완료/미배포

- `companies/onnuri/inventoryManufacturers/{manufacturerId}`에 `manufacturerId`, `name`, `normalizedName`, `active`, `revision`, `createdAt`, `createdBy`, `updatedAt`만 저장한다. NFC·trim·공백 정리 뒤 기존 거래처명 규칙과 같은 소문자/문장부호/공백 제거로 exact normalized name을 만들고, SHA-256 결정적 ID의 `companies/onnuri/inventoryManufacturerNames/{hash}` reservation을 같은 transaction에서 점유해 동시 중복 생성을 차단한다. fuzzy 자동 차단·병합과 hard delete는 없다.
- `listInventoryManufacturers`는 최대 500개 master를 bounded read한 뒤 active만 반환한다. `createInventoryManufacturer`는 delivery/sales/admin, `updateInventoryManufacturer`의 rename/deactivate는 admin만 허용하며 모든 mutation은 기존 active employee/session/permission transaction 재검증, 영구 request receipt/idempotency, revision conflict, append-only audit를 사용한다. viewer는 read-only다. 기존 default-deny Rules가 master와 reservation의 client read/write를 모두 막으며 새 Rules·복합 index는 추가하지 않았다.
- 상품의 기존 `manufacturer` string은 legacy fallback이자 선택 시점 canonical name snapshot으로 유지하고 `manufacturerId`만 optional로 저장한다. 신규/변경 연결은 active master를 요구하고 canonical name을 snapshot하며, 비활성화된 기존 연결은 ID와 snapshot을 보존한 채 다른 상품 수정/표시가 가능하다. rename/deactivate는 기존 상품을 rewrite하지 않으며 legacy string-only 상품도 그대로 동작한다. migration/backfill은 없다.
- 구형 strict client 보호를 위해 서버 전용 확장 Zod contract와 `includeManufacturerReference` opt-in을 사용한다. opt-in하지 않은 기존 list/detail/mutation 응답에서는 `manufacturerId`를 재귀적으로 제거하고 기존 `includeSummary`와 독립적으로 처리한다. 현재 frontend repository/form은 opt-in하지 않으며 제조사 picker·검색·최근 사용 UI는 M2로 남겼다.
- PASS: inventory gate 374/374, 전체 unit 1,425/1,439(14 skip), production inventory E2E 10/10, 격리 Emulator transaction/Rules 11/11, 전체 Rules 41/41, app/Functions typecheck, lint, Functions build, production static build, PWA/performance/Hosting gate, `git diff --check`. frontend 코드를 추가하지 않아 inventory lazy JS gzip 25,595B/25KiB와 inventory CSS raw 29,184B 예산 수치는 그대로다. deploy, commit/push, 운영 데이터 접근은 실행하지 않았다. **M2 dynamic picker 진행 가능**이다.

### 2026-09-21 재고 제조사 Master M2 — 완료/미배포

- 새 품목/수정 form의 제조사 문자열 입력을 기존 BottomSheet 기반 picker로 교체했다. picker를 열면 active master 최대 500개를 한 번 읽고, 검색은 `name`/`normalizedName`을 기준으로 Memory에서만 수행한다. 검색창은 자동 focus하지 않으며 신규 제조사 추가 화면의 이름 입력에서만 focus한다. 최근 선택은 인증 session namespace별 Memory에 최대 5개를 최신순·중복 제거로 보관하고 logout/session·권한 version 변경 시 폐기한다. persistent cache, realtime listener, fuzzy dependency는 추가하지 않았다.
- delivery/sales/admin은 active 제조사를 선택하고 새 제조사를 추가할 수 있다. 신규 추가는 loaded 목록에서 단순 유사 후보를 안내하고 create Callable 성공 즉시 현재 상품에 선택하며, exact duplicate 서버 거절 시 입력을 유지한 채 기존 제조사 선택을 안내한다. viewer에는 생성 UI를 노출하지 않는다. inactive 기존 reference는 snapshot과 함께 경고 표시하고 선택 목록에서는 제외하며, legacy string-only 상품은 picker를 열거나 수정 form을 저장했다는 이유만으로 자동 연결하지 않는다.
- 기존 strict client와 M1 response 계약을 유지했다. 기본 inventory repository는 opt-in하지 않고, 별도 동적 manufacturer repository의 reference read와 manufacturer-aware save만 `includeManufacturerReference`를 사용한다. 명시적 `clearManufacturerReference: true` write intent를 추가해 `제조사 없음`에서 `manufacturer: ""`와 실제 document의 `manufacturerId` 제거를 같은 기존 revision/request ID/idempotency/audit transaction으로 처리한다. 필드가 없는 구형 client는 기존 ID를 보존하고, clear와 새 ID를 함께 보내면 contract가 거절한다. migration/backfill과 M1 master/reservation 재설계는 없다.
- product editor를 별도 lazy boundary로 분리하고, 작은 manufacturer trigger와 실제 picker/repository/UI를 다시 분리해 picker는 사용자가 제조사 버튼을 누를 때만 로드한다. 360px에서 overflow가 없고 모든 picker target은 44px 이상이며 dialog/combobox/listbox/option semantics와 방향키 탐색을 제공한다. Back/취소는 form draft를 바꾸지 않고, local 검색 중 추가 network 요청은 0회다.
- PASS: manufacturer/form/Functions 집중 159/159와 backend 집중 76/76, inventory unit/Functions 391/391, production inventory E2E 10/10, Emulator integration 11/11, app/Functions typecheck, lint, production build, performance unit 18/18, PWA/performance/Hosting build gate, `git diff --check`. 최종 bundle은 inventory base JS 24,834B gzip, workspace JS 22,603B gzip, manufacturer picker 3,727B gzip, trigger 802B gzip, inventory CSS 29,184B raw, manufacturer CSS 3,010B raw이며 기존 budget을 완화하지 않았다. admin rename/deactivate UI, dependency 변경, migration/backfill, deploy는 실행하지 않았다. **M2 완료**다.

### 2026-09-21 inventory mobile controls checkpoint — 운영 배포 완료

- commit `6c17f324dd041b7bd3fcc161d6040f0a139a094b` (`Refine inventory mobile controls`)에서 단위 preset을 `낱개 / 봉 / 팩 / 병 / 직접입력`으로 정리했다. 첫 행은 `낱개 / 봉 / 팩`, 둘째 행은 `병 / 직접입력` 2열이다. 기존 `개`는 사용자에게 `낱개`로 표시하되 신규 `낱개` preset의 canonical/storage value는 기존 `개`를 사용한다. 기존 literal `낱개` 데이터는 보존하고 migration/backfill은 없으며 unit lock과 재고 처리 계약을 유지한다.
- 검색창 오른쪽에 sliders 계열 `목록 옵션` 버튼을 두고 BottomSheet에 `표시 옵션`(비활성 품목 보기, 임박 상품만 보기)과 `작업 모드`(재고조사 OFF/ON)를 구분했다. 기존 검색·filter·snapshot·revalidation 상태 로직은 변경하지 않았다.
- 구역 선택 `전체 / 냉장 / 냉동1 / 냉동2 / 샘플`은 회청색 container, subtle raised surface, 선택 상태 inset 표현과 44px touch height를 사용하며 360px에서 가로 overflow가 없다.
- Firebase Hosting release `1789974931146000`, version `03c10d3f79c62a9b`로 `2026-09-21 16:15:31 KST`에 Hosting만 배포했다. worker SHA-256은 `8b95bd550d8e3ee332126708d0991439ce69ed86b595a58c6f28ea8fbf4dc7ce`고 `https://onnuriway.com`·`https://onnuriway.web.app` verifier가 모두 통과했다. Functions, Rules, Indexes 등은 배포하지 않았다.

### 2026-09-21 inventory 목록 옵션 시인성 checkpoint — 운영 배포 완료

- commit `f815ded566b554cd4f8569244ce72fa92e960261` (`Improve inventory list options`)에서 checkbox/check indicator를 label 바로 옆에 배치하고 전체 56px row를 touch target으로 만들었다. label은 16px 수준으로 유지하고 선택 row에 subtle background/border를 적용했으며 `D-100일` secondary text를 보존했다. 재고조사는 `OFF | ON` segmented control이며 ON 시 sheet 밖에 compact `재고조사 ON`을 표시하고, 임의 목록 옵션이 활성화되면 trigger의 active dot를 유지한다.
- legacy UI 기대값은 unit preset 6→5, 표시명 `개`→`낱개`, 초기 수량 접근성 이름 `(개)`→`(낱개)`, 직접입력 2열 geometry, BottomSheet 이동에 따른 selector로 현재 계약에 맞게 갱신했다. canonical `개`와 literal `낱개` 보존 테스트는 유지했다.
- PASS: Legacy inventory E2E 11/11, Emulator integration 11/11, inventory 29 files/395 tests, typecheck, lint, production build, PWA, performance, Hosting gate, 360px horizontal overflow, console warning/error 0건. performance budget, dependency, 설정은 변경하지 않았다.

### 2026-09-21 inventory mobile UI 최종 production 검증 — 완료

- production commit은 `f815ded566b554cd4f8569244ce72fa92e960261`이고 Firebase Hosting release는 `1789979180255000`, version은 `9f46329655f14f0b`, 배포 시각은 `2026-09-21 17:26:20 KST`다. worker SHA-256은 `6e244e6d3385ccd7c68de525ace457aad5c1311e2a93d25550d3580b6e4e776a`다.
- `onnuriway.com`과 `onnuriway.web.app`에서 각각 25개 public resource 검증이 통과했고 worker/assets는 두 origin과 candidate에서 일치했다. worker의 `Cache-Control: no-store`와 `Service-Worker-Allowed: /`를 유지했으며 production build, PWA, performance, Hosting gate가 모두 통과했다.
- production read-only smoke에서 목록 옵션 버튼·active dot·BottomSheet, `표시 옵션`, 비활성/임박 옵션, label 인접 indicator, 56px 전체 row touch, 16px label, `D-100일`, `OFF | ON` segmented control, compact `재고조사 ON`, sheet 재개방 후 상태 유지를 확인했다. 360px horizontal overflow는 없었고 console warning/error는 0건이었다. 검증 후 비활성/임박/재고조사 상태는 OFF로 복원했다.
- 배포는 Firebase project/site `onnuriway`의 Hosting만 대상으로 했다. Functions, Firestore Rules/Indexes, Storage Rules, Extensions 등은 배포하지 않았고, 품목 저장/수정·제조사 변경·입고/출고/조정·사진 업로드·테스트 데이터 생성을 수행하지 않아 production data write는 없다. release 회귀가 없어 rollback은 필요하지 않다.
- 사용자가 최종 production UI의 목록 옵션과 변경된 inventory UX를 실제로 사용해 사용성에 문제가 없음을 확인했다. 이는 자동화 테스트 결과와 구분되는 정성적 실사용 확인이다. **inventory mobile UI 개선은 완료 상태**다.

### 2026-09-21 재고 제조사 Master M3 — 구현·production release 완료

- commit `194309b9a9266045688d17d624c8d202d3fdd5ad` (`Add inventory manufacturer management`)에서 일반 manufacturer row tap은 기존 선택 동작을 유지하고, 관리자에게만 각 active row 오른쪽의 독립된 `⋯` 관리 버튼을 표시한다. 실제 touch target은 44×48px이며 row 선택과 관리 이벤트를 분리했다. long-press는 도입하지 않았고 기존 공용 BottomSheet 패턴에서 `이름 수정`·`비활성화`·`취소`를 제공한다.
- rename/deactivate는 기존 production Callable `updateInventoryManufacturer`를 그대로 사용한다. Functions 제품 코드, Rules, indexes, schema는 변경하지 않았다. rename은 `expectedRevision`, 기존 request ID/idempotency, duplicate 처리와 revision conflict 시 최신 목록 refresh를 유지하고 성공 뒤 active 목록을 갱신한다. deactivate는 active picker에서만 제거하며 hard delete나 reactivate UI는 없다. 두 작업 모두 현재 product draft의 `manufacturerId`/이름을 자동 변경하거나 기존 상품에 write하지 않는다.
- M1/M2 snapshot 호환 정책도 유지한다. 기존 상품의 `manufacturerId`와 `manufacturer` string snapshot, inactive reference, legacy string-only 상품을 보존하고 자동 master 연결, migration/backfill, 기존 상품 문자열 일괄 전파를 하지 않는다. 따라서 master rename 뒤 picker의 active master 이름은 새 이름이지만 이미 저장된 상품 화면은 선택 당시 snapshot 이름을 계속 표시할 수 있으며 이는 의도된 호환성 정책이다.
- Frontend는 `context.canAdmin`을 필요한 inventory editor/field/picker까지 전달해 관리자에게만 관리 affordance를 노출한다. Backend 권한의 최종 기준은 기존 admin authorization이며 authenticated Callable, session/permission 재검증, transaction, revision, request receipt, audit 경계를 그대로 유지한다.
- 구현 검증은 전체 unit 1,456 passed/14 skipped, Inventory/Functions 404 passed, M3 관리자 E2E 1 PASS, Firestore Emulator integration 11 PASS, 기존 Inventory browser scenarios 11 PASS다. app/Functions typecheck, 전체 lint, production build, PWA 17, performance 18, PWA/performance/Hosting gate, 360px overflow, keyboard/Escape/Back, reservation/audit 검증도 모두 통과했다. budget, dependency, config는 변경하지 않았다.
- production application commit `194309b9a9266045688d17d624c8d202d3fdd5ad`를 Firebase Hosting release `1789983232326000`, version `2c48893eab60f919`로 `2026-09-21 18:33:52.326 KST`에 배포했다. worker SHA-256은 `2129650a8800dedc5239af91185d3310ba735fe0fd9d8dffb3d3910e84f48594`다. `onnuriway.com`과 `onnuriway.web.app`에서 각각 25개 verifier가 통과했고 candidate/production assets, worker, 양 origin worker가 일치했다. worker는 `Cache-Control: no-store, max-age=0`, `Service-Worker-Allowed: /`를 유지한다. production/PWA/performance/Hosting build gate가 통과했으며 Hosting 산출물은 102개, precache 73개, initial asset 9개다.
- 배포 범위는 Firebase project/site `onnuriway`의 Hosting뿐이다. Functions, Firestore Rules/indexes, Storage Rules, Extensions 및 기타 Firebase resource는 배포하지 않았다.
- production read-only smoke에서 관리자 로그인/session 유지, inventory 진입, 관리자 `⋯` 노출, 일반 row 선택, `⋯` 클릭 시 선택 미발생, 관리 BottomSheet, rename 입력/취소, deactivate 안내/취소, Escape/Back, picker/draft 유지, 360×800 horizontal overflow 없음과 console warning/error 0건을 확인했다. 안전한 기존 production 비관리자 session이 없어 비관리자 `⋯` 미노출은 운영에서 별도로 재검증하지 않았고, 해당 권한 동작은 frontend/backend 자동 테스트와 Emulator 검증 범위에서 확인했다.
- 운영 데이터 보호를 위해 production smoke에서는 manufacturer rename/deactivate/create, 품목 저장·수정, 입고·출고·조정, 사진 업로드, 테스트 데이터 생성을 실행하지 않았고 모든 form/confirm을 실행 전에 취소했다. 실제 production rename/deactivate write는 아직 수행하지 않았으며 해당 경로는 Emulator/Auth/Callable 자동 검증으로 확인한 상태다. 이는 실패가 아니라 의도된 read-only 검증 경계다.
- 사용자가 최종 production M3 UI를 실제 기기에서 확인해 현재 사용성이 괜찮다고 판단했다. 이는 자동 검증과 구분되는 정성적 실사용 확인이며 rollback은 필요하지 않다. **Manufacturer M3는 완료 상태**다.
- 현재 지원 범위는 create, rename, deactivate다. hard delete, reactivate, manufacturer merge, 기존 product snapshot 일괄 rename 전파는 지원하지 않으며 실제 사용에서 필요성이 확인되기 전에는 후속 작업으로 자동 지정하지 않는다. 기존 product snapshot과 master current name 불일치가 실제 업무 문제가 될 때만 read-time overlay 또는 별도 정리 정책을 검토한다.

### P3 — 디자인 디테일

1. 실기기에서 재고 카드 밀도, 토글/checkbox alignment, 사진 확대 affordance와 고정 action의 safe-area/키보드 겹침을 점검한다.
2. 모드별 aurora·motion은 기존 tone/mood와 `prefers-reduced-motion`, 고대비 접근성을 유지한다. 장식 추가보다 정보 밀도와 한 손 조작을 우선한다.
3. 새 UI 패턴은 거래처·학교납품·영업/홍보·재고 사이의 radius, divider, 버튼 상태, loader/photo viewer 일관성을 먼저 대조한다.

## 9. 관련 문서

- 공통 규칙: `AGENTS.md`
- 구현 기준: `급식길 PWA 구현 명세서.md`
- 데이터 구조: `급식길 PWA 데이터베이스 상세 설계서.md`
- 캐시/성능: `급식길 PWA 검색·캐시·성능 설계서.md`
- Hosting/도메인: `docs/phase-45-hosting-migration-status.md`
- 재고 기반 계획: `docs/phase-45-firebase-hosting-and-inventory-plan.md`
- 재고 최신 UX/검증: `docs/phase-46-inventory-field-experience.md` ~ `docs/phase-49-inventory-count-mode.md`

이 문서는 대화 로그가 아니라 현재 구현으로 진입하기 위한 색인이다. 새 결정·검증·배포가 생기면 확인된 결과만 갱신하고, 추정은 ‘미확인’에 남긴다.
