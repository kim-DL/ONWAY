# UI·전송·저장 계약 소유권

기준일: 2026-10-05. R8 리팩토링에서 실제 읽은 소스와 실행한 검증을 기록한다. 비교 원본은 `28af4c5764860fb1305d5d8e6ea69e921db65ca5`다. 권한·receipt 계약은 [업무·보안 계약](behavior-contracts.md), [재시도·구버전 호환 계약](receipt-compatibility.md)을 함께 참고한다.

## 이번 변경의 범위

`src/features/sales-visit/sales-visit-contract.ts` 안에서 신규 방문과 방문 수정이 중복 선언하던 **동일한 UI 입력 필드**를 `visitDetailsShape`로, 동일한 교차 필드 검증을 `validateVisitDetails`로 공유했다. 두 helper는 해당 모듈 내부에만 존재한다.

공개 schema/type 이름, 신규·수정별 revision 필드, 결과 schema, 날짜 helper는 유지했다. 서버 영업 입력 schema, 저장 schema, Callable·서비스·receipt, `src/domain` 재수출 경로는 변경하지 않았다. UI와 서버의 허용 입력을 하나로 합치지 않았으며 새 공유 패키지나 adapter 계층도 추가하지 않았다.

## 소유 파일과 경계

아래 경로는 저장소 루트 기준이다. `domain`이라는 경로 이름만으로 모든 schema가 동일한 전송 형식을 뜻하지는 않는다.

| 역할 | 소유 파일 | 실제 책임 |
| --- | --- | --- |
| 현재 영업 방문 폼 입력 | `src/features/sales-visit/sales-visit-contract.ts` | 현재 UI에서 생성할 `productName`·`visitedDate` 입력, 한국어 검증 메시지, 신규/수정 revision 필드 |
| UI 전송·응답 경계 | `src/features/sales-visit/sales-visit-repository.ts` | UI 입력 schema로 parse한 결과를 Callable에 보내고 `recordSalesVisitResultSchema`로 응답 검증 |
| 서버 영업 방문 명령 입력 | `functions/src/sales/sales-visit-contract.ts` | 현재 입력과 구 설치 PWA 입력 수용. `functions/src/sales/callables.ts`가 parse한 뒤 서비스 호출 |
| 서버 영업 저장 문서·receipt | `functions/src/sales/sales-visit-service.ts` | Admin `Timestamp` 문서 검증, 날짜 해석, transaction·revision·저장·receipt fingerprint 및 replay |
| 브라우저 영업 조회 모델 | `src/domain/sales.ts` | `Date`를 사용하는 학교 배정·방문·영업 프로필 조회 모델. 과거 샘플 기록과 삭제 메타데이터 수용 |
| 브라우저 Firestore 변환 | `src/lib/firebase/firestore-converters.ts` | Firebase client `Timestamp`를 `Date`로 재귀 변환한 뒤 domain schema 검증 |
| 재고 공용 전송 계약 | `functions/src/inventory/inventory-contract.ts` → `src/domain/inventory.ts` | 순수 Zod 계약을 브라우저용 경로로 재수출 |
| 제조사 확장 계약 | `functions/src/inventory/inventory-manufacturer-contract.ts` → `src/domain/inventory-manufacturer.ts` | 기본 재고 계약을 사용하는 제조사·opt-in 확장 schema의 명시적 재수출 |
| 거래처 공용 전송 계약 | `functions/src/customer/customer-contract.ts` → `src/domain/customer.ts` | 거래처 입력·응답 schema와 순수 정규화 helper의 명시적 재수출 |
| 납품사진 공용 전송 계약 | `functions/src/delivery-photo/delivery-photo-contract.ts` → `src/domain/delivery-photo.ts` | 사진·일자·경로 입력과 응답 schema의 명시적 재수출 |

## 영업 입력과 저장 형식이 의도적으로 다른 부분

| 항목 | 현재 UI 신규/수정 | 서버 명령 입력 | 저장·조회 모델 |
| --- | --- | --- | --- |
| 샘플 항목 | strict `{ productName }`만 허용. trim 후 1~120자 | 신규/수정 모두 `{ productName }` 또는 legacy `{ productId, quantity }`. legacy 수량은 정수 1~999 | 브라우저 `salesVisitSchema`와 서버 서비스의 방문 문서 schema 모두 두 형식을 읽음. 저장 legacy 수량은 양의 정수이며 명령 입력의 999 상한을 덧씌우지 않음 |
| 샘플 개수 | 최대 20개 | 최대 20개 | 브라우저 조회 모델은 최대 100개. 서버 서비스 내부 방문 문서 schema는 배열 개수 상한을 선언하지 않음 |
| 방문 날짜 | `visitedDate` 필수. `visitedAt` 입력 거절 | **신규 등록만** `visitedDate`/legacy `visitedAt` 중 정확히 하나 허용. 수정은 `visitedDate` 필수이며 `visitedAt` 거절 | `visitedAt` 저장. 서버는 Admin `Timestamp`, 브라우저 domain은 변환된 `Date` |
| 삭제된 방문 | 명령 입력 필드가 아님 | 명령 입력 필드가 아님 | 브라우저 domain은 삭제 상태와 필수 삭제 메타데이터 검증. 서비스 내부 수정 대상 방문 schema는 `deleted: false`·삭제 메타데이터 null을 요구 |
| 검증 오류 | 폼용 한국어 메시지·path | legacy 형식과 서버 고유 영어 메시지·path 포함 | 문서 무결성 검증. 명령의 폼 제약과 동일하지 않음 |

