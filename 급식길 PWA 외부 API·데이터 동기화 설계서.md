# 급식길 PWA 외부 API·데이터 동기화 설계서

**문서 버전:** 1.0  
**대상:** 급식길 PWA MVP  
**관련 문서:** MVP 기획서 v1.3 / 데이터베이스 상세 설계서 v1.3 / 인증·권한·보안 설계서 v1.3 / 디자인 시스템 v1.0 / 화면·UX 상세 명세서 v1.2 / 검색·캐시·성능 설계서 v1.1

---

# 1. 문서 목적

본 문서는 급식길에서 사용하는 외부 데이터와 API의 역할 및 동기화 정책을 정의한다.

대상:

- NEIS 학교기본정보
- Kakao Local API
- Kakao 지도 연결
- 학교 좌표 및 장소 매칭
- 신규 학교
- 학교명 변경
- 주소 변경
- 폐교·비활성 학교
- API 장애
- 관리자 동기화
- 향후 자동 동기화
- 외부 API Key 관리
- 동기화 감사 기록

핵심 원칙은 다음과 같다.

> **외부 API는 급식길의 학교 기본정보를 보완하는 공급원이며, 급식길 직원이 축적한 학교 현장정보·사진·홍보정보의 소유자가 아니다.**

---

# 2. 데이터 Source 구분

급식길의 데이터는 출처에 따라 크게 세 종류로 나눈다.

```text
공식 학교정보
→ NEIS

지도·좌표·장소정보
→ Kakao

회사 현장업무 정보
→ 급식길
```

각 Source의 데이터 소유 영역을 명확하게 분리한다.

---

# 3. 외부 API의 역할

## NEIS

담당:

- 학교 목록
- 학교 행정표준코드
- 학교명
- 학교급
- 소재지
- 도로명 주소
- 전화번호
- 홈페이지 등 공식 기본정보

NEIS 학교기본정보 데이터셋은 학교명, 소재지, 주소, 전화번호, 홈페이지 등의 정보를 제공하며 현재 포털에는 적재 주기가 `매주`로 안내되어 있다. citeturn961016search0turn745086view0

---

## Kakao

담당:

- 주소 → 좌표
- 학교명 → 장소 검색
- 장소 ID
- 지도 연결
- 길찾기

Kakao Local API는 주소 검색과 키워드 장소 검색을 제공하며, 장소 검색 결과에는 장소 ID, 장소명, 도로명·지번 주소, 경도와 위도 등이 포함된다. citeturn300614search1turn111107view0

---

## 급식길 자체 데이터

담당:

- 학교 사진
- 급식실 위치
- 검수시간
- 대차 필요 여부
- 출입 동선
- 차량 진입
- 하역 위치
- 현장 특이사항
- 제품 관심도
- 홍보 방문 기록
- 샘플
- 홍보지
- 커뮤니케이션 참고
- 월별 구역
- 후속 활동

이 정보들은 외부 API 동기화가 수정하거나 삭제하지 않는다.

---

# 4. 데이터 소유권 원칙

```text
NEIS
→ 학교 공식정보만 수정 가능

Kakao
→ 위치 관련 Metadata만 수정 가능

급식길 사용자
→ 현장정보·사진·홍보정보
```

외부 Sync가 회사가 직접 축적한 현장 데이터에 영향을 주지 않는 것이 가장 중요한 원칙이다.

---

# 5. Runtime 검색과 외부 API 분리

사용자가 학교 검색창에:

```text
둔산초
```

를 입력한다고 해서 NEIS나 Kakao API를 호출하지 않는다.

학교 검색:

```text
Keyboard
↓
급식길 Memory Search Index
↓
즉시 결과
```

외부 API는 검색 Backend가 아니다.

---

# 6. 전체 데이터 흐름

```text
NEIS
↓
학교 기본정보 Sync
↓
Firestore schools
↓
Search Catalog
↓
IndexedDB
↓
Memory
↓
학교 검색
```

위치정보:

```text
NEIS 주소
↓
Kakao 주소 검색
↓
Kakao 장소 검색
↓
좌표 / Place ID
↓
Firestore schools.location
↓
Kakao 지도 / 길찾기
```

---

# 7. NEIS School ID

학교의 급식길 내부 기본 식별자는 학교명으로 만들지 않는다.

학교명은 변경될 수 있기 때문이다.

학교 문서 ID는 NEIS에서 제공하는 학교 행정표준코드를 기준으로 구성한다.

개념:

```text
SCH-NEIS-{학교행정표준코드}
```

예:

```text
SCH-NEIS-1234567
```

학교명은 ID가 아니라 속성이다.

---

# 8. 학교명 변경

예:

```text
기존
대전A고등학교

변경
대전B고등학교
```

행정표준코드가 동일하다면 동일 학교로 판단한다.

처리:

```text
학교 Document 유지
↓
name 변경
↓
기존 학교명 alias 추가
↓
현장정보 유지
↓
사진 유지
↓
홍보정보 유지
↓
방문 History 유지
```

---

# 9. 이전 학교명 Alias

교명이 변경되면 기존 이름은 검색 Alias로 남긴다.

