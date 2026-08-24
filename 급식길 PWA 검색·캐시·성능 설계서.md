# 급식길 PWA 검색·캐시·성능 설계서

**문서 버전:** 1.1  
**대상:** 급식길 PWA MVP  
**관련 문서:** MVP 기획서 v1.3 / 데이터베이스 상세 설계서 v1.3 / 인증·권한·보안 설계서 v1.3 / 디자인 시스템 v1.0 / 화면·UX 상세 명세서 v1.2

---

# 1. 문서 목적

본 문서는 급식길의 다음 기술 영역을 정의한다.

- 학교명 검색 구조
- 한글 초성·별칭 검색
- 검색 Ranking
- 검색 Catalog
- Memory Cache
- IndexedDB
- Firestore Cache
- Service Worker
- PWA App Shell Cache
- 학교 상세정보 Cache
- 사진 Thumbnail / Preview / Original 전략
- 역할별 Cache 분리
- 로그인 지속과 Cache 연계
- Offline 조회
- Network 복구
- 데이터 최신화
- Cache 무효화
- Firestore Read 최소화
- 체감 성능 목표
- 성능 테스트 기준

핵심 목표는 다음과 같다.

> **사용자가 학교명을 입력하는 순간에는 네트워크 요청이 발생하지 않아야 하며, 이미 본 학교 정보는 네트워크 상태와 관계없이 가능한 한 즉시 표시되어야 한다.**

---

# 2. 최상위 성능 원칙

급식길의 체감 성능은 다음 순서를 따른다.

```text
즉시 화면 반응
↓
로컬 데이터 표시
↓
필요한 경우 서버 최신정보 확인
↓
변경 데이터만 갱신
```

사용자가 서버 응답을 기다린 뒤 화면을 보는 구조를 기본으로 하지 않는다.

---

# 3. Cache 계층 구조

급식길은 하나의 Cache만 사용하지 않는다.

다음 4개 계층을 사용한다.

```text
L0
Memory

L1
IndexedDB

L2
Service Worker / Cache Storage

L3
Firestore + Cloud Storage
```

각 계층의 역할을 명확하게 분리한다.

---

# 4. L0 — Memory Cache

현재 앱 실행 중 가장 빠르게 접근하는 데이터다.

포함:

- 학교 검색 Index
- 최근 검색 결과
- 현재 학교 상세 Summary
- 현재 월 홍보 Assignment 요약
- 현재 사용 중인 필터
- 최근 조회한 학교 몇 개
- 현재 화면에서 필요한 사진 Object URL

특징:

```text
가장 빠름
↓
앱 종료 시 제거 가능
```

학교명 검색은 이 계층에서 수행한다.

---

# 5. L1 — IndexedDB

앱을 종료했다 다시 실행해도 유지할 구조화된 로컬 데이터다.

IndexedDB는 브라우저에서 비교적 큰 구조화 데이터를 저장하고 Index를 이용해 검색할 수 있는 비동기 저장소다. citeturn739907view4

급식길에서는 자체 검색 Catalog와 일부 업무 Cache 저장에 사용한다.

---

# 6. L2 — Service Worker / Cache Storage

Service Worker는 네트워크 요청을 가로채 Cache된 Asset을 우선 제공하는 Offline First 구조에 사용할 수 있다. citeturn739907view2

급식길에서는 주로 다음을 담당한다.

- HTML App Shell
- JavaScript Bundle
- CSS
- Pretendard 관련 Web Asset
- 아이콘
- Manifest
- 정적 이미지
- 일부 안전한 Thumbnail Cache

업무 데이터 전체를 무분별하게 Cache Storage에 저장하지 않는다.

---

# 7. L3 — Firestore / Storage

최종 Source of Truth다.

```text
Cloud Firestore
→ 구조화된 업무 데이터

Cloud Storage
→ 학교 사진
```

Local Cache가 존재하더라도 최종 데이터 원본은 Firebase Backend다.

---

# 8. 검색의 핵심 원칙

사용자가 다음처럼 입력할 때:

```text
둔
둔산
둔산초
대전둔산초
ㄷㅈㄷㅅㅊ
```

각 키 입력마다 Firestore Query를 수행하지 않는다.

금지 구조:

```text
키 입력
↓
Firestore Query
↓
검색 결과
```

채택 구조:

```text
키 입력
↓
Memory Search Index
↓
즉시 검색 결과
```

---

# 9. 학교 검색 데이터 흐름

```text
NEIS / 관리자 학교 데이터
↓
Firestore schools
↓
Search Catalog 생성
↓
IndexedDB 저장
↓
앱 시작 시 Memory 적재
↓
로컬 검색
```

Search Catalog는 학교 전체 Document보다 훨씬 작게 유지한다.

---

# 10. Search Catalog 목적

학교 검색 화면에서 필요한 정보만 포함한다.

예:

```text
schoolId
name
shortName
normalizedName
initials
aliases
schoolType
district
status
fieldInfoAvailable
photoCount
```

홍보 역할에서는 추가로 별도 Sales Catalog를 조합할 수 있다.

---

# 11. 학교 Search Catalog 예시

개념:

```text
{
  schoolId: "SCH-NEIS-1234567",

  name: "대전둔산초등학교",
  shortName: "둔산초",

  normalizedName: "대전둔산초등학교",

  initials: "ㄷㅈㄷㅅㅊㄷㅎㄱ",

  aliases: [
    "둔산초",
    "대전둔산초"
  ],

  schoolType: "elementary",

  district: "seo",

  photoCount: 3,

  fieldInfoAvailable: true
}
```

Catalog에는 긴 메모나 방문 기록을 포함하지 않는다.

---

# 12. 문자열 정규화

사용자 검색어와 학교 데이터를 동일한 방식으로 정규화한다.

예:

```text
공백 제거
대소문자 통일
불필요한 특수문자 제거
한글 Unicode 정규화
학교명 축약어 생성
초성 생성
```

예:

```text
"대전 둔산 초등학교"
→ "대전둔산초등학교"
```

---

# 13. 학교명 축약

