# 거래처 목록 UI/UX 리뉴얼 1차

기준: 2026-09-25, 거래처 prototype. 운영 배포 전 로컬·demo Emulator 검증 기록이다.

## 관찰과 결정

- 변경 전 390px 브라우저에서는 큰 거래처 환영 제목과 둥근 카드가 첫 목록 진입을 밀어냈다. 검색 결과와 전체보기의 카드 내부 회색 정보판은 주소·출입비번·납품위치·연락처를 여러 상자로 나눠 읽는 순서가 흔들렸다. 캡처는 `output/playwright/ui-renewal/before/`에 있다.
- 거래처 홈은 인사말과 한 줄 제목, 검색·전체보기·등록 순서로 압축했다. 최근 항목은 이름 → 상태 → 주소 → 출입비번, 검색·전체보기는 이름 → 상태 → 주소 → 출입비번 → 납품위치 → 연락처 → 전화·길안내 순서다.
- `field-list.module.css`의 `ul/li` 구분선과 행의 누름·초점 상태를 세 목록에 적용했다. 최근 항목과 카드의 전체 행은 상세 진입이고, 전화·길안내는 별도 링크다. 검색·전체보기의 상세 화살표로 행 진입을 드러낸다. 접점은 48px 이상으로 맞췄다. 상태는 색상 칩 대신 텍스트로 읽히며, 긴 이름·출입비번은 줄바꿈한다.
- 320px에서 글자를 200%로 키우면 연락처와 action을 같은 줄에 넣기 어렵다. 행 너비가 18rem 이하일 때 연락처를 온전한 폭에 놓고 전화·길안내를 다음 줄로 배치한다. 원래의 검색, 필터, 저장, 폐업 확인, 상세 복귀, Callable 데이터 경계는 유지한다.

## 브라우저 비교

`output/playwright/ui-renewal/after/`에는 320·360·390·412·768·1280px 홈·검색 캡처, 360·412·768·1280px 최근·전체보기 캡처, 320·390px 최근·전체보기 회귀 캡처, 320·360·390·412px의 200% 검색 캡처가 있다. `metrics-*.json`과 `listing-metrics-*.json`은 DOM 위치·행 높이·보이는 행 수·action 크기를 기록한다. 동일한 390px 검색 fixture의 380px 키보드 가정 캡처는 `before/customer-search-390.png`와 `after/customer-search-390-keyboard.png`다.

| 390px 화면 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 검색, 380px 높이 | 첫 카드의 이름·주소·출입비번 일부 | 구분선 목록의 이름·주소·출입비번·납품위치와 연락처 시작 부분 |
| 최근 5곳 | 장식 제목과 카드 5개 | 검색·전체보기 진입을 포함한 압축 홈과 구분선 행 5개 |
| 전체보기 | 카드 경계와 큰 정보판 | 상태 텍스트, 같은 정보 순서, 별도 전화·길안내, 다음 행 조기 노출 |

Browser fixture의 헤더는 실제 shell의 대체물이다. 실제 로그인·PIN, 하단 탐색, 빈 최근 목록, 검색·상세·Back은 demo Emulator 캡처 `after/emulator-*.png`와 거래처 E2E로 확인한다. 200%·긴 한국어 이름·긴 출입비번, 320px 넘침, 키보드 초점, 화면 읽기용 이름과 axe, reduced motion, forced colors를 브라우저에서 확인한다.

`output/playwright/ui-renewal/audit/`에는 기존 회귀의 PIN, 학교납품, 영업/홍보, 재고 대표 캡처와 이번 demo Emulator의 납품사진 360px·200% 캡처를 모았다. 학교납품과 영업/홍보는 현장정보와 사진·활동이 여러 카드에 걸쳐 길게 쌓이고, 재고는 검색·필터·실사 상태를 첫 화면에 집중시킨다. 납품사진에서는 긴 거래처명·출입비번·세 개의 action이 같은 폭에서 밀집한다. 화면 순서 결정은 Galaxy 현장 사용성 확인까지 보류한다. 이 캡처들은 거래처 전후 비교의 계측값으로 사용하지 않는다.

## 검증과 남은 판단

- 거래처 unit 21 files / 271 tests, demo Emulator 거래처 suite 16 tests, canonical acceptance 10/10 gate(전체 unit 1,583, safe-config browser 282, full user journey 86)가 PASS했다. 최종 build 수치는 `docs/HANDOFF.md`의 이번 작업 항목에 기록한다.
- 기존 budget과 verifier는 수정하지 않는다. 48KiB customer CSS, 36KiB customer JS ceiling 안에서 스타일 중복을 덜어냈다.
- Galaxy S20+ 설치 PWA에서 320~412px 체감, 실기기 키보드, 한 손 터치, 화면 읽기, 하단 탐색 간섭과 돌아가기 동작을 확인한다. 후속 화면 적용 순서는 이 prototype의 결과와 Galaxy 검증을 함께 보고 정한다.

터치·제목 판단 근거: [Android 터치 영역](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views), [Apple 버튼](https://developer.apple.com/design/human-interface-guidelines/buttons), [GOV.UK 제목 계층](https://design-system.service.gov.uk/styles/headings/).
