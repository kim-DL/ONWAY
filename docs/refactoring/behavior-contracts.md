# R0 서버 권한·인가·재시도 계약 정적 확인

기준: 2026-10-05, 원본 HEAD `28af4c5764860fb1305d5d8e6ea69e921db65ca5`. R3/R6 변경은 아래 정책을 바꾸지 않는다. 아래는 현재 코드/Rules의 관찰이며 운영 데이터 조회나 실제 revoke 경쟁 상태 검증 결과가 아니다. Emulator 결과는 별도 기록한다.

## Client SDK collection × 역할 × 읽기/쓰기

D=delivery, S=sales, V=viewer, A=승인된 Google admin. 아래 역할 표시는 유효한 세션과 각 Rules 추가 조건을 통과한 단일 역할을 뜻한다. 복수 역할은 실제 Rules의 OR 조건을 따른다. 모든 Client create/update/delete는 금지다. Admin SDK는 Rules를 우회하므로 Callable 인가가 따로 필요하다.

| 경로 | Client 읽기 | Client 쓰기 | 근거/추가 조건 |
| --- | --- | --- | --- |
| `schools/*`, `schoolFieldProfiles/*` | D/S/V/A | 금지 | `canReadField`, `firestore.rules` |
| `schools/*/photos/*` | D/S/V/A | 금지 | slot 01/02/03 metadata만 |
| `companies/onnuri/customers/*` | D/S/V/A | 금지 | `canReadCustomers`: canonical 직원 active, employeeId/uid 연결, 허용 역할 검사 추가 |
| `salesProfiles/*`, `salesVisits/*`, `salesCycles/*` 및 assignments/employeeStats/stats/team | S/A | 금지 | `canReadSales` |
| `zones/*`, `products/*`, `communicationTags/*`, `activityTags/*` | S/A | 금지 | `canReadSales` |
| `employeeDirectory/*` | 유효한 세션 | 금지 | `sessionValid` |
| `employees/*`, `auditLogs/*`, `neisSyncRuns/*` 및 changes | A | 금지 | `isAdmin` |
| `authz/{uid}` | 본인의 get만 | 금지 | 서명된 요청의 UID 일치; list 허용 없음 |
| `searchCatalogs/*` | common/field=D/S/V/A, sales/assignment=S/A; get만 | 금지 | 이름 prefix 검사 |
| `catalogMeta/current`, `appSettings/public` | D/S/V/A, get만 | 금지 | 다른 ID는 불허 |
| `exportJobs/*` | A 또는 S의 본인 requestedBy 문서 get | 금지 | list 허용 없음 |
| inventory products/lots/events/settings/cycles/manufacturers/name reservations/requests/photo stages | 금지 | 금지 | 명시 허용 없는 경로: catch-all deny |
| delivery-photo routes/days/photos 및 photo upload rate/stage | 금지 | 금지 | 명시 허용 없는 경로: catch-all deny |
| authCredentials, pinIndexes, pinReservations, secureSettings, requestLocks, photoUploadSessions, photoUploadRateLimits | 금지 | 금지 | 명시 deny |
| 모든 Storage object | 금지 | 금지 | `storage.rules`, 학교/임시사진/export 포함 catch-all deny |

## Callable 권한 및 인가 타이밍

