# 유리 버튼 표면·그림자 Hosting 릴리스

- 승인: 사용자가 면 반사+얕은 그림자 안을 확정하고 main 병합·Hosting 배포를 요청했다.
- 제품 source: `0fd7db36023102381bbe93b8e28479ff7dbe593a`, main fast-forward. 동일 source의 CI 성공 후 배포했다.
- 변경: 3/4권한용 유리 소재, 정적 면 반사, 얕은 접촉 그림자. 글자·크기·권한·업무 동작 유지. 에셋 합계 85,590→48,888B.
- 관련 로컬 단위 9·브라우저 3 PASS 결과 재사용. 추가 lint·typecheck·운영 build·PWA·성능·Hosting gate PASS. 최종 117파일 후보 해시 고정.
- [Quality Gate 41152997590](https://github.com/kim-DL/ONWAY/actions/runs/41152997590): attempt 1, full 필수 14개(plan/verify 포함) SUCCESS, presentation은 계획상 제외. job 재실행 없음. 헤더 CSS가 축소 허용 목록에 없어 기존 규칙의 full이 실행됐으며 CI 수정은 섞지 않았다.
- 배포: `--project onnuriway --only hosting:onnuriway --non-interactive`.
- **2026-10-31 10:11:45.700 KST**, version **93a62db89377f0f1**, release **1793409105700000**. 직전 복구 version **df13547e1d3815c7**.
- 양쪽 운영 주소 공개 HTTP 각 28 PASS 및 www 301. 유리 에셋 두 개·표면/그림자 CSS의 공개 해시 6개가 로컬 후보와 일치했다.
- 새 Chromium 세션 360×780/DPR3: PIN 화면·활성 service worker·소재와 CSS 19개의 오프라인 캐시·pageerror 0 확인. 실제 인증 후 업무 헤더는 합성 컴포넌트 검사와 구분한다.
- Aside 기존 운영 탭에서 새 worker 감지와 업데이트 안내를 확인했다. 입력 흔적이 있어 강제 새로고침/업데이트 적용은 하지 않았다.
- Functions 72개 metadata·MCP 전용 Hosting·비공개 env digest 동일. Functions/Rules/Auth 배포·업무 데이터 쓰기 없음.
- 증거: ignored `output/glass-surface-release-20261031/`. 실제 Android 설치 PWA는 미검증이다. 기기 각도에 반응하는 실제 굴절이 아닌 정적 소재 표현이다.

후속 변경은 결과 문서만이며 제품 소스·빌드·배포를 반복하지 않는다.