예:

```text
name:
대전B고등학교

aliases:
대전A고등학교
A고
B고
```

직원이 예전 학교명으로 검색해도 학교를 찾을 수 있도록 한다.

---

# 10. 학교 코드가 변경된 경우

학교명이 같더라도 NEIS 학교코드가 새롭게 나타나면 자동으로 기존 학교와 합치지 않는다.

처리:

```text
새 코드 발견
↓
신규 학교 Candidate 생성
↓
유사 이름 / 주소 기존 학교 탐색
↓
관리자 검토
```

가능한 상태:

```text
newSchool
possibleCodeChange
possibleDuplicate
```

관리자가 최종 판단한다.

---

# 11. 신규 학교

새로운 NEIS 학교코드가 발견되고 기존 Document가 없으면:

```text
schools 생성
↓
현장정보 = 미등록
↓
사진 = 없음
↓
Kakao 위치 매칭
↓
Search Catalog 반영
```

화면에는:

```text
현장정보 미등록
사진 없음
```

상태로 표시한다.

---

# 12. 신규 학교가 홍보 월 배정에 미치는 영향

신규 학교가 발견됐다고 현재 진행 중인 월의 담당 구역에 자동 추가하지 않는다.

이유:

월별 구역은 직원 간 업무 배정 결과이기 때문이다.

처리:

```text
신규 학교 발견
↓
학교 DB 추가
↓
관리자 알림
↓
현재 월 또는 다음 월 배정 여부 결정
```

---

# 13. NEIS 데이터 매핑

`schools/{schoolId}`에는 Source Field와 급식길 정규화 Field를 구분한다.

예:

```text
source:
  provider: "NEIS"
  schoolCode
  educationOfficeCode
  syncedAt

name
shortName
normalizedName

schoolType

address:
  road
  jibun
  postalCode

phone
homepage
```

필요한 원본값 일부는 `sourceSnapshot` 또는 별도 Sync 기록에 보존할 수 있다.

---

# 14. NEIS가 수정 가능한 Field

NEIS Sync가 자동 갱신할 수 있는 대상:

```text
학교명
학교급
공식 주소
전화번호
홈페이지
학교 관련 공식 Metadata
```

---

# 15. NEIS가 수정할 수 없는 Field

다음은 절대 덮어쓰지 않는다.

```text
schoolFieldProfiles

schools/{schoolId}/photos

salesProfiles

salesVisits

salesCycles

assignments

communicationTags

activityTags
```

---

# 16. 주소 변경

NEIS에서 주소가 변경된 경우:

```text
기존 주소
↓
새 주소 감지
↓
schools.address 갱신 후보
↓
Kakao Location 재검증
```

주소 변경 자체와 좌표 변경은 분리해서 처리한다.

---

# 17. 주소 변경 시 현장정보

학교 주소가 변경돼도 다음 데이터는 자동 삭제하지 않는다.

- 사진
- 급식실 위치
- 검수시간
- 대차
- 출입구
- 하역 위치

대신 다음 상태를 생성할 수 있다.

```text
fieldInfoReviewRequired: true
```

학교 이전 가능성이 있기 때문이다.

관리자가 실제 이전 여부를 확인한다.

---

# 18. NEIS 목록에서 학교가 사라진 경우

한 번 Sync 결과에서 보이지 않았다고 즉시 삭제하지 않는다.

금지:

```text
NEIS에 없음
→ schools 삭제
```

채택:

```text
NEIS에 없음
↓
inactiveCandidate
↓
관리자 검토
```

---

# 19. 폐교 처리

NEIS 학교기본정보 공식 안내에서도 폐교 현황은 별도 학교알리미의 신설·폐교 정보 확인을 안내하고 있다. 따라서 NEIS 목록에서 단순히 사라진 사실만으로 폐교를 확정하지 않는다. citeturn961016search0turn745086view0

상태:

```text
active
inactiveCandidate
inactive
```

필요 시:

```text
closed
merged
```

를 추가할 수 있다.

---

# 20. 폐교 학교 데이터

학교가 비활성화돼도 물리 삭제하지 않는다.

유지:

- 과거 방문 기록
- 현장정보
- 사진 Metadata
- 홍보 기록
- 월별 Assignment History

일반 학교 검색에서는 기본적으로 제외한다.

관리자는 과거 기록에서 조회 가능하다.

---

# 21. 학교 합병

여러 학교가 합쳐져 새로운 코드의 학교가 생성될 수 있다.

자동 병합하지 않는다.

관리자에게:

```text
기존 학교 A
기존 학교 B

↓ 가능성

신규 학교 C
```

형태로 Review Candidate를 보여준다.

과거 History는 원래 학교에 유지한다.

---

# 22. NEIS Sync 방식

MVP에서는 자동 Scheduler보다 관리자 수동 Sync를 먼저 구현한다.

관리자 메뉴:

```text
학교 관리

[ 학교 목록 최신화 ]
```

---

# 23. NEIS Sync는 즉시 적용하지 않는다

버튼 선택:

```text
학교 목록 최신화
↓
NEIS 데이터 수집
↓
현재 DB와 비교
↓
Diff 생성
↓
관리자 Preview
↓
적용
```

