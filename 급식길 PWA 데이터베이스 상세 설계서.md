# 급식길 PWA 데이터베이스 상세 설계서

**문서 버전:** 1.3  
**대상:** 급식길 PWA MVP  
**기준:** 전체 문서 정합성 검토서 v1.0 반영  
**관련 문서:** MVP 기획서 v1.3 / 인증·권한·보안 설계서 v1.3 / 화면·UX 상세 명세서 v1.2 / 검색·캐시·성능 설계서 v1.1 / 외부 API·데이터 동기화 설계서 / 구현 명세서 v1.1 / 테스트·인수 기준서 v1.1

---

# 1. 문서 목적

본 문서는 급식길 PWA에서 사용하는 Firestore·Cloud Storage 데이터 구조를 최종 확정한다.

다음 항목을 정의한다.

- 학교 기본정보
- 학교 현장정보
- 학교 사진
- 직원 및 인증정보
- 홍보·영업 학교 Profile
- 월별 구역 및 담당 배정
- 방문 기록
- 제품 관심도
- 태그
- 후속 활동
- 검색 Catalog
- CSV Export
- 감사 로그
- NEIS Sync
- Kakao 위치정보
- Revision 및 동시 수정
- Soft Delete
- 데이터 보존 정책
- 주요 Index

핵심 원칙은 다음과 같다.

> **학교 공식정보, 회사 공용 현장정보, 홍보·영업정보, 인증정보를 물리적으로 분리하여 역할별 권한과 데이터 생명주기를 명확하게 관리한다.**

---

# 2. 최상위 데이터 구조

최종 Firestore 구조는 다음을 기준으로 한다.

```text
schools/{schoolId}
  └─ photos/{slotId}

schoolFieldProfiles/{schoolId}

salesProfiles/{schoolId}

salesVisits/{visitId}

salesCycles/{cycleId}
  ├─ assignments/{schoolId}
  ├─ employeeStats/{employeeId}
  └─ stats/team

employees/{employeeId}

employeeDirectory/{employeeId}

authCredentials/{employeeId}

pinIndexes/{lookupKey}

authz/{uid}

zones/{zoneId}

products/{productId}

communicationTags/{tagId}

activityTags/{tagId}

searchCatalogs/{catalogId}

catalogMeta/current

exportJobs/{jobId}

auditLogs/{logId}

neisSyncRuns/{runId}

appSettings/public

secureSettings/{settingId}
```

---

# 3. 폐기된 구조

다음 Collection 또는 개념은 사용하지 않는다.

```text
deliveryProfiles
deliveryPhotos
```

대체:

```text
deliveryProfiles
→ schoolFieldProfiles

deliveryPhotos
→ schools/{schoolId}/photos
```

이유:

학교 현장정보와 사진은 납품 전용정보가 아니라 납품·홍보 직원이 공동으로 사용하는 회사 자산이기 때문이다.

---

# 4. 핵심 데이터 영역

급식길 데이터는 크게 네 영역으로 구분한다.

```text
1. 학교 기본정보

2. 학교 현장정보

3. 홍보·영업정보

4. 시스템·인증정보
```

---

# 5. 학교 기본정보

경로:

```text
schools/{schoolId}
```

Source:

```text
NEIS
+
Kakao
+
관리자 보정
```

학교 공식 정보와 지도 위치정보를 저장한다.

---

# 6. schoolId

학교명을 ID로 사용하지 않는다.

기본 식별 기준:

```text
NEIS 학교 행정표준코드
```

개념:

```text
SCH-NEIS-{schoolCode}
```

예:

```text
SCH-NEIS-B100000001
```

실제 Prefix 사용 여부는 구현 시 통일하되 학교명이 Document ID가 되어서는 안 된다.

---

# 7. schools Schema

예시:

```ts
interface School {
  schoolId: string

  source: {
    provider: "NEIS"
    schoolCode: string
    educationOfficeCode: string
    syncedAt: Timestamp | null
  }

  name: string
  shortName: string | null
  normalizedName: string
  initials: string
  aliases: string[]

  schoolType:
    | "elementary"
    | "middle"
    | "high"
    | "special"
    | "other"

  district:
    | "dong"
    | "jung"
    | "seo"
    | "yuseong"
    | "daedeok"

  address: {
    road: string | null
    jibun: string | null
    postalCode: string | null
  }

  phone: string | null
  homepage: string | null

  location: {
    latitude: number | null
    longitude: number | null

    kakaoPlaceId: string | null

    matchStatus:
      | "unmatched"
      | "autoMatched"
      | "needsReview"
      | "confirmed"
      | "failed"

    matchMethod:
      | "address"
      | "keyword"
      | "address+keyword"
      | "manual"
      | null

    matchConfidence: number | null

    matchedName: string | null
    matchedRoadAddress: string | null

    matchedAt: Timestamp | null
    confirmedBy: string | null
    confirmedAt: Timestamp | null
  }

  operationalStatus:
    | "active"
    | "inactiveCandidate"
    | "inactive"
    | "closed"
    | "merged"

  possibleRelocation: boolean

  schoolBaseRevision: number

  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

# 8. 학교명 변경

동일 NEIS 학교코드에서 학교명이 변경된 경우:

```text
schoolId 유지
```

하고:

```text
name
→ 새 학교명