학교명에서 일반적인 학교급 표현을 축약한 별칭을 생성한다.

예:

```text
대전둔산초등학교
→ 둔산초

대전탄방중학교
→ 탄방중

대전괴정고등학교
→ 괴정고
```

단, 자동 생성 결과가 실제 학교명과 충돌하면 관리자 Alias를 우선한다.

---

# 14. 초성 검색

학교명에서 한글 초성을 생성한다.

예:

```text
대전둔산초등학교
→ ㄷㅈㄷㅅㅊㄷㅎㄱ
```

사용자:

```text
ㄷㅈㄷㅅㅊ
```

입력 시 해당 학교를 찾을 수 있어야 한다.

초성 검색은 서버 Query가 아니라 Local Index에서 처리한다.

---

# 15. Alias

학교에는 별도 검색 별칭을 가질 수 있다.

예:

```text
대전둔산초등학교

aliases:
둔산초
대전둔산초
둔산초등
```

Alias는 학교 공식명을 변경하지 않는다.

검색 편의를 위한 데이터다.

---

# 16. 검색 Ranking

검색 결과는 다음 순서로 점수를 부여한다.

```text
1. 공식 학교명 정확 일치
2. 축약명 정확 일치
3. Alias 정확 일치
4. 공식명 Prefix
5. 축약명 Prefix
6. Alias Prefix
7. 초성 Prefix
8. 문자열 포함
9. 초성 포함
10. 제한적 Fuzzy Match
```

정확도가 높은 결과를 항상 위에 둔다.

---

# 17. Ranking 예시

검색어:

```text
둔산초
```

결과:

```text
1. 대전둔산초등학교
2. 대전둔산여자고등학교
3. 대전둔원초등학교
```

정확한 축약어 일치를 가장 높은 점수로 둔다.

---

# 18. Fuzzy Search

오타 보정은 보조 기능이다.

예:

```text
둔산쵸
```

입력 시:

```text
대전둔산초등학교
```

를 후보로 표시할 수 있다.

그러나 지나친 Fuzzy Search로 전혀 다른 학교가 위에 나타나서는 안 된다.

MVP에서는 짧은 편집 거리 기반의 제한적 보정만 사용한다.

---

# 19. 검색 결과 수

초기 표시:

```text
최대 8~12개
```

정도로 제한한다.

사용자가 더 많은 결과를 원할 경우 Scroll한다.

수백 개 결과를 한 번에 DOM에 렌더링하지 않는다.

---

# 20. 검색 Debounce

학교 수가 수백 개 수준이고 검색이 Memory에서 이루어지므로 긴 Debounce를 사용하지 않는다.

금지 예:

```text
입력 후 300ms 대기
```

권장:

```text
즉시 또는 0~50ms
```

실제 저사양 모바일 성능 테스트 결과에 따라 조정한다.

---

# 21. 검색 성능 목표

MVP 목표:

```text
키 입력
→ 검색 계산 50ms 이내 목표

사용자 체감 결과 표시
→ 100ms 이내 목표
```

이는 서비스 설계 목표이며 브라우저·기기 성능에 따라 달라질 수 있다.

---

# 22. 검색 Catalog 다운로드

로그인 직후 모든 학교 상세정보를 받지 않는다.

다운로드 우선순위:

```text
1. Search Catalog
2. 현재 역할 Catalog
3. 현재 월 Assignment Catalog
4. 실제 선택한 학교 Detail
```

---

# 23. Catalog Version

Search Catalog에는 Version을 부여한다.

예:

```text
catalogVersion: 184
```

앱의 IndexedDB:

```text
catalogVersion: 183
```

서버:

```text
184
```

이면 최신 Catalog를 가져온다.

같으면 전체 Catalog를 다시 다운로드하지 않는다.

---

# 24. Catalog Meta

가벼운 Metadata Document:

```text
appSettings/public
```

또는 별도:

```text
catalogMeta/current
```

에서 다음 값을 제공한다.

```text
commonCatalogVersion
fieldCatalogVersion
salesCatalogVersion
assignmentCatalogVersion
updatedAt
```

앱은 먼저 Meta만 확인한다.

---

# 25. Catalog 분할

대전 학교 전체 규모에서는 하나의 Catalog도 충분할 가능성이 높지만, 문서 크기와 업데이트 범위를 줄이기 위해 필요하면 행정구 단위로 분할한다.

예:

```text
common:dong
common:jung
common:seo
common:yuseong
common:daedeok
```

Firestore 단일 Document 최대 크기 한계에 근접하지 않도록 충분히 여유를 둔다.

권장 내부 목표:

```text
Catalog 1개
약 300KB 이하
```

---

# 26. Common Search Catalog

모든 직원에게 제공 가능하다.

포함:

- schoolId
- 학교명
- 축약명
- Alias
- 초성
- 학교급
- 행정구
- 주소 요약
- 사진 존재 여부
- 현장정보 등록 여부

홍보정보는 포함하지 않는다.

---

# 27. Field Catalog

학교 현장정보를 빠르게 요약하는 Catalog다.

포함 가능:

```text
cartRequired
inspectionStart
inspectionEnd
cafeteriaLocationShort
photoCount
fieldCompleteness
```

납품과 홍보 모두 사용할 수 있다.

---

# 28. Sales Catalog

홍보·영업 사용자에게만 제공한다.

포함:

```text
schoolId

interestScore

monthlyVisitStatus

primaryAssigneeId

latestVisitDate

followUpRequired

followUpDue
```

긴 방문 메모나 모든 Visit History는 넣지 않는다.

---

# 29. Monthly Assignment Catalog

홍보 사용자가 `내 구역` 화면을 즉시 볼 수 있도록 현재 월의 가벼운 Assignment Snapshot을 유지한다.

예:

```text
cycleId
schoolId
zoneId
primaryAssigneeId
assigneeIds
status
```

---

# 30. 역할별 Catalog 조합

### 납품

```text
Common Catalog
+
Field Catalog
```

### 홍보·영업

```text
Common Catalog
+
Field Catalog
+
Sales Catalog
+
Current Month Assignment Catalog
```

