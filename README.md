# 급식길 (ONNURIWAY)

대전 학교 급식실 납품·홍보 현장 운영을 위한 PWA 프로젝트다. Phase 16 Performance Hardening까지 구현했으며 모바일 우선 현장 앱, 로컬 학교 검색, Cache-first 현장정보, 월별 영업 운영, 서버 Filter 기반 임시 CSV, NEIS Preview/Diff/선택 Apply, 검토형 Kakao 위치 매칭, 버전형 현장 사진과 PC 우선 운영 콘솔을 제공한다.

## 개발 기준

- Node.js 22 LTS
- Next.js 16 App Router + TypeScript strict
- Firebase Web SDK / Cloud Functions 2nd gen
- Firebase Local Emulator Suite + JDK 21
- idb 8 기반 명시적 IndexedDB Schema
- Serwist 9 기반 명시적 PWA Cache Allowlist
- Vitest / Firebase Rules Unit Testing / Playwright

## 시작

```bash
npm install
cp .env.example .env.local
npm run dev
```

실제 Firebase Project 설정이 없어도 앱과 Production Build는 동작한다. Emulator 연동 시 `.env.local`에 Demo/Test Firebase Web 설정과 `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`를 사용한다.

## Emulator Seed

```bash
# Terminal 1
npm run emulators

# Terminal 2
npm run seed
```

Seed는 `demo-*` 프로젝트의 Local Emulator에서만 동작하며, 동일한 직원·학교·Cycle·테스트용 PIN 자격정보를 매번 재생성한다. Demo 기본 Secret은 실제 프로젝트에서 사용할 수 없으며, Emulator를 일회성으로 기동해 Seed 실행 자체를 검증하려면 `npm run seed:verify`를 사용한다.

## NEIS Initial Import

```bash
# 단위 계약
npm run test:neis

# Fixture CLI + Firestore 원자성 통합 Gate
npm run test:neis:emulator
```

수동 Fixture 적재는 Seed를 실행하지 않은 빈 `demo-onnuriway` Emulator에서 `npm run neis:import:fixture`로 실행한다. Initial Import는 `schools`가 비어 있을 때 한 번만 허용하며 두 번째 실행이나 기존 학교가 있으면 전체를 거부한다.

실제 NEIS 연결에는 서버 전용 `TARGET_EDUCATION_OFFICE_CODE`, `NEIS_API_KEY`, 명시적 `ALLOW_LIVE_NEIS_IMPORT=true`가 모두 필요하다. 실제 Key는 Secret Manager에서 관리하며 `NEXT_PUBLIC_*` 환경 변수로 만들지 않는다. 실제 Cloud Import는 별도 승인 전 실행하지 않는다.

## Search Catalog

```bash
# 정규화·초성·축약·Alias·Fuzzy·성능 단위 테스트
npm run test:search

# Firestore 버전 발행·원자적 Meta 전환·실패 보존 Gate
npm run test:search:emulator

# 검색 UI·IndexedDB·Offline·Network 0·접근성 누적 E2E
npm run test:e2e:phase6
```

`searchCatalogs/common-v{version}-{district}-{chunk}`는 발행 후 변경하지 않고 `catalogMeta/current`가 현재 문서 ID를 가리킨다. 앱은 사용자·역할·`sessionVersion`·Catalog Version으로 구분한 IndexedDB를 먼저 읽고 Memory Index를 구성한다. 검색 타이핑 중에는 Firestore, NEIS, Kakao 요청을 만들지 않는다.

`npm run search:catalog:publish`는 서버 권한으로 Catalog를 발행하는 운영 명령이다. Demo Emulator 밖에서는 `ALLOW_LIVE_SEARCH_CATALOG_PUBLISH=true`가 없으면 실행을 거부하며, 실제 Project 발행은 별도 승인 전 수행하지 않는다.

## Incremental NEIS Sync & Kakao Matching

```bash
# Diff·Kakao Scoring·길안내 단위 계약
npm run test:sync

# Preview/Apply·데이터 보존·대량 누락·위치 검토 통합 Gate
npm run test:sync:emulator

# 실제 학교 상세 길안내·Fallback·접근성 E2E
npm run test:e2e:phase13
```

`previewNeisSchoolSync`는 외부 결과를 `neisSyncRuns/{runId}/changes`에만 저장하고 `applyNeisSchoolSync`가 명시적 위험 변경 확인 뒤 학교별 Transaction으로 적용한다. 교명은 같은 학교 ID와 이전 Alias를 유지하고, 누락은 삭제 대신 `inactiveCandidate`, 주소 변경은 기존 좌표를 덮지 않는 이전 검토 상태가 된다. 비정상 대량 누락은 `SUSPICIOUS_RESULT`에서 강제로 멈춘다.