바로 Firestore를 변경하지 않는다.

---

# 24. Sync Preview

예:

```text
학교 목록 최신화

신규 학교          2
학교명 변경        1
주소 변경          3
기본정보 변경      4
목록에서 사라짐    1

총 11건 변경

[ 변경내용 보기 ]

[ 적용 ]
```

---

# 25. 변경 유형

NEIS Diff Type:

```text
NEW
NAME_CHANGED
ADDRESS_CHANGED
PHONE_CHANGED
HOMEPAGE_CHANGED
TYPE_CHANGED
SOURCE_UPDATED
MISSING
UNCHANGED
```

---

# 26. 위험도에 따른 변경 구분

## 자동 적용 가능 후보

```text
전화번호 변경
홈페이지 변경
```

## 검토 권장

```text
학교명 변경
주소 변경
학교급 변경
```

## 자동 처리 금지

```text
학교 사라짐
코드 변경 추정
학교 병합 추정
```

초기 MVP에서는 전체 변경을 관리자 Preview 후 적용하도록 해도 된다.

---

# 27. Sync Staging

외부 데이터를 바로 Production School Document에 쓰지 않는다.

개념:

```text
NEIS
↓
Staging
↓
Normalize
↓
Validate
↓
Diff
↓
Apply
```

---

# 28. neisSyncRuns

동기화 실행 기록:

```text
neisSyncRuns/{runId}
```

예:

```text
status
startedAt
completedAt

requestedBy

sourceCount

newCount
changedCount
missingCount

appliedCount

errorCount
```

---

# 29. Sync 상태

```text
FETCHING
NORMALIZING
DIFF_READY
APPLYING
COMPLETED
FAILED
```

관리자 화면에서 현재 상태를 확인할 수 있다.

---

# 30. Sync 실패

외부 API 오류가 발생해도 기존 학교 DB를 유지한다.

```text
NEIS 실패
↓
현재 Firestore 유지
↓
Sync Run FAILED
↓
관리자 안내
```

외부 장애 때문에 학교 목록을 비우지 않는다.

---

# 31. 부분 응답 방어

API에서 예상보다 적은 데이터가 반환되면 이를 정상적인 대량 폐교로 해석하지 않는다.

예:

```text
기존 학교 수
300

새 API 결과
42
```

이면 자동 적용 금지.

상태:

```text
SUSPICIOUS_RESULT
```

관리자 검토 대상으로 처리한다.

---

# 32. 수량 안전장치

다음 조건에서는 자동 Apply를 막는다.

예:

```text
기존 대비 학교 수 급감

한 번에 비정상적으로 많은 MISSING

응답 페이지 누락

API 오류 포함

필수 Field 누락
```

정확한 임계값은 실제 초기 학교 수를 확인한 뒤 결정한다.

---

# 33. Pagination

NEIS API 데이터 수집은 API가 제공하는 Page 구조를 모두 순회해 전체 대상 데이터를 확보한다.

NEIS Open API 기본 인자에는 `pIndex`와 `pSize`가 제공된다. citeturn961016search0turn745086view0

한 Page만 가져온 뒤 전체 학교 목록으로 판단해서는 안 된다.

---

# 34. 대전 학교만 사용

급식길의 운영 범위는 대전광역시다.

NEIS Sync에서는 대전광역시교육청 대상 데이터만 가져오도록 한다.

교육청 코드는 환경 설정값으로 관리한다.

```text
TARGET_EDUCATION_OFFICE_CODE
```

API 응답을 기준으로 초기 설정을 검증한다.

코드를 UI 또는 여러 파일에 반복 하드코딩하지 않는다.

---

# 35. 대상 학교급

MVP 기본 대상:

```text
초등학교
중학교
고등학교
```

특수학교 등 추가 학교급이 실제 납품·홍보 대상에 포함될 경우 관리자 설정으로 확장한다.

---

# 36. 유치원

초기 MVP 학교 대상에 포함하지 않는 것을 기본으로 한다.

운영 대상이 변경되면 별도 schoolType으로 추가한다.

---

# 37. Kakao 위치정보 목적

Kakao 데이터의 목적은 다음이다.

```text
학교 주소
↓
정확한 지도 위치

학교
↓
Kakao Place ID

학교 상세
↓
길안내
```

---

# 38. Kakao Local API

주소→좌표 검색은 Kakao Local API를 사용한다.

Kakao 공식 문서상 주소 검색 API는 도로명·지번 주소에 대한 좌표를 반환하며 REST API Key 인증 방식으로 제공된다. citeturn300614search1turn111107view2

---

# 39. Kakao Keyword Search

주소 검색만으로 학교의 Kakao Place ID를 얻을 수 없는 경우 학교명을 이용해 키워드 장소 검색을 수행한다.

Kakao 키워드 장소 검색 결과에는:

- 장소 ID
- 장소명
- 지번 주소
- 도로명 주소
- 경도
- 위도
- 장소 상세페이지

등이 제공된다. citeturn111107view0turn111107view3

---

# 40. Kakao 매칭 상태

