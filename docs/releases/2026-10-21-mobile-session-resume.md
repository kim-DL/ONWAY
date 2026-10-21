# 2026-10-21 모바일 홈 복귀·로그인 유지 Hosting 릴리스

## 승인 범위와 변경

사용자가 수정 커밋, 전체 CI 확인, Firebase Hosting 운영 배포, 배포 후 검증과 로컬 동기화를 승인했다. 배포 대상은 project `onnuriway`의 `hosting:onnuriway`다.

시간 경과나 일시적 통신 실패로 직원 인증을 지우지 않고, 최근 검증된 직원 세션과 마지막 업무 모드·탭으로 화면을 먼저 복구한다. 인증·권한의 서버 확인은 뒤에서 계속한다. 거래처의 같은 세션 메모리를 일시적 오프라인 동안 유지하고, 연결 복구 시 갱신한다. 오프라인 편집 저장은 전송 전에 막는다. 수동 로그아웃·서버 권한 철회·비공개 상태 정리와 기존 사진 outbox/서버 확인 후 완료 판정은 유지한다.

## 검증과 CI 이력

- 구현 commit `ccb5249b73340479b59d7b795550aff4b3a74bfb`, 최종 release source `a934d515cee6b57620cae3903356ed34cca7c2a5`.
- 최초 [Quality Gate 39578039882](https://github.com/kim-DL/ONWAY/actions/runs/39578039882)는 기존 Vite 의존성의 high 취약점으로 audit에서 실패했다. 로컬 재현 후 `vite 8.2.2→8.2.4`의 lock 3개 필드만 수정했다. 보안 기준·용량 상한·앱/Functions 의존성은 그대로다.
- 깨끗한 npm ci와 high/critical audit PASS. moderate 9개는 남아 있다. 수정 도구로 전체 unit 1,771 PASS / 기존 조건부 15 SKIP, 검색·캐시 성능 gate PASS.
- 인증·거래처 Chromium 14 PASS, 정적 demo 복귀/재시작 Chromium 2·Windows WebKit 2 PASS. 로컬 실패와 재실행 원인은 구현 문서에 구분했다.
- 고정 source의 운영 build/PWA/성능/Hosting gate PASS. 사진·재고 ON / Emulator OFF. initial JS gzip 140,103B, customer 36,834B, inventory 25,861B. 산출물 113개 / precache 100 / initial assets 9개.
- `c523bf6`의 [Quality Gate 39579369157](https://github.com/kim-DL/ONWAY/actions/runs/39579369157)는 Phase 17 사진 이력의 버튼 대비 검사 1개에서 실패했다(82 PASS/18 기존 조건부 SKIP). 실제 공유 CSS에서 활성화 직후 opacity 0.55가 남는 원인을 재현해 사진 조작부의 opacity 전환만 제거했다. 동일한 실제 정적 사진 이력·Axe 검사 1 PASS, lint·운영 build·PWA/성능/Hosting gate PASS다. 이 실행의 일반 browser 310 PASS/2 flaky/8 SKIP는 별도 이력이며 flaky는 재고 키보드 복귀와 인사 애니메이션이었다. 검사 기준은 유지했다.
- 최종 [Quality Gate 39582354656](https://github.com/kim-DL/ONWAY/actions/runs/39582354656)는 **attempt 2 SUCCESS**, 2026-10-21T11:00:11Z 완료다. 최종 실행은 unit 1,771 PASS/15 기존 조건부 SKIP, 일반 browser 312 PASS/8 SKIP/0 flaky, 영업 도구 2·NEIS 3·Rules 50·Phase 17 browser 83 PASS/18 기존 재고 조건부 SKIP·재고사진 4·transaction 12·납품사진 16 PASS다.
- 이 최종 source의 attempt 1은 Phase 17 검색 중 통신 검사 1개에서 실패했다(82 PASS/1 FAIL/18 기존 조건부 SKIP). 앞서 보완한 사진 대비 검사는 통과했다. 포착된 요청은 Firestore Listen 채널 POST였다. 인증·검색·해당 테스트는 앞선 c523bf6 실행에서 통과한 것과 동일하며, 그대로 실행한 로컬 테스트는 2 PASS/1 FAIL이었다. 같은 20개 입력의 별도 브라우저 관찰 5회는 통신 0이었다. 초기 관찰의 idle 30초에는 추가 요청이 없었고, 정확한 Listen 메시지 유형은 확정하지 못했다. 간헐 실패로 판단해 소스·assertion·timeout·skip·예산을 바꾸지 않고 같은 source의 실패 job을 한 번 재실행했다. attempt 2는 같은 source에서 전체 SUCCESS다. 마지막 실행 안의 flaky는 0이며, source의 attempt 1 실패와 구분한다.

## 운영 반영과 동기화

- project onnuriway / target hosting:onnuriway만 배포했다. Functions/Rules/Auth 배포와 운영 업무 데이터 쓰기는 없다.
- live version **c4e035caf38f7259**, release **1792580507302000**, **2026-10-21 20:01:47.302 KST** (2026-10-21T11:01:47.302Z), FINALIZED다. 직전 복구 version은 **ff64054ec6bac356**이며 복구 배포 자체를 실행하지는 않았다.
- 두 origin 공개 HTTP 검사는 각 25개 PASS다. www→apex 301, 새 Chromium의 로그인 UI·worker activated·pageerror 0을 확인했다. 공개 worker SHA-256 **33c05e0e1383a6c4decdb7ec99f80ad8cd4479c9551aacaa68903058015f9b49**가 배포 후보와 두 origin에서 같다.
- 전체 Functions 72개 metadata fingerprint와 실사/MCP API revision·build·updateTime, MCP 전용 Hosting version/release가 전후 같다. MCP 1.14.2·writesRequireApproval·공개 health/OAuth metadata 3개도 유지한다. 관련 PR #4 draft/open/head 86ce19328bf0074328b43512745f284aeb7df740은 유지했다.
- 후보 113파일 digest와 기존 비공개 env snapshot digest는 배포 전후 같다. 소스 a934d51은 main과 codex/mobile-resume-20261021의 로컬/원격에 저장했다. 이 릴리스 기록·HANDOFF·구현 기록은 문서 전용 후속 commit으로 main에 저장하고 제품 코드는 바꾸지 않는다. 제품 CI를 다시 실행하거나 같은 산출물을 중복 배포하지 않도록 문서 commit에 [skip ci]를 사용한다.
- 기존 AGENTS.md 사용자 변경 7줄은 배포 후보를 깨끗하게 유지하는 동안 task 전용 stash로 보존했고 저장한 원본과 일치하도록 복구했다. task 전용 stash를 제거했고 기존 stash 목록은 보존했다. 다른 branch/worktree와 기존 stash는 보존한다.
- ignored 증거: output/mobile-resume-release-20261021/. 운영 메타데이터는 credential/env 원문 대신 버전·revision·전체 metadata의 canonical SHA-256 중심으로 남긴다.

## 확인 범위

자동 브라우저·에뮬레이터·공개 URL 확인은 실제 iPhone/설치 PWA 현장 인수와 구분한다. OS가 프로세스를 종료하면 앱 초기화와 메모리 업무 데이터 재조회는 필요하다. Firebase 저장소가 유지되고 서버가 세션을 철회하지 않았다면 PIN 재입력 없이 이어진다. 직원 기기의 촬영→홈→복귀 반복과 장시간 백그라운드·네트워크 전환·직접 로그아웃 확인은 남아 있다.

## 남은 검사 유지보수

현재 CI는 모든 단계를 한 verify job에 두어 새 commit이나 실패 job 재실행 때 앞부분도 다시 실행된다. 다음 유지보수에서는 보안 검사를 CI 전 로컬 준비에 포함하고, 독립 gate job 분리와 검색 검사에서 초기 Listen transport를 구분하는 방식을 검토해야 한다. 이번 릴리스에서는 CI 구조·assertion·timeout·skip·예산을 변경하지 않았다.