aliases
→ 기존 학교명 추가
```

한다.

학교 현장정보·사진·홍보정보·방문기록은 그대로 유지한다.

---

# 9. Alias

예:

```text
name:
대전새빛고등학교

aliases:
[
  "대전구명고등학교",
  "새빛고",
  "구명고"
]
```

과거 학교명 검색을 지원한다.

---

# 10. 학교 삭제 정책

NEIS에서 학교가 한 번 사라졌다고 Hard Delete하지 않는다.

```text
active
↓
inactiveCandidate
```

관리자 검토 후:

```text
inactive
closed
merged
```

등으로 변경한다.

`schools` Document 자체를 일반 Sync에서 삭제하지 않는다.

---

# 11. 학교 현장정보

경로:

```text
schoolFieldProfiles/{schoolId}
```

납품과 홍보 직원이 공동 사용하는 정보다.

---

# 12. schoolFieldProfiles Schema

```ts
interface SchoolFieldProfile {
  schoolId: string

  cafeteria: {
    building: string | null
    floor: string | null

    locationDescription: string | null

    entranceDescription: string | null
    routeDescription: string | null
  }

  inspection: {
    startTime: string | null
    endTime: string | null
    note: string | null
  }

  equipment: {
    cartRequired:
      | "required"
      | "notRequired"
      | "unknown"

    elevator:
      | "available"
      | "unavailable"
      | "unknown"

    stairsRequired:
      | "required"
      | "notRequired"
      | "unknown"
  }

  vehicle: {
    access:
      | "available"
      | "limited"
      | "unavailable"
      | "unknown"

    unloadingLocation: string | null

    parking:
      | "available"
      | "limited"
      | "unavailable"
      | "unknown"

    note: string | null
  }

  fieldNotes: string | null

  completeness: number

  reviewRequired: boolean

  revision: number

  createdAt: Timestamp
  createdBy: string

  updatedAt: Timestamp
  updatedBy: string
}
```

---

# 13. 현장정보 수정

현장정보는 Client가 Firestore에 직접 전체 Document를 덮어쓰는 방식으로 수정하지 않는다.

기본:

```text
Client
↓
updateSchoolFieldProfile()
↓
Server Validation
↓
Revision 확인
↓
Firestore Update
↓
Audit
```

---

# 14. Revision

동시 수정 방지를 위해:

```text
revision
```

을 사용한다.

예:

```text
현재 revision = 12
```

Client:

```text
expectedRevision = 12
```

Server가 저장하면:

```text
13
```

으로 증가한다.

---

# 15. Revision 충돌

다른 직원이 먼저 수정해 Server Revision이:

```text
13
```

이 된 상태에서:

```text
expectedRevision = 12
```

요청이 오면 저장하지 않는다.

Error:

```text
CONFLICT
```

---

# 16. 학교 사진

Metadata:

```text
schools/{schoolId}/photos/{slotId}
```

학교당 최대:

```text
3장
```

Slot:

```text
01
02
03
```

---

# 17. 사진 Slot 의미

권장:

```text
01
학교 / 접근

02
급식실 출입구

03
검수 / 하역 위치
```

강제 의미라기보다 기본 안내 용도다.

---

# 18. 사진 Metadata Schema

```ts
interface SchoolPhoto {
  schoolId: string

  slotId:
    | "01"
    | "02"
    | "03"

  currentVersionId: string

  caption: string | null

  status:
    | "active"
    | "deleted"

  photoRevision: number

  createdAt: Timestamp
  createdBy: string

  updatedAt: Timestamp
  updatedBy: string

  deletedAt: Timestamp | null
  deletedBy: string | null
}
```

---

# 19. Cloud Storage 경로

```text
schools/{schoolId}/photos/{slotId}/{versionId}/
```

예:

```text
schools/SCH001/photos/02/v003/
```

하위 파일:

```text
thumbnail.webp
preview.webp
original.webp
```

---

# 20. 사진 Version

기존 사진 파일을 같은 Object에 덮어쓰지 않는다.

예:

```text
v001
v002
v003
```

또는 UUID 기반 Version ID를 사용할 수 있다.

Metadata의:

```text
currentVersionId
```

만 새 Version으로 변경한다.

---

# 21. 사진 삭제

사용자 삭제는 Soft Delete를 사용한다.

```text
status:
active
→ deleted
```

즉시 Storage 원본을 제거하지 않는다.

---

# 22. 사진 Undo

삭제 직후:

```text
실행 취소
```

를 선택하면:

```text
deleted
→ active
```

로 되돌린다.

Storage Version은 그대로 유지한다.

---

# 23. 과거 사진 Cleanup

오래된 Version과 deleted 사진의 실제 Storage 삭제는 일반 사용자 동작과 분리한다.

향후 관리 Cleanup 정책에서 처리한다.

MVP에서는 데이터 복구 가능성을 우선한다.

---

# 24. 홍보·영업 현재 Profile

경로:

```text
salesProfiles/{schoolId}
```

학교별 현재 영업 상태를 저장한다.

월별 Record가 아니다.

---

# 25. salesProfiles Schema

```ts
interface SalesProfile {
  schoolId: string