홍보 역할은 납품에 필요한 학교 현장정보까지 사용할 수 있다.

---

# 31. 납품 기기에 홍보 Catalog 저장 금지

납품 역할로 인증한 사용자는 다음 Catalog를 요청하지 않는다.

```text
Sales Catalog
Assignment Catalog
```

UI에서 사용하지 않는 정도가 아니라 Network 요청 자체가 없어야 한다.

Security Rules에서도 접근을 차단한다.

---

# 32. 로그인 지속과 Cache

급식길은 정상 로그인 후 앱을 종료해도 인증 상태를 유지한다.

Firebase Web Auth의 `LOCAL` 지속성은 브라우저 창을 닫아도 인증 상태를 유지하며 명시적인 Sign-out 시 제거되는 방식이다. citeturn739907view3

따라서 앱 재실행 시 다음 흐름을 사용한다.

```text
앱 실행
↓
기존 Auth 확인
↓
Role 확인
↓
현재 Cache Namespace 확인
↓
Catalog Load
↓
업무 화면
```

---

# 33. Cache Namespace

사용자 데이터 Cache는 다음 요소를 조합해 구분한다.

```text
geupsikgil:
{employeeId}:
{roleScope}:
{sessionVersion}:
{catalogVersion}
```

예:

```text
geupsikgil:
EMP001:
sales:
8:
184
```

---

# 34. 역할 변경

예:

```text
sales
→
delivery
```

권한 변경 시:

```text
sessionVersion 변경
↓
기존 Sales Cache 무효화
↓
재로그인
↓
Delivery Cache 생성
```

홍보 데이터가 납품 역할에서 계속 남아 표시되지 않도록 한다.

---

# 35. 로그아웃 Cache 처리

명시적 로그아웃 시:

- Memory Cache 제거
- 현재 사용자 검색 History 정책에 따른 제거
- 홍보 관련 IndexedDB 제거
- 사진 임시 Object URL 제거
- 민감한 미완료 Form 제거

공용 기기에서는 사용자별 Persistent Cache를 더 적극적으로 제거한다.

---

# 36. Firestore 자체 Offline Cache

현재 Firebase Web SDK에서는 Firestore Web Offline Persistence가 기본적으로 꺼져 있고 Memory Cache가 기본이며, 필요할 경우 Persistent Local Cache를 명시적으로 설정할 수 있다. Firebase는 Web Persistent Cache가 세션 사이에 자동으로 지워지지 않으므로 민감 데이터를 다룰 때 신뢰할 수 있는 기기인지 고려해야 한다고 안내한다. citeturn867876view0turn867876view1

따라서 급식길은 Firestore Persistent Cache를 무조건 전 사용자에게 활성화하지 않는다.

---

# 37. Firestore Cache 정책

## 개인 기기

Persistent Local Cache 사용을 검토할 수 있다.

적용 후보:

- 학교 기본정보
- 학교 현장정보

MVP에서는 개인 기기라도 홍보·영업정보(`salesProfiles`, `salesVisits`, 커뮤니케이션 참고, 후속 업무)는 Firestore Persistent Cache 또는 자체 IndexedDB에 저장하지 않고 Memory Cache만 사용한다.

## 공용 기기

기본적으로 Memory Cache를 우선한다.

홍보 민감 데이터의 Persistent Firestore Cache는 사용하지 않는다.

---

# 38. 자체 IndexedDB와 Firestore Cache 역할 구분

둘을 중복해서 무작정 사용하지 않는다.

### 자체 IndexedDB

우리가 직접 구조와 수명을 통제해야 하는:

- Search Catalog
- Search Alias
- 최근 학교
- UI용 Summary
- Version Metadata

### Firestore Cache

Firestore Document 조회 시 SDK에서 관리하는 보조 Cache.

검색 시스템의 핵심을 Firestore Local Query에 의존하지 않는다.

---

# 39. 검색을 Firestore Offline Query로 하지 않는 이유

Firestore는 Persistent Cache에서 Offline Query를 지원하지만, 공식 문서상 기본적으로 로컬 Cache의 Document를 스캔할 수 있으며 많은 Cache 데이터에서는 별도 Local Index 설정이 성능에 영향을 줄 수 있다. citeturn739907view0

급식길 학교 검색은 Dataset이 작고 검색 규칙이 명확하므로 자체 Search Catalog가 더 예측 가능하다.

---

# 40. 학교 상세 조회

학교 검색 결과를 선택하면 다음 순서로 정보를 표시한다.

```text
Memory
↓
IndexedDB Cache
↓
Firestore
```

---

# 41. 학교 상세 Cache-First

사용자가 이전에 본 학교라면:

```text
0단계
Memory Cache 확인

1단계
IndexedDB Cache 표시

2단계
Firestore 최신 Version 확인

3단계
변경되었으면 화면 갱신
```

사용자가 서버 응답 전까지 빈 화면을 보지 않게 한다.

---

# 42. 학교 상세 Freshness

각 Cached Detail에 다음 값을 둔다.

```text
schoolId
revision
cachedAt
updatedAt
```

서버 Revision이 동일하면 상세 전체를 다시 처리할 필요가 없다.

---

# 43. school revision

학교 현장정보 변경 시:

```text
revision
15
→
16
```

형태의 Version 값을 증가시킨다.

사진 교체나 현장정보 변경도 별도 Version을 가질 수 있다.

---

# 44. stale-while-revalidate 개념

급식길 상세화면의 기본 철학:

```text
Stale
→ 먼저 보여줌

Revalidate
→ 뒤에서 최신 확인

Changed
→ 조용히 갱신
```

사용자가 이미 알고 있던 데이터를 우선 보여주는 대신 최신 여부를 별도로 확인한다.

---

# 45. Cached Data 표시

Cache 데이터가 표시된 순간 사용자에게 매번:

```text
캐시된 데이터
```

라고 경고하지 않는다.

다만 Offline일 경우에는:

```text
오프라인 · 저장된 정보를 표시하고 있습니다.
```

를 제공한다.

---

# 46. 데이터 최신화 표시