```text
unmatched
autoMatched
needsReview
confirmed
failed
```

---

# 41. unmatched

아직 위치 매칭을 시도하지 않은 상태.

신규 학교 생성 직후 기본값.

---

# 42. autoMatched

자동 매칭 결과가 높은 신뢰도를 가진 상태.

예:

```text
학교명 일치
+
도로명 주소 일치
+
대전 지역
```

---

# 43. needsReview

다음 상황:

- 같은 이름의 후보 여러 개
- 주소 불일치
- 학교명 일부 차이
- 주소 Search와 Place Search 좌표 차이
- 신규 이전 학교
- Place ID 변경

관리자가 확인해야 한다.

---

# 44. confirmed

관리자가 실제 학교임을 확인한 위치.

자동 매칭보다 높은 신뢰 상태로 취급한다.

---

# 45. failed

Kakao에서 적절한 결과를 찾지 못한 상태.

학교 자체는 정상적으로 사용할 수 있다.

지도 기능만 제한된다.

---

# 46. Kakao 자동 매칭 Flow

```text
NEIS 학교
↓
도로명 주소 검색
↓
좌표 획득
↓
학교명 Keyword Search
↓
후보 비교
↓
신뢰도 평가
```

결과:

```text
autoMatched
또는
needsReview
또는
failed
```

---

# 47. 첫 번째 기준 — 주소

가장 먼저 NEIS 공식 도로명 주소를 사용한다.

```text
NEIS address
↓
Kakao Address Search
```

좌표를 확보한다.

---

# 48. 두 번째 기준 — 학교명

```text
학교 공식명
+
지역정보
```

로 Kakao Keyword Search를 수행한다.

예:

```text
대전둔산초등학교 대전
```

---

# 49. 후보 비교

후보별로 다음을 비교한다.

```text
학교명 유사도
도로명 주소
지번 주소
행정구
좌표 거리
```

---

# 50. 자동 매칭 Confidence

개념적 Score 예:

```text
학교명 정확 일치
+40

도로명 주소 일치
+40

행정구 일치
+10

주소 좌표와 Place 좌표 근접
+10
```

총점:

```text
90 이상
autoMatched

60~89
needsReview

60 미만
needsReview 또는 failed
```

정확한 Weight는 실제 대전 학교 데이터로 테스트 후 조정한다.

---

# 51. Confidence는 사용자에게 노출하지 않는다

관리자 Debug에서는:

```text
Match Confidence 94
```

를 볼 수 있다.

일반 직원은:

```text
지도 위치 확인됨
```

정도로만 인지하면 된다.

---

# 52. Location 데이터 구조

`schools/{schoolId}`:

```text
location:
  latitude
  longitude

  kakaoPlaceId

  matchStatus
  matchMethod
  matchConfidence

  matchedName
  matchedRoadAddress

  matchedAt
  confirmedBy
  confirmedAt
```

---

# 53. matchMethod

예:

```text
address
keyword
address+keyword
manual
```

---

# 54. 관리자 위치 검토

`needsReview` 학교는 관리자 목록에서 따로 표시한다.

```text
지도 위치 확인 필요  4
```

선택:

```text
대전○○초등학교

NEIS 주소
...

Kakao 후보 1
...

Kakao 후보 2
...

[ 후보 1 확정 ]
[ 후보 2 확정 ]
[ 직접 위치 입력 ]
```

---

# 55. 수동 위치 지정

Kakao 후보가 부정확하면 관리자가 직접 위치를 지정할 수 있다.

최종 상태:

```text
confirmed
matchMethod: manual
```

향후 NEIS Sync가 이 위치를 자동 덮어쓰지 않는다.

---

# 56. 관리자 확정 위치 우선

우선순위:

```text
manual confirmed
>
administrator confirmed Kakao
>
autoMatched Kakao
>
address-only coordinate
>
unmatched
```

---

# 57. NEIS 주소 변경과 Kakao 위치

현재 학교가 `confirmed` 상태인데 NEIS 주소가 변경된 경우 즉시 좌표를 교체하지 않는다.

```text
주소 변경
↓
새 Kakao Match 실행
↓
기존 위치와 비교
```

차이가 작으면 유지 가능.

차이가 크면:

```text
needsReview
```

로 보낸다.

---

# 58. 학교 이전 가능성

새 주소와 기존 좌표의 거리가 크게 달라지면:

```text
possibleRelocation: true
```

로 표시한다.

이 경우 학교 현장정보도 관리자 검토 대상으로 표시한다.

---

# 59. Kakao 길안내

학교 상세에서 `길안내`를 선택하면 급식길 내부에 별도의 내비게이션 엔진을 구현하지 않는다.

Kakao 지도에서 해당 학교를 목적지로 여는 방식을 사용한다.

Kakao 지도 공식 Web API 가이드는 좌표 또는 장소 ID를 이용해 지도 및 길찾기 바로가기 URL을 만들 수 있도록 제공한다. citeturn300614search0

---

# 60. 길안내 우선순위

```text
kakaoPlaceId 존재
↓
Place 기반 길안내

없음
↓
학교명 + 좌표

좌표 없음
↓
학교명 검색
```

