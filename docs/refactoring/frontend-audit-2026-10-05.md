# 급식길 프론트엔드 리팩토링 독립 분석

분석 기준: 2026-10-05, `/workspace/ONWAY` 정적 읽기 전용 분석. `AGENTS.md`와 `docs/HANDOFF.md`를 먼저 읽었다. 제품 source, 의존성, 설정, 운영 데이터는 수정하지 않았고 테스트·build·설치는 실행하지 않았다. 아래는 구현 결함 판정이 아니라 유지보수 위험 및 안전한 분리 제안이다. 비공개 env는 읽지 않았다.

## 확인된 구조와 고정 계약

- package.json 실제 버전은 Next 16.3.8 / React 19.2.8 / TypeScript 6.0.3. HANDOFF의 아키텍처 요약에 남은 Next 16.3.3은 최신 기록·package와 차이가 있다.
- `next.config.ts:31`의 `output: "export"`, webpack extension alias 및 Serwist 설정을 유지한다. Next 서버/Server Actions/SSR 데이터 계층 전환은 이번 리팩토링이 아니다.
- `src/features/*` 16개 업무/기반 디렉터리로 이미 상당 부분 모듈화돼 있다. 거대한 새 계층이나 일괄 폴더 이동보다 현재 경계의 약한 부분을 국소 정리하는 편이 적절하다.
- 큰 파일: `src/app/globals.css` 4,276행, `features/admin/admin-workspace.tsx` 2,790행, school-detail 520행, sales-workspace 514행, auth-context 476행, app-shell 469행. inventory-workspace는 301행이지만 긴 단일 effect에 가장 복잡한 경합 처리가 집중된다.
- 사용자/권한 namespace, revision / stockRevision / request ID / idempotency, Zod strict 응답 opt-in, Callable + App Check, Memory-only 민감 데이터, logout 시 즉시 감춤과 비공개 상태 정리, no offline write queue는 변경 금지 계약이다.
- 고객과 재고의 오프라인 정책은 다르다. `customers/use-customers.ts:26`은 offline 시 목록/draft 민감 상태 폐기, `inventory/inventory-workspace.tsx:118`은 같은 인증 컴포넌트의 Memory draft를 유지하고 쓰기를 막는다. 둘을 하나의 범용 데이터 hook으로 합치면 정책이 쉽게 섞인다.
- 검색/학교 데이터는 제한된 namespaced IndexedDB, 고객/재고/납품사진은 Memory 중심. SW는 앱셸·공개 자산·학교 thumbnail만 캐시한다. `src/app/sw.ts:33`의 skipWaiting=false 및 명시적 업데이트 유지.
- 최근 운영 수정은 인증 저장소 초기화 일치, iPhone HEIC/native file materialization, inventory CSS 예산이다. 손대기 전 해당 회귀를 반드시 고정한다.

## 우선순위 1: 리팩토링 보호막을 동작 기준으로 고정

근거:
- `src/features/admin/admin-save-lifecycle.test.ts:27`은 React hooks를 직접 교체하고, 93행에서 component.name으로 자식 검색, 108행에서 hook slot 배열로 상태 주입.
- `src/features/inventory/inventory-workspace-lifecycle.test.ts:8`도 hook 순서에 결합하고 50행에서 `effects[0]`을 직접 실행.
- `src/features/pwa/pwa-connectivity-lifecycle.test.ts:10`은 connectivity만 검사하며 설치/worker 효과는 명시적으로 제외.
- `vitest.config.ts` 환경은 node. SSR markup 및 수동 hook harness가 실제 React effect 재실행·StrictMode·portal·focus lifecycle을 대신하지 않는다. 기존 테스트가 쓸모없다는 뜻이 아니라 검증 범위가 다르다는 뜻이다.

순서:
1. 현 HEAD/dirty diff 및 기존 검증 상태를 기록하고, 주요 관찰 계약을 테스트 이름/파일에 연결한다.
2. 기존 Playwright/Emulator 여정으로 관리자 저장 중 이동 차단, 두 창 인증 유지와 revision conflict, 고객/재고 재진입/스크롤, offline draft, 권한 변경, 사진 취소/unmount를 먼저 고정한다.
3. 실제 수정할 경계에 한해서 필요한 누락 시나리오만 보강한다. 단순 파일 추출용 미러 테스트나 전면 테스트 프레임워크 교체는 하지 않는다.
4. 분리 뒤 기존 assertion을 유지한 채 import 경로/직접 harness 진입점만 바꾸고 브라우저 검증으로 확인한다.