| 작업 | 권한 | I/O 전 | commit/read transaction 내부 | 응답 직전 |
| --- | --- | --- | --- | --- |
| 거래처 list | D/S/V/A | requireCustomerActor | 서비스 list에는 별도 tx 없음 | requireCustomerActor 재검사 |
| 거래처 save | D/S/V/A (V도 저장 가능) | requireCustomerActor | verifyCustomerTransactionActor를 receipt 조회보다 먼저 실행 | 별도 Callable 사후 재검사 없음 |
| 거래처 위치 search/reverse | D/S/V/A | requireCustomerActor | 외부 위치 검색 | requireCustomerActor 재검사 |
| 거래처 사진 upload/get | D/S/V/A | requireCustomerActor | upload 준비·최종화 / get 다운로드 전후 tx에서 verifyCustomerTransactionActor | Callable에서도 requireCustomerActor 재검사 |
| 재고 context/list/history/manufacturer list | D/S/V/A | requireInventoryActor(read) | 해당 단순 조회는 tx 재검사 없음 | requireInventoryActor(read) 재검사 |
| 재고 detail/get photo | D/S/V/A | requireInventoryActor(read) | detail tx / photo 다운로드 전후 tx에서 verifyInventoryTransactionActor(read) | requireInventoryActor(read) 재검사 |
| 재고 save/move/count/lot/status/delete, 제조사 create, 사진 upload | D/S/A; V 불가 | requireInventoryActor(write) | mutation은 receipt 이전 재검사, 사진은 준비·최종화 tx 재검사 | requireInventoryActor(write) 재검사 |
| 재고 settings 및 제조사 update | A | requireInventoryActor(admin) | receipt 이전 verifyInventoryTransactionActor(admin) | requireInventoryActor(admin) 재검사 |
| 납품사진 route/day 조회·저장 | D/S/V/A | requireCustomerActor | 각 tx 시작에 verifyCustomerTransactionActor; 저장 retry도 재검사 | 공통 Callable 사후 검사 없음 |
| 납품사진 create | D/S/V/A | requireCustomerActor | prepare 및 commit tx 재검사; retry 시에도 prepare에서 재검사 | 공통 Callable 사후 검사 없음 |
| 납품사진 list/get | D/S/V/A | requireCustomerActor | service list는 읽기 전후 verifyRead tx; get은 다운로드 전후 검증 tx | service의 최종 재검사로 보호 |
| 납품사진 delete | 등록자 당일 또는 A | requireCustomerActor | 권한 tx 재검사→소유/날짜 검사→삭제 metadata/receipt/audit 저장 | cleanup 이후 별도 Callable 재검사 없음 |
| 학교 현장정보 update | D/S/A; V 불가 | auth + schema + canonical authz/claims + role | 직원/sessionVersion 재조회 없음. actor는 uid/employeeId만 전달 | 없음 |
| 영업 cycle/assignments 관리 | A | requireVerifiedAdmin | 참조·배정·revision 검증, canonical authz/sessionVersion 재조회 없음 | 없음 |
| 영업 방문 record/update·profile update | S/A | requireSalesActor; A면 requireVerifiedAdmin | 방문자 활성/영업 역할 및 배정/revision 등 검증. 호출자 canonical session 재조회 없음; receipt replay는 이들 업무 검증보다 먼저 반환될 수 있음 | 없음 |
| 영업 claim/release | S 또는 해당 admin 정책 | requireSalesActor | 해당 직원·역할·배정 정책 검사. authz/sessionVersion 재조회 없음; receipt replay는 역할 재검사 전 반환 | 없음 |

`requireCustomerActor`는 canonical authz/claims와 활성 직원의 UID/employeeId/역할 집합을 확인하며 admin 역할이 섞여 있어도 승인 Google 검사를 추가한다. `requireInventoryActor`는 authz+employee를 한 번의 getAll로 읽고 동일한 세션/역할 연결과 adminApproved/provider 조건을 확인한다. `verifyCustomerTransactionActor`는 authz active/sessionVersion/permissionsVersion 및 canonical employee 역할 집합을 검사한다. `verifyInventoryTransactionActor`는 여기에 read/write/admin 범위 검사를 더한다.

학교·영업 인가 타이밍을 재고 방식으로 통일하는 일은 이번 동작 보존 리팩토링 범위에 넣지 않는다. 실제 revoke race를 재현한 뒤 별도의 보안 변경으로 평가해야 한다. 이 문서는 그 차이를 PASS로 판단하지 않는다.