서버 `resolveServerVisitDate`는 legacy `visitedAt`을 서울 날짜로 해석한다. 선택 날짜가 서버의 서울 기준 오늘이면 서버 현재 시각을 사용하고, 다른 날짜이면 해당 날짜의 서울 정오를 사용한다. 이번 변경은 이 기존 해석을 수정하지 않았다. legacy 상품 항목을 새 `productName` 형식으로 일괄 변환하는 migration도 없다.

## 정규화·strict·순서 보존

UI 공통 shape의 선언 순서는 기존과 같다.

```text
visitedDate → visitedBy → brochureStatus → sample → interestScore
→ activityTagIds → summary → followUp → requestId → appVersion
```

신규 등록의 앞부분은 `cycleId → schoolId → expectedAssignmentRevision`, 수정의 앞부분은 `visitId → cycleId → schoolId → expectedVisitRevision → expectedAssignmentRevision → expectedSalesRevision`이다. 각 앞부분 뒤에 위 shape를 펼치므로 parse 결과의 JSON key 순서를 유지한다. `sample`은 `status → items`, 샘플 항목은 `productName`, `followUp`은 `required → dueDate → summary` 순서다.

- ID·제품명·요약·앱 버전 등 기존 문자열의 `.trim()` 위치와 길이 제한을 유지했다. 제품명 중복은 trim된 값을 `toLocaleLowerCase("ko-KR")`로 비교하며, 저장할 제품명을 소문자로 바꾸지는 않는다.
- 두 최상위 입력, sample, 샘플 항목, followUp의 `.strict()`를 유지했다. 구 필드를 포함한 알 수 없는 key를 조용히 버리지 않는다.
- 공통 refinement의 검사 순서는 제품명 중복 → 전달인데 제품 없음 → 미전달인데 제품 있음 → 활동 태그 중복 → 필수 후속 값 없음 → 후속 없음인데 값 존재다. 한국어 메시지·오류 path와 여러 오류의 순서를 유지했다.
- 서버는 `fingerprint({ ...input, actorUid })`에서 `JSON.stringify` 결과를 SHA-256으로 처리한다. 이번 UI 정리는 서버 입력 schema의 key 선언·parse·fingerprint 순서를 변경하지 않았다. 서로 다른 서버/domain의 ID·날짜 schema는 오류 메시지나 허용 표현이 다르므로 공용 primitive로 교체하지 않았다.

## 브라우저 재수출 경계를 유지한 이유

읽은 import 경로에서 기본 재고·납품사진 계약은 `zod`만 사용한다. 거래처 계약은 `zod`와 `functions/src/shared/phone-number.ts`의 순수 문자열 helper를 사용한다. 제조사 계약은 `zod`와 기본 재고 계약에 의존한다. 이 경로에 `firebase-admin`, `node:crypto`, Callable 또는 service 구현 import는 없다. 서버 codec·transaction 구현이 Functions 디렉터리에 있다는 이유로 이를 domain 재수출 대상으로 넓혀서는 안 된다.

현재 계약 파일은 브라우저와 Functions 양쪽에서 이미 사용하며, Functions는 `rootDir: "src"`와 NodeNext `.js` import 규칙으로 빌드한다. 경로를 정리하려고 schema를 `src/domain`으로 역이동하거나 새 workspace 패키지를 만드는 것은 이번 중복 제거에 필요하지 않았다. 재수출 facade와 기존 양쪽 빌드 경계를 유지했다.

구 클라이언트의 strict 응답 parser를 위한 `includeSummary`, `includeManufacturerReference`, `includeOverviewPhoto` opt-in도 유지한다. 새 서버 필드의 존재와 구 클라이언트에 실제로 그 필드를 보내는 조건은 별개다. 응답 필터와 command fingerprint 제외 필드를 이번 UI helper로 합치지 않았다.

## 확인한 검증과 한계

- `src/features/sales-visit/sales-visit-contract.test.ts`의 신규/수정 공통 사례 2개가 각 작업의 정상 입력, 여섯 교차 필드 오류의 메시지·path, legacy 샘플/타임스탬프 거절을 검증한다. 기존 assertion을 완화하지 않았다.
- `functions/tests/sales-visit-service.test.ts`의 기존 검증은 서버 신규 등록의 legacy 상품·타임스탬프 수용, 날짜 표현 중복/누락 거절, 수정의 `visitedAt` 거절, 서버 날짜 해석을 포함한다.
- 위 client/server 계약과 `src/domain/phase1-contract.test.ts`를 포함한 집중 suite는 11파일/116개 PASS였다. 이는 학교·영업 R9 검증과 함께 실행한 결과이며 이 문서가 전체 브라우저·Emulator 완료를 뜻하지 않는다.
- 일회성 비교에서 원본 HEAD의 UI schema와 현재 schema에 신규/수정 각 12종, 총 **24종 입력**을 적용했다. 성공한 parse 결과 또는 실패한 `error.issues`의 `JSON.stringify`가 모두 동일했다. trim, JSON key 순서, 중첩 unknown key, legacy 거절, 불가능한 날짜, 다중 오류의 메시지·path·순서를 비교했다. 모든 가능한 입력에 대한 형식 증명은 아니다.
- 브라우저 재수출의 runtime 의존 설명은 위 소스 import 경로를 읽은 결과다. 최종 번들·Functions build·통합 검증 결과와 배포 여부는 최신 HANDOFF에 별도로 기록한다.
