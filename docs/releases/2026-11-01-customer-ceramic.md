# 거래처 세라믹 패널 Hosting 릴리스

- 승인: 2026-11-01 사용자 요청 — 최종 점검, Git main 병합, Hosting 배포.
- 릴리스 소스: d408019254843b5b458ead8dd2609baa7c7a30bc. 제품 구현 e5a58fd를 codex/customer-ceramic-panel → main fast-forward 병합 후, 98afbfa에서 거래처 로그아웃 테스트의 새 설정 진입 동선을 반영. origin/main 동기화.
- 최종 UI: 기존 유리 모드 유지, 세라믹 2×2 검색/전체보기/납품사진/등록, 중앙 정렬, 중성 은백색 표면·얕은 세로 홈, 좌우 기본 8px+대칭 스크롤바 공간, 스크롤 종료 700ms 후 바 숨김, 최근 거래처 10개.
- 홈 앱 설정 제거, 학교/영업 설정·재고 옵션 유지, 납품사진/복원 설정의 거래처 복귀 지원.
- 추가 보완: 세라믹 네 아이콘을 PWA 사전 캐시 및 공개 에셋 allowlist에 등록. 로컬 운영 빌드의 새 브라우저 문맥에서 SW 설치 후 오프라인 fetch 4개 모두 HTTP 200 확인.
- 관련 단위 37개, 최종 브라우저 14개 PASS (27.1초), 변경 파일 lint 및 운영 build 타입 검사 PASS.
- 성능 gate의 초기 CSS/JS 초과를 중복 스타일·아이콘 렌더링·복귀 버튼 소유 위치 정리로 해결. 예산 확대 없음. 최종 거래처 CSS 49,119B, 거래처 JS gzip 36,851B, 납품사진 JS gzip 10,238B. 예산 여유가 작으므로 후속 변경 시 재측정 필요.
- 운영 build/PWA/성능/Hosting gate PASS. 사진·재고 ON, emulator OFF. PWA revision은 제품 소스 SHA. 배포 후보 121개 파일의 SHA-256을 candidate.json에 기록.
- CI: https://github.com/kim-DL/ONWAY/actions/runs/41230618842 attempt 2 SUCCESS. 필수 14개 작업 성공, full 프로필에서 presentation만 계획대로 제외..
- 실제 기기/설치 PWA는 미확인. 운영 데이터 쓰기·Functions/Rules/Auth 배포는 범위 밖.
- 증거: ignored output/customer-ceramic-release-20261101/.

- CI 이력: 첫 실행 41227205575에서 사용자 흐름 테스트 한 건이 제거된 거래처 설정 버튼을 찾다가 실패했다. 실제 새 경로인 학교 모드→설정으로 수정했다. 다음 실행의 사용자 흐름·일반 브라우저는 통과했고 재고 사진 작업에서 제조사 버튼 높이 43.999969482421875px가 44px 기준에 걸려 실패했다. 제품 코드가 동일한 직전 검사에서는 통과했으므로 assertion/timeout/소스를 바꾸지 않고 해당 작업만 재실행했다.

- 재고 사진 작업만 재실행해도 같은 측정 실패가 재현됐다. 로컬에서 실제 BottomSheet의 등장 애니메이션 200ms 프레임에 높이 43.999996185302734px, 종료 후 44px를 확인했다. d624098에서 제조사 시트의 애니메이션 종료를 기다린 뒤 기존 크기 assertion을 실행하도록 수정했다. 기준·타임아웃·제품 UI는 변경하지 않았다.

- d624098의 재고 사진 검사는 통과했으나 phase17에서 기존 반응형 로고 폭 검사가 실패했다. 로컬에서도 viewport 변경 직후 mark 46.96875px, 두 렌더 프레임 후 88px를 재현했다. d408019에서 viewport 전환 후 두 프레임을 기다려 레이아웃을 측정하게 했다. 기존 크기 assertion·타임아웃·제품 UI는 유지했다.

- d408019 첫 실행에서 두 측정 검사는 통과했으나 delivery-photo-field의 콘솔 경고 검사가 실패했다. 변경하지 않은 delivery-photo-upload-panel CSS(11ed1a1c9fc6d3c2.css, 1,705B)에 대한 unused-preload 경고 한 건이었다. 같은 소스의 delivery-photos 전용 작업은 통과했고 업로드/서버 확인 관련 assertion도 통과했다. 검사 완화 없이 phase17 작업만 재실행했다.

## 배포와 공개 확인

- 2026-11-01 07:24:35.287 KST, Hosting version f434c0da99847278, release 1793485475287000. 직전 복구 version 10ce0ed273e639ad.
- Firebase CLI에 --project onnuriway --only hosting:onnuriway --non-interactive를 명시했다. 121개 산출물의 배포 전후 해시 동일.
- https://onnuriway.com 및 https://onnuriway.web.app 공개 Hosting 검사 PASS. 새 세라믹 에셋 네 개의 원격/로컬 해시·MIME 검증도 포함.
- Aside의 새 확인용 탭에서 로그인된 운영 거래처의 네 버튼 활성화, 아이콘 네 개 로드, 하단 탐색 없음, 납품사진 제목과 거래처 복귀 버튼, 복귀 후 홈 패널 표시를 확인했다. 운영 최근 기록이 비어 있어 실제 10개 표시는 합성 데이터 검사로 확인했다. 저장·업로드·실제 데이터 수정은 하지 않았다.
- 후속 문서 커밋은 앱 재배포 없이 Git에 반영한다.
