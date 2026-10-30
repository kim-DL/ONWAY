# 설치형 앱 테마 대비 수정 Hosting 릴리스

- 승인: 사용자가 수정 코드를 main에 병합하고 Hosting 배포하도록 명시했다.
- 제품 source: `4ab5b0acb6a267068b3684a4faba42ee078adf6e`, main fast-forward.
- 변경: HTML/PWA theme 색을 밝은 배경 #f8fafc와 통일, meta light 및 CSS only light. 앱 식별자·기능·권한·데이터 계약 유지.
- [Quality Gate 41145106830](https://github.com/kim-DL/ONWAY/actions/runs/41145106830): attempt 1, 독립 12개+최종 verify 모두 SUCCESS. unit 1,817 PASS/기존 15 SKIP, 일반 browser 348 PASS/기존 8 SKIP, Phase 17 browser 83 PASS/기존 18 SKIP, 재고사진 4·transaction 12·납품사진 16 PASS. 실패·내부 flaky·job 재실행 없음.
- 관련 로컬 unit 18·typecheck/lint·build/PWA/성능/Hosting PASS. 최초 릴리스 빌드는 source 식별값 누락을 candidate guard가 거부했다. 코드 변경 없이 GITHUB_SHA를 지정한 재빌드와 산출물 gate를 통과한 뒤 117파일 후보를 고정했다. CI 재실행은 하지 않았다.
- 배포: `--project onnuriway --only hosting:onnuriway --non-interactive`.
- version **df13547e1d3815c7**, release **1793403783636000**, **2026-10-31 08:43:03.636 KST**. 직전 복구 version **9799c6d06a6314cc**.
- 양쪽 https://onnuriway.com 및 https://onnuriway.web.app 공개 HTTP 각 28 PASS, www 301. 모바일 Chromium 360×780/DPR3의 PIN·service worker activated·offline CSS 19개/유리 소재·pageerror 0·theme/manifest/light/dark 선호 검사 PASS.
- worker SHA-256 `cb1bf2686439840a13c6cda63f034e003cdacd2e6b7822cf1c4f7645fada1cab`가 공개 두 주소와 로컬 후보에서 같다.
- Aside 실제 운영 세션에서 theme #f8fafc, meta light, computed light only, 배경 rgb(248,250,252), 로그인 세션/업무 화면 유지 확인. 업무 쓰기·업데이트 버튼 강제 클릭 없음.
- Functions 72개 metadata·MCP 전용 Hosting·비공개 env digest 동일. Functions/Rules/Auth 배포·운영 업무 데이터 쓰기 없음.
- 증거: ignored `output/android-system-bar-release-20261031/`. 실제 Android 시스템 바/설치 PWA는 기기 미연결로 미검증이며 해결 확정으로 표현하지 않는다. 앱 삭제·저장 데이터 초기화 없이 설치 manifest 반영 후 확인한다.

결과 문서만 후속 `[skip ci]` 커밋에 기록하며 제품 소스와 검증 결과를 구분한다.