서버 갱신이 완료되면 대부분 별도 Toast를 띄우지 않는다.

중요한 현장정보가 현재 화면에서 변경된 경우에만 필요하면:

```text
최신 정보로 업데이트되었습니다.
```

정도의 조용한 표시를 사용할 수 있다.

---

# 47. Real-time Listener 원칙

모든 학교와 모든 방문 기록에 실시간 Listener를 열지 않는다.

Listener 대상 후보:

- 현재 보고 있는 학교
- 현재 월의 작은 Assignment Summary
- 앱 Version / Catalog Meta

정도로 제한한다.

---

# 48. 실시간 Listener 금지 대상

다음 전체 데이터에 항상 Listener를 걸지 않는다.

```text
전체 학교 Detail
전체 Sales Visit History
전체 사진 Metadata
전체 직원 활동
전체 과거 월
```

불필요한 Firestore Read와 앱 복잡성을 증가시킨다.

---

# 49. 최근 학교 Prefetch

사용자가 Search Result를 보고 있을 때 상위 결과 2~3개의 아주 작은 Summary를 Prefetch할 수 있다.

예:

```text
둔산초
둔산여고
둔원초
```

단, 사진 Original이나 전체 Visit History를 Prefetch하지 않는다.

---

# 50. Prefetch 우선순위

허용:

```text
학교 상세 Summary
첫 사진 Thumbnail
```

조건부:

```text
첫 사진 Preview
```

금지:

```text
Original 사진 3개
전체 Visit History
```

---

# 51. 사진 3단계 전략

사진은 다음 3개의 Resolution을 사용한다.

```text
Thumbnail
Preview
Original
```

---

# 52. Thumbnail

용도:

- 검색 결과
- 최근 학교
- 작은 Gallery
- 목록

권장 목표:

```text
약 240~400px 수준
```

실제 Size는 사진 처리 품질 테스트 후 확정한다.

---

# 53. Preview

용도:

- 학교 상세
- 큰 사진 카드
- 일반 Photo Viewer 최초 화면

권장 목표:

```text
약 1000~1600px 수준
```

모바일 화면에서 충분히 선명하게 보이는 정도로 한다.

---

# 54. Original

용도:

- 실제 고해상도 확대가 필요한 경우
- 관리자 원본 확인

일반 학교 상세에서 자동 다운로드하지 않는다.

---

# 55. 사진 요청 흐름

학교 상세:

```text
Thumbnail
↓
Preview
```

Photo Viewer:

```text
Preview 즉시 표시
↓
사용자가 실제 확대
↓
필요한 경우 Original
```

---

# 56. 사진 Direct Download

Firebase Storage Web SDK는 `getBlob()`과 `getBytes()` 등을 통해 URL을 공개하는 방식 대신 SDK에서 직접 데이터를 받을 수 있으며, 이를 Security Rules와 함께 사용해 세밀한 접근 제어를 적용할 수 있다. citeturn739907view1

급식길의 내부 사진은 역할 기반 접근 제어가 중요하므로 직접 다운로드 방식을 우선 검토한다.

---

# 57. 사진 Object URL

`getBlob()` 결과를 Browser Object URL로 만들어 `<img>`에 표시할 수 있다.

사용 완료 시:

```text
URL.revokeObjectURL()
```

방식으로 임시 URL을 정리한다.

---

# 58. 사진 Version URL

사진 교체 시 같은 Storage Object를 덮어쓰지 않는다.

```text
slotId
+
versionId
```

를 사용한다.

예:

```text
01/v003/preview.webp
```

그러면 오래된 Browser Cache가 새 사진을 잘못 보여주는 문제를 줄일 수 있다.

---

# 59. 사진 Cache Key

개념:

```text
schoolId
slotId
versionId
size
```

예:

```text
SCH123:
01:
v003:
thumbnail
```

사진 Version이 바뀌면 다른 Cache 항목으로 취급한다.

---

# 60. 사진 Cache 수명

Thumbnail:

```text
비교적 장기 Cache
```

Preview:

```text
최근 사용 학교 중심
```

Original:

```text
Memory 또는 단기 Cache
```

Original을 무제한 Persistent Cache하지 않는다.

---

# 61. 사진 Cache 용량

Browser 저장공간은 브라우저와 기기 정책에 따라 제한되거나 제거될 수 있으므로 Local Cache를 영구 보관소로 취급하지 않는다. IndexedDB 등 브라우저 저장공간의 실제 용량과 Eviction 정책은 브라우저별로 다를 수 있다. citeturn739907view4

따라서 사진 Cache가 사라져도 앱은 정상 동작해야 한다.

---

# 62. Service Worker App Shell

앱 실행에 필요한 정적 Asset은 Service Worker로 Cache한다.

예:

```text
index.html
JS bundles
CSS
app icons
manifest
font CSS
basic UI assets
```

Service Worker는 HTTPS 환경에서 동작하며 Cache된 Asset 우선 제공을 통해 Offline First App Shell을 만들 수 있다. citeturn739907view2

---

# 63. App Shell 버전

예:

```text
app-shell-v18
```

새 배포:

```text
app-shell-v19
```

Service Worker Activation 시 오래된 App Shell Cache를 정리한다.

---

# 64. 업무 데이터와 App Shell 분리

금지:

```text
하나의 Cache에
JS
학교사진
홍보정보
모두 저장
```

권장:

```text
app-shell
school-thumbnails
public-assets
```

처럼 목적별로 분리한다.

민감한 홍보 데이터는 Service Worker Cache Storage에 기본적으로 넣지 않는다.

---

# 65. PWA 업데이트

새 Service Worker가 설치되었을 때 현재 입력 중인 Form을 갑자기 Reload하지 않는다.

새 버전 발견:

```text
새 버전이 준비되었습니다.

[ 업데이트 ]
```

정도로 안내할 수 있다.

중대한 보안 업데이트는 별도 최소 Version 정책을 따른다.

---

# 66. Offline 학교 검색

Search Catalog가 IndexedDB에 있다면 인터넷 연결 없이도 학교 검색이 가능해야 한다.