Kakao 위치는 서버에서 주소와 Keyword 후보를 함께 평가한다. 단일 고신뢰 대전 후보만 자동 매칭하며 복수·타 지역·낮은 신뢰도는 검토 대상으로 남긴다. 관리자 확정/직접 입력 위치가 자동 결과보다 우선한다. 직원 길안내는 신뢰 좌표가 있으면 정확한 목적지를, 없으면 공식 학교명 검색을 연다.

실제 연결은 Functions Secret `NEIS_API_KEY`, `KAKAO_REST_API_KEY`와 `TARGET_EDUCATION_OFFICE_CODE` 외에도 `ALLOW_LIVE_NEIS_SYNC=true`, `ALLOW_LIVE_KAKAO_MATCH=true`가 각각 필요하다. Key는 `NEXT_PUBLIC_*`로 만들지 않는다. 실제 외부 호출과 배포는 별도 승인 전 실행하지 않는다.

## School Detail & Field Info

```bash
# 현장정보 Domain·Mutation 단위 계약
npm run test:field

# Firestore 원자 저장·멱등성·Revision 충돌·Audit Gate
npm run test:field:emulator

# 상세·IndexedDB·Offline·Callable·동시 수정·접근성 누적 E2E
npm run test:e2e:phase7
```

학교 상세는 `Memory → IndexedDB → Firestore` 순서로 이전 정보를 즉시 표시하고 최신화한다. Cache는 사용자·역할·`sessionVersion`·학교별로 분리하며 학교 기본정보, 공용 현장정보, 활성 사진 Metadata만 저장한다. 로그아웃·세션 무효화 시 Search Cache와 함께 제거한다.

현장정보는 Client가 Firestore에 직접 쓰지 않고 `updateSchoolFieldProfile` Callable을 사용한다. 서버는 활성 세션·역할·Strict Input·Expected Revision·Request ID Payload 지문을 확인하고 Profile, Request Lock, Audit를 하나의 Transaction으로 기록한다. 사진은 Collection List 없이 고정 Slot `01~03`만 `get`한다.

## Photos

```bash
# 이미지 처리·Slot·입력 계약
npm run test:photo

# Firestore·Storage Version·Soft Delete·복구·Audit Gate
npm run test:photo:emulator

# Gallery·Viewer·업로드·교체·삭제/Undo·역할·접근성 누적 E2E
npm run test:e2e:phase8
```

사진은 학교당 `01 | 02 | 03` 세 Slot만 사용한다. Client는 `preparePhotoUpload`로 10분짜리 서버 세션을 준비하고 `finalizePhotoUpload`로 파일을 서버 경계에 전달한다. 서버는 10MB·MIME·magic bytes·40MP 한도를 다시 확인하고 EXIF/방향을 정리한 뒤 `thumbnail.webp`, `preview.webp`, `original.webp`를 새 UUID Version 경로에 저장한다. 기존 Version은 덮어쓰지 않는다.

학교 상세는 첫 사진 Preview와 보조 Thumbnail만 먼저 요청한다. Viewer에서 실제 확대할 때만 Original을 받는다. Thumbnail·Preview는 사용자·역할·`sessionVersion`·사진 Version으로 구분한 최대 24개/36MB IndexedDB Cache를 사용하고 Original은 Memory에서만 유지한다. 모든 Object URL과 사진 Cache는 로그아웃·세션 무효화 시 제거된다.

Storage Client SDK 직접 접근은 역할과 관계없이 계속 거부한다. 사진 조회·업로드·교체·Soft Delete·복구는 매 요청 Firebase Auth, 활성 `authz`, Session/Permission Version, 역할과 App Check를 다시 확인하는 Callable만 사용한다. Viewer는 조회만 가능하다.

## Monthly Sales Cycle & Assignment

```bash
# Cycle·Assignment 계약과 초기화 단위 테스트
npm run test:sales

# 월 생성·전월 복사·배정·담당 변경·멱등성·Audit Gate
npm run test:sales:emulator

# A/B/C 내 구역·전체 팀·관리자 권한·접근성 누적 E2E
npm run test:e2e:phase9
```

