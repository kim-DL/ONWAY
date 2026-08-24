# 급식길 PWA 구현 명세서

**문서 버전:** 1.1  
**대상:** 급식길 PWA MVP  
**목적:** 확정된 기획·데이터·보안·UX·성능 설계를 실제 코드로 구현하기 위한 최종 개발 기준서  
**주요 개발 도구:** Codex  
**작성 기준일:** 2026-08-18

**관련 문서**

1. 급식길 PWA MVP 기획서
2. 데이터베이스 상세 설계서
3. 인증·권한·보안 설계서 v1.3
4. 디자인 시스템 v1.0
5. 화면·UX 상세 명세서 v1.2
6. 검색·캐시·성능 설계서 v1.1
7. 외부 API·데이터 동기화 설계서 v1.0
8. 테스트·인수 기준서 v1.1

---

# 1. 문서 목적

본 문서는 기존 설계 문서를 실제 개발 작업 단위로 변환한다.

Codex는 본 문서를 기준으로 다음을 판단한다.

- 어떤 기술을 사용할 것인가
- 어떤 디렉터리 구조를 사용할 것인가
- Client와 Server 책임을 어떻게 나눌 것인가
- 어떤 순서로 구현할 것인가
- 어떤 기능을 어느 Phase에서 만들 것인가
- 어떤 테스트를 통과해야 다음 단계로 넘어갈 것인가
- 어떤 보안 조건을 반드시 지켜야 하는가
- 어떤 기능을 MVP에서 만들지 않을 것인가

본 문서의 최종 목적은 다음과 같다.

> **Codex가 전체 프로젝트를 한 번에 추측해서 구현하지 않고, 확정된 설계를 작은 검증 가능한 단계로 정확하게 구현하도록 한다.**

---

# 2. 문서 우선순위

문서 간 내용이 충돌할 경우 다음 우선순위를 따른다.

```text
1. 사용자가 가장 최근에 명시적으로 확정한 결정
2. 가장 최신 Version의 관련 상세 설계서
3. 본 구현 명세서
4. 이전 Version 문서
```

예:

```text
직원코드 + PIN
```

이라는 과거 내용이 남아 있더라도 최신 정책:

```text
개인 PIN 단독 로그인
```

을 적용한다.

또한:

```text
deliveryProfiles
```

이라는 과거 명칭이 남아 있다면 최신 구조인:

```text
schoolFieldProfiles
```

를 적용한다.

---

# 3. 구현 시 절대 원칙

Codex는 다음 원칙을 위반해서는 안 된다.

1. 전체 프로젝트를 한 번에 구현하지 않는다.
2. Phase 단위로 구현한다.
3. 각 Phase 완료 후 테스트한다.
4. Security Rules 없이 기능부터 Production 방식으로 연결하지 않는다.
5. 화면 Component에서 Firestore 호출을 무분별하게 직접 수행하지 않는다.
6. 학교 검색 입력마다 Network 요청하지 않는다.
7. 납품 사용자에게 홍보 데이터를 전달하지 않는다.
8. PIN을 평문으로 저장하지 않는다.
9. 외부 API Secret을 Client에 넣지 않는다.
10. NEIS Sync로 현장·사진·홍보 데이터를 덮어쓰지 않는다.
11. 사진 Original을 학교 목록에서 자동 다운로드하지 않는다.
12. 방문 기록 전체 History를 학교 진입 시 전부 읽지 않는다.
13. 권한 없는 기능을 UI에서 숨기는 것만으로 보안을 처리하지 않는다.
14. 중요한 서버 Mutation에는 중복 요청 방지 장치를 적용한다.
15. 테스트 실패 상태에서 다음 Phase로 넘어가지 않는다.

---

# 4. 기술 스택

## Frontend

```text
Next.js 16
App Router

React
TypeScript
```

Next.js 공식 문서는 App Router를 현재 애플리케이션 구조로 제공하고 있으며, Next.js 16 업그레이드 문서도 현재 App Router 기준으로 유지되고 있다. citeturn790512search0turn790512search22

## Runtime / Hosting 기준

```text
Node.js 22 LTS
Frontend: Vercel
Backend: Firebase Authentication / Firestore / Storage / Functions
```

Next.js 16 호환성이 Firebase App Hosting의 활성 지원 범위에서 검증되기 전까지 Frontend는 Vercel을 기본 배포 대상으로 한다. Firebase는 Backend와 Emulator의 기준 플랫폼으로 사용한다.

---

# 5. TypeScript

전체 프로젝트에 TypeScript를 사용한다.

기본:

```text
strict: true
```

핵심 Domain에서:

```text
any
```

사용을 피한다.

특히 다음 데이터에는 명시적인 Type을 둔다.

- School
- SchoolFieldProfile
- SchoolPhoto
- Employee
- Authz
- SalesProfile
- SalesVisit
- SalesCycle
- Assignment
- SearchCatalogItem
- ExportJob
- NeisSyncRun

---

# 6. Firebase Client

Firebase JavaScript Modular SDK를 사용한다.

Firebase 공식 Web 설정에서도 모듈형 JavaScript SDK 구조를 제공한다. citeturn790512search1

사용 서비스:

```text
Firebase Authentication
Cloud Firestore
Cloud Storage
Cloud Functions
Firebase App Check
```

---

# 7. Firebase Server

Server 업무:

```text
Cloud Functions for Firebase
Firebase Admin SDK
```

Cloud Functions는 TypeScript 기반으로 구현한다.

Firebase Cloud Functions는 HTTPS·Callable·이벤트·Scheduler 기반 서버 코드를 지원한다. citeturn790512search6

---

# 8. Cloud Functions 세대

새 함수는 기본적으로:

```text
Cloud Functions 2nd gen
```

기준으로 작성한다.

기존 1st gen을 새 프로젝트에서 혼용하지 않는다.

---

# 9. Firebase Emulator

개발 및 자동 테스트에는 Local Emulator Suite를 사용한다.

대상:

```text
Authentication
Firestore
Cloud Functions
Cloud Storage
```

Firebase Local Emulator Suite는 이들 Firebase 서비스를 로컬 환경에서 연동해 테스트하도록 지원한다. citeturn790512search3turn790512search15turn790512search21turn790512search38

---

# 10. UI Styling

기본:

```text
CSS Variables
+
Tailwind CSS
+
필요한 Custom CSS
```

디자인 시스템 Token은 CSS Variable을 Source of Truth로 둔다.

예:

```text
--color-surface
--color-glass
--color-text-primary

--radius-card
--radius-control

--shadow-card
--shadow-button

--motion-fast
--motion-standard
```

Tailwind Utility는 이 Token을 소비한다.

---

# 11. UI Component 정책

대규모 UI Framework의 기본 디자인에 프로젝트를 맞추지 않는다.

급식길 자체 Component를 만든다.

주요 Component:

```text
GlassButton
SoftCard
SmartChip
StatusBadge
SegmentedControl
BottomSheet
FloatingContextBar
HeartInterestSelector
PhotoViewer
```

필요한 접근성 Primitive는 외부 Headless Library를 선택적으로 사용할 수 있다.

---

# 12. Animation

단순 Interaction:

```text
CSS Transition
```

을 우선한다.

복잡한:

- Shared Element
- Photo Viewer
- Bottom Sheet
- 일부 Spring Interaction

에만 Motion Library 사용을 허용한다.

Animation Library가 데이터 상태관리까지 담당하게 하지 않는다.

---

# 13. Form Validation

Client와 Server 양쪽에서 동일한 Validation 기준을 사용한다.

권장:

```text
Zod Schema
```

또는 동등한 Runtime Schema Layer.

Client Validation은 UX용이며 Server Validation을 대체하지 않는다.

---

# 14. 테스트 도구

권장:

```text
Vitest
→ Unit / Domain

Firebase Emulator
→ Rules / Functions

Playwright
→ 주요 User Flow

ESLint
→ Static Analysis

TypeScript
→ Type Check
```

---

# 15. 기본 프로젝트 구조

```text
/
├─ src/
│
├─ functions/
│
├─ public/
│
├─ scripts/
│
├─ tests/
│
├─ docs/
│
├─ firestore.rules
├─ storage.rules
├─ firestore.indexes.json
├─ firebase.json
├─ .firebaserc
├─ next.config.ts
├─ tsconfig.json
├─ package.json
└─ README.md
```

---

# 16. src 구조

```text
src/
├─ app/
│
├─ components/
│
├─ features/
│
├─ domain/
│
├─ repositories/
│
├─ services/
│
├─ lib/
│
├─ hooks/
│
├─ stores/
│
├─ styles/
│
├─ types/
└─ utils/
```

---

# 17. App Router 구조

개념:

```text
src/app/

├─ page.tsx
│
├─ login/
│
├─ delivery/
│
├─ sales/
│
├─ school/
│  └─ [schoolId]/
│
├─ activity/
│
├─ settings/
│
└─ admin/
```

실제 URL 구조는 Route Group으로 정리할 수 있다.

---

# 18. Route Group 권장

```text
app/

├─ (auth)/
│  └─ login/
│
├─ (field)/
│  ├─ delivery/
│  ├─ sales/
│  ├─ school/
│  ├─ activity/
│  └─ settings/
│
└─ admin/
```

---

# 19. Domain Layer

```text
src/domain/
```

에는 Firebase와 React에 의존하지 않는 업무 Domain을 둔다.

예:

```text
school.ts
field-profile.ts
sales-profile.ts
sales-visit.ts
sales-cycle.ts
employee.ts
interest.ts
search.ts
```

---

# 20. Domain Enum

한곳에서 정의한다.

예:

```text
VisitStatus

BEFORE
COMPLETED
FOLLOW_UP
REVISIT
ON_HOLD
```

관심도:

```text
0
20
40
60
80
100
```

사진 Slot:

```text
01
02
03
```

---

# 21. Repository Layer

UI가 Firebase에 직접 의존하지 않도록 Repository를 둔다.

```text
SchoolRepository

SchoolFieldRepository

SalesProfileRepository

SalesVisitRepository

AssignmentRepository

PhotoRepository

SearchCatalogRepository
```

---

# 22. Repository 원칙

금지:

```text
SchoolCard.tsx
↓
getDocs(...)
```

권장:

```text
SchoolCard / Page
↓
Repository
↓
Memory / IndexedDB / Firestore
```

UI가 데이터 저장 위치를 알 필요가 없도록 한다.

---

# 23. Service Layer

업무 Workflow를 담당한다.

예:

```text
AuthService
SearchService
CacheService
PhotoService
SalesVisitService
SyncService
ExportService
```

---

# 24. Firebase 초기화

```text
src/lib/firebase/
```

권장:

```text
client.ts
auth.ts
firestore.ts
storage.ts
functions.ts
app-check.ts
emulator.ts
```

환경에 따라 Emulator 연결 로직을 분리한다.

---

# 25. Server Functions 구조

```text
functions/src/

├─ auth/
├─ employees/
├─ schools/
├─ sales/
├─ photos/
├─ exports/
├─ integrations/
├─ admin/
├─ audit/
├─ shared/
└─ index.ts
```

---

# 26. Server 공통 모듈

```text
functions/src/shared/

auth-context.ts
authorization.ts
validation.ts
errors.ts
audit.ts
idempotency.ts
timestamps.ts
secrets.ts
```

서버 함수마다 동일한 권한 로직을 복사하지 않는다.

---

# 27. Firebase Functions 기본 정책

Callable Function을 기본으로 한다.

중요 함수에는:

```text
enforceAppCheck: true
```

를 적용한다.

Firebase 공식 문서에 따르면 Callable Functions에서 App Check Enforcement를 설정하면 유효한 App Check Token이 없는 요청을 거부할 수 있다. citeturn766162search0

---

# 28. Authentication Architecture

일반 직원:

```text
PIN
↓
employeeLogin()
↓
PIN 검증
↓
Employee 확인
↓
Custom Token
↓
signInWithCustomToken()
↓
Firebase Auth Session
```

Firebase Admin SDK는 Custom Token 발급을 지원한다. citeturn766162search1

---

# 29. PIN 정책

본 구현에서는 최신 인증 설계서를 따른다.

```text
PIN 단독 로그인

6자리

고유 PIN
```

PIN 부여 방식:

```text
서버에서 고유한 무작위 6자리 생성
휴대폰·직원 코드·별칭 기반 생성 금지
```

인증·권한·보안 설계서 v1.3을 Source of Truth로 한다.

---

# 30. PIN Server 데이터

Client 접근 금지:

```text
pinIndexes/{pinLookupKey}

authCredentials/{employeeId}
```

예:

```text
authCredentials

pinHash
pinVersion
sessionVersion
failedAttemptCount
lockedUntil
```

---

# 31. PIN Lookup

입력 PIN:

```text
PIN
↓
HMAC
↓
pinLookupKey
↓
employeeId
```

PIN 원문을 Query Key 또는 Document에 저장하지 않는다.

---

# 32. PIN Hash

Lookup 후 별도의 강한 PIN Hash를 검증한다.

Lookup Key와 검증 Hash를 같은 값으로 사용하지 않는다.

---

# 33. Auth Persistence

로그인 성공 후 인증 상태는 지속시킨다.

```text
앱 종료
→ 로그인 유지

재실행
→ 자동 로그인
```

Firebase Web Authentication에는 브라우저 재실행 이후에도 인증 상태를 유지하는 Local Persistence가 제공된다. citeturn790512search35

---

# 34. Auth Boot

앱 첫 렌더링:

