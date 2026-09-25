# 거래처·납품사진 버튼 리뉴얼

기준일: 2026-09-26. Production 배포 전 후보이며, 운영 데이터·backend·Rules·feature flag 계약은 변경하지 않았다.

## 관찰과 결정

- 인증된 운영 `onnuriway.com`을 읽기 전용으로 열어 거래처 홈·상세, 납품사진 목록·기록 날짜를 확인했다. 운영 사진 촬영·편집·저장은 실행하지 않았다. 기존 거래처 화면은 검색, 전체보기, 전화·길안내, 상세의 버튼 강조가 제각각이었고, 납품사진은 카메라의 어두운 녹색과 평면적인 연녹색 편집 버튼, 둥근 날짜 pill이 한 화면에 섞였다.
- 기존 파란 배경은 유지한다. 진한 남색 `#213e7a` 채움은 가장 중요한 진입·행동(거래처 검색, 상세 길찾기, 카메라, 선택한 지역·날짜)에 사용한다. 흰색 면·얇은 청색 테두리·2~3px 하단 그림자는 보조 행동에 쓰고, 등록·더보기처럼 문맥상 보조적인 행동은 평면으로 둔다. 상태 배지는 기존 의미별 색을 유지한다.
- 버튼 모서리는 대체로 9~11px로 제한하고 날짜 선택의 999px pill을 없앴다. 촬영 아이콘은 간결한 카메라 윤곽·큰 렌즈로 바꾸고 48px 버튼 중앙에 배치했다. 모든 주요 터치 영역은 최소 48px, 키보드 초점과 강제 고대비 상태는 유지한다. `마지막 확인` 문구만 거래처 홈에서 제거했으며 실제 갱신·오류 동작은 유지한다.
- 시각적 소음을 줄이고 하나의 주요 행동을 강조하는 기준은 [Linear의 인터페이스 리뉴얼 기록](https://linear.app/now/behind-the-latest-design-refresh), 조작 크기와 강조 단계는 [Apple 버튼 지침](https://developer.apple.com/design/human-interface-guidelines/buttons) 및 [GOV.UK 버튼 지침](https://design-system.service.gov.uk/components/button/)을 참고했다. 특정 서비스의 화면을 복제하지 않았다.

## 비교와 검증

- 변경 전·후 브라우저 캡처: ignored `output/playwright/button-renewal/before/`, `after/`. 실제 demo Emulator의 320·360·390·412px 및 100%/200% 납품사진 캡처: `output/playwright/ui-renewal/customer-photo-field/`. 거래처 목록의 320·390px, 상세 및 360·412·768·1280px 캡처: `output/playwright/customer-presentation/`와 `output/playwright/ui-renewal/after/`.
- 거래처 static browser 28/28, 인증 demo Emulator 거래처 16/16·납품사진 10/10이 통과했다. 거래처 검색·최근 5곳·전체보기·상세·등록, 납품사진의 정보/카메라/더보기 독립 hit target과 날짜 기록 진입을 확인했다. 320·360·390·412px 및 200% 확대에서 날짜 탭은 자체 가로 스크롤을 사용하고 시트 너비를 넘지 않았다. 강제 고대비의 검색 보조 문구 대비도 바로잡아 재검증했다.
- `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` production 정적 build와 기존 PWA·성능·Hosting verifier를 사용한다. CSS/JS ceiling, verifier, 테스트 기준은 변경하지 않았다. Customer CSS raw 48,132/49,152B·JS gzip 36,798/36,864B, Delivery-photo CSS raw 6,121/6,144B·JS gzip 10,222/10,240B, History dates CSS raw 1,013/1,024B다. Inventory bundle은 변경 전과 동일하다.
- 최종 canonical acceptance는 10/10 gate와 demo Emulator 내부 12/12 gate PASS다. 전체 unit 1,584 PASS/14 SKIP, 공통 browser 290 PASS, Rules 50 PASS, full user journey 75 PASS/12 SKIP, 검색 5,000건 p95 1.24ms다. 명시적 flag-on 최종 build 뒤 PWA·performance·Hosting gate가 다시 PASS했고 export/shipped 100개·precache 87개·initial assets 9개다. `output/acceptance/phase17-report.json`에 gate 결과가 있다.

## 실기기 확인

Galaxy S20+에서 기존 배경이 유지되는지, 검색과 길찾기의 강조가 과하지 않은지, 카메라 아이콘이 정확히 중앙에 보이는지, 편집 버튼의 눌림·초점 상태와 날짜 탭의 가로 스와이프를 확인한다. 200% 확대와 한 손 사용 시 전화·길안내·카메라·더보기의 터치 오작동 및 하단 탐색과의 간섭도 확인한다. 이 후보를 검토한 뒤 별도 승인으로 production 승격한다.