영업 홈은 활성 Cycle의 ‘내 구역’을 기본으로 열고 로그인 직원이 담당자에 포함된 학교만 표시한다. ‘전체 보기’를 명시적으로 선택하면 구역 필터와 함께 팀 배정을 확인할 수 있으며 개인 성과 순위는 제공하지 않는다. 지난 Cycle은 월 선택에서 확인할 수 있지만 읽기 전용으로 표시한다.

월 생성, 최대 50개 배정 생성과 담당 변경은 Client Firestore 쓰기가 아닌 관리자 전용 Callable에서 처리한다. 서버는 활성 Session·Admin 역할·Strict Input·존재 학교·활성 구역과 영업 직원 참조·Expected Revision·Request ID Payload 지문을 확인하고 Cycle, Assignment, 활성 월 Settings와 Audit를 Transaction으로 기록한다. 전월 배정 복사 시 담당 관계만 계승하고 방문·월 상태·홍보지·샘플 상태를 새 달 기준으로 초기화한다.

영업 Workspace는 직원·역할·`sessionVersion`·Cycle로 격리한 Memory Cache만 사용한다. 탭에서 최근 18개월만 유지하고 실제 배정된 학교만 조회하며 로그아웃·세션 무효화 시 제거한다. 앱 종료 뒤 영업 배정의 Offline 복원은 보안상 보장하지 않는다.

## PWA Install, Offline & Update

```bash
# Cache Allowlist·Metadata 단위 계약
npm run test:pwa

# Production Build 뒤 Service Worker·Icon Artifact 검증
npm run build
npm run verify:pwa:build

# App Icon 재생성
npm run icons:generate
```

Production Build는 `/`, Next Hash Asset, Manifest와 Icon을 Serwist App Shell에 Precache한다. Runtime Cache는 같은 출처의 명시적 Public Asset과 안전한 Thumbnail Route만 허용하며 Firebase, Callable, Storage 중계, CSV와 영업 응답을 Cache하지 않는다. 검색·학교 상세·Thumbnail은 직원·역할·`sessionVersion` Namespace의 IndexedDB를 사용하고 로그아웃 또는 Session 불일치 시 함께 제거한다.

정상 사용 뒤 Offline로 전환하면 App Shell, 로컬 학교 검색, 이전에 본 학교 상세와 Thumbnail을 사용할 수 있다. 실제 연결 상태는 브라우저의 `navigator.onLine` 값만 신뢰하지 않고 Service Worker가 Cache하지 않는 `HEAD /api/connectivity`로 확인한다. 새 Worker는 자동 `skipWaiting`이나 Reload를 하지 않으며 “새 버전이 준비되었습니다” 알림에서 사용자가 `업데이트`를 선택한 경우에만 전환한다. 방문 저장 Offline Queue는 만들지 않고 열린 입력 Draft와 재시도 안내를 유지한다.

## Performance Hardening

```bash
# 검색·Cache·계측 단위 계약과 5,000개 Catalog Microbenchmark
npm run test:performance

# Production Bundle Raw/gzip·Chunk·Dynamic Boundary Gate
npm run build
npm run verify:performance:build

# Production Chromium 4× CPU 체감 성능 Gate
npm run test:e2e:phase16
```

초기 Route는 Auth Application을 Dynamic Boundary로 분리하고, 인증 뒤 App Shell·검색·상세·사진·영업·이력·CSV·관리자 기능을 사용 시점별 12개 Boundary로 나눈다. Phase 15 기준 초기 JavaScript `381,220B gzip`은 `138,274B gzip`으로 63.7% 감소했으며 자동 Gate는 실제 초기 HTML의 `script`/`preload`까지 합산해 Raw 520KiB, gzip 160KiB, 단일 Chunk gzip 90KiB를 상한으로 고정한다.

검색은 5,000개 합성 Catalog p95 1.24ms이고 입력 중 Network 요청은 0이다. 학교 선택은 Memory/IndexedDB 상세 Cache를 Firestore보다 먼저 사용하고, Memory Cache는 첫 Render에 동기 표시한다. Production Chromium 4× CPU Gate에서 검색 최대 1.0ms, Cached Detail 0.2ms, Cached Image 5.2ms, Warm Relaunch 803.6ms, CLS 0을 확인했다.

로컬 계측기는 Boot·Catalog·Search·Detail·Image Duration, Cache Hit/Miss, 기능별 논리 Firestore Read, CLS·Long Task만 최근 120개까지 Memory에 유지한다. 학교·직원·UID·검색어·URL·문서 경로는 수집하거나 외부로 전송하지 않는다.

## Google-approved Admin Console

```bash
# 관리자 계약·인증 단위 테스트
npm run test:admin

# Google 승인·직원/PIN/세션·Workspace·Audit 통합 Gate
npm run test:admin:emulator
```