```text
Offline
↓
학교명 입력
↓
Memory Search
↓
검색 결과
```

---

# 67. Offline에서 제공할 최소 정보

Cache가 있는 학교에 한해:

- 학교명
- 학교급
- 행정구
- 주소
- 학교 사진 Thumbnail
- 급식실 위치
- 검수시간
- 대차 필요 여부
- 엘리베이터·계단
- 차량 진입
- 현장 특이사항

을 최대한 조회할 수 있도록 한다.

---

# 68. Offline 홍보정보

MVP에서는 개인·공용 기기 구분 없이 홍보·영업정보를 Persistent Cache하지 않는다.

현재 앱 세션의 Memory Cache에 이미 존재하는 데이터는 일시적인 네트워크 단절 중 화면에 남을 수 있지만, 브라우저 재실행 뒤 Offline 조회를 보장하지 않는다. 홍보·영업정보의 Offline Read와 완전한 Offline Write는 MVP 핵심 범위에서 제외한다.

---

# 69. Offline Write

사용자가 Offline 상태에서 방문기록을 입력할 경우:

```text
입력 내용 유지
↓
저장 시 네트워크 없음 감지
↓
사용자 안내
```

예:

```text
현재 인터넷 연결이 없습니다.

작성한 내용은 유지됩니다.
연결 후 다시 저장해주세요.
```

Firestore 자체는 Offline Write Queue를 지원할 수 있지만, 급식길 MVP에서는 홍보 기록의 권한·충돌·감사 정책 때문에 자동 Offline Write Queue에 전적으로 의존하지 않는다. Firestore는 Offline Persistence가 활성화된 경우 네트워크 복구 후 로컬 변경을 동기화하며, 같은 Document에 대한 여러 변경은 마지막 쓰기 우선 방식이 적용된다. citeturn867876view2

---

# 70. Draft Form 보호

네트워크가 끊겨도 사용자가 작성한 방문 결과를 잃지 않도록 현재 Form State는 Memory에 유지한다.

필요하면 짧은 Session Draft를 별도로 저장할 수 있다.

민감한 홍보 Draft의 장기 Persistent 저장은 기본값으로 하지 않는다.

---

# 71. Network 복구

```text
Offline
↓
Network 복구
↓
인증 상태 확인
↓
현재 권한 확인
↓
Catalog Version 확인
↓
현재 화면 최신화
```

복구됐다고 모든 데이터를 다시 다운로드하지 않는다.

---

# 72. Auth와 Cache Freshness

Network가 복구되었을 때 데이터보다 먼저 확인해야 하는 것은 현재 세션의 유효성이다.

```text
Auth
→ Role
→ Session Version
→ Data Refresh
```

권한이 사라졌다면 Cache 데이터를 계속 노출하지 않는다.

---

# 73. Session Version 변경

현재 Cache Namespace의:

```text
sessionVersion = 8
```

서버:

```text
sessionVersion = 9
```

이면:

```text
현재 사용자 민감 Cache 무효화
↓
로그인 화면
```

으로 전환한다.

---

# 74. Catalog Delta

초기 MVP에서는 복잡한 Delta Sync보다 Version 단위 교체를 우선한다.

예:

```text
v183
→
v184 Catalog 전체 교체
```

Catalog 자체가 작기 때문이다.

향후 Catalog가 커지면:

```text
added
updated
removed
```

Delta 방식을 추가할 수 있다.

---

# 75. Detail Delta

학교 상세정보는 Document Revision을 이용하므로 전체 학교 데이터를 갱신할 필요가 없다.

현재 선택한 학교만 최신화한다.

---

# 76. 학교 목록 업데이트

NEIS Sync 이후:

```text
학교 추가
학교명 변경
학교 상태 변경
```

이 발생하면 Search Catalog Version을 증가시킨다.

현장정보 수정만으로 학교 이름 Search Catalog 전체를 항상 재생성할 필요는 없다.

---

# 77. Catalog Version 분리 이유

예:

```text
commonCatalogVersion
184

fieldCatalogVersion
92

salesCatalogVersion
331
```

학교 이름이 변경되면 Common만 업데이트할 수 있다.

홍보 방문이 기록될 때마다 Common Catalog 전체를 다시 내려보내지 않는다.

---

# 78. Firestore Read 최소화

피해야 할 구조:

```text
앱 실행
↓
학교 300개 Document Read

검색
↓
또 다시 Query

학교 열기
↓
여러 전체 Collection Query
```

---

# 79. 권장 Read 구조

앱 실행:

```text
Auth 확인
1~몇 개 Meta Read
필요 Catalog Read
```

학교 선택:

```text
school
schoolFieldProfile
photo metadata
```

홍보인 경우 추가:

```text
salesProfile
현재 월 assignment
최근 visit 일부
```

필요한 데이터만 읽는다.

---

# 80. 방문 History Pagination

모든 과거 방문 기록을 학교 상세 진입 때 가져오지 않는다.

기본:

```text
최근 3건
```

또는:

```text
최근 5건
```

`전체 기록 보기`에서 페이지 단위로 추가 조회한다.

---

# 81. 홍보 전체 보기 Pagination

전체 학교가 수백 개 수준이라도 카드 DOM을 한꺼번에 모두 렌더링하지 않는 것을 권장한다.

필터링 결과가 많으면:

- Virtualized List
- Incremental Render

중 하나를 검토한다.

---

# 82. 관리자 Table

PC 관리자 화면에서 학교·직원 Table이 길어질 경우 Virtualization을 고려한다.

초기 데이터 규모가 작다면 먼저 일반 Pagination으로 구현할 수 있다.

---

# 83. UI Render 최적화

학교 카드 상태가 하나 변경됐다고 전체 목록을 다시 렌더링하지 않는다.

Component Key:

```text
schoolId
```

를 안정적으로 유지한다.

---

# 84. 이미지 Layout Shift 방지

사진 영역은 이미지 다운로드 전에 Aspect Ratio 또는 고정 높이를 확보한다.

금지:

```text
사진 로드
↓
화면 전체가 아래로 밀림
```

