# 현장 지연 P0 운영 릴리스 — 2026-10-18

사용자가 PR #5의 main 병합, 필요한 Functions/Hosting 운영 배포, 기존 MCP 유지, 배포 검증과 로컬 동기화를 명시적으로 요청했다.

## 소스와 CI

- [PR #5](https://github.com/kim-DL/ONWAY/pull/5)는 2026-10-18 11:04:17 KST에 merge했다. 제품 소스는 `ccd8d0321230e114d93b78a8b30059c7018cbb03`, PR head는 `1ad0b27585675003bd0b1d2c9d88e709d1dcd8b5`다. 둘의 Git tree는 `95111c45b2a8b50eb84d38d9ba3ce3fb87088b5c`로 같다.
- 병합된 정확한 main에서 [Quality Gate 39088759706](https://github.com/kim-DL/ONWAY/actions/runs/39088759706)가 11:29:26 KST 전체 성공했다. audit, lint, 앱/Functions typecheck, unit, 검색 성능, Functions/정적 build, PWA, 기존 JS/CSS budget, 전체 브라우저 및 사진 회귀를 통과했다.
- unit 1,736 PASS / 조건부 emulator 15 SKIP, 일반 browser 286 PASS / 기존 개인 PC 이미지 조건 4 SKIP, 지연 영업 도구 2 PASS, Phase 17 browser 81 PASS / 재고 전용 18 SKIP다. 별도 NEIS 3·Rules 50·실제 재고 transaction 12·재고사진 4·납품사진 16 PASS다. 조건부 unit 15개는 NEIS 3개 및 재고 transaction 12개 전용 단계에서 실제 실행했다. 재고 전용 browser 18개는 동일 제품 소스의 별도 로컬 검증 기록을 따른다.

## 운영 반영

Node 22.23.2/npm 10.9.8, 기존 비공개 운영 설정으로 사진/재고 flag ON, Emulator OFF, PWA revision을 merge SHA로 고정해 새로 build했다. Functions build 및 PWA/성능/Hosting artifact gate가 모두 통과했다. 후보 109개 파일의 크기/SHA-256 manifest를 저장하고 배포 직전·직후 동일성을 확인했다. precache 96개, 초기 assets 9개다. 비공개 env 파일 3종의 digest도 전후 같다.

| 대상 | 배포 결과 | 이전 복구 기준 |
| --- | --- | --- |
| `recordInventoryCount` / `asia-northeast3` | ACTIVE `recordinventorycount-00009-yum`; update time `2026-10-18T02:31:32.841460586Z` | `recordinventorycount-00008-gox`; 원본 소스 위치와 generation을 로컬 metadata에 보존 |
| Hosting site `onnuriway` | FINALIZED version `a21113ad828fdb0a`; release `1792290714536000`; 11:31:54.536 KST | version `663003d922fb2290` |

실행 대상은 각각 `--project onnuriway --only functions:recordInventoryCount --non-interactive` 및 `--project onnuriway --only hosting:onnuriway --non-interactive`다. 사진 서버 API는 변경하지 않아 추가 사진 Functions 배포가 필요하지 않았다. Rules 배포와 검증용 운영 업무 데이터 쓰기를 수행하지 않았다.

## MCP와 기존 작업 보존

- 전체 Functions 72개 중 `recordInventoryCount`만 변경됐고 다른 71개의 CLI metadata는 전후 동일하다. 재고 함수의 런타임·서비스 계정·메모리·CPU·동시성·최대 인스턴스·timeout·ingress·기존 업무 환경변수도 동일하다.
- `employeeMcp`는 version 1.14.2, revision `employeemcp-00031-muy`이며 Functions API metadata 전체가 전후 같다. 전용 Hosting `onnuriway-mcp`의 version `392f487ef50a6a9c`와 release도 그대로다.
- [PR #4](https://github.com/kim-DL/ONWAY/pull/4)는 draft/open으로 유지하고 `codex/mcp-1.8.0`의 `86ce19328bf0074328b43512745f284aeb7df740`, 기존 실험 브랜치·worktree·stash를 보존한다. 로컬 main은 원격 main과 fast-forward 동기화했다. 이 릴리스 문서 후속 커밋은 제품 코드를 바꾸지 않으므로 중복 배포하지 않는다.

## 배포 후 확인

- `https://onnuriway.com`, `https://onnuriway.web.app`에서 공개 GET/HEAD **각 25개 PASS**: HTML/보안·캐시 헤더, worker, manifest, connectivity, 브랜드·아이콘 및 초기 자산을 확인했다. www HTTPS는 301로 apex에 이동한다.
- 공개 worker는 두 주소 모두 후보와 바이트 단위로 같고 SHA-256은 `af8db918595224c44633e388e4a901fa3816a542340e1acb7ee031bb55b85ae0`이다.
- 독립 Chromium 새 세션에서 두 origin의 직원 PIN 로그인 화면, 서비스 워커 `activated`, 실행 오류 0을 확인했다. 배포 전 동일 공개 검사에서 기존 worker `20aa159d3a9aeca9f142ab0ade71a6cca170d03a9587d1545463421c40294c44`와 정상 로그인 화면을 확인했다.
- 인증 없는 재고 Callable 요청은 전후 401 `UNAUTHENTICATED`다. MCP health·OAuth 공개 metadata는 전후 200이고 공개 응답이 동일하며 `writesRequireApproval: true`다. MCP의 실제 인증 세션·전체 업무 tool 실행까지 검증한 결과는 아니다.
- 실제 직원 로그인/App Check 성공과 운영 업무 저장 테스트는 하지 않았다. 실제 iPhone/설치 PWA의 카메라·업데이트·오프라인·종료/재실행은 별도 현장 인수 대상으로 남는다. 합성 성능 측정을 운영 지연 개선율로 보고하지 않는다.

클라이언트를 구버전으로 되돌릴 때는 새 outbox의 미전송 사진을 현 버전에서 서버 저장 확인까지 완료해야 한다. 구버전은 새 outbox를 전송하지 못하므로 Hosting rollback만으로 대기 사진 저장이 완료되지 않는다. 서버 함수와 Hosting의 복구 기준은 분리해 기록했다.

배포 후보 manifest, 전후 release/Functions metadata, CI 요약, 두 origin의 공개 검사·로그인 화면·브라우저 검사, 보존 검증과 실행 로그는 배포 PC의 ignored `output/field-p0-release-20261018/`에 있다. 비공개 env 원문이나 실제 직원·거래처·재고·사진 정보를 이 문서에 포함하지 않았다.