검증: `npm run typecheck`, `npm run lint`, `npm run test:unit`, 변경 업무의 집중 suite. 통합은 demo 환경에서 `npm run test:e2e:phase17`, `npm run test:e2e:inventory`.

## 우선순위 2: 관리자 workspace를 페이지별로 추출

근거: `src/features/admin/admin-workspace.tsx:275` Overview, 375 Schools, 575 신규직원, 720 직원상세, 989 Employees, 1219 Cycles, 1663 Kakao 검토, 1807 Sync, 2269 Audit, 2373 Settings, 2649 전체 로딩/탐색. 페이지/폼/label/포매터/비동기 저장이 한 파일이다.

현재 계약:
- `AdminInteractionProvider`와 `interaction.canNavigate()`를 통한 저장 중 탐색 차단(2699행).
- `loadGeneration`을 통한 늦은 load 응답 무효화(2661, 2684행), silent refresh 실패 시 기존 자료 유지(2779행).
- cycle key가 selectedCycle 및 홍보제품 목록으로 draft reset을 제어(2748행).
- 기존 Customer/Inventory lazy import 유지; Admin 자체도 app-shell에서 lazy load.

안전한 순서: 공통 표시 label/formatter와 PageHeading/EmptyState → Audit/Overview/Schools 같은 읽기 페이지 → 직원/배정/동기화/설정 페이지별 추출 → 마지막에 load controller hook. 처음에는 static import 추출만 해서 동작을 고정하고, 새로운 lazy chunk 분할은 별도 측정/검토 단계로 둔다. 페이지 props 최소화를 위해 억지로 새 context를 넣지 않는다.

검증: `npm run test:admin`, `npm run test:e2e`(관리자 navigation fixture), `npm run test:admin:emulator`, 전체 typecheck/lint 및 build budgets. 저장 실패→입력 유지, PIN 노출 후 닫기, 저장 중 Escape/탐색 차단, silent refresh 실패를 재검증한다.

## 우선순위 3: 재고 catalog lifecycle을 UI에서 추출

근거: `src/features/inventory/inventory-workspace.tsx:97`~214 단일 effect에 TTL coordinator, progressive pagination, write reconciler, access failure, online/focus/visibility event, queued force refresh, 폐기 lifecycle이 집중. 215행부터 calendar watcher까지 추가 결합. 여러 동작을 한 줄에 작성해 실제 복잡도가 줄수보다 크다.

현재 계약:
- `inventory-repository.ts:38` 100개 page의 progressive callback, 5,000개 방어, `includeSummary: true`.
- 최초 usable page publish(143행), context/list 병렬(152행), 쓰기 우선 reconciler(87, 145, 159행).
- TTL 내 재진입 network 0, stale 즉시 표시 후 background refresh, 부분/후속 page 실패 시 usable 목록 유지.
- session/permissions namespace 변경과 인증 실패 시 민감 UI 제거; offline 상태에서 draft를 Memory에 유지하되 저장 금지.
- calendar/watch와 KST 일자 변경/실사 preference도 유지.

안전한 순서: ① 기존 coordinator/reconciler는 그대로 두고 effect의 입출력을 명확한 `useInventoryCatalog` 또는 작은 controller로 이동 ② calendar/context 동기화 별도 hook ③ 순수 목록/filter/count 파생 모델 추출 ④ UI만 남긴다. 동시에 고객 catalog와 합치거나 새 상태관리 라이브러리를 도입하지 않는다.

검증: `npm run test:inventory`, `npx vitest run src/lib/revalidation-coordinator.test.ts src/features/auth/private-client-state-snapshots.test.ts`, `npm run test:e2e:inventory`, `npm run test:performance`. 1,000개 재진입 0호출, page 1 먼저 표시, 진행 중 write/삭제/권한 변경, offline→online 및 focus+visibility 중복 이벤트, 자정/주간실사 전환 검증.

## 우선순위 4: 전역 CSS를 cascade를 보존하며 단계적으로 정리

근거: `src/app/globals.css:451` route, 826 shell/design system, 1228 sales, 2050 export, 2209 PWA, 2294 admin, 2473/2595/2737/3099/3430/3603 이후 반복된 역사적 palette/density override가 같은 파일에 누적. CSS modules가 이미 존재하므로 일괄 전환은 불필요하다.

