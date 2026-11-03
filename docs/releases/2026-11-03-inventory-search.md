# 재고 검색창 리뉴얼 배포

2026-11-03 14:37 KST. 사용자가 로컬 시안을 확인한 뒤 main 병합과 Hosting 배포를 승인했다.

## 변경

- 검색창과 목록 옵션 버튼에 11px 모서리와 옅은 도자기 표면을 적용했다. 돋보기 배경판은 제거하고 전용 돋보기·세로 조절 노브 아이콘을 사용한다.
- 입력칸 안쪽의 파란 사각 포커스 표시를 검색창 전체의 둥근 강조로 대체했다. 고대비 외곽선과 모션 감소는 유지한다.
- 검색어 지우기는 기존 query/limit 상태를 초기화하고 입력칸에 포커스를 복귀시킨다. 검색·Callable·권한·서버 확인·저장 경로는 유지한다.
- 기존 CSS 용량 한도 안에 들어가도록 고정 배치·장식은 컴포넌트의 inline style로 두고, 포커스·고대비·모션 상태만 CSS에 남겼다. 재고 CSS 28,510B / gzip 6,656B로 기존 28.5KiB / 6.5KiB 한도를 통과했다. 초기 CSS는 23,045B / gzip 6,504B다.

## CI에서 확인한 기존 문제

- 기존 로그인 화면의 `직원 PIN 로그인` 영역이 추가된 뒤, 부분 이름을 사용한 테스트 선택자 `getByLabel("직원 PIN")`가 입력칸과 영역을 동시에 선택했다. 23개 테스트 파일에 정확한 이름 비교를 적용했다.
- 이전 로그인 제목 `6자리 PIN`을 찾던 3개 테스트 파일의 확인 대상을 현재 `직원 PIN 로그인` 영역으로 갱신했다. 입력·오류 복구·로그아웃·세션 검증은 유지했다.
- 검색 컨테이너가 label에서 div로 바뀐 점을 재고 화면 크기 측정 테스트에 반영했다. 최소 터치 크기와 정렬 검증은 유지했다.
- 로그인 회사명/도움말에서 검출된 대비 부족은 글자색 두 개만 조정했다. 인증 로직·설정은 변경하지 않았다.
- 이전 실패 실행: [41581330808](https://github.com/kim-DL/ONWAY/actions/runs/41581330808), [41582153805](https://github.com/kim-DL/ONWAY/actions/runs/41582153805), [41582786307](https://github.com/kim-DL/ONWAY/actions/runs/41582786307). 이전 실패/성공을 최종 소스의 검증으로 합산하지 않는다.

## 검증

- 관련 아이콘/재고 UI/lifecycle 단위 80개, 변경 파일 ESLint, 프런트 타입 검사 통과.
- PIN 입력·잠금·오류 복구·대비를 포함한 로컬 브라우저 4개 통과. 실제 재고 컴포넌트와 격리 데이터로 검색·지우기/포커스·옵션 및 320/390/430/1280px 배치 확인.
- 운영 빌드와 PWA·성능·Hosting gate 통과. 기존 납품사진/재고 운영 플래그 유지.
- 최종 소스 `700e749709dee76b54f51bd4369b18e9f20b3b75`의 [Quality Gate 41583609552](https://github.com/kim-DL/ONWAY/actions/runs/41583609552), attempt 1: 필수 14개 job 성공. 분류상 제외된 ci-policy/ui/presentation만 skipped.
- 일반 브라우저 결과: 380 passed, 8 skipped, 2 flaky. 재고 상단 고정/목록 겹침 검사 2개(mobile/desktop)가 최초 실패 후 재시도에서 통과했다. 모든 항목이 최초 실행부터 성공한 것으로 보고하지 않는다. 전체 사용자 흐름 83개 통과.

## 배포와 공개 검증

- 소스는 main에 fast-forward 병합·push하고 후속 검증 수정까지 반영했다. 배포 당시 작업 트리는 깨끗했다.
- 배포 명령: `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project onnuriway --only hosting:onnuriway --non-interactive`.
- Hosting version: `91dbd23e04c70e0a`. API releaseTime: `2026-11-03T05:37:14.060Z`. 직전 버전/복구 기준: `f341f4ea489a61e7`.
- [onnuriway.com](https://onnuriway.com), [onnuriway.web.app](https://onnuriway.web.app)에서 각각 공개 검증 32개 통과. 캐시/MIME/PWA 및 비공개 경로 차단 검사를 포함한다.
- 로컬 산출물 122개가 배포 후보 manifest와 일치했다. 두 주소에서 각각 JavaScript/CSS 94개의 SHA-256이 후보 파일과 일치했다. 재고의 지연 로드 자산도 포함한다.
- Hosting만 배포했다. Functions/Rules/Auth 설정/운영 데이터는 변경하지 않았다. 운영 로그인 후 검색창 조작과 실제 휴대폰/PWA 갱신은 별도 확인이 남아 있다. 활성 운영 탭은 강제 새로고침하지 않았다.
- 로컬 증거: `output/playwright/inventory-pearl-search/`의 build/gate/deploy/public 검증 로그, candidate-manifest.json, 자산 해시 결과와 화면 캡처.