Skeleton이 같은 크기를 차지한다.

---

# 85. Skeleton 사용

네트워크가 필요한 첫 Detail에서는:

```text
Cached Data 없음
↓
Skeleton
↓
Detail
```

Cached Data가 있다면:

```text
Cached Detail
↓
Fresh Detail
```

로 처리한다.

Cache가 있는데 Skeleton으로 되돌리지 않는다.

---

# 86. 사용자 체감 우선순위

가장 빨라야 하는 기능:

```text
1. 앱 실행
2. 학교 검색
3. 학교 상세 핵심정보
4. 사진 첫 화면
5. 내 구역 목록
```

상대적으로 늦어도 되는 기능:

```text
전체 과거 방문기록
CSV 생성
관리자 통계
원본 사진
```

---

# 87. 성능 Budget

MVP 내부 목표:

### 앱 Shell

```text
설치 후 재실행
1초 이내에 기본 UI 노출 목표
```

### 학교 검색

```text
입력 → 결과
100ms 이하 체감 목표
```

### Cache된 학교 상세

```text
선택 → 핵심정보
200ms 내 표시 목표
```

### Network 학교 상세

```text
Cache 없음
→ Skeleton 즉시
→ 핵심정보 가능한 빠르게
```

### 이미지

```text
Thumbnail 우선
Preview 점진적
Original 지연
```

수치는 개발 목표이며 실제 기기별 측정으로 조정한다.

---

# 88. 저사양 기기 기준

최신 고급 스마트폰만 기준으로 최적화하지 않는다.

테스트에는 최소 다음 환경을 포함한다.

```text
중급 Android
오래된 Android
iPhone Safari
Desktop Chrome
```

PWA 주요 업무는 중급 Android에서도 부드럽게 동작해야 한다.

---

# 89. Network 테스트

반드시 다음 환경을 테스트한다.

```text
Wi-Fi
4G/5G
느린 4G
Offline
Network 중간 끊김
```

Chrome DevTools Network Throttling도 활용한다.

---

# 90. 성능 로그

Production에서 개인정보를 포함하지 않는 범위에서 최소 성능 지표를 수집할 수 있다.

예:

```text
appBootDuration
catalogLoadDuration
searchDuration
schoolDetailDuration
imagePreviewDuration
```

학교명·방문 메모 등 실제 업무내용을 Performance Log에 넣지 않는다.

---

# 91. Cache Hit 측정

개발 테스트에서:

```text
Memory Hit
IndexedDB Hit
Firestore Hit
Image Cache Hit
```

을 구분해 볼 수 있어야 한다.

---

# 92. Search Debug

개발 모드에서는 검색 결과마다 점수를 확인할 수 있는 Debug 기능을 둘 수 있다.

예:

```text
대전둔산초등학교
score: 1000
reason: alias-exact
```

Production 사용자에게는 표시하지 않는다.

---

# 93. Cache Debug 관리자 도구

개발/관리용 화면에서:

```text
Catalog Version
Cache Size
Last Sync
Current Role
Session Version
```

등을 볼 수 있게 하면 장애 대응에 유리하다.

일반 사용자에게는 노출하지 않아도 된다.

---

# 94. Cache 초기화

설정 또는 관리자 지원용으로:

```text
로컬 데이터 새로 받기
```

기능을 제공할 수 있다.

동작:

```text
현재 사용자 Catalog 제거
↓
최신 Catalog 재다운로드
```

Firebase 로그인까지 해제하지는 않는다.

---

# 95. 전체 로컬 데이터 초기화

문제 해결용 관리 기능:

```text
앱 데이터 초기화
```

실행 시:

- IndexedDB
- 앱 Cache
- 검색 Catalog
- 사진 Cache

등을 정리한다.

민감한 기능이므로 일반 설정에서 쉽게 눌리지 않도록 한다.

---

# 96. Offline Support 수준 정의

MVP Offline 수준은 다음과 같다.

### 반드시 지원

```text
앱 Shell 실행
학교 검색
Cache된 학교정보 조회
Cache된 Thumbnail 조회
```

### 가능한 범위에서 지원

```text
홍보 현재 구역 조회
홍보 Summary 조회
```

### MVP 필수 아님

```text
완전한 Offline 방문 기록 저장 및 자동 동기화
Offline 사진 업로드 Queue
Offline CSV Export
```

---

# 97. 데이터 민감도와 Cache

Cache 가능 여부는 단순 속도가 아니라 데이터 민감도를 고려한다.

## 낮음

```text
학교 공식정보
학교 검색 Index
```

장기 Cache 가능.

## 중간

```text
학교 현장정보
학교 사진
```

역할 및 기기 정책에 따라 Cache.

## 높음

```text
홍보 방문 기록
커뮤니케이션 참고
후속 업무
```

MVP에서는 Memory Cache만 허용한다. 역할별 격리와 세션 종료 시 제거를 적용하며 Persistent 저장은 금지한다.

---

# 98. 공용 기기 기본 정책

공용 기기에서는:

```text
Auth Persistence
→ 운영 정책에 따라 유지 가능

Firestore
→ Memory 우선

Search Catalog
→ 공통 학교정보만 Persistent 가능

Sales Data
→ Persistent 금지, Memory만 사용
```

명시적 로그아웃 시 사용자 Sales Cache를 제거한다.

Firebase도 민감한 정보를 다루는 Web App에서 Persistent Firestore Cache가 세션 간 자동 삭제되지 않으므로 신뢰할 수 있는 기기 여부를 고려하도록 안내한다. citeturn867876view1

---

# 99. 개인 기기 기본 정책

개인 휴대전화:

```text
Auth LOCAL
Search Catalog Persistent
학교 현장정보 일부 Persistent
Thumbnail Cache
Sales Data Memory Cache only
```

앱을 다시 켰을 때 빠르게 업무를 시작하는 것을 우선한다.

---

# 100. 데이터 무효화 우선순위

다음 이벤트 발생 시 Cache를 즉시 재평가한다.