관리자는 일반 직원 PIN이 아니라 Google Provider로 로그인한다. 서버는 Email Verified, `secureSettings/adminAccess` 허용목록, `adminApproved`, 활성 `authz`, Claim과 Employee의 UID·Session Version을 매 요청 교차검증한다. 허용된 Google UID는 기존 관리자 Employee와 재결합되며 이전 UID의 Authz와 Refresh Token은 폐기된다. 관리자 역할은 직원 관리 폼에서 부여하거나 해제할 수 없다.

PC 우선 Console은 운영 개요, 학교, 직원, 월별 Cycle·배정, NEIS/Kakao 동기화, 관리자 범위 CSV, Audit와 공개 운영 설정을 제공한다. 새 직원 PIN은 10분 예약 후 원문을 한 번만 표시하고 HMAC Lookup Key와 scrypt Hash만 저장한다. 권한·PIN·세션·배정·설정 변경은 Client Firestore 직접 쓰기 없이 서버 Callable과 Audit를 통과한다. 관리자는 Offline Session으로 복원되지 않으며 민감 운영 DTO는 Service Worker나 Persistent IndexedDB에 저장하지 않는다.

## Sales Visit Recording

```bash
# 방문 입력·통계 계약 단위 테스트
npm run test:visit

# Firestore 원자 저장·멱등 재생·Revision·권한 Gate
npm run test:visit:emulator

# 실제 Bottom Sheet·저장·권한·Axe·터치 타깃 누적 E2E
npm run test:e2e:phase10
```

영업 학교 상세의 방문 기록 Bottom Sheet에서 방문일, 실제 방문자, 홍보지·샘플 전달, 제품별 샘플 수량, 5단계 Heart 관심도와 명시적 ‘관심도 미확인’, 활동 태그, 결과와 후속 일정을 입력한다. 기본 선택을 두지 않으며 입력 오류는 Draft를 보존한 채 요약으로 안내한다. 다른 직원의 배정은 팀 전체 보기에서 조회만 가능하다.

`recordSalesVisit`는 Client 직접 쓰기 없이 방문 원본, 학교 Sales Profile, 월 Assignment, 직원·팀 Stats, Audit와 Request Lock을 하나의 Transaction으로 기록한다. 실제 방문자 `visitedBy`, 인증된 기록 입력자 `recordedBy`와 Assignment 주 담당자를 분리하며 Expected Revision과 Payload 지문으로 동시 수정·재시도·더블 탭을 방어한다. 성공 후 상세 화면은 관심도·전달 상태·후속 행동을 즉시 반영하고 관련 Cache를 최신화한다.

## Sales History & Collaboration

```bash
# 방문 이력·프로필 계약 단위 테스트
npm run test:history

# 커서 페이지네이션·멱등성·Revision·권한·원본 불변성 Gate
npm run test:history:emulator

# 팀 조회 전용·태그 저장·배송 비노출·Axe·터치 타깃 누적 E2E
npm run test:e2e:phase11
```

영업 학교 상세은 최근 방문 3건만 먼저 읽고 `전체 기록 보기`를 눌렀을 때 `visitedAt DESC + documentId DESC` 커서로 5건씩 이어 읽는다. Timeline은 당시 담당자, 실제 방문자, 기록자, 홍보지·샘플, Heart 관심도, 활동 태그, 요약과 당시 후속 일정을 불변 원본 기준으로 표시한다. 다른 영업 직원의 학교도 팀 범위에서 읽을 수 있지만 방문 원본과 학교 협업 정보의 편집은 제공하지 않는다.

커뮤니케이션 참고 태그와 다음 행동은 월 Assignment가 아니라 `salesProfiles/{schoolId}`에 유지한다. 담당 직원의 `updateSalesProfile` 요청은 Client 직접 쓰기 없이 활성 Session·역할·현재 Assignment 관계·Expected Assignment/Sales Revision·활성 태그·Request ID Payload 지문을 Transaction에서 검증하고 Audit와 함께 저장한다. 월별 활동 태그와 학교에 지속되는 커뮤니케이션 태그는 UI와 데이터 계약 모두에서 분리한다. 납품 모드는 영업 프로필과 방문 이력을 읽지 않는다.

## Filtered CSV Export

```bash
# CSV 입력·응답·BOM·한글·Formula Injection 계약
npm run test:export

# Firestore Job·Storage·권한·멱등·Audit·만료 정리 Gate
npm run test:export:emulator
npm run test:sync
npm run test:sync:emulator

# 실제 Filter Preview·생성·Download·Axe 누적 E2E
npm run test:e2e:phase12
npm run test:e2e:phase13
```

