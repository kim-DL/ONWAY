# 급식길 백엔드·데이터 리팩토링 사전 감사

2026-10-05 KST. `/workspace/ONWAY/AGENTS.md`와 `docs/HANDOFF.md`를 먼저 읽고 현 소스를 읽기 전용으로 조사했다. 제품 소스·의존성·설정 변경, 테스트 실행, 운영 API/데이터 접근은 하지 않았다. 분석 시작 시 `git status --short` 출력은 비어 있었다. HANDOFF/AGENTS의 과거 dirty worktree 문구는 현재 git 관찰과 구분해야 한다. 아래는 개선 후보이며 운영 장애가 확인됐다는 뜻은 아니다.

## 절대로 축소하지 않을 경계

- 재고는 사전/사후 Callable 인증 (`functions/src/inventory/callables.ts:48,54`), transaction 내부 세션·직원·권한 재검증 (`inventory-service.ts:104-106`), revision/stockRevision 분리, 영구 request receipt 및 append-only 감사 기록이 함께 동작한다.
- 구 설치 PWA의 strict 응답 계약을 위해 `includeSummary`, `includeManufacturerReference`, `includeOverviewPhoto` opt-in이 존재한다. 응답 확장 옵션은 이미 저장된 명령의 fingerprint와 독립인 경우가 있다.
- Firestore 전체 Client write 차단은 `firestore.rules:26-27,289-292`, Storage direct read/write 차단은 `storage.rules:13-18,32-33`. 다만 거래처 Client **read**는 `firestore.rules:164-166`에서 허용한다. “모든 거래처 읽기가 Rules에서 금지”라고 계획에 쓰면 사실과 다르다.
- 납품사진 전용 SA/bucket, App Check, `asia-northeast3`, 함수별 메모리·동시성·timeout, generation 기반 객체 소유권과 168시간 보관은 공통화 때문에 바꾸지 않는다.
- Rules/Auth/revision/request ID/upload race/Emulator/PWA/performance 테스트는 유지 대상이다. 더 적은 파일 수 자체를 성공 기준으로 삼지 않는다.

## 우선순위 후보 7개

### B1 — 권한 매트릭스와 인가 타이밍을 먼저 고정 (선행 조사, 구현 위험 높음)

근거: `functions/src/customer/customer-authorization.ts:29-61`, `functions/src/inventory/inventory-authorization.ts:26-59`, `functions/src/admin/admin-authorization.ts:36-64`, `functions/src/field/callables.ts:30-43`, `functions/src/field/profile-service.ts:113-174`.

거래처는 viewer 포함 모든 활성 직원이 저장할 수 있고 재고 viewer는 읽기만 가능하다. 재고는 한 번의 `getAll`로 canonical authz/employee를 조회하도록 최적화됐고 관리자 Google 승인까지 검사한다. 같은 이름의 “actor 검사”라도 정책이 다르므로 단순 공통 requireActor로 합치면 권한 확대/축소 또는 read 증가가 발생한다.

특히 현장정보 Callable은 사전 authz 검사 후 `{ uid, employeeId }`만 서비스에 전달하며 해당 commit transaction에는 직원/sessionVersion 재조회가 없다. 이는 재고·거래처와 다른 **정적 확인 사실**이고, 실제 revocation 경쟁 상태는 미검증이다. 이 차이를 refactor 중 암묵적으로 변경하지 말고 demo Emulator에서 “인가 후 저장 전 revoke”, “이미 commit된 request replay 후 revoke”, “admin 공급자/승인 불일치”를 먼저 재현한다. 보안 수정이 필요하면 동작 보존 리팩토링과 별도 변경 단위로 처리한다.

검증: `npm exec -- vitest run functions/tests/customer-authorization.test.ts functions/tests/inventory-authorization.test.ts functions/tests/inventory-callables.test.ts functions/tests/login-service.test.ts functions/tests/field-profile-service.test.ts`; demo 환경이 준비되면 `npm run test:field:emulator`, `npm run test:rules`.

### B2 — 안전한 공통 응답 헤더 및 진단 정보 정리 (초기 구현, 위험 낮음~중간)

근거: `functions/src/customer/callables.ts:20-35`, `functions/src/customer/customer-photo-callables.ts:11`, `functions/src/inventory/callables.ts:28-41`, `functions/src/delivery-photo/delivery-photo-callables.ts:35-60`; legacy raw error logging은 `functions/src/field/callables.ts:59-62`, `functions/src/sales/callables.ts:197`, `functions/src/export/callables.ts:43-77`, `functions/src/sync/callables.ts:115-163`.

동일한 `private, no-store, max-age=0`/Pragma 헤더 helper는 작은 공통 모듈로 먼저 추출할 수 있다. logger도 customer/inventory의 allow-list 방식(category/operation)을 기준으로 legacy error object 로깅과 차이를 줄일 후보가 된다. 원시 SDK error 안 실제 민감 값 노출은 이번 감사에서 확인하지 않았으며 운영 로그를 조회하지 않았다.