```text
로그아웃
권한 변경
sessionVersion 변경
직원 비활성화
Catalog Version 변경
학교 Revision 변경
사진 Version 변경
```

---

# 101. 만료 시간만 사용하지 않는다

금지:

```text
24시간 지났으니 무조건 삭제
```

Version 기반 무효화를 우선하고 TTL은 보조 수단으로 사용한다.

---

# 102. TTL 후보

예:

```text
검색 Catalog
Version 기반

학교 Detail
Revision + 필요 시 TTL

Sales Summary
Revision / Cycle Version + 짧은 TTL

사진 Thumbnail
Version 기반 장기 Cache

Original
단기
```

정확한 TTL 숫자는 실사용 후 조정한다.

---

# 103. 데이터 표시 우선순위 예시 — 납품

둔산초 검색:

```text
Memory Search
↓
결과 즉시
```

둔산초 선택:

```text
IndexedDB Field Summary
↓
사진 Thumbnail
↓
Firestore 최신정보
↓
Preview
```

---

# 104. 데이터 표시 우선순위 예시 — 홍보

내 구역:

```text
Memory Assignment Catalog
↓
School Cards 즉시
↓
Sales Summary Fresh Check
```

학교 선택:

```text
Cached Sales Profile
+
Cached Field Info
↓
최신 Profile
↓
최근 Visits
↓
사진 Preview
```

---

# 105. 검색 실패 UX

검색 결과 없음:

```text
검색 결과가 없습니다.

학교명을 다시 확인해주세요.
```

검색 결과가 없다고 즉시 외부 NEIS API를 호출하지 않는다.

학교 목록 최신화는 별도의 관리자 Sync 기능으로 처리한다.

---

# 106. NEIS와 Runtime Search 분리

NEIS는 학교 기본정보의 Upstream Source다.

Runtime Search Engine이 아니다.

```text
NEIS
↓
Firestore
↓
Search Catalog
↓
IndexedDB
↓
Memory Search
```

사용자가 검색할 때 NEIS API를 호출하지 않는다.

---

# 107. Kakao와 Runtime Search 분리

Kakao API 역시 학교 이름 자동완성 Search Backend로 사용하지 않는다.

Kakao는:

- 좌표
- 장소 매칭
- 길안내

에 사용한다.

학교 목록 검색의 Source는 급식길 내부 Catalog다.

---

# 108. 구현 Component / Module

권장 모듈:

```text
SearchCatalogService
SearchNormalizer
KoreanInitialMatcher
SearchRanker

CacheNamespaceService
IndexedDbRepository
CatalogRepository

SchoolDetailRepository
SalesSummaryRepository

ImageCacheService
PhotoLoader

NetworkStatusService
SyncCoordinator

ServiceWorker
```

---

# 109. Repository 패턴

화면 Component가 직접:

```text
Firestore
IndexedDB
Memory
```

를 각각 호출하지 않는다.

예:

```text
SchoolDetailRepository
```

가 내부에서 Cache 우선순위를 결정한다.

UI는:

```text
getSchoolDetail(schoolId)
```

정도만 요청한다.

---

# 110. 검색 Repository

```text
SearchCatalogRepository
↓
Memory Index
```

검색 화면에서 Firestore SDK를 직접 호출하지 않는다.

---

# 111. Sync Coordinator

앱 실행 시:

```text
Auth Ready
↓
Role Ready
↓
Catalog Meta
↓
Catalog Sync
↓
Memory Index Build
```

순서를 중앙에서 관리한다.

페이지마다 독립적으로 Catalog를 다운로드하지 않는다.

---

# 112. 성능 장애 방지 규칙

Codex 구현 시 다음을 금지한다.

1. 검색 키 입력마다 Firestore Query
2. 앱 실행 때 전체 학교 Detail 다운로드
3. 학교 목록에서 Original 사진 다운로드
4. 전체 Visit History 선로딩
5. 모든 Collection에 Real-time Listener
6. Sales Data를 납품 사용자 Cache에 저장
7. 모든 Cache를 하나의 Namespace로 공유
8. Version 없이 사진 덮어쓰기
9. Cache가 있는데 Loading Blank Screen 표시
10. Service Worker에 민감 Sales API Response 무차별 Cache
11. 앱 업데이트 때 입력 Form을 강제 Reload
12. Network 복구 때 전체 데이터 재다운로드

---

# 113. 필수 성능 테스트

## TEST 01 — 검색 Network 0

학교명을 20회 입력한다.

기대 결과:

```text
검색 타이핑 과정
Firestore Read = 0
```

---

## TEST 02 — 초성 검색

```text
ㄷㅈㄷㅅㅊ
```

입력.

기대:

```text
대전둔산초등학교
상위 결과
```

---

## TEST 03 — 축약어

```text
둔산초
```

입력.

정확한 학교가 최상단에 표시되어야 한다.

---

## TEST 04 — 앱 재실행

로그인 상태 유지 + Catalog 존재.

```text
앱 실행
↓
로그인 화면 없음
↓
검색 즉시 사용 가능
```

---

## TEST 05 — Offline 검색

Network 차단.

```text
학교 검색
```

정상 동작해야 한다.

---

## TEST 06 — Offline Detail

이전에 본 학교.

Network 차단.

Cache된 현장정보를 표시해야 한다.

---

## TEST 07 — 처음 보는 학교 Offline

Cache가 없는 Detail.

명확한 Offline 안내를 제공하고 앱이 Crash하지 않아야 한다.

---

## TEST 08 — Catalog Version 변경

Local:

```text
183
```

Server:

```text
184
```

최신 Catalog로 교체되어야 한다.

---

## TEST 09 — 동일 Version

Local = Server.

Catalog 전체 다운로드가 발생하지 않아야 한다.

---

## TEST 10 — 역할 변경

```text
sales
→
delivery
```

기존 Sales Cache가 표시되지 않아야 한다.

---

## TEST 11 — Session Version 변경

기존 Cache가 있어도 민감 Sales 화면에 접근할 수 없어야 한다.

---

## TEST 12 — 사진 Version 교체

```text
v003
→
v004
```

이후 새 사진을 표시해야 한다.