현재 계약: selector 순서/특이도, data-mode 상태, BottomSheet portal 및 `:has`, motion/reduced-motion, safe-area/keyboard, 44px+ touch, focus-visible, disabled 상태/transition, inventory 신규 봉과 최근 분홍/노랑/화이트 디자인. CSS budget 여유가 작아 추출 후 class name 증가도 측정 필요.

안전한 순서: ① 현 화면/viewport별 기준 캡처·computed style 확보 ② token/reset와 feature rule 목록화 ③ 가장 고립된 route/export/admin 한 묶음씩 옮기되 처음에는 순서/selector 동일 ④ visual/a11y/bundle 검증 후 실제 죽은 override만 제거. 전역 import를 여러 파일로 나눴다는 이유로 크기가 줄었다고 주장하지 않는다. import 순서/특이도 변경과 중복 삭제를 같은 단계에 섞지 않는다.

검증: `npm run test:e2e` + 해당 authenticated 여정, `npm run build`, `npm run verify:performance:build`, `npm run verify:pwa:build`, `npm run verify:hosting:build`. 320/390/768/1280px, motion on/off, reduced-motion, keyboard/safe-area; transition 완료 뒤 axe가 측정되도록 기존 테스트 계약 유지.

## 우선순위 5: 학교·영업 화면의 순수 모델과 폼을 분리

근거: `src/features/school-detail/school-detail.tsx:109` profileSection, 126 FieldProfileEditor, 304 page, 342 save handler; `src/features/sales-cycle/sales-workspace.tsx:124`~185 assignment/route/filter/통계 모델; `sales-visit/sales-visit-sheet.tsx:82`~126 순수 표시/선택 helper와 큰 form 결합.

현재 계약: salesLocation은 보이는 elevator만 변경해도 기존 cart/stair 필드를 보존(111행); editor key에 profile revision 포함(500행); 학교 저장 expectedRevision/requestId; sales visit requestId는 form 생명주기 동안 동일(176행). route는 cycle/담당 ownership/좌표 적합성을 재확인하고 기존 이름·담당 순서로 정렬.

순서: 순수 파생 모델/patch helper → 읽기용 brief/presentation → 독립 form 컴포넌트. 기존 dynamic photo/history/visit/route picker 경계는 유지하고 요청 ID 생성 위치·key·form reset 시점을 바꾸지 않는다. 저장 정책 개선이 필요하면 별도 기능/버그 작업으로 분리.

검증: `npm run test:field`, `npm run test:sales`, `npm run test:visit`, `npm run test:e2e:phase7`, `npm run test:e2e:phase9`, `npm run test:e2e:phase10`, `npm run test:e2e:phase13`(변경 범위 해당 시). 지연 로드 회귀와 production JS gate 포함.

## 우선순위 6: 사진 전처리의 공통 저수준 경계를 중립 모듈로 옮기기

근거: `inventory/inventory-photo.tsx:12`가 고객 사진 전처리에 의존하고 고객 전처리는 `customers/customer-photo-preparation.ts:1`에서 학교 optimizer를 사용한다. `customers/customer-photo-preparation.ts:15`/32의 FileReader/Blob timeout·abort·byte-length 검사와 `delivery-photos/delivery-photo-preparation.ts:36`/53에 유사한 코드가 반복된다.

현재 계약: 30MB source, Blob 10초 → FileReader 20초 fallback, native input을 bytes 복사 전 reset/unmount하지 않기, 정확한 byte length 확인, abort/late completion 무시, HEIC native decoder, 준비 결과 재사용, Blob URL 소유권 해제. 고객/학교/재고는 AVIF 허용; 납품사진은 AVIF 거절·MIME mismatch 확인 및 evidence용 transport 품질/크기 정책이 별도다.

순서: ① 현재 customer/shared optimizer 이름 의존을 중립 `lib/media` 경계로 이동하되 wrapper API 유지 ② timeout/abort/byte read의 완전히 같은 primitive만 추출 ③ content-type detection 결과와 allowed policy는 분리. 사진 quality/허용형식/카메라 선택 UX와 업로드 계약은 바꾸지 않는다. 납품사진 freeze에 따라 이는 후순위 선택 단계다.