```text
App Start
↓
Auth Resolving
↓
Session Validation
↓
Role Load
↓
App
```

로그인 여부가 결정되기 전에 Login 화면을 먼저 표시하지 않는다.

---

# 35. Auth Splash

Auth 확인 중에는:

```text
<AuthSplash />
```

을 표시한다.

로그인 화면 Flash를 방지한다.

---

# 36. sessionVersion

서버:

```text
authz/{uid}
```

또는 이에 상응하는 권한 문서에서 현재 Session Version을 관리한다.

중요 요청:

```text
token/session
vs
server authz
```

검증.

권한 변경 시 기존 세션은 재인증 대상으로 전환한다.

---

# 37. Role Scopes

지원:

```text
delivery
sales
admin
viewer
```

필요하면 복수:

```text
["delivery", "sales"]
```

를 지원한다.

---

# 38. Permission Matrix

### Delivery

```text
School Base R

School Field RW

Photos RW

Sales DENY
```

### Sales

```text
School Base R

School Field RW

Photos RW

Sales R

Own/Authorized Sales Write
```

### Viewer

```text
School Base R
School Field R
Photos R
```

### Admin

Google 계정 인증, 서버 허용목록, `admin` 역할을 모두 확인한 뒤 관리 기능을 허용한다.

표의 `W`는 업무상 변경 권한을 뜻하며 Client SDK 직접 쓰기를 뜻하지 않는다. 핵심 Collection의 create/update/delete는 기본 DENY하고 승인된 Callable Function에서만 실행한다.

---

# 39. Firestore Rules

Rules에서는 재사용 함수 구조를 사용한다.

```text
isSignedIn()

isActive()

hasScope()

isAdmin()

canReadField()

canWriteField()

canReadSales()

sessionValid()
```

Firestore Security Rules는 Custom Function을 정의해 반복되는 조건을 재사용할 수 있다. citeturn766162search3

---

# 40. Storage Rules

다음 경로를 명확히 구분한다.

```text
schools/
temporaryUploads/
exports/
```

Storage Rules는 Firebase Authentication Token의 Claims를 이용한 권한 검증과 업로드 파일 크기·contentType Validation을 지원한다. citeturn766162search4turn766162search6

---

# 41. Default Deny

Firestore와 Storage 모두:

```text
명시적으로 허용하지 않은 경로
→ DENY
```

가 기본이다.

---

# 42. Firestore 핵심 구조

최종 기준:

```text
schools/{schoolId}

schoolFieldProfiles/{schoolId}

schools/{schoolId}/photos/{slotId}

salesProfiles/{schoolId}

salesVisits/{visitId}

salesCycles/{YYYY-MM}
  └─ assignments/{schoolId}

employees/{employeeId}

employeeDirectory/{employeeId}

authCredentials/{employeeId}

pinIndexes/{lookupKey}

products/{productId}

communicationTags/{tagId}

activityTags/{tagId}

auditLogs/{logId}

exportJobs/{jobId}

neisSyncRuns/{runId}
```

---

# 43. Deprecated Collection 금지

다음 신규 사용 금지:

```text
deliveryProfiles
deliveryPhotos
```

대신:

```text
schoolFieldProfiles
schools/{schoolId}/photos
```

를 사용한다.

---

# 44. schoolId

NEIS 학교 행정코드를 기준으로 안정적 ID를 만든다.

학교명을 Document ID로 사용하지 않는다.

---

# 45. 학교 Field Revision

현장정보:

```text
revision
```

을 유지한다.

Client Update 요청:

```text
expectedRevision
```

을 보낸다.

Server가 현재 Revision과 비교한다.

---

# 46. 동시 수정

예:

```text
Client A
revision 5

Client B
revision 5
```

A 저장:

```text
5 → 6
```

B 저장:

```text
expected 5
current 6
```

이면 충돌로 처리한다.

조용히 B의 데이터로 덮어쓰지 않는다.

---

# 47. Conflict UX

서버 Error:

```text
CONFLICT
```

UI:

```text
다른 직원이 먼저 정보를 수정했습니다.

최신 내용을 확인해주세요.
```

최신 데이터 Reload 후 다시 수정하도록 한다.

---

# 48. 중요 Mutation

다음은 Cloud Function을 통과시킨다.

```text
employeeLogin

updateSchoolFieldProfile

recordSalesVisit

updateSalesProfile

preparePhotoUpload

finalizePhotoUpload

adminCreateEmployee

adminUpdateEmployee

adminResetPin

adminUpdateRoles

adminRevokeSessions

createSalesCycle

updateAssignment

exportCsv

previewNeisSchoolSync

applyNeisSchoolSync

confirmKakaoMatch
```

---

# 49. Idempotency

중요 Mutation 요청에는:

```text
requestId
```

를 포함한다.

예:

```text
UUID
```

Client가 저장 버튼을 두 번 누르더라도 동일 requestId는 한 번만 처리한다.

적용:

- 방문 기록
- 사진 finalize
- CSV 생성
- 직원 생성
- Cycle 생성
- NEIS Apply

---

# 50. Audit

서버 Mutation이 성공한 경우 필요한 Audit Event를 같은 업무 흐름에서 생성한다.

Client가 Audit Log를 직접 쓰지 않는다.

---

# 51. 학교 검색 Architecture

검색은:

```text
Firestore Query
```

기반으로 만들지 않는다.

```text
Search Catalog
↓
IndexedDB
↓
Memory Index
```

를 사용한다.

---

# 52. Search Pipeline

```text
학교명
↓
Normalize
↓
Alias
↓
Initials
↓
Rank
↓
Top Results
```

---

# 53. Search Ranking

순서:

```text
정확 학교명
축약명 정확
Alias 정확
공식명 Prefix
축약명 Prefix
Alias Prefix
초성 Prefix
부분 포함
초성 포함
제한적 Fuzzy
```

---

# 54. Search Network Rule

사용자의 키 입력:

```text
Firestore = 0
NEIS = 0
Kakao = 0
```

이어야 한다.

이 조건은 테스트에서 반드시 측정한다.

---

# 55. Search Cache

앱 초기화:

```text
IndexedDB Catalog
↓
Memory Index Build
```

Catalog가 존재하면 서버 확인보다 검색 가능 상태를 먼저 만든다.

---

# 56. Cache Layer

```text
L0 Memory

L1 IndexedDB

L2 Service Worker / Cache Storage

L3 Firebase
```

---

# 57. Cache Namespace

```text
employeeId
+
roleScope
+
sessionVersion
+
catalogVersion
```

기준으로 분리한다.

---

# 58. Sales Cache 보호

납품 Role에서는:

```text
Sales Catalog
Sales Summary
Assignments
```

를 다운로드하지 않는다.

---

# 59. School Detail Repository

데이터 순서:

```text
Memory
↓
IndexedDB
↓
Firestore
```

