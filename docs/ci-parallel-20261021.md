# Quality Gate 병렬화와 실패 검사 재실행

기준일: 2026-10-21

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
- 빌드와 그 산출물을 검사하는 PWA·용량 gate는 같은 `production-build` 작업 안에서 순서대로 실행한다. 다른 검사 runner들은 자기 실행 스크립트에서 필요한 빌드·에뮬레이터·정적 서버를 준비한다. 다른 작업의 변경 파일이나 로컬 산출물에 의존하지 않는다.
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
- 사용자 기존 `AGENTS.md` 7줄 변경과 다른 worktree·기존 stash를 보존한다. CI 구성만 변경하며 Hosting·Functions·Rules·업무 데이터에 대한 배포/쓰기는 없다.

실제 GitHub 실행 결과와 소요 시간은 최종 소스 CI 완료 후 별도로 기록한다.