  interestScore:
    | 0
    | 20
    | 40
    | 60
    | 80
    | 100

  interestEvaluated: boolean

  interestedProductIds: string[]

  communicationTagIds: string[]

  latestVisit: {
    visitId: string | null
    visitedAt: Timestamp | null
    visitedBy: string | null
  }

  followUp: {
    required: boolean
    dueDate: string | null
    summary: string | null
  }

  nextAction: {
    dueDate: string | null
    summary: string | null
  }

  salesRevision: number

  createdAt: Timestamp
  updatedAt: Timestamp
  updatedBy: string
}
```

---

# 26. 관심도 값

내부값:

```text
0
20
40
60
80
100
```

UI 의미:

```text
0
♡♡♡♡♡
미평가 / 관심도 미확인

20
♥♡♡♡♡
관심 낮음

40
♥♥♡♡♡
관심 보통

60
♥♥♥♡♡
관심 있음

80
♥♥♥♥♡
구체 검토

100
♥♥♥♥♥
도입 협의
```

---

# 27. interestEvaluated

`0` 자체만으로 사용자가 관심도를 실제로 선택했는지 판단하지 않는다.

따라서 Profile에는:

```text
interestEvaluated
```

를 둘 수 있다.

예:

```text
interestScore: 0
interestEvaluated: false
```

= 아직 평가하지 않음.

```text
interestScore: 0
interestEvaluated: true
```

= 이번 판단에서 명시적으로 `관심도 미확인`을 선택함.

---

# 28. 홍보 방문 기록

경로:

```text
salesVisits/{visitId}
```

각 방문을 독립 Event로 저장한다.

과거 방문기록은 덮어쓰지 않는다.

---

# 29. salesVisits Schema

```ts
interface SalesVisit {
  visitId: string

  schoolId: string

  cycleId: string

  assignmentSnapshot: {
    zoneId: string | null

    primaryAssigneeId: string | null

    assigneeIds: string[]
  }

  visitedAt: Timestamp

  visitedBy: string

  recordedBy: string

  brochure: {
    status:
      | "delivered"
      | "notDelivered"
  }

  sample: {
    status:
      | "delivered"
      | "notDelivered"

    items: {
      productId: string
      quantity: number
    }[]
  }

  interest: {
    score:
      | 0
      | 20
      | 40
      | 60
      | 80
      | 100

    explicitlySelected: boolean
  }

  activityTagIds: string[]

  summary: string

  followUp: {
    required: boolean
    dueDate: string | null
    summary: string | null
  }

  deleted: boolean
  deletedAt: Timestamp | null
  deletedBy: string | null
  deleteReason: string | null

  revision: number

  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

# 30. 방문 완료 필수값

정상 방문 완료 기록은 다음이 모두 존재해야 한다.

```text
visitedAt

visitedBy

brochure.status

sample.status

interest.explicitlySelected = true

summary
```

관심도 `0`도 명시적으로 선택했다면 유효하다.

---

# 31. 방문 기록 Soft Delete

일반 사용자가 방문기록을 Hard Delete하지 않는다.

```text
deleted: true
```

사용.

관리자 또는 권한 있는 복구 기능에서 다시 활성화할 수 있다.

---

# 32. 월별 Sales Cycle

경로:

```text
salesCycles/{cycleId}
```

cycleId 형식:

```text
YYYY-MM
```

예:

```text
2026-08
```

---

# 33. Sales Cycle Schema

```ts
interface SalesCycle {
  cycleId: string

  year: number
  month: number

  status:
    | "draft"
    | "active"
    | "closed"

  copiedFromCycleId: string | null

  createdAt: Timestamp
  createdBy: string

  activatedAt: Timestamp | null
  closedAt: Timestamp | null
}
```

---

# 34. 월별 Assignment

경로:

```text
salesCycles/{cycleId}/assignments/{schoolId}
```

학교 한 곳당 월 하나의 Assignment Document를 기본으로 한다.

---

# 35. Assignment Schema

```ts
interface SalesAssignment {
  schoolId: string
  cycleId: string

  zoneId: string

  primaryAssigneeId: string

  assigneeIds: string[]

  monthlyStatus:
    | "before"
    | "completed"
    | "followUp"
    | "revisit"
    | "onHold"

  latestVisitId: string | null
  latestVisitedAt: Timestamp | null

  brochureStatus:
    | "unknown"
    | "delivered"
    | "notDelivered"

  sampleStatus:
    | "unknown"
    | "delivered"
    | "notDelivered"

  revision: number

  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

# 36. 월별 초기화

새 Cycle에서는 새 Assignment Document를 생성한다.

이전 Cycle의 Assignment를 재사용하지 않는다.

원하면:

```text
copiedFromCycleId
```

기준으로 이전 배정을 복사할 수 있다.

---

# 37. 월이 바뀌어도 유지되는 데이터

다음은 `salesProfiles` 등에 남는다.

```text
제품 관심도

관심 제품

커뮤니케이션 참고 태그

최근 방문

현재 후속 업무

다음 행동

전체 과거 방문기록
```

---

# 38. 월마다 새로 생성되는 데이터

```text
zoneId

primaryAssigneeId

assigneeIds

monthlyStatus

월 홍보지 상태

월 샘플 상태
```

---

# 39. 담당자와 방문자

세 Field는 구분한다.

```text
primaryAssigneeId
```

월 주 담당.

```text
visitedBy
```

실제 방문.

```text
recordedBy
```

기록 입력자.

서로 다를 수 있다.

---

# 40. zones

경로:

```text
zones/{zoneId}
```

MVP 예:

```text
A
B
C
```

---

# 41. Zone Schema

```ts
interface SalesZone {
  zoneId: string

