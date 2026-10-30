# 2026-10-30 업무 모드 유리 버튼 Hosting 릴리스

사용자가 승인한 유리 버튼 디자인과 최종 문구를 적용하고, main 병합과 Firebase Hosting 운영 배포를 완료했다. 로고 오른쪽의 한 줄 모드 선택은 `거래처 · 학교 · 영업 · 재고`이며, 권한 3개와 4개의 빈 유리 소재를 구분한다. 상세 결정과 합성 전후 PNG는 [구현 문서](../glass-mode-navigation-20261030.md)에 있다.

## 소스와 로컬 검증

- 제품 source: **`6a703f26d737ce331d469875e4730feec18cac7f`**. 기준 `b226fea`에서 작업했으며 `codex/glass-mode-navigation-20261030`을 main에 fast-forward 병합했다. 두 branch를 origin에 저장했고 이번 요청에는 별도 PR을 만들지 않았다.
- 최종 전체 unit **1,825 PASS / 기존 15 SKIP**, 헤더 Chromium **50 PASS**, 앱·Functions typecheck·lint PASS. 320/360/390/768/1280px, 권한 3·4개, 200% 글자, 최소 44px 누름 영역, 고대비·동작 줄이기·키보드·모드 전환·기존 인사 모션을 확인했다.
- 실제 정적 앱과 합성 인증의 브랜드/모드 전환 검사 **1 PASS**다. 최초 로컬 실행은 기존 Functions의 10초 발견 제한으로 초기화에 실패했고, 기존 복구 설정 `FUNCTIONS_DISCOVERY_TIMEOUT=60`으로 에뮬레이터만 재실행해 해결했다. 테스트/CI timeout·assertion·skip은 완화하지 않았다.
- 최초 unit의 옛 제목/모드 버튼 색상 결합 1개는 중립색 유리 버튼 결정과 달랐다. 본문 팔레트 검사는 보존하고 그 결합만 제거한 뒤 전체 unit을 다시 통과했다. UI 조정 중의 옛 선택창/회전 테두리 기대 수정·소재 외부 영역 clip·문구 변경 중단 이력은 구현 문서에 구분한다.
- 의존성 audit high/critical **0**, 기존 moderate **14**다. package·lock·CI 구성과 보안 기준은 변경하지 않았다.

## 전체 CI

- [Quality Gate 41052348949](https://github.com/kim-DL/ONWAY/actions/runs/41052348949), push/main, **attempt 1**, 위 제품 source와 일치한다. `audit`, `typecheck`, `lint`, `unit`, `functions-build`, `search-performance`, `deferred-tools`, `production-build`, `browser`, `phase17`, `inventory-photos`, `delivery-photos`와 최종 `verify` **13개 전체 SUCCESS**다.
- unit **1,825 PASS / 기존 15 SKIP**, 일반 browser **348 PASS / 기존 8 SKIP**, Phase 17 browser **83 PASS / 기존 18 SKIP**, 재고사진 **4 PASS**, 재고 transaction **12 PASS**, 납품사진 **16 PASS**다. 실패·내부 flaky·수동 job 재실행은 **0**이다.
- 첫 job 시작→최종 판정 완료는 21:02:11→21:13:16 KST, 11분 5초다. 기존 병렬 검사·준비 단계·최종 판정·timeout·skip·audit·성능 예산을 유지했다. CI는 최종 코드의 로컬 검증을 마친 뒤 한 번 실행했다.

## 고정한 후보와 운영 배포

- 운영 build/PWA/성능/Hosting gate와 로컬 정적 HTTP **28개 검사 PASS**. 납품사진·재고 ON, Emulator OFF이며 기존 비공개 설정을 유지했다.
- 후보 **116파일**, precache **103개**. 공개 유리 소재 두 개는 합계 **85,590B**다. initial JS gzip **143,643B**는 기존과 같고 공통 CSS gzip은 **47,198→44,387B**다. 모든 기존 예산을 유지했다. 실제 업무 조작 시간의 속도 개선을 주장하는 측정이 아니다.
- 최종 후보 manifest·서비스 워커의 source revision·비공개 env digest를 저장했다. 배포 전과 배포 후에 116파일 및 env digest가 같음을 확인했다. 문서만 바뀌는 후속 커밋 때문에 빌드를 다시 만들지 않았다.
- 실행: `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project onnuriway --only hosting:onnuriway --non-interactive`.
- live version **`4b292455d646836f`**, release **`1793362470563000`**, **2026-10-30 21:14:30.563 KST** (`2026-10-30T12:14:30.563Z`), **FINALIZED**.
- 직전 복구 version **`faa34f2e24e98461`**, release **`1793348791948000`**. 배포 직전 다른 Hosting 릴리스가 없음을 다시 확인했다. 복구 배포는 실행하지 않았다.

## 운영 확인과 경계

- [운영 주소](https://onnuriway.com)와 [Firebase 기본 주소](https://onnuriway.web.app) 공개 Hosting 검사 각 **28 PASS**, www→apex **301**다. 두 소재의 HTTP GET·WebP MIME·후보와 원격 파일 해시를 확인했다.
- 두 origin의 새 S26 규격 Chromium(360×780 / DPR 3)에서 PIN과 시작 버튼 표시, 가로 넘침 0, 인증 로고 일치, **service worker activated**, 새 소재 2개의 offline cache 존재, **pageerror 0**을 확인했다. 실제 직원 PIN으로 로그인하거나 운영 업무를 변경하지 않았다.
- 공개 worker SHA-256 **`f0a0c98c9de46fe2765694c518e274e76bcf9489565dddae15d67fbc577b2f29`**가 고정 후보와 같다. 로컬 Aside에서도 실제 헤더 컴포넌트의 최종 문구와 360px 화면을 확인했다. Aside 화면과 DPR 3 자동 검사는 별도의 증거다.
- Functions **72개** metadata·revision·updateTime과 MCP 전용 Hosting version **`392f487ef50a6a9c`** / release **`1791529886712000`**이 전후 동일하다. Functions/Rules/Auth 배포와 운영 업무 데이터 생성·수정·삭제는 없다.
- 사용자 요청으로 주요 진행 상황을 기존 목소리·속도·볼륨의 온누리 공지방송으로 보고했다. 연결된 web MCP의 터널은 응답하지 않아 같은 PC의 기존 로컬 worker/CLI를 사용했다. 진행 보고 01~04는 `completed`이며 `music_session_not_found`는 감쇠할 음악 세션이 없다는 경고다. 반복 예약·별도 상시 알림 프로세스는 추가하지 않았다.

## 증거와 저장소 마무리

ignored `output/glass-mode-release-20261030/`에 CI source/job/test 요약, 후보 manifest, 비공개 env digest, 전후 metadata, 배포 로그, 양쪽 공개 검사, 로그인 PNG와 브라우저 결과를 보관한다. 디자인 원본·최종 프롬프트·비교 PNG는 `output/glass-mode-navigation-20261030/`에 있다. 비공개 값과 실사용자 정보는 문서화하거나 커밋하지 않는다.

릴리스 기록·HANDOFF·구현 문서만 `[skip ci]` 후속 커밋으로 저장하고 main과 관리 worktree를 동기화한다. 다른 worktree·실험 branch·기존 stash는 보존한다. 제품 코드는 같은 상태이므로 문서 때문에 전체 CI나 운영 배포를 반복하지 않는다.

실제 S26·직원 기기·설치 PWA·운영 로그인 후 업무 인수는 별도다. 합성 데이터와 공개/자동 브라우저 검증을 실제 기기 인수로 표현하지 않는다.
