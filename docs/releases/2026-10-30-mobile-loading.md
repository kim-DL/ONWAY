# 2026-10-30 모바일 중앙 로딩 Hosting 릴리스

사용자가 모바일 중앙 로딩·온누리 로고 확대·필요한 로딩 확장 후 main 병합과 Hosting 운영 배포까지 승인했다. 작업 브랜치를 main에 fast-forward 병합하고 최종 소스의 전체 CI 확인 후 Firebase Hosting만 배포했다.

## 소스와 검증

- 배포 소스: `9b8fc14daa97897ae4c9a2d763e93606a32cb36d`. 초기 구현 `91040ee`와 인증 로고 스타일 범위 복원 `9b8fc14`를 포함한다. 브랜치 `codex/mobile-loading-polish-20261030`과 main에 저장했다. 이번 요청에는 새 PR을 만들지 않았다.
- 최종 [Quality Gate 41025259604](https://github.com/kim-DL/ONWAY/actions/runs/41025259604), attempt 1: 독립 검사 12개와 최종 verify 전부 SUCCESS다. unit **1,827 PASS / 기존 15 SKIP**, 일반 browser **340 PASS / 2 내부 flaky / 기존 8 SKIP**, Phase 17 **83 PASS / 기존 18 SKIP**, NEIS 3·Rules 50·재고사진 4·transaction 12·납품사진 16 PASS다.
- 내부 flaky 2개는 기존 `welcome-greeting.spec.ts:217`의 모바일/데스크톱 모션 정지·설정 복원 검사다. 정지 직후 transform 비교의 첫 실패 후 기존 자동 재시도로 통과했다. 앞선 릴리스에서도 관찰됐으며 정확한 최초 실패 원인은 미확정이다. 모션 코드·assertion·timeout·skip·재시도 정책을 바꾸지 않았다. 수동 job 재실행은 없다.
- 첫 [CI 41024711214](https://github.com/kim-DL/ONWAY/actions/runs/41024711214)는 관리자 스타일 보존 unit 1개 실패로 최종 verify가 실패했고 나머지 검사 11개는 성공했다. 당시 unit 1,826 PASS/1 FAIL/기존 15 SKIP, browser 342 PASS/기존 8 SKIP다. `.auth-shell .auth-brand__mark` 범위를 복원한 새 커밋의 로컬 검증과 전체 CI로 해결했으며 이전 성공 결과를 최종 소스의 결과로 대체하지 않았다.
- 최종 소스로 운영 build/PWA/성능/Hosting gate PASS. 납품사진·재고 ON, Emulator OFF, 기존 비공개 설정 유지. initial JS gzip 143,643B, 학교/공통 CSS gzip 47,198B, 납품사진 JS gzip 10,223B, 사진 이력 CSS raw 5,620B로 모든 기존 예산을 유지했다. 의존성·Functions/Rules/CI 구성 변경은 없다.
- 후보 **114파일**, precache **101개**를 고정했다. 배포 전후 파일 digest 및 비공개 env digest가 동일하며 서비스 워커에 배포 소스 revision이 포함돼 있다. 비공개 값은 기록하지 않는다.

## 운영 결과

- 실행: `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project onnuriway --only hosting:onnuriway --non-interactive`.
- live version **`faa34f2e24e98461`**, release **`1793348791948000`**, **2026-10-30 17:26:31.948 KST** (`2026-10-30T08:26:31.948Z`), FINALIZED.
- 직전 복구 version **`0daafb880d5e16f4`**, release `1793298248156000`을 기록했다. 복구 배포는 실행하지 않았다.
- [운영 주소](https://onnuriway.com)와 [Firebase 기본 주소](https://onnuriway.web.app) 공개 Hosting 검사 각 **26 PASS**, www→apex **301**. 기존 25개 조건에 인증 로고 WebP의 GET·MIME·후보 파일 해시 확인을 추가했다.
- 두 origin의 새 390px Chromium에서 PIN·시작 버튼 표시, 공개 로고 일치, 가로 넘침 0, service worker activated, pageerror 0을 확인했다. 공개 worker SHA-256 **`38fcf60fa93c8cb03cae7c054906beae715bc0b4685d63299ac8af3f1ecbcded`**가 후보와 같다.
- 운영 apex의 390/1280px 브라우저에서 인증 코드 응답을 잠시 보류해 시작 로딩을 관찰했다. 중앙 그룹은 x/y 중심 오차 1px 미만, 가로 넘침 0이고 응답을 풀면 PIN 입력이 가능하다. 이는 배치 확인용 합성 지연이며 실제 운영 속도 측정이 아니다.
- Functions **72개**의 metadata fingerprint·revision·updateTime과 MCP 전용 Hosting version `392f487ef50a6a9c` / release `1791529886712000`이 전후 동일하다. Functions/Rules/Auth 배포, 운영 업무 데이터 생성·수정·삭제는 없다.

## 기록과 확인 범위

[구현·전후 화면·로컬 실패 및 수정 기록](../mobile-loading-20261030.md). ignored 배포 증거는 `output/mobile-loading-release-20261030/`에 CI 결과·후보 manifest·환경 digest·snapshot·공개 HTTP·브라우저·배포 로그를 보관했다. 구현 검증은 `output/mobile-loading-20261030/` 및 `output/mobile-loading-polish-20261030/`에 있다.

제품 소스가 동일한 릴리스 기록·HANDOFF·구현 문서만 `[skip ci]` 후속 커밋으로 저장하고 main·현재 관리 worktree를 동기화한다. 다른 worktree·실험 branch·기존 stash를 보존하며 문서 때문에 전체 CI나 운영 배포를 반복하지 않는다.

실제 직원 PIN을 사용하는 운영 업무 검증이나 실제 iPhone/Android 설치 PWA의 OS 시작 화면·장시간 복귀 인수는 수행하지 않았다. 공개 페이지·자동 브라우저와 합성 데이터 검증을 실제 기기 인수로 표현하지 않는다.