순서: 헤더만 이동 → failure fixture에 합성 비밀/URL/사진 bytes를 넣어 로그 비노출과 기존 HttpsError code/details 유지 확인 → 진단 helper 적용. 범용 Callable factory 및 런타임 options 통합은 뒤로 미룬다. delivery-photo `run()`과 inventory `handler()`의 재인가 위치도 동일하지 않다.

검증: `npm exec -- vitest run functions/tests/inventory-callables.test.ts functions/tests/customer-photo.test.ts functions/tests/delivery-photo-callables.test.ts functions/tests/delivery-photo-runtime-identity.test.ts`; `npm run typecheck`, `npm run lint`, `npm run functions:build`.

### B3 — 프런트/서버 계약의 소유권과 호환성 정리 (초기~중기, 위험 중간)

근거: `src/domain/inventory.ts:2`, `src/domain/customer.ts:9`, `src/domain/delivery-photo.ts:26`, `src/domain/inventory-manufacturer.ts:7`, `src/lib/phone-number.ts:1`에서 functions 소스를 재수출한다. 반면 `src/features/sales-visit/sales-visit-contract.ts:13-55`와 `functions/src/sales/sales-visit-contract.ts:22-75`는 중복처럼 보여도 서버에 legacy `{ productId, quantity }`/`visitedAt` 수용 경로가 있고 UI는 현재 `{ productName }`/`visitedDate`만 받는다. `src/domain/common.ts:9-31`과 inventory contract의 ID/revision도 허용 범위가 다르다.

순서: 도메인별 wire/UI/persistence schema 목록과 실제 의미 차이 기록 → 공통으로 동일한 primitive·현재 wire 계약만 추출 → legacy adapter와 UI validation 메시지는 도메인에 유지. 새 workspace 패키지를 즉시 도입하지 말고 현재 Functions `rootDir: src`/NodeNext와 Next bundler 양쪽 build를 만족하는 최소 이동 경로를 검증한 뒤 결정한다. Browser import graph에 `firebase-admin`, `node:crypto`, 서비스 코드가 유입되지 않음을 확인한다.

검증: `npm exec -- vitest run src/domain/phase1-contract.test.ts src/domain/delivery-photo.test.ts src/features/sales-visit/sales-visit-contract.test.ts functions/tests/sales-visit-service.test.ts functions/tests/inventory-callables.test.ts`; `npm run typecheck`, `npm run functions:build`, `npm run build`, `npm run verify:performance:build`.

### B4 — InventoryService를 순수 도메인 계산과 저장 순서로 분리 (중기, 위험 중간~높음)

근거: `functions/src/inventory/inventory-service.ts` 461행. `:25-70` 문서 codec/정렬/수량 집계, `:95-142` receipt/audit, `:167` 제품·제조사·사진 초기 저장, `:245-286` 실사 freshness/수량/이력 계산, `:416-435` tombstone 정책이 한 서비스 안에 있다.

순서: Timestamp codec 및 순수 집계/inspection projection을 먼저 추출하고 기존 서비스 public API를 유지 → command별 계산을 명시적 input/output 함수로 분리 → transaction은 마지막까지 한 orchestrator에 남긴다. 읽기/쓰기 순서와 transaction 범위, unit lock, 소진 lot 이력, metadata revision과 stockRevision, transfer 양쪽 location 실사 무효화, private `inspectionByLot` 유출 차단을 그대로 유지한다.

검증: `npm run test:inventory`; demo 환경 준비 후 `npm run test:e2e:inventory`. 기존 중요 케이스는 `inventory-service.test.ts:474` 동시 최초 등록, `:497` partial commit 방지, `:662` 구 응답과 fingerprint, `:723` 동시 출고, `:917` audit 실패 원자성, `:985-994` viewer/revoked 재검증. 기존 통과 결과를 이번 리팩토링 결과로 재사용하지 않는다.

### B5 — request receipt 공통화는 도메인별 정책을 보존하여 제한적으로 진행 (후순위, 위험 높음)

근거: `functions/src/inventory/inventory-service.ts:95-132`, `functions/src/inventory/inventory-manufacturer-service.ts:39-57`, `functions/src/customer/customer-service.ts:88-128`, `functions/src/field/profile-service.ts:17-43,119-131`.

inventory와 manufacturer가 동일 receipt collection을 쓰지만 inventory는 응답 옵션 4개를 fingerprint에서 제외하고 `detail`을 저장하지 않으며 선택적 최신 product replay를 한다. customer는 과거 결과 대신 현 customer 문서를 다시 읽는다. field는 명시적 입력 subset으로 hash하며 revision만 재생한다. 이를 하나의 “idempotent mutation helper”로 무조건 합치면 이미 commit된 retry가 collision 나거나 최신 화면을 과거 응답으로 되돌릴 수 있다.

