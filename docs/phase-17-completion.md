# Phase 17 완료 기록

- 완료일: 2026-08-24
- 기준 문서: 구현 명세서, 테스트·인수 기준서
- 검증 환경: `demo-onnuriway`, Auth/Firestore/Functions/Storage Emulator, Production Mode Chromium, Node.js 22.23.2, Next.js 16.3.2

## Phase

Phase 17 — Full Acceptance Test

## 구현

- 정적 분석, 단위·성능, Production Build, PWA, Bundle, Safe Configuration, Emulator, Rules, 전체 브라우저 여정을 순서대로 실행하는 `test:acceptance` 단일 진입점
- 각 Emulator 하위 Gate 전에 Firestore를 초기화해 순서 의존과 Seed 오염을 제거한 격리 실행기
- Auth/Firestore/Functions/Storage를 한 번 기동하고 기능별 통합 Gate 10개, Rules, Production E2E를 누적 실행하는 CI 경로
- 실패 즉시 중단하고 `output/acceptance`에 기계 판독 가능한 Gate 결과를 기록하는 리포터
- GitHub Actions에 성능, PWA, Bundle, 전체 Emulator 수용 Gate 통합
- P0 11개, P1 17개, 보안 공격군 6개를 코드 증적에 연결한 수용 매트릭스

## 발견 및 수정

- Dynamic Auth Boot 화면에 문서 제목이 없어 접근성 검사 시점에 `h1`이 없던 문제를 수정했다.
- Offline 상세와 전역 연결 상태에 같은 문구가 표시될 때 E2E 선택자가 모호해지는 문제를 상세 영역으로 한정했다.
- Admin Callable E2E가 Custom Token을 사용해 Google Provider 전용 관리자 경계를 재현하지 못하던 문제를 Auth Emulator의 Google IdP 연결 흐름으로 교정했다.
- 연속 Emulator Gate가 이전 Gate의 Firestore 데이터를 공유해 월별 Sales Seed가 충돌하던 문제를 Gate별 초기화로 제거했다.

## 검증 결과

- P0: 0건
- 핵심 P1: 0건
- 기능별 Emulator Gate: 10/10 통과
- Firestore/Storage Rules: 23/23 통과, 보안 평가 5/5, 미해결 Finding 0건
- Production 브라우저: 30개 시나리오 각각 통과 확인
- Safe Configuration 모바일·데스크톱 접근성: 4/4 통과
- 단위 계약: 96개 통과·3개 명시적 Skip
- Next.js 16 Webpack Production Build, PWA Artifact, Bundle Budget: 통과
- `npm audit --audit-level=high`: High/Critical 0건

정량 성능과 항목별 연결은 `docs/phase-17-acceptance-matrix.md`, Rules 평가는 `docs/security/phase-17-rules-audit.json`에 기록했다.

## 2026-09-20 P1 dependency moderate 일시 예외

- 유효기한: **2026-10-20까지**. `npm audit`은 Moderate 7/High 0/Critical 0, `npm audit --omit=dev`는 Moderate 2/High 0/Critical 0이며, 기존 `--audit-level=high` gate는 그대로 checkpoint 차단 조건이다.
- 7개 audit node는 아래 고유 advisory 4개와 부모 aggregate 3개(`@google-cloud/pubsub`, `gaxios`, `firebase-tools`)다. aggregate는 별도 취약점이 아니다.