검증: `npx vitest run src/features/customers/customer-photo-preparation.test.ts src/features/inventory/inventory-photo-preparation.test.ts src/features/inventory/inventory-photo-picker-lifecycle.test.ts src/features/school-detail/photo-upload-optimizer.test.ts src/features/delivery-photos`, inventory/사진 E2E. iPhone 실제 촬영·HEIC, Android provider 파일 선택은 별도 실기기 확인 필요(자동 browser PASS로 대체 불가).

## 우선순위 7: 앱 탐색 orchestration과 PWA lifecycle의 책임만 정리

근거: `app-shell/app-shell.tsx:173` 설정/진단/로그아웃 UI, 271 content 상태, 305~407 history/Back/모드 전환, 416 renderer. `pwa/pwa-provider.tsx:62` connectivity, 112 install event, 138 SW registration/update, 176 사용자 승인 apply가 한 provider에 있다.

현재 계약: 업무 모드는 단일 URL에 자체 history state(version 1)를 쓰며 Next route restoration을 요청하지 않음(313행); 권한 없는 모드 복원 금지; search resolve는 replace; session/permission key로 workspace remount(422~427행); scroll을 workspace-content에서 보존. PWA update는 사용자 선택 뒤에만 reload, network reachability는 navigator.onLine만으로 판단하지 않음.

순서: SettingsPage/DeliveryHome 같은 presentation부터 이동 → history serialize/normalize 같은 순수 helper → 현재 event 소유권 그대로 navigation hook. PWA connectivity/installation/SW hook은 이 작업과 다른 작은 변경으로 수행한다. 이 과정에서 browser history 데이터 형식, routing, SW strategy/version/policy를 바꾸지 않는다.

검증: `npm run test:pwa`, `npx vitest run src/features/app-shell src/components/ui/bottom-sheet-history.test.ts src/lib/browser-history.test.ts`, `npm run test:e2e:phase4`, `npm run test:e2e:phase17`, production PWA/Hosting gates. Back/Escape/nested sheet, 업데이트 대기 중 편집 유지, 명시 update 뒤 로그인 유지, offline reopen 확인.

## 이번 1차 범위에서 보호하거나 미룰 항목

- `auth/auth-context.tsx:135`의 invalidation generation barrier, 159 listener 설치 수명, 181 offline verified session 복원과 admin 제외, `lib/firebase/client.ts`의 저장소 초기화 순서는 보호 대상이다. 인증 state machine 전면 재작성은 기능 이익 대비 회귀 위험이 크므로 1차 정리 목표로 잡지 않는다.
- `auth/private-client-state.ts:26`은 고객/재고 snapshot 즉시 clear 후 Blob revoke/storage prefix 정리, 이어서 async cache cleanup을 한다. registry와 직접 import가 섞여 있다는 이유만으로 모두 lazy import하거나 동적 등록만으로 바꾸면 즉시 폐기 계약 및 initial bundle 경계를 깨뜨릴 수 있다.
- common transport/cache/repository 추출은 domain별 auth failure 해석, manufacturer reference opt-in, includeSummary, pagination, retention 정책이 다르므로 무리하게 통합하지 않는다.
- framework/Next/React/Firebase 업그레이드, new query/state library, Rules/스키마 마이그레이션, offline 쓰기 queue, 디자인 변경, budget 상향은 별도 작업이다.

## 완료 판정과 권장 작업 단위

- 각 변경은 하나의 경계만 추출하고 컴파일/집중 unit+행동 회귀 통과 후 다음 단계. 관리자와 CSS를 같은 diff에 대량 변경하지 않는다.
- 최종: typecheck/lint/unit, 변경 업무 Emulator/브라우저, `npm run build`, `verify:pwa:build`, `verify:performance:build`, `verify:hosting:build`를 실제 실행한 HEAD에 기록한다. 현재 분석에서는 실행하지 않았다.
- 측정 지표는 초기 JS/기능 lazy JS/CSS raw+gzip, 입력 중 network 0, TTL내 재진입 호출 0, catalog page/write 경합 계약, 권한폐기/Blob URL cleanup. 파일 줄수 자체를 성공 KPI로 삼지 않는다.
- 버그 또는 설계 정책 변경을 발견하면 재현 증거와 별도 변경으로 처리하고, 순수 추출 diff에 조용히 포함하지 않는다.