순서: operation별 receipt path/hash 입력/result/replay/retention 표를 작성 → 기존 영구 receipt fixture로 이전 명령의 fingerprint 바이트 동등성 검증 → inventory 내부의 audit record/receipt IO만 추출 → 정책을 주입할 필요성이 확인됐을 때만 coordinator 공유. 기존 SHA-256 JSON 직렬화 방식, field 순서, requestId namespace, TTL 없음, transaction 내부 재인가, append-only 감사 실패 시 전체 rollback을 보존한다.

검증: `npm exec -- vitest run functions/tests/inventory-service.test.ts functions/tests/inventory-manufacturer-service.test.ts functions/tests/customer-service.test.ts functions/tests/field-profile-service.test.ts`; demo transaction/Rules 검증과 command collision, exact retry, 다른 UID/operation/request payload, revoke-after-commit 재시도 검증.

### B6 — 납품사진 service의 route/day 경계부터 분리 (후순위, 위험 높음)

근거: `functions/src/delivery-photo/delivery-photo-service.ts` 859행. `:294-394` route/day, `:395-578` 업로드 prepare/commit/recovery, `:579-697` 읽기/삭제, `:698-858` orphan/만료 정리가 공존한다. `:115-145` cleanup target/path, `:163-293` 소유권 보호가 업로드/만료 경로에 연결된다.

순서: 작은 문서 codec와 route/day 서비스를 먼저 추출하고 public facade를 유지 → read projection 분리 → 업로드/cleanup state machine을 도식화하고 Race G~Q 계약 고정 → 그 뒤 lease/generation 처리 모듈 분리. route/day와 객체 업로드는 별개 책임이므로 파일 크기 축소보다 이 경계가 기준이다. 보관 시간, scheduler 빈도, generation/attempt token, dedicated bucket/service account, upload retry당 rate-charge 규칙을 변경하지 않는다.

검증: `npm run test:delivery-photo`, demo 준비 후 `npm run test:delivery-photo:emulator`, `npm run test:rules`. `functions/tests/delivery-photo.test.ts:417` commit ack 유실, `:428` partial failure settle, `:451` lease 상실, `:551-940` Race G~Q가 필수 안전망이다. 저장 객체 삭제/유지 결과와 메타데이터를 검증하며 테스트를 파일 이동 때문에 제거하지 않는다.

### B7 — Rules를 생성하거나 완화하지 말고 도메인별 접근 계약을 문서화 (모든 단계의 게이트)

근거: `firestore.rules:96-131,150-167,173-195,289-292`, `storage.rules:13-18,32-33`, `tests/rules/customer.rules.test.ts`, `tests/rules/delivery-photo.rules.test.ts`, `tests/rules/firestore.rules.test.ts`, `tests/rules/storage.rules.test.ts`.

Refactor에서 shared contract나 repository를 정리할 때 “SDK로 더 쉽게 접근”하는 경로가 들어오지 않도록 현재 collection × read/write × actor 표를 작성한다. inventory/manufacturer/reservation/delivery-photo client read/write 차단은 catch-all deny에 의존하는 경로를 포함한다. 서버 Admin SDK는 Rules를 우회하므로 Rules PASS가 Callable 인가나 transaction 안전성을 대신하지 않는다.

검증: `npm run test:rules` 및 변경 도메인의 Callable/서비스 검증을 함께 실행한다. Rules 자체 배포·운영 읽기·운영 테스트 데이터 쓰기는 이 사전 계획 작업 범위 밖이다.

## 권장 단계와 완료 조건

1. 현재 커밋·lockfile·실행환경/기존 CI 결과를 기준선으로 고정하고 B1/B3/B5/B7 표를 작성한다. 기존 문서 최신/과거 기록을 구분한다.
2. B2 헤더 및 B4 순수 계산·codec 같은 작은 무동작 변경을 한 도메인씩 시행한다. 변경된 도메인 unit + 전체 typecheck/lint + Functions build가 통과해야 다음으로 간다.
3. B3 계약 정리를 수행하고 설치 PWA 구버전→서버 신버전 fixture를 확인한다. 배포가 필요해질 경우 서버 호환 먼저, 프런트 나중이며 구 parser로 바로 rollback하지 않는다.
4. B4 command 경계, B5 제한적 receipt 추출, B6 route/day를 각각 독립적으로 검증한다. 권한 정책 수정은 별도 changeset으로 유지한다.
5. 종합 검증: demo Emulator/Rules/핵심 E2E → `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run functions:build`, `npm run build`, `npm run verify:pwa:build`, `npm run verify:performance:build`, `npm run verify:hosting:build`, `git diff --check`. 변경 범위에 맞는 기존 gate를 통과하며 budget을 완화하지 않는다. 이번 읽기 감사에서는 이 명령을 실행하지 않았다.

성공 기준: 공개 Callable 이름/입출력/권한/에러 code, receipt 재생, 저장 데이터와 감사 의미, Rules, bundle budget이 보존되고 책임과 의존 방향이 명확해지는 것. 전체 백엔드 재작성, DB migration/backfill, 새 repository framework, 전역 generic transaction engine은 1차 목표로 권하지 않는다.