오래된 Browser Cache 때문에 v003이 계속 보이면 실패다.

---

## TEST 13 — Gallery

학교 상세 진입 시 Original 3장이 자동 다운로드되지 않아야 한다.

---

## TEST 14 — Viewer

Viewer 최초 진입:

```text
Preview
```

우선 표시.

실제 확대 시 필요한 경우 Original을 가져온다.

---

## TEST 15 — 느린 Network

Slow 4G.

Cached 학교 Detail은 Network 응답을 기다리지 않고 먼저 표시한다.

---

## TEST 16 — Cache 없음 + Slow Network

Skeleton이 즉시 표시되고 Layout Shift가 최소화되어야 한다.

---

## TEST 17 — 납품 Role

Network Log에서:

```text
salesCatalog
salesProfile
salesVisit
```

요청이 없어야 한다.

---

## TEST 18 — Visit Pagination

학교 상세 첫 진입에서 모든 과거 Visit를 읽지 않는다.

---

## TEST 19 — Service Worker Offline

인터넷 차단 후 재실행.

최소 App Shell이 정상 실행되어야 한다.

---

## TEST 20 — 로그아웃

로그아웃 후 이전 직원의 민감한 Sales Summary가 다른 직원 화면에서 나타나지 않아야 한다.

---

# 114. MVP 완료 기준

검색·Cache·성능 구현은 다음 조건을 모두 만족해야 완료로 본다.

- 학교 검색 중 Network 요청 없음
- 학교 초성 검색 가능
- 학교 축약어 검색 가능
- Alias 검색 가능
- Ranking 일관성
- Search Catalog IndexedDB 저장
- 앱 실행 시 Memory Index 생성
- Catalog Version 관리
- 역할별 Catalog 분리
- 납품 사용자 Sales Catalog 접근 없음
- Cache된 학교 상세 즉시 표시
- stale-while-revalidate 방식 적용
- 학교 Revision 기반 갱신
- 사진 Thumbnail / Preview / Original 분리
- 사진 Version 기반 Cache 무효화
- Service Worker App Shell
- Offline 학교 검색
- Cache된 현장정보 Offline 조회
- 로그인 지속과 Cache Namespace 연동
- Session Version 변경 시 민감 Cache 차단
- Visit History 지연 로딩
- 불필요한 Real-time Listener 없음
- 성능 테스트 통과

---

# 115. 구현 우선순위

## Phase 1 — Search Catalog

```text
Normalizer
초성
Alias
Ranking
Memory Search
```

## Phase 2 — IndexedDB

```text
Catalog Store
Version
Recent Schools
```

## Phase 3 — Detail Cache

```text
School Detail Repository
Field Info Cache
Revision
```

## Phase 4 — Role Cache

```text
Delivery
Sales
Session Namespace
```

## Phase 5 — Image Pipeline

```text
Thumbnail
Preview
Original
Version Cache
```

## Phase 6 — PWA

```text
Service Worker
App Shell
Offline Boot
```

## Phase 7 — Refresh

```text
Catalog Sync
SWR Detail
Network Recovery
```

## Phase 8 — Performance Hardening

```text
Read Count
Search Benchmark
Image Benchmark
Offline Test
Low-end Device Test
```

---

# 116. Firebase 기술 기준

본 문서 작성 시 현재 Firebase 공식 문서를 기준으로 다음 사항을 확인했다.

- Firebase Web Auth는 `LOCAL` 상태를 사용하면 브라우저 창 종료 후에도 인증 상태를 유지하고 명시적 Sign-out 시 제거할 수 있다. citeturn739907view3
- Firestore Web은 기본적으로 Memory Cache를 사용하며 Persistent Offline Cache는 명시적으로 설정한다. citeturn867876view0
- Web Persistent Firestore Cache는 세션 간 자동 삭제되지 않으므로 민감 데이터 사용 시 신뢰 기기 여부를 고려해야 한다. citeturn867876view1
- Firestore Offline Persistence는 Network 복구 시 Local 변경사항을 Backend와 동기화할 수 있다. citeturn867876view2
- Firebase Storage Web SDK는 `getBlob()` / `getBytes()` 방식으로 데이터를 직접 받아 Security Rules 기반의 세밀한 접근 제어를 적용할 수 있다. citeturn739907view1
- Service Worker는 Cache된 Asset을 이용한 Offline First PWA App Shell에 사용할 수 있다. citeturn739907view2

---

# 117. 최종 구조

급식길 성능 구조를 한 번에 표현하면 다음과 같다.

```text
Firebase
│
├─ Firestore
│   ├─ schools
│   ├─ schoolFieldProfiles
│   ├─ salesProfiles
│   └─ salesCycles
│
├─ Storage
│   └─ school photos
│
↓
Catalog / Repository
│
↓
IndexedDB
│
↓
Memory
│
↓
UI
```

사진:

```text
Storage
↓
Thumbnail
↓
Preview
↓
Original
```

검색:

```text
Keyboard
↓
Memory Index
↓
Result
```

---

# 118. 검색·캐시·성능 한 줄 정의

> **급식길은 학교 검색을 완전히 로컬화하고, IndexedDB와 Memory를 이용해 즉각적인 화면 반응을 제공하며, Firebase는 원본 데이터와 최신화 역할에 집중시키고, 사진·역할·세션별 Cache를 분리하여 속도·비용·보안을 동시에 관리한다.**

---

# 119. 문서 상태

본 문서는 **급식길 검색·캐시·성능 설계서 v1.1**이다.

실제 구현과 현장 테스트 후 다음을 조정한다.

- Search Ranking Weight
- Fuzzy Match 강도
- Catalog 분할 단위
- Detail Cache TTL
- Sales Memory Cache TTL
- Thumbnail Size
- Preview Size
- Image Cache 용량
- Prefetch 학교 수
- Real-time Listener 범위
- 공통 학교정보 Persistent Firestore Cache 범위
- 저사양 기기 성능 기준

변경 시:

```text
Performance Design v1.1
Performance Design v1.2
```

형태로 이력을 유지한다.
