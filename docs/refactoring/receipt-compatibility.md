# 재시도·구버전 호환 계약

## Receipt identity와 replay

모든 JSON hash는 기존 `createHash("sha256").update(JSON.stringify(...)).digest("hex")`를 사용한다. key 정렬·정규화·schema 공유로 직렬화 순서를 바꾸지 않는다. 아래 `input`은 해당 Callable schema가 parse한 객체이며 선언 순서와 transform/default를 포함한다.

| operation | receipt 경로 | hash 입력/순서 | 저장·재생 | 보존 |
| --- | --- | --- | --- | --- |
| inventory save/move/count/updateLot/status/delete/updateSettings | `companies/onnuri/inventoryRequests/{requestId}` | Object.entries(input) 순서 유지; includeDetail/refreshOnReplay/includeSummary/includeManufacturerReference 4개만 제외 | operation+actorUid+fingerprint 비교; result에서 detail 제외. replayed 속성 있으면 true. save/status/delete가 refreshOnReplay 요청하면 같은 tx에서 현재 상품 재조회; receipt 수정 없음 | 영구, TTL 추가 금지 명시 |
| create/updateInventoryManufacturer | 위 inventoryRequests 공유 | JSON.stringify(input) 전체 | operation+actorUid+fingerprint 비교; stored.result 그대로 | 만료 필드·삭제 경로 없음, 재고 namespace 동일 |
| saveCustomer | `requestLocks/customer-{requestId}` | includeOverviewPhoto만 rest destructuring으로 제외, 나머지 속성 순서 보존 | operation+actorUid+requestFingerprint 비교. customerId/revision 저장, replay는 현 customer 문서 재조회 | 만료 필드 없음 |
| updateSchoolFieldProfile | `requestLocks/field-{requestId}` | 명시 순서 schoolId→expectedRevision→appVersion→patch | operation literal schema, actorUid/schoolId/fingerprint 검증; 저장 revision만 `{revision,replayed:true}` 반환 | 만료 필드 없음 |
| createSalesCycle | `requestLocks/sales-cycle-{requestId}` | `{...input,actorUid}` 순서 | cycleId/copiedAssignmentCount/status 저장, replayed=true 추가 | 만료 필드 없음 |
| updateSalesCyclePromotedProducts (저장 operation updateSalesCycleProducts) | `requestLocks/sales-cycle-products-{requestId}` | `{...input,actorUid}` | cycleId/productCount 저장·재생 | 만료 필드 없음 |
| createSalesAssignments | `requestLocks/sales-assignments-{requestId}` | `{...input,actorUid}` | createdCount 저장·재생 | 만료 필드 없음 |
| claimSalesAssignments | `requestLocks/sales-assignment-claim-{requestId}` | `{...input,actorUid,employeeId}` | createdCount/zoneId 저장·재생 | 만료 필드 없음 |
| releaseSalesAssignments | `requestLocks/sales-assignment-release-{requestId}` | `{...input,actorUid,employeeId}` | removedCount 저장·재생 | 만료 필드 없음 |
| changeSalesAssignment | `requestLocks/sales-assignment-change-{requestId}` | `{...input,actorUid}` | revision 저장·재생 | 만료 필드 없음 |
| record/updateSalesVisit | `requestLocks/sales-visit-{requestId}` / `requestLocks/sales-visit-update-{requestId}` | `{...input,actorUid}` | resultSchema 결과 저장; 저장 result + replayed=true | 만료 필드 없음 |
| updateSalesProfile | `requestLocks/sales-profile-{requestId}` | `{...input,actorUid}` | resultSchema 결과 저장; 저장 result + replayed=true | 만료 필드 없음 |
| saveDeliveryPhotoRoute | `requestLocks/delivery-photo-route-{requestId}` | JSON.stringify(input) | route 저장; schema parse 후 과거 result 반환 | receipt 만료 필드 없음 |
| saveDeliveryPhotoDay | `requestLocks/delivery-photo-day-{requestId}` | JSON.stringify(input) | deliveryDateKey/customerIds/revision/isOverride 저장·재생 | receipt 만료 필드 없음. 별도 day 문서 14일 만료와 구분 |
| createDeliveryPhoto | `requestLocks/delivery-photo-create-{requestId}` | SHA-256 update 순서: decoded source bytes→contentType→customerId→source | operation+actorUid+inputHash 비교. complete result 재생; processing/cleaning/recoverable 등 lease 상태별 경로 | receipt TTL 없음. photo 168시간 만료 및 lease/cleanup/recovery 기한과 구분 |
| deleteDeliveryPhoto | `requestLocks/delivery-photo-delete-{requestId}` | JSON.stringify(input) | photoId/deletedAt result 저장·재생; 현재 photo 문서도 읽어 cleanup 재시도 | receipt 만료 필드 없음 |

사진 upload stage는 위 receipt와 다르다. 거래처 `customerPhotoUploads/{uploadId}`와 재고 별도 photo stage는 UID/employeeId/inputHash를 비교하고 uploaded/attached 결과를 재생하지만 미첨부 stage에는 만료·정리 정책이 있다. 이를 영구 inventory receipt helper와 통합하지 않는다. `만료 필드 없음`은 읽은 소스의 사실이며 배포된 Firestore TTL 설정을 확인했다는 뜻이 아니다.
