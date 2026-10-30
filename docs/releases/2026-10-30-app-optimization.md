# 2026-10-30 시작 경로·검색 최적화 Hosting 릴리스

사용자가 승인한 코드 정리·성능 개선을 마치고 main 병합과 Firebase Hosting 운영 배포를 완료했다. 변경 범위와 전후 측정은 [최적화 문서](../app-optimization-20261030.md)에 있다.

## 검증한 소스와 검사

- 제품 source **`64cfdaddbd777dcf87892d11204c8434dbff7aa3`**. 기준 `24c462ad1d6797afdf832d64de60febfec1459d6`에서 작업한 `codex/app-optimization-20261030`을 main에 fast-forward 병합하고 두 branch를 origin에 저장했다.
- 먼저 코드 검토와 관련 로컬 검증을 마쳤다. unit **1,817 PASS / 기존 15 SKIP**, 관련 후속 unit **16 PASS**, 실제 정적 인증·업무 흐름 **30 PASS**, typecheck·lint·검색 성능 gate와 운영 build·PWA·성능·Hosting gate PASS다. 의존성 audit high/critical **0**, 기존 moderate **14**다.
- 최초 일반 browser **350 PASS / 플랫폼 4 SKIP / 2 FAIL** 후 표시 시점 문제를 조사했다. 두 사례는 원본 12회 재현 PASS, 검사 동기화 보강 후 12회 PASS다. 정확한 CSS 값·350ms 정지 확인·테스트 timeout·CI retry·skip을 유지했다. 비교 서버의 Windows 경로 오류와 의존성 없는 baseline worktree의 Functions 컴파일 실패도 구현 문서에 구분했다.
- 최종 코드의 [Quality Gate 41068028807](https://github.com/kim-DL/ONWAY/actions/runs/41068028807), push/main, **attempt 1**이 위 source와 일치한다. 독립 검사 12개와 최종 `verify` **13개 전체 SUCCESS**다. 첫 job 시작~최종 완료는 **23:00:34~23:12:04 KST**, 11분 30초다.
- CI: unit **1,817 PASS / 기존 15 SKIP**, 일반 browser **348 PASS / 기존 8 SKIP**, Phase 17 browser **83 PASS / 기존 18 SKIP**, NEIS **3**, Rules **50**, 지연 도구 **2**, 재고사진 **4**, 재고 transaction **12**, 납품사진 **16 PASS**다. CI 실패·내부 flaky·수동 재실행은 **0**이다. 기존 CI 명령·환경·보안 및 성능 예산을 유지했다.

## 빌드와 측정

- 최종 source revision과 기존 비공개 운영 설정으로 후보를 만들었다. 재고·납품사진 ON, Emulator OFF다. 후보 **117파일 / precache 104개**와 env digest를 고정하고 배포 전후 동일함을 확인했다.
- 최초 CSS gzip **37,102→6,436B(-82.7%)**, raw **196,309→22,819B**다. 업무 CSS를 인증 후 지연 청크로 옮겼으며 전체 CSS gzip **78,275→78,208B**, 초기 JS gzip **143,643→143,657B(+14B)**다. 새로운 초기 CSS 상한 raw 32KiB/gzip 8KiB와 기존 예산을 모두 통과했다.
- 동일 합성 정적 앱·CPU 4배·지연 120ms·각 5회의 첫 브랜드 위치 안정 중앙값 **1,325→685ms**, PIN **3,814→3,746ms**, 저장 세션의 재고 검색 입력 **3,953→3,963ms**다. 초기 표시가 빨라졌고 실제 업무 준비 시간은 사실상 같다. 인위적 기다림은 추가하지 않았다.
- 5,000개 학교·155개 검색 표본은 결과/정렬/점수가 모두 같고 중앙값 **18.64→15.41ms**, p95 **24.70→21.27ms**다. 인덱스 생성 중앙값은 **149.56→155.66ms**로 약 6ms 늘었다. 실제 직원 기기·운영 p75 측정으로 일반화하지 않는다.
- 로컬 Hosting HTTP **28 PASS**, S26 규격 Chromium의 로그인·worker 활성화·전체 공개 CSS **19개**와 유리 소재의 offline cache·업무 CSS 지연 적용·pageerror 0을 확인했다. Aside에서는 360×780 로그인과 3/4개 모드 헤더를 직접 확인했다.

## Hosting 배포와 공개 확인

- 명령: `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project onnuriway --only hosting:onnuriway --non-interactive`.
- live version **`9799c6d06a6314cc`**, release **`1793369645430000`**, **2026-10-30 23:14:05.430 KST** (`2026-10-30T14:14:05.430Z`), **FINALIZED**.
- 직전 복구 version **`4b292455d646836f`**, release **`1793362470563000`**. 배포 직전에 origin/main과 후보 source 및 운영 직전 릴리스가 바뀌지 않았음을 확인했다. 복구 배포는 실행하지 않았다.
- [운영 주소](https://onnuriway.com)와 [Firebase 기본 주소](https://onnuriway.web.app)의 공개 HTTP 검사 각각 **28 PASS**, www→apex **301**이다.
- 두 origin의 새 S26 규격 Chromium(360×780 / DPR 3)에서 PIN·시작 버튼·인증 로고, 가로 넘침 0, **service worker activated**, **pageerror 0**을 확인했다. 로그인 화면에서 업무 CSS가 적용되지 않고, 전체 CSS 19개와 소재 두 개가 오프라인 캐시에 있는 것도 확인했다. 운영 직원 계정으로 로그인하거나 업무 데이터를 쓰지 않았다.
- 공개 worker SHA-256 **`e12d7a0be7611eb1c68ac09f7c94ff2775ef53c5db87d3f2e952919b9e6494c3`**가 고정 후보와 같다.
- Functions **72개**의 metadata·revision·updateTime과 MCP 전용 Hosting version **`392f487ef50a6a9c`** / release **`1791529886712000`**이 배포 전후 동일하다. Functions/Rules/Auth 배포·운영 업무 데이터 쓰기·비공개 설정 변경은 없다.

## 기록과 마무리

주요 진행 상황은 사용자 요청에 따라 온누리 방송의 기존 목소리·속도·음량으로 보고했고 `completed`를 확인했다. `music_session_not_found`는 감쇠할 Aside 음악 세션이 없다는 경고이며 음성 보고 실패가 아니다. 기존 업무 일정·음성 설정·기록을 유지하고 작업용 반복 방송은 만들지 않았다.

ignored `output/app-optimization-20261030/`에 감사·전후 표본·로컬 검사 이력을, `output/app-optimization-release-20261030/`에 CI 증거·후보 manifest·env digest·전후 metadata·배포 로그·양쪽 공개 검사·브라우저 PNG를 보관한다. 실사용자 정보와 비밀 값은 문서/커밋에 없다.

결과 문서만 `[skip ci]` 후속 커밋으로 main에 저장하고 관리 worktree도 동기화한다. 제품 코드는 같아 문서 때문에 전체 CI나 배포를 반복하지 않는다. 다른 worktree와 기존 stash를 보존한다. 실제 S26 하드웨어·설치 PWA 현장 인수는 자동 브라우저 검증과 구분한다.