  name: string

  displayOrder: number

  active: boolean

  createdAt: Timestamp
  updatedAt: Timestamp
}
```

Zone 자체는 월별 소유 데이터가 아니다.

월별 배정은 Assignment에서 관리한다.

---

# 42. 직원 공개 Directory

경로:

```text
employeeDirectory/{employeeId}
```

팀 화면 등에서 필요한 최소 정보만 제공한다.

---

# 43. employeeDirectory Schema

```ts
interface EmployeeDirectory {
  employeeId: string

  displayName: string

  active: boolean

  displayOrder: number
}
```

로그인 PIN, 내부 권한 설정 등을 포함하지 않는다.

---

# 44. 직원 내부정보

경로:

```text
employees/{employeeId}
```

---

# 45. employees Schema

```ts
interface Employee {
  employeeId: string

  firebaseUid: string

  displayName: string

  roleScopes: (
    | "delivery"
    | "sales"
    | "viewer"
    | "admin"
  )[]

  permissions: {
    exportTeam: boolean
  }

  status:
    | "active"
    | "disabled"

  sessionVersion: number

  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

# 46. 일반 직원 Login Alias

직원코드나 Login Alias는 일반 인증의 필수 입력으로 사용하지 않는다.

따라서 과거의:

```text
loginAlias
```

인증 구조는 폐기한다.

관리자 내부 식별을 위해 employeeId 자체는 유지한다.

---

# 47. 인증정보

경로:

```text
authCredentials/{employeeId}
```

Client 접근 금지.

---

# 48. authCredentials Schema

```ts
interface AuthCredential {
  employeeId: string

  pinHash: string

  pinVersion: number

  failedAttemptCount: number

  lockedUntil: Timestamp | null

  sessionVersion: number

  updatedAt: Timestamp
}
```

PIN 원문은 저장하지 않는다.

---

# 49. PIN Lookup Index

경로:

```text
pinIndexes/{lookupKey}
```

lookupKey는 PIN 원문이 아니다.

서버 Secret 기반 HMAC 결과를 사용한다.

---

# 50. pinIndexes Schema

```ts
interface PinIndex {
  employeeId: string

  createdAt: Timestamp
  updatedAt: Timestamp
}
```

Client Read/Write 모두 금지한다.

---

# 51. authz

경로:

```text
authz/{uid}
```

중요 권한의 즉각적 무효화를 위한 작은 서버 권한 문서다.

---

# 52. authz Schema

```ts
interface Authz {
  employeeId: string

  active: boolean

  sessionVersion: number

  permissionsVersion: number

  updatedAt: Timestamp
}
```

---

# 53. products

경로:

```text
products/{productId}
```

샘플·관심 제품에 사용한다.

---

# 54. Product Schema

```ts
interface Product {
  productId: string

  name: string

  shortName: string | null

  active: boolean

  displayOrder: number

  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

# 55. 커뮤니케이션 태그

경로:

```text
communicationTags/{tagId}
```

예:

```text
간결한 설명 선호
상세 자료 선호
가격 중심
품질 중심
샘플 확인 선호
사전 연락 필요
문자 연락 선호
전화 연락 선호
검수 시간 대화 어려움
```

사람의 성격 평가가 아닌 업무 참고 정보로 한정한다.

---

# 56. 활동 태그

경로:

```text
activityTags/{tagId}
```

예:

```text
후속 필요
샘플 반응
가격 문의
담당자 부재
납품 협의
자료 요청
견적 요청
```

특정 `salesVisit`에 연결한다.

---

# 57. Tag 공통 Schema

```ts
interface TagDefinition {
  tagId: string

  label: string

  active: boolean