Cached Data가 있으면 즉시 표시하고 뒤에서 최신화한다.

---

# 60. Photo Pipeline

Storage:

```text
schools/{schoolId}/photos/{slotId}/{versionId}/
```

파일:

```text
thumbnail.webp
preview.webp
original.webp
```

---

# 61. Photo Slot

허용:

```text
01
02
03
```

4번째 Slot은 Server와 Rules 양쪽에서 거부한다.

---

# 62. Photo Upload Flow

```text
사진 선택/촬영
↓
Client 기본 Validation
↓
Temporary Upload
↓
Server Processing
↓
EXIF 제거
↓
Orientation 정리
↓
WebP 변환
↓
Thumbnail
↓
Preview
↓
Original
↓
Metadata Update
```

---

# 63. Photo Version

기존 파일 덮어쓰기 금지.

```text
v001
v002
v003
```

또는 UUID 기반 Version ID를 사용한다.

사진 삭제는 즉시 파일을 제거하지 않고 Metadata에 `deletedAt`, `deletedBy`, `deleteReason`을 기록하는 Soft Delete로 처리한다. UI는 짧은 Undo 기회를 제공하고, 실제 파일 정리는 관리자 보존 정책과 Audit 확인 뒤 별도 서버 작업으로 수행한다.

---

# 64. Photo Download

목록:

```text
Thumbnail
```

학교 상세:

```text
Preview
```

실제 고해상도 확대 시:

```text
Original
```

을 필요할 때만 가져온다.

---

# 65. 학교 현장정보

구현 대상:

```text
cafeteria location

building
floor

entrance
route

inspection time

cart required

elevator
stairs

vehicle access

unloading

parking

notes
```

---

# 66. Field Form

전체 Document Form 하나를 만들지 않는다.

Section 단위 편집을 지원한다.

```text
InspectionTimeSheet

CartSheet

LocationSheet

VehicleSheet

NotesSheet
```

---

# 67. Sales Cycle

경로:

```text
salesCycles/{YYYY-MM}
```

학교 배정:

```text
salesCycles/{YYYY-MM}/assignments/{schoolId}
```

---

# 68. 새 달

새 월 시작 시 기존 Assignment Document를 재사용하지 않는다.

새 Cycle을 생성한다.

선택적으로 이전 달 구역/담당 설정을 복사한다.

---

# 69. 유지 데이터

월이 변경돼도 유지:

```text
salesProfiles
interest
interestedProducts
communicationTags
visitHistory
followUp
```

---

# 70. Monthly 데이터

새 Cycle:

```text
zone
assignee
monthlyVisitStatus
brochure
sample
```

---

# 71. Sales Home 기본값

앱 진입:

```text
내 구역
```

전체 보기로 자동 진입하지 않는다.

---

# 72. 전체 보기

Sales User는 팀 전체 Read 가능.

다른 직원 기록 수정은 권한 규칙을 따른다.

---

# 73. 방문 기록

Function:

```text
recordSalesVisit()
```

을 사용한다.

필수값:

```text
visitedAt
visitedBy
brochureStatus
sampleStatus
interestScore
summary
```

---

# 74. 방문 완료

필수값이 모두 없으면 방문 완료 상태를 생성하지 않는다.

Client뿐 아니라 Server Schema에서도 검증한다.

---

# 75. 방문 실제 사용자

Client가 전달한:

```text
recordedBy
```

를 신뢰하지 않는다.

Server는 Authentication Context에서 기록자를 얻는다.

---

# 76. 담당자와 방문자

분리:

```text
primaryAssigneeId

visitedBy
```

한 직원이 다른 직원 담당 학교를 방문할 수 있다.

---

# 77. 제품 관심도

DB:

```text
0
20
40
60
80
100
```

UI:

```text
♡♡♡♡♡
♥♡♡♡♡
♥♥♡♡♡
♥♥♥♡♡
♥♥♥♥♡
♥♥♥♥♥
```

---

# 78. 관심도 0

UI:

```text
관심도 미확인
```

으로 표시한다.

`관심 없음`으로 자동 해석하지 않는다.

방문 폼의 초기 `미선택` 상태는 값이 없는 상태다. 사용자가 `관심도 미확인`을 직접 선택한 경우에만 `0`을 저장하며, 미선택 상태의 방문 완료 저장은 Client와 Server 모두 거부한다.

---

# 79. 방문 History

학교 상세 최초 진입:

```text
최근 3~5건
```

만 읽는다.

전체 History는 Pagination한다.

---

# 80. Follow-up

Sales Profile에 현재 후속 상태를 유지하고 Visit에는 당시 후속 정보를 기록한다.

다음 달에도 미완료 Follow-up은 보여야 한다.

---

# 81. Communication Tags

방문 활동 태그와 분리한다.

```text
communicationTags
```

는 학교 영업 Profile에 지속된다.

---

# 82. Activity Tags

```text
activityTags
```

는 특정 Visit Event에 연결한다.

---

# 83. CSV

Client가 전체 Firestore 데이터를 다운로드해서 CSV를 만들지 않는다.

```text
exportCsv()
```

Server Function을 사용한다.

---

# 84. CSV 권한

Server가:

```text
current uid
role
export permission
requested scope
```

를 검증한다.

---

# 85. CSV Encoding

한국 Excel 사용을 고려해:

```text
UTF-8 BOM
```

형식으로 생성한다.

---

# 86. NEIS

Runtime Search에서 사용 금지.

흐름:

```text
NEIS
↓
Sync
↓
Firestore
↓
Search Catalog
```

---

# 87. NEIS Sync

두 단계:

```text
previewNeisSchoolSync
↓
Diff

applyNeisSchoolSync
↓
실제 적용
```

---

# 88. NEIS 보호 영역

Sync가 수정 금지:

```text
schoolFieldProfiles
photos
salesProfiles
salesVisits
salesCycles
```

---

# 89. 교명 변경

같은 School Code:

```text
학교명 변경
```

이면:

```text
same schoolId
new name
old name → alias
```

로 처리한다.

---

# 90. NEIS Missing

한 번 누락:

```text
Hard Delete
```

하지 않는다.

```text
inactiveCandidate
```

처리.

---

# 91. Kakao Matching

순서:

```text
NEIS Address
↓
Kakao Address Search

School Name
↓
Kakao Keyword Search

↓
Candidate Scoring
```

---

# 92. Kakao Status

```text
unmatched
autoMatched
needsReview
confirmed
failed
```

---

# 93. Kakao Review

`needsReview`는 관리자 화면에서 확정한다.

관리자 Confirmed 위치는 자동 Sync보다 우선한다.

---

# 94. Kakao Secret

REST Key는 Client에 넣지 않는다.

Kakao Local 요청은 Server Function에서 수행한다.

---

# 95. PWA

MVP에서 구현:

```text
Manifest
App Icon
Standalone
Service Worker
App Shell Cache
Offline Boot
```