---

# 61. 길안내 대상 좌표

길안내의 목적지는 **학교 공식 위치**다.

급식실 하역 위치가 학교 내부에 별도로 존재하더라도 기본 Kakao 목적지를 급식실 출입구 좌표로 임의 변경하지 않는다.

학교 내부 이동은 급식길 사진과 학교 현장정보로 안내한다.

---

# 62. 향후 학교 내부 Pin

향후 필요하면 별도로:

```text
schoolLocation
cafeteriaEntranceLocation
unloadingLocation
```

을 저장할 수 있다.

MVP에서는 사진·설명 기반 안내를 우선한다.

---

# 63. Kakao 지도 내장 여부

MVP에서는 학교 상세에 무거운 Interactive Map을 필수로 넣지 않는다.

우선:

```text
학교정보
+
길안내 버튼
```

을 사용한다.

관리자 위치 확인 화면에서는 Kakao Map을 사용할 수 있다.

---

# 64. Kakao API Key

REST API Key는 서버에서 사용한다.

다음 기능은 서버에서 수행한다.

- 주소 검색
- Keyword 장소 검색
- 자동 Match

Kakao Local REST API는 REST API Key를 요청 헤더에 넣어 호출하도록 공식 문서에 정의되어 있다. citeturn856637search1turn300614search1

---

# 65. Client Kakao Key

향후 Kakao Web Map SDK를 관리자 화면에 직접 사용한다면 JavaScript용 플랫폼 Key가 필요할 수 있다.

REST Key와 Client용 Key의 역할을 혼합하지 않는다.

---

# 66. 외부 Secret 관리

Client Bundle에 넣지 않는다.

```text
NEIS API Key
Kakao REST API Key
Server Secret
```

서버 Secret 저장소를 이용한다.

---

# 67. NEIS Key 노출 금지

NEIS API 호출은 PWA Client에서 하지 않는다.

금지:

```text
Browser
↓
NEIS
```

채택:

```text
Admin
↓
Cloud Function
↓
NEIS
```

---

# 68. Kakao 자동 Match도 서버 중심

```text
Cloud Function
↓
Kakao Local API
↓
결과 Normalization
↓
Firestore
```

일반 Client가 자동 매칭을 수행하지 않는다.

---

# 69. API 오류 처리

외부 API 오류는 사용자 핵심 기능을 멈추게 하지 않는다.

예:

```text
Kakao 장애
```

이어도:

- 학교 검색
- 사진
- 검수시간
- 대차
- 홍보 기록

은 정상적으로 사용할 수 있어야 한다.

길안내만 일시 제한될 수 있다.

---

# 70. Retry

일시적 외부 오류는 제한적으로 재시도한다.

예:

```text
1차
↓
짧은 Backoff
↓
2차
↓
Backoff
↓
3차 실패
```

무한 Retry하지 않는다.

---

# 71. Rate Limit

외부 API 호출은 하나씩 무제한 호출하지 않는다.

특히 전체 학교 Kakao Match 시:

```text
Batch
+
Rate Control
```

을 적용한다.

외부 서비스의 현재 Quota와 이용정책은 구현 시점에 공식 정책을 다시 확인한다.

---

# 72. 결과 Cache

Kakao Place가 이미 Confirmed됐고 NEIS 주소에 변화가 없다면 매 Sync마다 Kakao API를 다시 호출하지 않는다.

```text
NEIS unchanged
+
Kakao confirmed
↓
No Kakao API Call
```

---

# 73. Kakao 재매칭 조건

다음 때만 수행한다.

```text
신규 학교

주소 변경

학교명 변경

기존 failed

기존 needsReview 재시도

관리자 수동 재검색
```

---

# 74. 장소 ID 변경

Kakao Keyword Search에서 기존 Place ID와 다른 후보가 나타나더라도 자동 교체하지 않는다.

기존:

```text
confirmed
```

이면:

```text
possiblePlaceChange
↓
관리자 Review
```

를 사용한다.

---

# 75. 동기화와 Search Catalog

NEIS Apply 완료 후 변경된 내용이 검색에 영향을 주는 경우:

```text
commonCatalogVersion + 1
```

예:

- 신규 학교
- 교명 변경
- 학교급 변경
- inactive 변경

---

# 76. Kakao Match와 Search Catalog

좌표 변경만으로 Search Catalog 전체 Version을 올릴 필요는 없다.

필요한 Detail Revision만 변경한다.

---

# 77. 학교 현장정보 Revision과 분리

```text
schoolBaseRevision
fieldRevision
photoRevision
salesRevision
```

을 논리적으로 분리한다.

NEIS Sync 때문에 현장정보 Cache가 모두 무효화되지 않도록 한다.

---

# 78. 초기 데이터 구축

첫 Production 구축:

```text
NEIS 전체 학교 데이터 수집
↓
대전 대상 Filtering
↓
학교 Base 생성
↓
Search Alias 생성
↓
Kakao 자동 Match
↓
needsReview 검토
↓
Search Catalog 생성
```

---

# 79. 초기 Import 후 관리자 검수

최소 확인:

- 학교 수
- 학교급 분포
- 행정구 분포
- 중복 학교
- 주소 누락
- Kakao Match 실패
- 학교명 이상
- inactive 후보

---

# 80. 정기 Sync 정책

MVP 초기:

```text
관리자 수동
[학교 목록 최신화]
```

을 기본으로 한다.

운영 안정화 이후 자동 Sync를 추가할 수 있다.

---

# 81. 자동 Sync

Firebase Cloud Functions에는 Cloud Scheduler를 이용하는 Scheduled Function 기능이 제공된다. citeturn856637search6turn856637search18

향후:

```text
Scheduled NEIS Fetch
↓
Diff 생성
↓
자동 Apply 하지 않음
↓
관리자에게 변경 Candidate 제공
```

방식으로 시작하는 것을 권장한다.

---

# 82. 자동 Apply 범위

운영 안정화 후 다음처럼 나눌 수 있다.

### 자동 가능

```text
전화번호
홈페이지
```

### 관리자 승인 유지

```text
교명
주소
신규 학교
Inactive
학교급
```

---

# 83. Sync 알림

변경이 없으면:

```text
학교 목록은 최신 상태입니다.
```

변경이 있으면:

```text
학교정보 변경 7건이 있습니다.

[ 확인 ]
```

---

# 84. 외부 Source Timestamp

학교 Document에는:

```text
source:
  neisSyncedAt
```

Location:

```text
location:
  kakaoMatchedAt
```

등을 유지한다.

사용자 화면에는 일반적으로 노출하지 않는다.

---

# 85. 관리자 Source 정보

관리자 화면에서는 필요 시:

```text
NEIS 최종 확인
2026.08.18

Kakao 위치 확인
2026.08.18
```

처럼 확인할 수 있다.

---

# 86. Audit Log

다음 이벤트는 감사 로그에 기록한다.

```text
NEIS_SYNC_STARTED
NEIS_SYNC_COMPLETED
NEIS_SYNC_FAILED

SCHOOL_CREATED_FROM_NEIS
SCHOOL_NAME_CHANGED
SCHOOL_ADDRESS_CHANGED
SCHOOL_MARKED_INACTIVE

KAKAO_AUTO_MATCHED
KAKAO_MATCH_CONFIRMED
KAKAO_MATCH_CHANGED
KAKAO_MATCH_FAILED
```

---

# 87. 변경 전·후 기록

학교 주요 공식정보 변경 시:

```text
field
oldValue
newValue
source
changedAt
```

을 감사 로그에 남긴다.

사진·현장정보 전체를 복제하지 않는다.

---

# 88. Sync 권한

일반 납품·홍보 직원:

```text
NEIS Sync 실행 불가
Kakao Match 확정 불가
```

관리자만 실행한다.

---

# 89. 사용자가 발견한 학교정보 오류

일반 직원에게 공식 학교명이나 주소를 직접 수정하게 하지 않는다.

대신 향후:

```text
학교정보 오류 신고
```

기능을 둘 수 있다.

MVP에서는 관리자에게 직접 전달하는 방식도 가능하다.

---

# 90. 학교 현장정보 오류

현장정보는 납품과 홍보 직원 모두 수정할 수 있다.

공식정보와 현장정보 수정 권한을 혼동하지 않는다.

---

# 91. 관리자 Sync 화면

권장 구조:

```text
학교 데이터 관리

NEIS
최종 동기화
2026.08.18

학교 000개

[ 학교 목록 최신화 ]

────────────

Kakao 위치

확인 완료    000
검토 필요      4
실패           1

[ 위치 검토 ]
```

---

# 92. Diff 상세 화면

```text
학교정보 변경

[ 신규 2 ]
[ 교명 1 ]
[ 주소 3 ]
[ 기타 4 ]
[ 누락 1 ]

────────────────

대전○○초등학교

주소 변경

기존:
...

새 주소:
...

[ 적용 ]
```

---

# 93. Bulk Apply

위험도가 낮은 변경은:

```text
선택 항목 6건 적용
```

할 수 있다.

폐교 후보나 주소 대규모 변경은 Bulk Apply에서 제외할 수 있다.

---

# 94. Rollback

동기화 오류가 발생하면 Sync Run 단위로 어떤 학교가 변경됐는지 추적 가능해야 한다.

전체 DB Snapshot을 UI에서 즉시 Rollback하는 기능은 MVP 필수가 아니다.

하지만 Audit를 이용해 변경 내용을 확인할 수 있어야 한다.

---

# 95. 데이터 삭제 금지 원칙

외부 API Sync는 다음 데이터를 Hard Delete하지 않는다.

```text
schools
schoolFieldProfiles
photos
salesProfiles
salesVisits
salesCycles
```

학교 폐교도 Soft Inactive가 기본이다.

---

# 96. API 응답 Validation

외부 데이터를 신뢰해서 바로 저장하지 않는다.

최소 Validation:

```text
schoolCode 존재
schoolName 존재

중복 Code 여부

주소 형식

대상 지역 확인

필수값 Type
```

Kakao:

```text
latitude 범위
longitude 범위
placeId 형식
address 존재 여부
```