| 고유 advisory | 설치/영향/패치 | 경로와 범위 | reachability |
| --- | --- | --- | --- |
| npm 1119441 · [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) · CVE-2026-41907 | `uuid 9.0.1`; 영향 `<11.1.1`; 패치 `11.1.1` | production: `firebase-admin 14.4.0 → @google-cloud/storage 8.2.0 → gaxios 6.7.1 → uuid`; dev에서도 `firebase-tools 15.30.2 → gaxios → uuid` 공유 | gaxios는 multipart boundary에 `uuid.v4()`를 무인자로만 호출한다. 취약한 v3/v5/v6, caller buffer/offset은 호출하지 않으며 급식길 Storage save/download/delete 입력도 이를 제어하지 못한다. production tree에는 존재하지만 취약 동작의 실행 경로는 확인되지 않았다. |
| npm 1153174 · [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf) · CVE-2026-54285 | `@opentelemetry/core 1.30.1`; 영향 `<2.8.0`; 패치 `2.8.0` | dev: `firebase-tools → @google-cloud/pubsub 5.3.1 → @opentelemetry/core` | Firebase Pub/Sub emulator client에서만 적재된다. production Functions/bundle에 없고 untrusted production baggage header가 이 CLI process에 도달하지 않는다. |
| npm 1193670 · [GHSA-8cw4-87c7-c6xx](https://github.com/advisories/GHSA-8cw4-87c7-c6xx) · CVE-2026-85063 | `csv-parse 5.6.0`; 영향 `<7.0.2`; 패치 `7.0.2` | dev: `firebase-tools → csv-parse` | `firebase auth:import`의 운영자 지정 로컬 파일만 읽고 현재 호출은 `parse()` 기본 옵션이라 exploit 전제인 `columns: true`와 `group_columns_by_name: true`를 사용하지 않는다. production runtime에는 없다. |
| npm 1164823 · [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x) · CVE-2026-71429 | `stream-json 1.9.1`; 영향 `<=3.4.0`; 패치 `3.5.0` | dev: `firebase-tools → stream-json` | Auth/Realtime Database import 및 Firebase CLI의 로컬 Next dependency 분석에만 사용된다. filter 경로 자체는 존재하지만 입력은 운영자가 선택한 로컬 파일 또는 `npm ls` 출력이며 untrusted production request는 도달하지 않는다. |

나머지 세 node는 고유 advisory가 없는 전파 집계다.

| aggregate node | 설치/집계 영향/해소 범위 | production/dev 경로와 root |
| --- | --- | --- |
| `gaxios` | `6.7.1`; audit 집계 `6.4.0–6.7.1`; uuid를 제거한 `7+`에서 해소 | production root `firebase-admin`, dev root `firebase-tools`; 위 uuid advisory를 전파 |
| `@google-cloud/pubsub` | `5.3.1`; audit 집계 `5.1.0–6.0.0`; `6.0.1+`에서 해소 | dev root `firebase-tools`; 위 OpenTelemetry advisory를 전파 |
| `firebase-tools` | `15.30.2`; audit 집계 `>=10.1.2`; 현재 release line의 fixed version 없음 | root dev dependency; 위 네 advisory를 집계하며 npm의 `10.1.1` 제안은 breaking downgrade |

- registry 재확인 시 direct dependency `firebase-admin 14.4.0`, `firebase-tools 15.30.2`와 중간 `@google-cloud/storage 8.2.0`은 최신 stable이었다. gaxios 6, uuid 9, Pub/Sub 5, OpenTelemetry Core 1, csv-parse 5, stream-json 1에는 안전한 동일-major release가 없다.
- gaxios 7/uuid 11, Pub/Sub 6/OpenTelemetry 2, csv-parse 7, stream-json 3은 부모 선언 범위 밖이다. 특히 stream-json 3은 Firebase CLI가 쓰는 기존 subpath import와 호환되지 않는다. 검증되지 않은 강제 override가 deploy/emulator/import를 깨뜨릴 위험이 현재의 비도달 또는 개발 전용 Moderate 위험보다 불확실성이 커서 적용하지 않는다.
- mitigation은 인증된 Callable·권한/revision 경계, 10MB 사진 제한과 비재개 업로드, 운영자 통제 CLI 입력, High/Critical audit gate, 기존 전체 P1 기능·보안·빌드 통과 상태다. **known accepted transitive risk**로만 기록하며 취약점 수를 0으로 간주하지 않는다.
- 다음 중 하나가 먼저 발생하면 기한 전에도 즉시 재검토한다: `firebase-admin` 또는 `firebase-tools` 새 stable release, `@google-cloud/storage`의 gaxios 7+ 이동, advisory의 High/Critical 상향, 급식길 Storage/HTTP 호출 구조 변경. 2026-10-20까지 조건 변화가 없어도 예외를 갱신하거나 제거한다.

## 릴리스 판정

Phase 17 기술 수용 기준은 통과했다. 현재 결과는 Phase 18 Pilot에 투입할 수 있는 릴리스 후보이며 Production 배포 승인은 아니다. 실제 납품 1~2명, 홍보 1~2명, 관리자 1명의 Pilot과 그 결과에 대한 관리자 승인이 완료되어야 최종 Production Gate를 통과한다.

실제 외부 서비스, Firebase Project, 운영 데이터는 변경하지 않았다.