  displayOrder: number

  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

# 58. 직원 통계

경로:

```text
salesCycles/{cycleId}/employeeStats/{employeeId}
```

직원 평가나 Ranking 목적이 아니다.

월별 업무 화면의 빠른 Summary용 Cache다.

---

# 59. employeeStats Schema

```ts
interface EmployeeCycleStats {
  employeeId: string

  assignedSchoolCount: number

  completedCount: number

  beforeCount: number

  followUpCount: number

  revisitCount: number

  onHoldCount: number

  updatedAt: Timestamp
}
```

---

# 60. 팀 통계

경로:

```text
salesCycles/{cycleId}/stats/team
```

예:

```ts
interface TeamCycleStats {
  totalSchoolCount: number

  completedCount: number
  beforeCount: number
  followUpCount: number
  revisitCount: number
  onHoldCount: number

  updatedAt: Timestamp
}
```

직원 순위를 저장하지 않는다.

---

# 61. Search Catalog

경로:

```text
searchCatalogs/{catalogId}
```

학교 검색 입력 시 Firestore Query를 하지 않기 위한 로컬 Catalog Source다.

---

# 62. Catalog 종류

논리적으로:

```text
common
field
sales
assignment
```

을 분리한다.

필요하면 행정구 또는 Chunk 단위로 나눈다.

---

# 63. Common Catalog Item

```ts
interface SchoolSearchItem {
  schoolId: string

  name: string
  shortName: string | null

  normalizedName: string
  initials: string
  aliases: string[]

  schoolType: string
  district: string

  photoCount: number

  fieldInfoAvailable: boolean
}
```

---

# 64. Field Catalog

예:

```ts
interface FieldCatalogItem {
  schoolId: string

  cartRequired:
    | "required"
    | "notRequired"
    | "unknown"

  inspectionStart: string | null
  inspectionEnd: string | null

  cafeteriaLocationShort: string | null

  photoCount: number
  completeness: number
}
```

---

# 65. Sales Catalog

홍보 사용자에게만 제공한다.

```ts
interface SalesCatalogItem {
  schoolId: string

  interestScore:
    | 0
    | 20
    | 40
    | 60
    | 80
    | 100

  monthlyVisitStatus: string | null

  primaryAssigneeId: string | null

  latestVisitDate: Timestamp | null

  followUpRequired: boolean
  followUpDue: string | null
}
```

---

# 66. catalogMeta

경로:

```text
catalogMeta/current
```

---

# 67. Catalog Meta Schema

```ts
interface CatalogMeta {
  commonCatalogVersion: number

  fieldCatalogVersion: number

  salesCatalogVersion: number

  assignmentCatalogVersion: number

  updatedAt: Timestamp
}
```

---

# 68. Catalog Version

다음과 같이 영역별 Version을 분리한다.

학교명 변경:

```text
commonCatalogVersion + 1
```

학교 현장정보 변경:

```text
fieldCatalogVersion + 1
```

홍보 정보 변경:

```text
salesCatalogVersion + 1
```

불필요한 전체 Catalog 재다운로드를 줄인다.

---

# 69. Export Jobs

경로:

```text
exportJobs/{jobId}
```

---

# 70. ExportJob Schema

```ts
interface ExportJob {
  jobId: string

  requestedBy: string

  cycleId: string | null

  scope:
    | "own"
    | "team"
    | "admin"

  filter: Record<string, unknown>

  rowCount: number | null

  status:
    | "queued"
    | "processing"
    | "completed"
    | "failed"
    | "expired"

  storagePath: string | null

  expiresAt: Timestamp | null

  createdAt: Timestamp
  completedAt: Timestamp | null
}
```

---

# 71. CSV 보존

CSV는 영구 자료보관 기능이 아니다.

권장:

```text
임시 Storage
+
만료
```

기본 목표:

```text
약 24시간
```

정확한 TTL은 설정값으로 둔다.

---

# 72. Audit Log

경로:

```text
auditLogs/{logId}
```

Client에서 생성하지 않는다.

---

# 73. Audit Schema

```ts
interface AuditLog {
  logId: string

  eventType: string

  actorUid: string | null
  actorEmployeeId: string | null

  targetType: string
  targetId: string | null

  schoolId: string | null
  cycleId: string | null

  changedFields: string[]

  requestId: string | null

  appVersion: string | null

  createdAt: Timestamp
}
```

PIN이나 Secret은 저장하지 않는다.

---

# 74. Audit Event 예

```text
LOGIN_SUCCESS
LOGIN_FAILURE_LOCK

EMPLOYEE_CREATED
EMPLOYEE_DISABLED
ROLE_CHANGED
SESSION_REVOKED

SCHOOL_FIELD_UPDATED

PHOTO_ADDED
PHOTO_REPLACED
PHOTO_DELETED
PHOTO_RESTORED

SALES_VISIT_CREATED
SALES_VISIT_UPDATED
SALES_VISIT_DELETED

SALES_PROFILE_UPDATED

ASSIGNMENT_CHANGED

CSV_EXPORTED

NEIS_SYNC_STARTED
NEIS_SYNC_COMPLETED

KAKAO_MATCH_CONFIRMED
```

---

# 75. NEIS Sync Run

경로:

```text
neisSyncRuns/{runId}
```

---

# 76. neisSyncRuns Schema

```ts
interface NeisSyncRun {
  runId: string

  status:
    | "FETCHING"
    | "NORMALIZING"
    | "DIFF_READY"
    | "APPLYING"
    | "COMPLETED"
    | "FAILED"
    | "SUSPICIOUS_RESULT"

  requestedBy: string

  sourceCount: number

  newCount: number
  changedCount: number
  missingCount: number

  appliedCount: number
  errorCount: number

  startedAt: Timestamp
  completedAt: Timestamp | null
}
```

---

# 77. NEIS Diff

대량 Diff 상세를 하나의 Document에 전부 저장할 필요는 없다.

필요 시:

```text
neisSyncRuns/{runId}/changes/{changeId}
```

Subcollection을 둘 수 있다.

---

# 78. NEIS Change Schema

```ts
interface NeisSyncChange {
  type:
    | "NEW"
    | "NAME_CHANGED"
    | "ADDRESS_CHANGED"
    | "PHONE_CHANGED"
    | "HOMEPAGE_CHANGED"
    | "TYPE_CHANGED"
    | "MISSING"

  schoolId: string | null

  schoolCode: string

  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null

  approved: boolean | null
  applied: boolean
}
```

---

# 79. App Settings

경로:

```text
appSettings/public
```

Client에서 읽어도 되는 설정만 저장한다.

예:

```ts
interface PublicAppSettings {
  minimumAppVersion: string | null

  currentSalesCycleId: string

  commonCatalogVersion: number

  maintenanceMode: boolean

  updatedAt: Timestamp
}
```

---

# 80. Secure Settings

경로:

```text
secureSettings/{settingId}
```

Client에서 읽을 수 없다.

단, 실제 API Key나 PIN Pepper는 Firestore보다는 Server Secret 환경에 저장하는 것을 기본으로 한다.

`secureSettings`에는 Secret 자체보다는 서버 내부 정책값 등을 두는 것을 권장한다.

---

# 81. Server Secret

다음은 Firestore Client 데이터베이스 설계 범위에서 제외한다.

```text
PIN_LOOKUP_SECRET

PIN_PEPPER

NEIS_API_KEY

KAKAO_REST_API_KEY

Firebase Admin Credential
```

Server Secret 환경에서 관리한다.

---

# 82. 데이터 Mutation 원칙

다음 핵심 Document는 Server Mutation을 기본으로 한다.

```text
schoolFieldProfiles

school photo metadata

salesProfiles

salesVisits

salesCycles

assignments

employees

authCredentials

pinIndexes

exportJobs

auditLogs

neisSyncRuns
```

---

# 83. Client 직접 Read

Security Rules가 허용하는 경우 Client Read는 가능하다.

예:

```text
schools

schoolFieldProfiles

photos

salesProfiles

salesVisits
```

역할별 접근 범위를 적용한다.

---

# 84. 권한 의미

설계 문서에서:

```text
RW
```

라고 표현되어 있어도:

```text
업무상 Read/Mutation 권한
```

을 의미한다.

반드시 Client SDK 직접 Write를 의미하지 않는다.

---

# 85. 역할별 데이터 범위

## Delivery

```text
schools
schoolFieldProfiles
school photos
employeeDirectory 필요 범위
```

Sales 데이터 접근 금지.

---

# 86. Sales

```text
schools
schoolFieldProfiles
school photos

salesProfiles
salesVisits
salesCycles
assignments

products
communicationTags
activityTags
```

접근.

---

# 87. Viewer

```text
schools
schoolFieldProfiles
school photos
```

Read Only.

---

# 88. Admin

관리 대상 전체.

단:

```text
authCredentials
pinIndexes
```

는 관리자 Web Client에서 직접 읽기보다 Server 관리 기능을 통해 처리한다.

---

# 89. 데이터 삭제 정책

업무 History가 있는 데이터는 기본적으로 Hard Delete하지 않는다.

Soft Delete 또는 Status 변경 사용.

대상:

```text
학교
사진
방문 기록
직원
```

---

# 90. 직원 삭제

퇴사 직원:

```text
status:
active
→ disabled
```

기존 방문 기록의 employeeId는 유지한다.

---

# 91. Product 삭제

사용 중단 제품:

```text
active: false
```

과거 샘플·관심 기록에서 ID는 유지한다.

---

# 92. Tag 삭제

태그 정의도:

```text
active: false
```

방식을 사용한다.

과거 방문 기록의 Tag ID는 유지한다.

---

# 93. Firestore Index

구현 시 예상 Composite Index를 명시적으로 관리한다.

---

# 94. salesVisits 주요 Query

학교 최근 방문:

```text
schoolId ==
deleted == false
visitedAt desc
```

Index 후보:

```text
schoolId ASC
deleted ASC
visitedAt DESC
```

---

# 95. 직원 방문 기록

```text
visitedBy ==
visitedAt desc
```

Index 후보:

```text
visitedBy ASC
visitedAt DESC
```

---

# 96. Cycle 방문 기록

```text
cycleId ==
visitedAt desc
```

Index:

```text
cycleId ASC
visitedAt DESC
```

---

# 97. Follow-up

필요 시:

```text
followUp.required == true
followUp.dueDate
```

검색용 별도 평면 Field를 둘 수 있다.

예:

```text
followUpRequired
followUpDueDate
```

Firestore Query 효율을 위해 Domain Nested 구조와 Query용 Flat Field를 함께 둘 수 있다.

---

# 98. Assignment Query

월별 직원 담당:

```text
primaryAssigneeId ==
```

Subcollection Query 또는 현재 Cycle 경로에서 조회한다.

Index는 실제 Query 구현 후 Emulator Error가 제안하는 Index를 검토하되 설계 의도와 맞는지 확인한다.

---

# 99. 전체 History Pagination

방문 History는:

```text
orderBy visitedAt desc
limit 3~5
```

첫 조회.

추가:

```text
startAfter
```

기반 Pagination을 사용한다.

---

# 100. employeeStats

통계는 방문 Event로부터 파생되는 Cache다.

Client가 직접 수정하지 않는다.

방문 저장 또는 Assignment 변경 시 Server가 갱신한다.

---

# 101. 데이터 원본 우선순위

공식 학교정보:

```text
NEIS
```

위치:

```text
관리자 Confirm
>
Kakao Auto Match
```

현장정보:

```text
급식길 직원
```

영업정보:

```text
급식길 홍보 직원
```

방문 Event:

```text
실제 방문기록
```

---

# 102. NEIS Sync 보호

NEIS Sync가 변경 가능한 Collection:

```text
schools
```

관련 Meta:

```text
search catalog
sync runs
audit
```

---

# 103. NEIS Sync 변경 금지

```text
schoolFieldProfiles

photos

salesProfiles

salesVisits

salesCycles
```

절대 자동 수정하지 않는다.

---

# 104. Kakao 변경 범위

Kakao는 기본적으로:

```text
schools.location
```

만 수정한다.

---

# 105. 관리자 수동 위치

`confirmed + manual` 상태는 자동 Match보다 우선한다.

NEIS 주소가 변경되더라도 자동 덮어쓰지 않고 Review한다.

---

# 106. 검색 Catalog와 업무 DB

Catalog는 파생 데이터다.

Catalog가 손상돼도 원본:

```text
schools
schoolFieldProfiles
salesProfiles
assignments
```

에서 재생성할 수 있어야 한다.

---

# 107. Stats 역시 파생 데이터

```text
employeeStats
team stats
```

도 재계산 가능한 Cache로 취급한다.

---

# 108. 데이터베이스 Backup 중요도

최우선:

```text
schools
schoolFieldProfiles
photos metadata
salesProfiles
salesVisits
salesCycles
employees
auditLogs
```

Search Catalog나 Stats보다 원본 데이터를 우선 보호한다.

---

# 109. 데이터 유실 위험도

가장 민감:

```text
salesVisits

schoolFieldProfiles

photo metadata + Storage

salesProfiles
```

Migration·Sync·Bulk Update 시 특별히 보호한다.

---

# 110. 개발 Seed 데이터

Emulator Seed에서는 최소:

```text
Delivery User

Sales A

Sales B

Admin

Disabled User
```

직원을 만든다.

학교:

```text
완전정보
부분정보
정보없음
교명변경
inactiveCandidate
```

상태를 각각 준비한다.

---

# 111. 테스트용 Cycle

예:

```text
2026-08
```

Cycle에 A/B/C Zone Assignment를 생성한다.

---

# 112. 데이터베이스 테스트

반드시 자동 검증:

```text
Interest Enum

Photo Slot

Visit Required Fields

Cycle ID

Assignment Structure

PIN Lookup Uniqueness

Revision Conflict

Soft Delete

Role Access
```

---

# 113. Migration 정책

Schema 변경이 발생하면 Production Document를 수동으로 하나씩 수정하지 않는다.

```text
scripts/migrations/
```

아래에 Migration Script를 작성한다.

예:

```text
001-add-photo-status.ts

002-add-interest-evaluated.ts
```

---

# 114. Migration 기록

각 Migration:

```text
version
executedAt
affectedCount
result
```

을 기록할 수 있다.

큰 Migration은 Dry Run을 지원하는 것을 권장한다.

---

# 115. Timestamp 정책

업무 데이터의:

```text
createdAt
updatedAt
deletedAt
visitedAt
```

은 가능한 Server 기준 시간으로 기록한다.

Client가 `createdAt`을 임의 지정하지 않는다.

---

# 116. updatedBy

업무 Mutation의 사용자 식별도 Client 입력을 그대로 믿지 않는다.

Server Authentication Context를 기준으로 기록한다.

---

# 117. requestId

중요 Mutation에는:

```text
requestId
```

를 사용한다.

대상:

```text
sales visit
photo finalize
CSV
employee creation
cycle creation
NEIS Apply
```

동일 requestId 중복 처리를 차단한다.

---

# 118. Idempotency Store

필요하면:

```text
requestLocks/{requestId}
```

같은 서버 전용 구조를 사용할 수 있다.

다만 구현 단계에서 Cloud Function별 Transaction 구조가 충분하면 별도 Collection을 만들지 않아도 된다.

---

# 119. 데이터베이스 성능 원칙

금지:

```text
앱 시작
→ 모든 학교 Detail Read

학교 선택
→ 전체 Visit History Read

검색
→ Firestore Query 반복
```

---

# 120. 권장 조회

학교 검색:

```text
Local Catalog
```

학교 상세:

```text
schools/{schoolId}

schoolFieldProfiles/{schoolId}

photos metadata
```

Sales Role 추가:

```text
salesProfiles/{schoolId}

현재 assignment

최근 visits 3~5
```

---

# 121. Real-time Listener

필요한 범위에만 제한한다.

후보:

```text
현재 학교
현재 Cycle Summary
catalog meta
```

전체 학교 / 전체 방문기록 Listener는 사용하지 않는다.

---

# 122. 데이터베이스 완료 기준

다음을 만족해야 DB 설계 구현 완료로 본다.

- 학교코드 기반 School ID
- schools 구현
- schoolFieldProfiles 구현
- 사진 Subcollection 구현
- 사진 최대 3 Slot
- 사진 Version
- 사진 Soft Delete
- salesProfiles 구현
- salesVisits 구현
- monthly salesCycles 구현
- assignments 구현
- 담당자/방문자/기록자 분리
- 제품 관심도 6단계
- 관심도 미선택과 0 구분
- communicationTags / activityTags 분리
- employees / directory 분리
- PIN 평문 없음
- pinIndexes 구현
- authz / sessionVersion
- Search Catalog
- Catalog Version
- ExportJob
- Audit
- NEIS Sync Run
- Revision Conflict
- Soft Delete 정책
- Firestore Index
- Emulator Seed
- Rules Test

---

# 123. 최종 데이터 흐름

```text
                     NEIS
                       │
                       ▼
                   schools
                       │
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▼
      schoolFieldProfiles      photos
             │
             │
             └─────────┐
                       │
                       ▼
                 학교 상세 화면
```

홍보:

```text
schools
   │
   ├─ schoolFieldProfiles
   ├─ photos
   │
   ├─ salesProfiles
   │
   ├─ current assignment
   │
   └─ recent salesVisits
```

---

# 124. 최종 Sales 데이터 모델

```text
salesProfiles
```

= 현재 학교 영업 상태.

```text
salesVisits
```

= 실제 방문 History.

```text
salesCycles/{YYYY-MM}/assignments
```

= 해당 월 업무 배정 및 상태.

이 세 영역의 책임을 혼합하지 않는다.

---

# 125. 최종 인증 데이터 모델

```text
employees
```

= 직원 및 권한.

```text
employeeDirectory
```

= 직원 공개정보.

```text
authCredentials
```

= PIN Hash 등 인증정보.

```text
pinIndexes
```

= PIN 단독 로그인 직원 검색.

```text
authz
```

= 현재 세션/권한 유효성.

---

# 126. 최종 사진 모델

```text
schools/{schoolId}/photos/{slotId}
```

= 현재 Metadata.

```text
Storage/{versionId}
```

= 실제 사진 Version.

따라서:

```text
Metadata
→ 현재 사진을 가리킴

Storage
→ Version History 보존
```

구조를 사용한다.

---

# 127. 데이터베이스 한 줄 정의

> **급식길 데이터베이스는 NEIS 기반 학교 기본정보, 납품·홍보가 공동 사용하는 학교 현장정보와 사진, 학교별 영구 영업 Profile, 월별 Assignment, 불변에 가까운 방문 History, 직원 인증정보를 서로 분리하고 Revision·Soft Delete·Server Mutation·Audit를 통해 현장 데이터의 안전성과 추적성을 확보하는 구조다.**

---

# 128. 문서 상태

본 문서는 **급식길 PWA 데이터베이스 상세 설계서 v1.3**이다.

본 문서는 기존 데이터베이스 설계의 다음 구버전 개념을 모두 대체한다.

```text
deliveryProfiles
→ schoolFieldProfiles

deliveryPhotos
→ schools/{schoolId}/photos

직원코드 + PIN
→ PIN 단독 로그인

loginAlias 기반 인증
→ 제거

사진 직접 덮어쓰기
→ versionId

사진 즉시 Hard Delete
→ Soft Delete

관심도 0 = 단순 미입력
→ 미선택 여부 별도 구분
```

향후 데이터 구조 변경 시 본 문서를 먼저 개정하고 Migration 계획을 함께 작성한다.
