# 재고 박스 수량 계산 및 입력 화면 개선

사용자 승인: 2026-11-07, 최종 점검 후 배포. 후보 소스 `13d65e53ea94a4192a86981ef70310ba9a38abe2` (`codex/inventory-box-quantity`).

## 변경 내용

- 품목 등록·수정에 선택형 박스 입수 수량을 추가했다. 기존 재고 기준 단위와 별도 필드로 관리하여 기존 수량의 의미를 바꾸지 않는다.
- 초기 입고·입고·출고·수량 조정·보관 장소 이동에서 `박스 수 × 박스당 수량 + 낱개`를 자동 계산한다. 기존 총수량 직접 입력도 제공한다. 입수량을 모르면 비워둘 수 있고, 1회 계산용 입수량 변경은 품목 기본값을 바꾸지 않는다.
- 입력칸 안 오른쪽에 단위, 가운데에 숫자를 표시한다. 제조사·규격 선택 버튼은 연한 블루와 짙은 네이비 글자, 테두리·하단 음영으로 표현한다.
- 새 계산 내역은 해당 입출고 이벤트에 남기며, 이전 이벤트는 수정하지 않는다. 서버가 계산식과 합계의 일치를 검사하고 기존 request ID·revision·권한·감사 계약을 유지한다.
- 이전 버전 앱에는 새 필드를 응답하지 않는다. 이전 앱이 상품을 수정하면서 새 필드를 생략해도 저장된 입수량을 보존한다. 입수량 수정 시 열린 계산의 오래된 stockRevision은 거부한다.

## 최종 검증

- 전체 단위 1,886개 통과, 조건부 15개 생략. 이후 발견한 제조사 연결 상품의 구버전 수정 회귀를 재현·수정하고 재고 검사 535개 재통과.
- 박스 계산·입력 단위 위치·중앙 정렬·320/390/768px 브라우저 10개 통과. 실제 Callable을 사용하는 상품 등록·입출고·실사·사진 교체 흐름 1개 통과.
- 격리 Firestore 에뮬레이터 13개 통과. 실제 트랜잭션에서 입수량 추가 전후 lot/이력 보존, 잘못된 합계·오래된 revision 거부, 동시 재시도 1회 반영 검증을 포함한다. 운영 데이터로 쓰기 검사를 하지 않았다.
- 최종 타입·lint·diff 검사, Functions·Hosting 빌드, PWA·Hosting·성능 검사 통과.
- 최종 재고 CSS 30,878B raw / 7,050B gzip. 후속 단위 프레임과 포커스 스타일로 중간 raw 한도 29.5KiB를 초과하여 재고 전용 raw 예산을 30.5KiB로 조정했다. gzip 7KiB와 초기 로딩/JS/다른 기능 예산은 유지한다.
- 실물 휴대폰과 운영 계정 로그인 후 쓰기 작업은 별도 미검증이다.

## 배포 및 데이터 보존

**2026-11-07 20:01 KST 운영 배포 완료.** 아래 서버 9개를 먼저 갱신하고 실제 ACTIVE 상태와 revision 변경을 확인한 다음 Hosting을 배포했다. 다른 서버 63개는 변경되지 않았다.

`listInventoryProducts`, `getInventoryProduct`, `saveInventoryProduct`, `recordInventoryMovement`, `recordInventoryCount`, `updateInventoryLot`, `setInventoryProductStatus`, `deleteInventoryProduct`, `listInventoryHistory`

- Firebase 배포 도구는 성공을 반환했으나 실제 함수 버전이 바뀌지 않았다. 읽기 전용 Cloud Functions 상태 비교로 발견했으며, CLI의 명시적 `--project onnuriway --only functions:…` 범위로 배포를 진행했다.
- Hosting 범위는 `--project onnuriway --only hosting:onnuriway`이다. 새 버전 `87ddaf3743a7e31d`, 이전 버전 `c54b282bdbfe28fc`.
- 배포 전후 상품 문서 92개, lot 89개, 이벤트 240개의 전체 문서 해시가 모두 일치했다. 기존 상품 정보·재고 수량·입출고 이력은 변경되지 않았다. 원문·개인정보·인증 정보는 증거 파일에 저장하지 않았다.
- 검증 후보 Hosting 파일 122개와 Functions 산출물 162개의 해시를 보관했다.
- 배포 후 후보 산출물 284개가 그대로임을 확인했다. `onnuriway.com`과 `onnuriway.web.app` 각각 JS/CSS 94개의 공개 응답 해시가 후보와 일치했으며, 두 주소의 PWA·연결 확인·정적 자산·캐시 헤더 공개 검사도 통과했다.
- 배포 직후 대상 Cloud Run 서비스의 ERROR 이상 로그 조회 결과 0건. 이는 해당 조회 구간의 상태이며, 실제 휴대폰에서 업무 쓰기를 수행한 검증과는 구분한다.

로컬 증거: `output/inventory-box-quantity/`의 `final-*.log`, `candidate-manifest.json`, `candidate-out/`, `cloud-*.json`, `inventory-*-hashes.json`, 배포 로그와 화면 캡처.

## 복구 주의

새 포장 필드가 저장된 뒤에는 그 필드를 읽고 보존하는 서버 버전으로 복구해야 한다. 새 필드를 모르는 엄격한 파서로 단순 롤백하면 기존 문서 읽기가 실패할 수 있다. 기존 재고·이력을 삭제하거나 재작성하는 마이그레이션은 없다. 납품사진 IndexedDB v2 호환도 유지한다.
