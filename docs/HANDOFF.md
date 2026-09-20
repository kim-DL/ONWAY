# 급식길 개발 인수인계

기준일: 2026-09-20
대상: 이전 대화 없이 이어서 작업할 새 Codex 스레드

## 1. 먼저 알아야 할 상태

### 확인된 사실

- 저장소: `C:\Users\HOME\Desktop\onnuriway`
- Git branch: `codex/mobile-action-reach`
- 문서 정리 전 HEAD: `fb173f13d5f1e271b6a34674253d88a4d903bc31` (`Record optimization deployment and PWA upgrade verification`, 2026-09-06)
- 초기 문서 정리 전 worktree 기록은 tracked modified 60개, untracked 109개, 총 169개였다. 2026-09-20 재확인에서도 대규모 dirty 상태가 유지되며 고객사·Firebase Hosting·재고 Phase 45~49와 최근 UI 수정이 아직 commit되지 않았다. `output/` 아래 검증 산출물이 untracked directory로 묶여 표시되므로 기본 `git status` 행 수를 실제 파일 수로 해석하지 않는다.
- 초기 HANDOFF 정리 작업은 `AGENTS.md`, 세 개의 기존 설계서와 이 파일만 변경했다. 이후 아래 2026-09-20 P0 작업에서 재고 CSS·관련 테스트·이 문서를 최소 수정했으며 배포와 운영 데이터 쓰기는 하지 않았다.
- 운영 Frontend는 Next.js static export → Firebase Hosting site `onnuriway`다. 운영 주소는 `https://onnuriway.com`, 기본 주소는 `https://onnuriway.web.app`이다.
- Backend는 Firebase Auth, App Check, Firestore Standard/Native(서울), Storage, Cloud Functions 2nd gen(Node 22, `asia-northeast3`)이다.
- 현재 앱 모드는 거래처, 학교납품, 영업/홍보, 재고 네 가지다. 재고는 운영 build에서 활성화된 상태로 마지막 문서에 기록돼 있다.
- 2026-09-20 읽기 전용 재확인 기준 Firebase Hosting live release는 `1789262169443000`, version은 `1274c8c40b063e3f`, release time은 `2026-09-13T01:16:09.443Z`다. 두 공개 origin의 worker SHA-256은 `35a673947f19f04005c71bcbb67400db6375e07a517055d078643de8bd3e9fcb`로 일치한다.

### 미확인 또는 다시 확인할 사실

- 이번 P0 로컬 수정은 아직 Hosting에 배포하지 않았다. 운영 URL에는 수정 전 CSS가 남아 있어 `재고조사 off`가 가로로 보인다.
- 마지막 Hosting 배포 뒤 전체 test suite 전체는 아직 재실행하지 않았다. 다만 2026-09-20 P0 범위의 재고 UI/Emulator suite와 두 origin의 공개 25개 리소스 검사는 다시 통과했다.
- 현재 변경은 하나의 commit으로 정리되지 않았다. 다음 스레드는 먼저 `git status --short --branch`와 변경 범위를 확인하고 사용자 변경을 보존해야 한다.
- 운영 데이터 schema migration의 필요 여부는 Phase 49의 `lotSummary` 보강 이후 새 migration이 추가되지 않았다는 문서 기록까지만 확인했다.
- 실제 설치형 휴대폰 PWA의 카메라·키보드·safe-area 체감은 이번에도 확인하지 않았다. 데스크톱 Chrome의 360×800 viewport 검증과 구분한다.

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
| 오프라인 | 조회 cache만 제한 허용, 민감 쓰기 queue 금지 | 검색/학교만 namespace IndexedDB, 거래처·재고는 Memory, 쓰기 queue 없음 | 구현됨 |
| 보안 | Client 직접 쓰기 금지, App Check/권한/revision/request ID/audit 유지 | Callable service와 Rules 경계, private no-store 응답 | 구현됨 |

## 3. 현재 아키텍처와 데이터 흐름

### Frontend

- Next.js 16.3.2 App Router, React 19.2.8, TypeScript strict, CSS Modules/전역 token을 사용한다.
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
| 거래처 목록/사진 | Memory | 최근 거래처 ID 5개만 namespaced localStorage | cache 안 함 |
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