---

# 96. Service Worker

Phase 14에서 Serwist를 사용하되 급식길 요구에 맞는 명시적 Cache Allowlist와 사용자 승인형 업데이트 흐름을 적용한다.

Cache:

```text
app-shell
public-assets
school-thumbnails
```

민감 Sales API Response를 무분별하게 Cache하지 않는다.

`skipWaiting`에 의한 입력 중 강제 Reload와 Firebase API·Callable 응답·영업정보의 Runtime Cache는 금지한다.

---

# 97. PWA Update

새 Version 배포 시 입력 중인 Form을 강제로 Reload하지 않는다.

```text
새 버전이 준비되었습니다.

[업데이트]
```

방식을 기본으로 한다.

---

# 98. Offline MVP

반드시:

```text
App Shell
학교 검색
Cached School Detail
Cached Thumbnail
```

을 지원한다.

---

# 99. Offline Write

완전한 방문 기록 Offline Queue는 MVP 필수가 아니다.

네트워크 없음:

```text
작성 내용 유지
+
저장 재시도
```

방식부터 구현한다.

---

# 100. Design System 구현

첫 UI Phase에서 디자인 Token을 먼저 만든다.

```text
colors.css
spacing.css
radius.css
shadows.css
motion.css
typography.css
```

또는 하나의 Token 파일로 통합할 수 있다.

---

# 101. Pretendard

기본 글꼴:

```text
Pretendard Variable
```

Fallback System Font를 정의한다.

---

# 102. Material Hierarchy

```text
Background
→ Aurora Gradient

Navigation / Controls
→ Liquid Glass

Main Cards
→ Soft Solid

Photos
→ Content Layer
```

---

# 103. Status Rail

방문 상태 카드:

```text
왼쪽 Rail
+
Text Badge
```

전체 Card Background에 강한 상태색을 칠하지 않는다.

---

# 104. Motion

기본:

```text
160~220ms
```

Bottom Sheet:

```text
220~320ms
```

Photo Morph:

```text
250~400ms
```

실제 구현에서 체감 속도를 우선한다.

---

# 105. Reduced Motion

CSS:

```text
prefers-reduced-motion
```

을 지원한다.

Animation 비활성화 시 기능 손실이 없어야 한다.

---

# 106. Accessibility

최소:

```text
44 × 44px Touch Target
Keyboard Focus
Screen Reader Label
Non-color Status
Contrast
Reduced Motion
```

---

# 107. Error Model

공통 Server Error Code를 정의한다.

예:

```text
UNAUTHENTICATED
PERMISSION_DENIED
SESSION_INVALID
VALIDATION_FAILED
CONFLICT
NOT_FOUND
RATE_LIMITED
DUPLICATE_REQUEST
EXTERNAL_API_FAILED
INTERNAL
```

UI는 기술 Stack Trace를 표시하지 않는다.

---

# 108. Logging

Production Log에 넣지 않는다.

```text
PIN
PIN Hash
방문 Memo 전체
Sensitive Sales Data
Secret
```

---

# 109. Environment

최소 환경:

```text
local / emulator

production
```

필요 시:

```text
staging
```

을 추가한다.

---

# 110. Firebase Project 분리

Production 데이터와 개발 데이터는 동일 Project에서 테스트하지 않는다.

권장:

```text
development Firebase project
production Firebase project
```

자동 테스트는 Emulator 우선.

---

# 111. 환경 변수

Client 공개 설정과 Server Secret을 분리한다.

Client 예:

```text
NEXT_PUBLIC_FIREBASE_*
NEXT_PUBLIC_APP_CHECK_*
```

Server Secret:

```text
PIN_LOOKUP_SECRET
PIN_PEPPER
NEIS_API_KEY
KAKAO_REST_API_KEY
```

Server Secret을 `NEXT_PUBLIC_` 변수로 만들지 않는다.

---

# 112. Seed Data

개발용 Seed Script를 만든다.

```text
scripts/seed-emulator.ts
```

생성:

- Delivery User
- Sales A
- Sales B
- Admin
- Disabled User
- 학교 완전정보
- 학교 부분정보
- 신규 학교
- 교명 변경 학교
- Sales Visit
- Assignment

---

# 113. Seed 재현성

동일한 Seed Script를 실행하면 동일한 테스트 Scenario를 만들 수 있어야 한다.

수동 Console 입력에 의존하지 않는다.

---

# 114. 개발 Script

package.json에 최소 다음 Script를 둔다.

```text
dev
build
lint
typecheck

test
test:unit
test:rules
test:e2e

emulators
seed
```

---

# 115. CI Gate

향후 GitHub CI를 연결할 경우 최소:

```text
lint
↓
typecheck
↓
unit tests
↓
rules tests
↓
build
```

순서로 검사한다.

---

# 116. PHASE 0 — 프로젝트 Bootstrap

## 목표

개발 기반을 만든다.

## 작업

```text
Next.js App Router
TypeScript strict
CSS / Tailwind
Firebase SDK
Cloud Functions
Firebase CLI
Emulator
Testing
Git main branch / GitHub Actions CI
Node.js 22 / JDK 21
```

설정.

---

# 117. Phase 0 결과물

```text
앱 실행
Functions 빌드
Emulator 실행
Test 실행
Production Build
```

모두 성공.

아직 업무 기능은 구현하지 않는다.

---

# 118. Phase 0 Gate

PASS:

```text
npm run lint
npm run typecheck
npm test
npm run test:rules
npm run test:e2e
npm run functions:build
npm run build
```

성공.

Firebase Emulator 실행 가능.

---

# 119. PHASE 1 — Domain & Database Foundation

## 목표

UI보다 먼저 데이터 Contract를 확정한다.

## 구현

- Domain Types
- Enum
- Zod Schemas
- Firestore Path Helper
- Converter
- Seed Data
- Firestore Index Skeleton

---

# 120. Phase 1 중요 규칙

UI Component에 임시 데이터 Type을 따로 만들지 않는다.

Domain Type을 사용한다.

---

# 121. Phase 1 Gate

테스트:

```text
School Validation
Field Profile Validation
Interest Validation
Visit Validation
Cycle Validation
Photo Slot Validation
```

PASS.

---

# 122. PHASE 2 — Firebase Rules & Emulator

## 목표

기능보다 먼저 보안 경계를 만든다.

구현:

```text
firestore.rules
storage.rules
rules tests
```

---

# 123. Phase 2 테스트

Role별:

```text
Delivery
Sales
Viewer
Admin
Unauthenticated
```

Read / Write Matrix 자동 테스트.

특히:

```text
Delivery → Sales DENY
```

필수.

---

# 124. Phase 2 Gate

Security Rules Test:

```text
0 FAIL
```

전에는 다음 Phase 금지.

---

# 125. PHASE 3 — PIN Authentication

## 구현

