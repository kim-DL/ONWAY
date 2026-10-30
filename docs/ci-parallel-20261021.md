# Quality Gate 병렬화와 실패 검사 재실행

기준일: 2026-10-21

> 2026-10-31 이후 검사 선택과 계획된 skip 처리는 [범위별 검증 규칙](scoped-verification-20261031.md)이 우선한다. 아래 내용은 full 검사와 과거 병렬화의 기록이다. 기존 12개 검사 자체와 실패 job만 재실행하는 원칙은 유지한다.

## 변경과 보존 기준

기존에는 `verify` 한 작업에서 모든 검사를 순서대로 실행했다. 뒤쪽 검사 하나가 실패하면 그 작업을 재실행하면서 앞에서 성공한 검사도 반복했다. 이를 아래 12개 독립 작업과 결과를 모으는 기존 이름의 `verify`로 분리했다.

| 작업 | 기존 검사 명령 | 추가 실행 도구 |
| --- | --- | --- |
| `audit` | `npm run audit` | Node |
| `lint` | `npm run lint` | Node |
| `typecheck` | `npm run typecheck` | Node |
| `unit` | `npm test` | Node |
| `search-performance` | `npm run test:performance` | Node |
| `functions-build` | `npm run functions:build` | Node |
| `production-build` | `npm run build`, `npm run verify:pwa:build`, `npm run verify:performance:build` | Node |
| `browser` | `npm run test:e2e` | Node, Chromium |
| `deferred-tools` | `npm run test:e2e:ux` | Node, Java, Chromium |
| `phase17` | `npm run test:acceptance:emulator` | Node, Java, Chromium |
| `inventory-photos` | `npm run test:e2e:inventory` | Node, Java, Chromium |
| `delivery-photos` | `node scripts/firebase-emulators.mjs delivery-photo-frontend-e2e` | Node, Java, Chromium |

- 14개 기존 검사 명령, 단계별 환경 변수, 테스트 선택 조건, assertion, timeout, skip, audit high/critical 기준, PWA 및 JS/CSS 예산은 그대로다. 기존 테스트·실행 스크립트·의존성 lock을 변경하지 않는다.
- 각 검사 작업은 기존처럼 Ubuntu와 45분 제한을 사용한다. `.nvmrc`·`npm ci`·npm 다운로드 캐시, checkout/setup-node v7, Java 21/setup-java v5, Chromium 설치 명령을 공통 composite action으로 옮겼다. Java·Chromium은 필요한 작업에만 설치한다.
- 빌드와 그 산출물을 검사하는 PWA·용량 gate는 같은 `production-build` 작업 안에서 순서대로 실행한다. 브라우저 작업은 `npx vitest run src/features/app-shell/app-shell-header.test.ts`를 먼저 실행해 기존 헤더 검증 HTML을 생성한다. 이 파일은 직렬 CI에서 앞선 unit 작업이 생성하던 산출물이다. 같은 7개 테스트를 준비 단계에서 추가 실행하고 전체 unit 검사도 유지한다. 다른 검사 runner들은 자기 실행 스크립트에서 필요한 빌드·에뮬레이터·정적 서버를 준비한다. 다른 작업의 변경 파일이나 로컬 산출물에 의존하지 않는다.
- 검사 작업 사이에는 `needs`가 없다. 한 작업의 실패로 다른 검사가 취소되지 않는다. 전체 결과를 모으는 `verify`만 12개 작업을 모두 기다리고 `always()`로 실행한다. 검사 결과가 모두 `success`여야 통과하며 실패·취소·skip·누락·알 수 없는 작업·잘못된 JSON을 허용하지 않는다. 최종 판정에만 5분 제한을 둔다.
- workflow 이름 `Quality Gate`, 기존 check 이름 `verify`, main push/PR trigger, contents read 권한을 보존한다. 브랜치 보호 설정은 변경하지 않았다. API로 기존 보호 규칙을 조회하는 것은 integration 권한 403으로 불가능했으므로 보호 규칙의 현재 설정 자체는 확인 결과로 주장하지 않는다.
- job 단위로 독립 runner와 설치가 필요하므로 총 runner 사용량은 늘 수 있다. 실제 동시 실행 수와 대기 시간은 계정·조직의 GitHub Actions 실행 슬롯에 영향을 받는다. 모든 실행의 완료 시간을 보장하지 않는다.

## 실패 시 재실행

GitHub Actions에서 해당 실행을 열고 **Re-run jobs → Re-run failed jobs**를 선택한다. 이미 성공한 작업 결과는 유지하고 실패한 작업과 그 결과를 모으는 `verify`만 다시 실행한다. 특정 작업만 다시 실행할 때는 그 작업의 재실행 기능을 사용한다. 자동으로 무한 재시도하거나 실패를 성공으로 바꾸는 설정은 추가하지 않는다.

재실행 단위는 개별 테스트 케이스가 아닌 위 표의 작업 묶음이다. 예를 들어 납품사진 검사 실패 시 `delivery-photos`와 후속 `verify`를 재실행하며, 운영 빌드·전체 unit·일반 브라우저 검사를 다시 실행할 필요가 없다. 소스 수정이 필요한 실패는 새 커밋의 전체 CI로 확인한다. 예전 커밋의 통과 결과를 새 소스의 통과로 취급하지 않는다.

공식 동작: [GitHub Actions 재실행 안내](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs), [작업 의존성과 always 조건](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds).

## 로컬 검증

