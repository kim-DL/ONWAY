# 모바일 유리 모서리 Hosting 릴리스

- 승인: 사용자가 개선안을 확정하고 main 병합·Hosting 배포를 요청했다.
- 제품 source: `62a12451977ad2e644df53072f08c15c87c27a2d`. `codex/glass-mobile-corners-20261031`을 main에 fast-forward 병합·push했다. 제품 변경은 3/4권한용 WebP 두 개이며 합계 48,888→42,160B다. [변경·시각 검증](../glass-mobile-corners-20261031.md)
- 기준 제품 `974f3b1`의 전체 CI `41156169851` 성공을 재확인했다. 이후 `711cd73`까지는 문서만 변경됐다. 이번 실제 diff는 `presentation`으로 분류됐다.
- [Quality Gate 41192590796](https://github.com/kim-DL/ONWAY/actions/runs/41192590796): attempt 1 SUCCESS. 선택된 7개 job(plan/verify 포함) 성공, 나머지 8개는 계획에 따른 제외다. UI 78 PASS, unit 1,832 PASS/15 조건부 SKIP, lint/typecheck/운영 build 성공. job 재실행·flaky 결과 없음. workflow 생성→완료 5분 28초, UI 테스트 자체 3.2분(이번 실행 측정).
- 기존 관련 로컬 단위 5개·S26 브라우저 1개 결과를 재사용했다. 새 운영 build·PWA·성능·Hosting gate PASS. 사진·재고 ON, emulator OFF. 117개 파일의 source/tree/hash와 private env digest를 고정하고 배포 직전·직후 동일함을 확인했다.
- 배포 범위: `--project onnuriway --only hosting:onnuriway --non-interactive`.
- **2026-10-31 19:30:11.539 KST**, Hosting version **9c55e93a21e26f39**, release **1793442611539000**. 직전 복구 version은 **d712b93e977f7449**다.
- [onnuriway.com](https://onnuriway.com)·[onnuriway.web.app](https://onnuriway.web.app) 공개 검사 각 28 PASS, www 301 확인. 양쪽의 에셋 2개·헤더 CSS 해시가 후보와 일치했다.
- 새 Chromium 세션 360×780/DPR3에서 두 주소의 로그인, 활성 service worker, 새 유리 에셋 및 CSS 19개 precache, workspace CSS 지연 로딩, pageerror 0을 확인했다.
- Aside의 기존 운영 탭은 검사 중 닫혀 새 확인용 탭을 열었다. 이전 PWA 캐시가 사용되는 상태에서 새 버전 안내를 확인하고, 입력 없는 탭의 `업데이트` 버튼으로 적용했다. 로그인 복귀·거래처 화면·네 모드 버튼을 확인했고, 브라우저가 실제 사용하는 3/4권한 에셋의 해시가 새 후보와 일치했다. 업무 데이터 쓰기는 수행하지 않았다.
- Functions 72개 metadata·MCP Hosting·private env digest 동일. Functions/Rules/Auth 배포 없음. 실제 S26 설치 PWA 확인은 아직 없으며 브라우저 에뮬레이션과 구분한다.
- 증거: ignored `output/glass-corners-release-20261031/`의 candidate manifest, CI summary, 전후 상태, 공개 검사, browser smoke, glass-live, postdeploy-summary. 생성·전후 시안은 `output/glass-mobile-corners-20261031/`.

후속 문서 커밋은 제품 source와 구분한다. 제품 재빌드·재배포 없이 docs CI만 확인한다.