```text
employeeLogin()
PIN Lookup
PIN Hash
Rate Limit
Lock
Custom Token
Persistent Auth
Auth Splash
Logout
sessionVersion
```

---

# 126. Phase 3 UI

```text
<AuthSplash>

<PinLogin>

<PinIndicator>

Logout
Session Invalid Screen
```

---

# 127. Phase 3 Gate

필수:

```text
PIN Login PASS

잘못된 PIN DENY

반복 실패 Lock

앱 종료 후 Login 유지

Logout 후 Login 요구

Disabled DENY

Session Revoke PASS
```

---

# 128. PHASE 4 — Design System & App Shell

구현:

```text
Aurora Background
SoftCard
GlassButton
SegmentedControl
SmartChip
StatusBadge
BottomSheet
FloatingContextBar
Toast
Skeleton
```

---

# 129. Phase 4 Navigation

Delivery:

```text
학교
설정
```

Sales:

```text
학교
활동
설정
```

복수 Role:

```text
Mode Segmented Control
```

---

# 130. Phase 4 Gate

다음 화면에서 디자인 일관성 확인:

```text
Login
Delivery Home
Sales Home
School Detail Shell
Settings
```

접근성 Touch Size도 검사.

---

# 131. PHASE 5 — NEIS Initial School Data

구현:

```text
NeisClient
Paging
Normalize
Validation
Daejeon Filter
Initial Import
School ID
Aliases
```

---

# 132. Phase 5 개발 순서

Production NEIS 연결 전 Emulator에서는 Fixture Data를 사용한다.

Fixture 테스트가 통과한 후 실제 API를 연결한다.

---

# 133. Phase 5 Gate

확인:

- 중복 School Code 없음
- School Name 존재
- schoolId 안정성
- 대상 학교급
- 대전 지역 Filter
- Import 실패 시 기존 DB 보존

---

# 134. PHASE 6 — Search Catalog

구현:

```text
SearchNormalizer
Korean Initials
Alias
Ranker
SearchCatalogRepository
IndexedDB
Memory Index
```

---

# 135. Phase 6 UI

```text
SearchInput
SchoolSearchResult
RecentSchool
```

---

# 136. Phase 6 Gate

필수:

```text
정확 검색
축약
초성
Alias
Fuzzy
```

PASS.

Network 확인:

```text
Typing 중 Network Request = 0
```

---

# 137. PHASE 7 — School Detail & Field Info

구현:

```text
School Detail
Field Summary
Inspection
Cart
Route
Elevator
Vehicle
Unloading
Parking
Notes
```

---

# 138. Phase 7 Mutation

```text
updateSchoolFieldProfile()
```

Function 사용.

Revision Conflict를 처리한다.

---

# 139. Phase 7 Cache

```text
Cache First
↓
Fresh Check
```

를 구현한다.

---

# 140. Phase 7 Gate

납품 직원 실제 Flow:

```text
검색
↓
학교
↓
검수시간
↓
대차
↓
급식실 위치
```

빠르게 확인 가능.

---

# 141. PHASE 8 — Photos

구현:

```text
PhotoGallery
PhotoViewer
Upload
Replace
Delete
Version
Processing
Thumbnail
Preview
Original
```

---

# 142. Phase 8 Viewer

지원:

```text
Swipe
Pinch
Double Tap
Close
1/3
Caption
```

---

# 143. Phase 8 Gate

- 최대 3장
- 4장 거부
- Viewer 정상
- Version 교체
- Delivery/Sales 조회
- Viewer Upload DENY
- 비로그인 DENY
- Original 자동 다운로드 없음

---

# 144. PHASE 9 — Sales Cycle & Assignment

구현:

```text
salesCycles
assignments
monthly view
own zone
whole team
```

---

# 145. Phase 9 기본 UX

Sales 진입:

```text
내 구역
```

이어야 한다.

---

# 146. Phase 9 관리자

최소:

```text
Cycle 생성
Assignment 생성
담당 변경
```

서버 기능까지 구현.

복잡한 관리자 디자인은 후반 Phase에서 보완할 수 있다.

---

# 147. Phase 9 Gate

A/B/C 직원 Seed를 사용해:

```text
각자의 내 구역
+
전체 보기
```

정확하게 구분.

---

# 148. PHASE 10 — Sales Visit

구현:

```text
Visit Bottom Sheet
Brochure
Sample
Interest
Visit Summary
Activity Tags
Follow-up
```

---

# 149. Phase 10 Interest UI

```text
HeartInterestSelector
```

구현.

DB는 discrete score 유지.

---

# 150. Phase 10 저장

```text
recordSalesVisit()
```

서버가:

```text
visit
salesProfile
assignmentSummary
stats
audit
```

를 일관성 있게 갱신한다.

---

# 151. Phase 10 Idempotency

저장 버튼 Double Tap으로 같은 Visit가 두 번 생성되지 않아야 한다.

---

# 152. Phase 10 Gate

실제 시나리오:

```text
학교
↓
방문기록
↓
홍보지
↓
샘플
↓
♥♥♥♡♡
↓
결과
↓
후속
↓
저장
```

PASS.

---

# 153. PHASE 11 — Sales History & Collaboration

구현:

```text
Visit Timeline
Recent Visits
Whole Team
Communication Tags
Next Action
Follow-up
```

---

# 154. Phase 11 Permission

다른 직원:

```text
Read
```

허용.

임의 Edit:

```text
DENY
```

---

# 155. Phase 11 Gate

Sales A가 Sales B 학교를 열어 과거 방문을 볼 수 있지만 B의 기록을 임의 수정할 수 없어야 한다.

---

# 156. PHASE 12 — CSV

구현:

```text
Filter
Export Preview
exportCsv()
exportJobs
CSV
Audit
```

---

# 157. Phase 12 Gate

확인:

- UTF-8 BOM
- 한글 정상
- Filter 반영
- 자신의 Scope
- Team Permission
- Audit
- 중복 Export 방지

---

# 158. PHASE 13 — NEIS Sync & Kakao

NEIS:

```text
Preview
Diff
Apply
Audit
```

Kakao:

```text
Address
Keyword
Match
Review
Confirm
Directions
```

---

# 159. Phase 13 NEIS Safety Gate

다음 테스트는 반드시 수행한다.

```text
교명 변경
주소 변경
신규 학교
학교 누락
대량 누락
```

그리고:

```text
현장정보
사진
Sales
```

가 보존되는지 확인.

---

# 160. Phase 13 Kakao Gate

```text
정확 Match
다중 후보
타 지역 후보
API Failure
Manual Confirm
길안내
```

PASS.

---

# 161. PHASE 14 — PWA & Offline

구현:

```text
Manifest
Icons
Service Worker
App Shell
Offline Boot
Offline Search
Cached Detail
Update Flow
```

---

# 162. Phase 14 Cache Security