영업 활동 메뉴의 Export Center는 월별 배정과 방문 이력을 별도 CSV로 만든다. 기간, 담당 범위, 구역, 담당자, 행정구, 학교급, 상태, 관심도, 후속 여부, 태그와 방문일 Filter를 지원하며 권한 없는 직원에게 팀 범위를 표시하지 않는다. 미리보기와 생성은 같은 서버 Dataset Builder를 사용하고 Client는 CSV를 만들기 위해 Firestore 원본 전체를 내려받지 않는다.

`exportCsv`는 활성 Session·역할·`permissions.exportTeam`·Scope를 다시 확인하고 UTF-8 BOM·CRLF·한글 Header·CSV Escape·Formula Injection 방어를 적용한다. UUID Request ID와 Payload 지문으로 같은 요청을 재생하며 Job, `CSV_EXPORTED` Audit와 Lock을 한 번만 기록한다. 완성 파일은 Storage Client에서 직접 읽을 수 없고 소유자를 확인하는 `downloadCsvExport`만 중계한다. 기본 24시간 뒤 다운로드를 거부하며 매시간 Scheduled Cleanup이 Object를 실제 삭제한다.

## 품질 게이트

```bash
npm run lint
npm run typecheck
npm test
npm run seed:verify
npm run functions:build
npm run build
npm run verify:pwa:build
npm run test:performance
npm run verify:performance:build
npm run test:rules
npm run test:neis
npm run test:neis:emulator
npm run test:search
npm run test:search:emulator
npm run test:field
npm run test:field:emulator
npm run test:photo
npm run test:photo:emulator
npm run test:sales
npm run test:sales:emulator
npm run test:visit
npm run test:visit:emulator
npm run test:history
npm run test:history:emulator
npm run test:export
npm run test:export:emulator
npm run test:sync
npm run test:sync:emulator
npm run test:pwa
npm run test:admin
npm run test:admin:emulator
npm run test:e2e
npm run test:e2e:auth
npm run test:e2e:phase4
npm run test:e2e:phase6
npm run test:e2e:phase7
npm run test:e2e:phase8
npm run test:e2e:phase9
npm run test:e2e:phase10
npm run test:e2e:phase11
npm run test:e2e:phase12
npm run test:e2e:phase13
npm run test:e2e:phase16
```

`test:e2e:phase13`은 PIN 인증, 역할별 앱 셸, 학교 검색·상세·사진, A/B/C 영업 직원별 배정, 방문·이력·CSV에 더해 확정 좌표 길안내와 미확정 학교의 공식명 검색 Fallback을 누적 Chromium 시나리오로 통합 검증한다. `test:e2e:phase16`은 Emulator 설정으로 Production PWA를 Build하고 Chromium CPU를 4배 감속해 Search·Cached Detail·Warm Relaunch·Image Cache·CLS·Read Counter·PII 부재를 검증한다. 이전 Phase의 E2E 명령은 호환 회귀 진입점으로 유지한다.

Serwist의 명시적 Webpack 설정과 Next.js 16의 Bundler 경계를 일치시키기 위해 개발 서버와 Production Build 모두 Next.js 공식 `--webpack` 경로로 고정한다.

Windows 로컬 환경에서는 `.tools/jdk-21*`의 프로젝트 전용 JDK를 Emulator Script가 자동 감지한다. 다른 환경에서는 `JAVA_HOME` 또는 PATH의 JDK 21을 사용한다.

## 안전한 Firebase 기본값

- `.firebaserc`는 실제 Project가 아닌 `demo-onnuriway`를 가리킨다.
- Firestore는 유효한 Auth Token과 `authz/{uid}`를 교차검증한 역할별 읽기만 허용한다.
- 모든 Firestore Client Mutation과 Storage Client 접근은 서버 경계를 위해 Default DENY다.
- Firestore 데이터 계약은 Standard Edition / Native mode 기준이다.
- 실제 Development/Staging/Production Project 연결은 별도 승인과 환경 변수 설정 뒤 진행한다.
- 일반 직원 PIN은 HMAC Lookup과 scrypt Hash로 분리하며 Production Callable은 App Check를 강제한다.
- 관리자는 PIN 로그인을 사용하지 않고 Google Provider·Email Verified·서버 허용목록·`adminApproved`·활성 Employee를 모두 확인하는 별도 승인 경계를 사용한다.