---

# 97. 대전 지역 검증

NEIS와 Kakao 결과가 대전 범위를 벗어난 경우 자동 확정하지 않는다.

```text
needsReview
```

로 처리한다.

학교명만 같다는 이유로 타 지역 학교와 연결해서는 안 된다.

---

# 98. Kakao 좌표 검증

Kakao 결과의 X는 경도, Y는 위도로 제공된다. citeturn111107view0turn111107view2

내부 저장은 명확하게:

```text
latitude
longitude
```

로 이름을 바꿔 저장한다.

`x`, `y`라는 이름을 그대로 내부 Domain Field로 사용하지 않는다.

---

# 99. 길찾기 URL

Kakao 지도 Web API 공식 가이드는 장소 ID 또는 이름·위도·경도를 이용한 지도 및 길찾기 링크 패턴을 제공한다. 모바일에서는 환경에 맞는 Kakao 지도 화면으로 연결된다. citeturn300614search0

급식길은 이 공식 연결 방식을 사용한다.

---

# 100. Kakao 지도 실패 Fallback

Place ID 오류:

```text
좌표 기반 링크
```

좌표 없음:

```text
학교명 검색
```

그래도 실패:

```text
지도를 열 수 없습니다.
주소를 확인해주세요.
```

학교 상세 자체는 계속 사용할 수 있다.

---

# 101. 외부 API와 개인정보

NEIS와 Kakao에는 급식길의 홍보 방문정보를 전송하지 않는다.

금지:

```text
제품 관심도
담당자
방문 메모
커뮤니케이션 태그
샘플 기록
```

외부 지도 API에는 학교 위치 확인에 필요한 최소 정보만 사용한다.

---

# 102. 구현 Module

권장:

```text
NeisClient
NeisSchoolMapper
NeisSyncService
NeisDiffEngine

KakaoLocalClient
KakaoSchoolMatcher
KakaoMatchScorer

SchoolSyncRepository

ExternalApiRateLimiter
ExternalApiRetryPolicy

CatalogRebuildService
```

---

# 103. Cloud Functions

핵심 서버 기능:

```text
previewNeisSchoolSync()

applyNeisSchoolSync()

matchSchoolWithKakao()

confirmKakaoMatch()

retryFailedKakaoMatches()

rebuildSchoolCatalog()
```

향후:

```text
scheduledNeisSync()
```

추가.

---

# 104. 함수 책임 분리

예:

```text
previewNeisSchoolSync
```

는 Firestore 학교 데이터를 직접 변경하지 않는다.

```text
applyNeisSchoolSync
```

만 실제 변경을 수행한다.

Preview와 Apply를 분리한다.

---

# 105. 동기화 Transaction

한 학교 적용:

```text
school base update
+
revision update
+
audit log
```

를 가능한 한 일관된 단위로 처리한다.

전체 학교 수백 개를 하나의 거대한 Transaction으로 묶지 않는다.

---

# 106. Batch 처리

대량 학교 변경 시:

```text
Batch 1
Batch 2
Batch 3
```

형태로 처리하고 Sync Run에서 전체 진행 상태를 관리한다.

---

# 107. 필수 테스트 — 신규 학교

NEIS:

```text
기존에 없는 schoolCode
```

결과:

```text
신규 school 생성
현장정보 없음
사진 없음
Kakao Match 실행
Search Catalog 추가
```

---

# 108. 필수 테스트 — 교명 변경

같은 코드:

```text
A초
→
B초
```

결과:

```text
동일 schoolId
name 변경
A초 alias 유지
사진 유지
현장정보 유지
sales 유지
```

---

# 109. 필수 테스트 — 주소 변경

결과:

```text
NEIS 주소 변경 Candidate
Kakao 재매칭
기존 현장정보 보존
필요 시 field review 표시
```

---

# 110. 필수 테스트 — NEIS 누락

학교 1개가 다음 Sync에서 사라진다.

결과:

```text
Hard Delete 금지
inactiveCandidate
```

---

# 111. 필수 테스트 — 비정상 대량 누락

기존 300 → 신규 30.

결과:

```text
Apply 차단
SUSPICIOUS_RESULT
```

---

# 112. 필수 테스트 — Kakao 정확 Match

학교명과 주소 일치.

결과:

```text
autoMatched
```

---

# 113. 필수 테스트 — Kakao 다중 후보

같은 이름 후보 여러 개.

결과:

```text
needsReview
```

자동 확정 금지.

---

# 114. 필수 테스트 — 타 지역 학교

동일 학교명이 타 지역에 존재.

결과:

```text
대전 지역 후보 우선
타 지역 자동 Match 금지
```

---

# 115. 필수 테스트 — Kakao 실패

Kakao API 장애.

결과:

```text
학교 생성 정상
location failed
학교 검색 정상
학교 현장정보 정상
```

---

# 116. 필수 테스트 — 외부 API Key

Client Bundle 검사.

결과:

```text
NEIS Key 없음
Kakao REST Key 없음
```

---

# 117. 필수 테스트 — 현장정보 보호

NEIS Sync 전:

```text
검수시간 08:30
대차 필요
사진 3개
```

Sync 후:

```text
모두 동일
```

이어야 한다.

---

# 118. 필수 테스트 — 홍보 데이터 보호

Sync 전:

```text
♥♥♥♥♡
방문 History
샘플 기록
```

Sync 후 변경되지 않아야 한다.

---

# 119. 필수 테스트 — 교명 Alias 검색

교명 변경 후 기존 이름으로 검색.

결과:

```text
새 이름 학교가 검색됨
```

---

# 120. MVP 완료 기준

외부 API·동기화 구현은 다음을 만족해야 한다.

- NEIS 학교기본정보 Import
- 학교코드 기반 식별
- 학교명 기반 ID 사용하지 않음
- 신규 학교 자동 Candidate 생성
- 교명 변경 시 기존 데이터 유지
- 기존 교명 Alias 유지
- 주소 변경 감지
- NEIS 누락 시 Hard Delete 없음
- inactiveCandidate 지원
- 관리자 Sync Preview
- Diff 확인 후 Apply
- Sync 감사 로그
- Kakao 주소 검색
- Kakao Keyword Search
- Place ID 저장
- latitude / longitude 저장
- 자동 Match
- needsReview
- 관리자 Match 확정
- Kakao 실패 Fallback
- 길안내 연결
- 외부 Key Client 미노출
- 현장정보 Sync 보호
- 사진 Sync 보호
- 홍보정보 Sync 보호
- Search Catalog Version 연동

---

# 121. 구현 우선순위

## Phase 1 — NEIS Client

```text
API Client
Paging
Normalization
Validation
```

## Phase 2 — Initial Import

```text
Daejeon Filter
schools 생성
School ID
Alias
```

## Phase 3 — Sync Diff

```text
NEW
CHANGED
MISSING
Preview
```

## Phase 4 — Apply

```text
Update
Revision
Audit
Catalog
```

## Phase 5 — Kakao

```text
Address Search
Keyword Search
Place ID
Coordinate
```

## Phase 6 — Matching

```text
Confidence
Auto Match
Needs Review
Admin Confirm
```

## Phase 7 — Map

```text
Kakao 지도
길안내
Fallback
```

## Phase 8 — Hardening

```text
Retry
Rate Limit
Suspicious Result
Failure Recovery
Tests
```

---

# 122. 공식 API 기술 전제

본 설계는 작성 시점의 공식 문서를 기준으로 다음 사항을 확인했다.

- NEIS 학교기본정보 데이터셋은 학교명, 주소, 전화번호, 홈페이지 등의 공식 학교 기본정보를 제공하며 현재 `매주` 적재 주기로 안내된다. citeturn961016search0turn745086view0
- NEIS Open API에는 인증키와 Page Index/Page Size 기반 기본 요청 구조가 제공된다. citeturn745086view0
- Kakao Local API는 주소를 이용한 좌표 변환과 키워드 장소 검색을 제공한다. citeturn300614search1turn856637search1
- Kakao 장소 검색 결과에는 Place ID, 장소명, 주소, 경도, 위도 등의 정보가 포함된다. citeturn111107view0turn111107view3
- Kakao 지도는 좌표 또는 Place ID를 이용해 지도 또는 길찾기로 연결할 수 있는 공식 URL 방식을 제공한다. citeturn300614search0
- Firebase Cloud Functions는 Cloud Scheduler 기반 Scheduled Function을 지원한다. citeturn856637search6turn856637search18

외부 API의 Query Parameter, Quota, Key 설정 등 세부 구현값은 실제 개발 시점에 공식 문서를 다시 확인하고 코드에 반영한다.

---

# 123. 최종 데이터 경계

```text
NEIS
│
└─ 학교 공식정보
        │
        ▼
schools
        │
        ├───────── Kakao
        │           │
        │           └─ 지도 위치
        │              Place ID
        │              좌표
        │
        ▼
급식길
│
├─ schoolFieldProfiles
├─ photos
├─ salesProfiles
├─ salesVisits
└─ salesCycles
```

외부 Source에서 급식길 내부 업무 데이터 방향으로 자동 덮어쓰기는 존재하지 않는다.

---

# 124. 한 줄 정의

> **급식길의 외부 데이터 동기화는 NEIS를 학교 공식정보의 공급원으로, Kakao를 위치·길안내 보조정보의 공급원으로 사용하되, 모든 변경을 학교코드와 Revision을 기준으로 안전하게 병합하고 회사가 축적한 현장·사진·홍보 데이터를 외부 Sync로부터 완전히 보호하는 구조다.**

---

# 125. 문서 상태

본 문서는 **급식길 외부 API·데이터 동기화 설계서 v1.0**이다.

실제 초기 Import 후 다음 항목을 조정한다.

- 대상 학교급
- NEIS Filtering
- Sync Diff 임계값
- 자동 Apply 범위
- Kakao Match Confidence Weight
- 주소 변경 거리 기준
- Kakao Retry 정책
- 자동 Sync 주기
- 관리자 위치 검토 UI

변경 시:

```text
External Data Design v1.1
External Data Design v1.2
```

형태로 관리한다.