Sales Cache가 다른 User/Role에 노출되지 않아야 한다.

---

# 163. Phase 14 Gate

Network 차단:

```text
앱 실행
↓
학교 검색
↓
이전에 본 학교 확인
```

PASS.

---

# 164. PHASE 15 — 관리자 화면

최종 Admin 기능:

```text
직원 관리
PIN 관리
Role
Session Revoke

월별 Cycle
Assignments

학교 Sync
Kakao Review

CSV

Audit

App Settings
```

---

# 165. 관리자 Desktop

PC 우선 Master/Detail 또는 Table 기반으로 구현한다.

현장 모바일 화면보다 정보 밀도를 높여도 된다.

---

# 166. PHASE 16 — Performance Hardening

측정:

```text
App Boot
Search
School Detail
Image
Firestore Reads
Cache Hits
```

---

# 167. Performance Gate

목표:

```text
학교 검색
체감 100ms 이내

Cached Detail
약 200ms 내 핵심정보

앱 재실행
기본 UI 약 1초 수준 목표
```

절대 수치보다 저사양 모바일에서 실제 체감 성능을 우선한다.

---

# 168. PHASE 17 — Full Acceptance Test

`테스트·인수 기준서`의 전체 P0/P1 항목을 실행한다.

---

# 169. Security Regression

다시:

```text
Delivery → Sales
```

접근 공격.

```text
employeeId 변조

role 변조

Storage 직접 접근

Audit 변조

Auth Credential 접근
```

전부 테스트.

---

# 170. PHASE 18 — Pilot

실제 내부 직원:

```text
납품 1~2명
홍보 1~2명
관리자 1명
```

규모의 Pilot을 권장한다.

---

# 171. Pilot 우선 관찰

- 학교 검색
- 사진
- 검수시간
- 대차
- 내 구역
- 방문 기록
- 하트 관심도
- 로그인 유지
- 느린 네트워크
- 버튼 크기

---

# 172. Pilot 수정 원칙

```text
업무 차단
→ 즉시 수정

반복 불편
→ Production 전 수정

디자인 미세조정
→ v1.1 후보
```

---

# 173. Production Gate

Production 전:

```text
P0 = 0

핵심 P1 = 0

Rules Test PASS

Functions Test PASS

Build PASS

E2E PASS

Offline PASS

Pilot PASS
```

이어야 한다.

---

# 174. Codex 작업 방식

**Codex에게 전체 구현을 한 Prompt로 요청하지 않는다.**

금지 예:

> “이 설계서대로 급식길을 전부 만들어줘.”

---

# 175. 올바른 Codex 단위

예:

```text
Phase 3 — PIN Authentication만 구현한다.

관련 문서:
- 인증·권한·보안 설계서 v1.3
- 구현 명세서 Phase 3
- 테스트·인수 기준서 인증 영역

다른 업무 기능은 구현하지 않는다.
```

---

# 176. Codex Prompt 기본 Template

각 Phase는 다음 형식을 사용한다.

```text
급식길 PWA의 Phase [번호]를 구현해줘.

이번 작업 범위:
[구체적 Scope]

반드시 준수할 설계:
[관련 문서]

이번 Phase 밖의 기능은 구현하지 말 것.

구현 후 반드시:
1. 변경한 파일 목록
2. 구현 내용
3. 실행한 테스트
4. 테스트 결과
5. 보안 영향
6. 성능 영향
7. 남은 문제
8. 다음 Phase에 영향을 주는 사항

을 보고해줘.

lint, typecheck, 관련 test를 실행하고
실패가 있다면 완료했다고 보고하지 말 것.
```

---

# 177. Codex의 임의 결정 제한

다음 영역은 Codex가 임의 변경하지 않는다.

```text
권한 구조

DB Collection 이름

PIN 로그인 구조

학교 현장정보 범위

Sales 데이터 범위

하트 관심도 값

월별 Assignment 구조

사진 최대 개수

NEIS 데이터 소유 범위

Cache Security
```

변경 필요성이 발견되면:

```text
변경 제안
이유
영향 범위
```

까지만 보고한다.

설계를 조용히 변경하지 않는다.

---

# 178. Codex가 허용되는 자율 결정

다음은 동일 요구사항을 만족한다면 Codex가 합리적으로 결정할 수 있다.

- 작은 Utility 함수 배치
- Component 내부 파일 분할
- Local 변수명
- Test Helper
- Styling 세부 구현
- 내부 Hook 구성
- Build Optimization

---

# 179. Phase 완료 보고 Format

```text
## Phase

Phase 6 — Search

## 변경 파일

...

## 구현

...

## 테스트

Unit: 18 PASS
Rules: 해당 없음
E2E: 4 PASS

## Security Impact

...

## Performance Impact

...

## Known Issues

없음

## 다음 Phase 참고사항

...
```

---

# 180. Git 작업 원칙

한 Phase에 너무 많은 목적을 섞지 않는다.

Commit 역시 기능 단위로 분리한다.

예:

```text
feat(auth): add PIN custom-token login

test(auth): add emulator auth tests

feat(search): add local school index
```

---

# 181. Critical Path에 TODO 금지

다음과 같은 상태로 Phase 완료 처리하지 않는다.

```text
TODO: 나중에 권한 검사

TODO: 나중에 중복 방지

TODO: 실제 API 연결

TODO: 테스트 작성
```

Phase의 핵심 조건이면 Phase 안에서 완료한다.

---

# 182. Mock 사용 원칙

초기 Phase에서는 외부 API와 일부 Firebase 기능을 Mock할 수 있다.

그러나 해당 기능 Phase의 Gate에서는 실제 Emulator 또는 실제 API Sandbox/Development 환경으로 확인한다.

---

# 183. Production 데이터 사용 금지

개발 중:

```text
실제 직원 PIN
실제 홍보 기록
실제 Production 학교 사진
```

을 테스트용으로 사용하지 않는다.

---

# 184. Security Review 원칙

다음 변경 시 Security Regression Test 필수:

```text
Collection 추가

Role 변경

Storage 경로 추가

Functions 추가

CSV 변경

Cache 변경

Authentication 변경
```

---

# 185. Database Migration

Schema 변경이 발생하면 앱 코드만 수정하지 않는다.

필요한 경우:

```text
Migration Script
Migration Test
Rollback Plan
```

을 만든다.

---

# 186. Schema Version

필요 시:

```text
schemaVersion
```

을 App Settings에서 관리한다.

큰 구조 변경 시 구버전 Client를 차단할 수 있어야 한다.

---

# 187. App Version

Build Version을 노출한다.

설정:

```text
급식길
Version 1.0.0
```

관리/오류 대응에 사용한다.

---

# 188. 최소 Version

필요하면:

```text
minimumAppVersion
```

을 Server Settings에서 관리한다.

중요한 보안 변경 시 구버전 앱 사용을 차단한다.

---