- 기준 커밋 `b013e35`와 YAML 구조 대조: 기존 14개 gate의 명령·환경 변수 동일, trigger/권한/도구 버전 동일, 12개 작업 독립 및 최종 의존성 전체 일치 PASS. 기록: ignored `output/ci-parallel-20261021/contract-check.json`.
- 공식 배포 checksum을 확인한 actionlint v1.7.12: PASS.
- 최종 판정 CLI의 실제 프로세스를 실행하는 unit: 26 PASS. 각 12개 작업의 개별 실패, 취소·skip 등 성공 외 결과, 누락/알 수 없는 작업과 잘못된 JSON 거부를 확인했다.
- `npm run lint`, 앱·Functions `npm run typecheck`: PASS.
- 첫 CI에서 발견한 헤더 HTML 생성 의존성을 보완한 뒤 기존 생성 unit 7개, 해당 파일을 사용하는 mobile/desktop Chromium 28개 PASS(42.5초), actionlint·명령/환경/그래프 대조·diff check PASS다. 기존 브라우저 assertion·timeout·재시도 설정은 바꾸지 않았다.
- 사용자 기존 `AGENTS.md` 7줄 변경과 다른 worktree·기존 stash를 보존한다. CI 구성만 변경하며 Hosting·Functions·Rules·업무 데이터에 대한 배포/쓰기는 없다.

## 실제 실행 이력

- 첫 구성 `0c637d2`의 [Quality Gate 39593170549](https://github.com/kim-DL/ONWAY/actions/runs/39593170549)는 12개 작업이 동시에 시작했고 11개가 통과했다. unit 1,797 PASS/기존 조건부 15 SKIP, 재고사진 4·transaction 12·납품사진 16·지연도구 2 PASS다.
- `browser`는 앞선 unit이 만들던 헤더 HTML 16개가 없는 깨끗한 runner에서 ENOENT로 28개 실패했다. 그 밖에 281 PASS/8 기존 SKIP/3 내부 재시도 통과(재고 focus 1·인사 정지 2)다. 작업 분리 때 놓친 산출물 의존성으로 확인해 브라우저 작업 자체에 기존 생성 unit을 명시했다. 테스트 기대값을 낮추거나 실패 검사를 제외하지 않았다.
- 나머지 작업은 브라우저 실패 뒤에도 완료됐고 최종 `verify`는 올바르게 실패했다. 소스 보완이 필요해 같은 잘못된 커밋을 재실행하지 않고 보완한 새 커밋으로 전체 CI를 확인한다.
- 최종 구성 source `7c9a0b2b8f02d451b559ec26612eafa6e8bfa77d`의 [Quality Gate 39594520586](https://github.com/kim-DL/ONWAY/actions/runs/39594520586)는 attempt 1 **전체 SUCCESS**다. 12개 검사와 최종 `verify` 13개 모두 통과했고 workflow 재실행이 없다. 최종 browser와 Phase 17에 내부 flaky 보고도 없다.
- unit 1,797 PASS/기존 조건부 15 SKIP, 브라우저 준비 unit 7 PASS, 일반 browser 312 PASS/기존 8 SKIP, Phase 17 NEIS 3·Rules 50·browser 83 PASS/기존 조건부 18 SKIP, 재고사진 4·transaction 12·납품사진 16·지연도구 2 PASS다. 기존 audit·lint·앱/Functions typecheck·검색/캐시 성능·Functions build·운영 build/PWA/용량 gate도 모두 PASS다.

## 실측 시간과 저장소 상태

- 이전 직렬 기준: [Quality Gate 39582354656](https://github.com/kim-DL/ONWAY/actions/runs/39582354656)의 성공 attempt 2 `verify` 작업은 10:34:40–11:00:10 UTC, **25분 30초**였다. 이전 실패/재실행에 든 전체 대기 시간과 이 성공 작업의 시간을 구분한다.
- 최종 병렬 실행: 12개 검사가 11:47:07–08 UTC에 시작했고 최종 판정은 11:57:06 UTC에 완료됐다. 작업 시작부터 최종 판정 완료까지 **9분 59초**, 직렬 기준보다 **15분 31초 / 약 61% 단축**이다. 실행 생성→workflow 완료 표시 기준은 11:47:05–11:57:10 UTC(한국 시간 20:47:05–20:57:10), **10분 5초**다.
- 가장 긴 Phase 17은 준비 포함 9분 47초, 일반 browser 9분 43초다. 납품사진 4분 3초·재고사진 3분 8초·운영 build/PWA/용량 1분 19초가 이들과 병렬로 끝났고 최종 판정은 10초다. 헤더 HTML 준비는 약 1초다.
- 1회의 실제 Actions 비교이며 미래 실행의 완료 시간을 보장하지 않는다. 합산 runner 작업 시간은 25분 30초→34분 43초로 늘지만 동시 실행으로 사용자가 기다리는 시간을 줄인다. 계정 실행 슬롯·외부 다운로드·서버 상태에 따라 차이가 난다.
- 실행 source, job별 시작/완료/결과와 계산값은 ignored `output/ci-parallel-20261021/final-ci-results.json`에 있다. 실패한 작업만 재실행하는 동작은 GitHub의 기본 job 재실행 기능과 독립 그래프를 이용한다. 최종 실행에 실패가 없어 실제 실패 작업 재실행은 하지 않았으며, 실패 차단은 첫 CI의 `Required checks did not succeed: browser`와 CLI 회귀 26개로 확인했다.
- 최종 결과 문서만 후속 `[skip ci]` 커밋으로 저장한다. 검증된 CI 구성/테스트 소스를 바꾸지 않고 중복 전체 CI를 만들지 않는다. main과 작업 branch의 로컬·원격을 동기화하고 사용자 기존 `AGENTS.md` 수정 7줄, 다른 worktree·stash를 보존한다.