# 189. Observability

초기 MVP에서 최소한 다음은 확인 가능해야 한다.

```text
Function Errors
Login Lock
NEIS Sync Failure
Kakao Failure
CSV Failure
Photo Processing Failure
```

---

# 190. 사용자 업무정보 Log 최소화

Analytics 또는 Error Log에:

```text
학교 방문 결과 문장
개인 커뮤니케이션 참고
PIN
```

같은 내용을 넣지 않는다.

---

# 191. 최종 Component 목록

핵심:

```text
AuthSplash
PinLogin
PinIndicator

AppShell
Header
BottomNavigation

ModeSegmentedControl

SearchInput
SchoolCard
SchoolStatusRail

SoftCard
GlassButton
SmartChip
StatusBadge

FieldInfoSummary
FieldEditSheet

PhotoGallery
PhotoViewer
PhotoUploader

SalesSummary
HeartInterestSelector

VisitForm
VisitTimeline

BottomSheet
FloatingContextBar

FilterSheet

Toast
Skeleton
EmptyState
ErrorState

AdminTable
```

---

# 192. 최종 Client Service 목록

```text
AuthService

SearchService

CatalogService

CacheService

SchoolService

PhotoService

SalesService

ExportService

NetworkService

SyncCoordinator
```

---

# 193. 최종 Server Function 목록

MVP 예상:

```text
employeeLogin

adminCreateEmployee
adminUpdateEmployee
adminResetPin
adminDisableEmployee
adminUpdateRoles
adminRevokeSessions

updateSchoolFieldProfile

preparePhotoUpload
finalizePhotoUpload
deleteSchoolPhoto

createSalesCycle
updateAssignment

recordSalesVisit
updateSalesProfile

exportCsv

previewNeisSchoolSync
applyNeisSchoolSync

matchSchoolWithKakao
confirmKakaoMatch
retryKakaoMatch
```

구현 과정에서 동일 책임의 함수는 합리적으로 통합할 수 있다.

---

# 194. 최종 보안 Architecture

```text
PIN
↓
Cloud Function + App Check
↓
PIN Verification
↓
Custom Token
↓
Firebase Auth
↓
Role / Session
↓
Firestore / Storage Rules
↓
Repository
↓
UI
```

App Check는 Callable Functions에서 Enforcement할 수 있고, Security Rules는 Firebase Authentication Token과 Claims를 이용한 데이터 접근 제어를 지원한다. citeturn766162search0turn766162search3turn766162search4

---

# 195. 최종 Search Architecture

```text
NEIS
↓
Firestore
↓
Search Catalog
↓
IndexedDB
↓
Memory
↓
사용자 입력
```

검색 입력 시 외부 API 호출 없음.

---

# 196. 최종 학교 상세 Architecture

```text
School Base
+
School Field Profile
+
Photos
```

Sales Role:

```text
+
Sales Profile
+
Monthly Assignment
+
Recent Visits
```

---

# 197. 최종 Photo Architecture

```text
Upload
↓
Temporary
↓
Process
↓
Thumbnail
Preview
Original
↓
Versioned Storage
↓
Metadata
```

---

# 198. 최종 Sales Architecture

```text
Persistent Sales Profile
+
Monthly Assignment
+
Immutable-style Visit History
```

현재 상태와 과거 Event를 구분한다.

---

# 199. 최종 Sync Architecture

```text
NEIS
↓
Staging
↓
Normalize
↓
Diff
↓
Preview
↓
Apply
```

Kakao:

```text
Address
+
Keyword
↓
Match Score
↓
Auto / Review / Confirm
```

---

# 200. 실제 개발 시작 순서

Codex 작업 순서는 다음을 고정한다.

```text
00 Bootstrap

01 Domain / DB Contract

02 Security Rules

03 PIN Authentication

04 Design System / App Shell

05 NEIS Initial Data

06 Local Search / Catalog

07 School Field Info

08 Photos

09 Sales Cycle / Assignment

10 Sales Visit / Interest

11 History / Team Collaboration

12 CSV

13 NEIS Sync / Kakao

14 PWA / Offline

15 Admin

16 Performance Hardening

17 Full Acceptance Test

18 Pilot
```

특별한 이유가 없다면 순서를 건너뛰지 않는다.

---

# 201. 개발 중 가장 위험한 영역

우선적으로 코드 리뷰해야 하는 부분:

```text
1. Authentication
2. Security Rules
3. sessionVersion
4. Sales Permission
5. Photo Permission
6. Visit Transaction
7. NEIS Apply
8. Cache Role Isolation
```

UI Animation보다 이 영역을 먼저 안정화한다.

---

# 202. MVP에서 의도적으로 제외

다음은 이번 구현 범위가 아니다.

```text
GPS 직원 추적

실시간 직원 위치

직원 실적 순위

완전한 Offline Write Queue

복잡한 지도 Dashboard

4장 이상의 학교 사진

Push Notification 시스템

AI 자동 영업 분석

복잡한 CRM

고객 외부 로그인

학교 관계자 로그인

Gamification
```

---

# 203. 구현 완료의 정의

MVP 구현 완료는:

```text
코드가 존재한다
```

가 아니다.

다음 모두 만족해야 한다.

```text
기획 충족
+
Type Safe
+
Security Rules
+
Server Validation
+
Automated Test
+
User Flow Test
+
Performance
+
Offline
+
Pilot
```

---

# 204. Codex 최종 Release 보고

MVP 완료 시 Codex는 다음 보고서를 작성해야 한다.

```text
# 급식길 MVP Release Report

구현 기능

미구현 기능

주요 Architecture

Firebase Collections

Cloud Functions

Security Rules

테스트 결과

P0
P1
P2

성능 결과

Offline 결과

Known Issues

Deployment 정보

Rollback 방법

운영 시 주의사항
```

---

# 205. 구현 명세 한 줄 정의

> **급식길은 Next.js 기반 PWA와 Firebase를 사용하되, UI·Repository·Server의 책임을 명확히 분리하고, PIN 인증과 역할 기반 보안, 로컬 학교검색, 학교 현장정보, 버전형 사진, 월별 홍보 업무, 방문기록, 외부 데이터 동기화를 Phase 단위로 구현·검증하여 실제 현장 사용이 가능한 상태에 도달하도록 개발한다.**

---

# 206. 문서 상태

본 문서는 **급식길 PWA 구현 명세서 v1.1**이다.

본 문서 작성으로 MVP 개발 착수에 필요한 핵심 사전 문서는 모두 준비된 것으로 본다.

문서 정규화는 2026-08-23 완료했으며 다음 단계는:

```text
Codex Phase 0 시작
```

순서로 진행한다.

구현 중 설계 변경이 발생하면 관련 상세 설계서를 먼저 수정한 뒤 본 구현 명세의 Version을:

```text
v1.1
v1.2
```

순으로 갱신한다.
