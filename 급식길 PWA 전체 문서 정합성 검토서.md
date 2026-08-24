# 급식길 PWA 전체 문서 정합성 검토서

**문서 버전:** 1.0  
**검토 대상:** 급식길 MVP 개발 전 전체 설계 문서  
**목적:** 문서 간 충돌·구버전 정책·불명확한 구현 기준 제거 및 최종 Source of Truth 확정

---

# 1. 검토 대상 문서

현재까지 작성한 문서는 다음 9종이다.

```text
01. 급식길 PWA MVP 기획서

02. 데이터베이스 상세 설계서

03. 인증·권한·보안 설계서 v1.2

04. 디자인 시스템 v1.0

05. 화면·UX 상세 명세서 v1.1

06. 검색·캐시·성능 설계서 v1.0

07. 외부 API·데이터 동기화 설계서 v1.0

08. 테스트·인수 기준서 v1.0

09. 구현 명세서 v1.0
```

---

# 2. 전체 검토 결과

전체 구조의 핵심 방향에는 큰 충돌이 없다.

다음 핵심 구조는 이미 일관되게 정리돼 있다.

```text
학교 기본정보
+
학교 현장정보
+
학교 사진
+
홍보·영업정보
```

권한:

```text
납품
= 기본정보 + 현장정보 + 사진

홍보
= 기본정보 + 현장정보 + 사진 + 홍보정보
```

또한 다음 설계도 일관된다.

- 월별 홍보 Assignment
- 학교별 영구 Sales Profile
- 방문 Event History
- 하트 기반 제품 관심도
- 최대 사진 3장
- 로컬 학교 검색
- NEIS Runtime 검색 금지
- NEIS와 현장정보 분리
- Kakao 위치정보 별도 관리
- PIN 단독 로그인
- 로그인 지속
- 역할별 데이터 접근 차단

따라서 프로젝트의 기본 Architecture를 다시 설계할 필요는 없다.

---

# 3. 최종 Source of Truth 원칙

문서 간 충돌 발생 시 다음 순서를 적용한다.

```text
1. 가장 최근 확정된 사용자 요구

2. 본 정합성 검토서

3. 최신 Version 상세 설계서

4. 구현 명세서

5. 구버전 문서
```

---

# 4. 정합성 이슈 01 — 직원코드 로그인

## 과거 정책

```text
직원코드 + PIN
```

## 최신 정책

```text
PIN 단독 로그인
```

### 최종 확정

일반 직원 로그인 화면에는:

```text
직원코드
이메일
사용자명
```

을 요구하지 않는다.

사용자 입력:

```text
고유 개인 PIN 6자리
```

하나만 사용한다.

---

# 5. 정합성 이슈 02 — 휴대폰 번호 뒷 6자리

일부 인증 문서에서 다음 정책이 추가됐다.

```text
휴대폰 번호 뒷 6자리
→ 기본 PIN
```

그러나 이는 사용자가 요청하거나 확정한 요구가 아니라 문서 작성 과정에서 추가된 설계였다.

또한 전화번호를 인증정보 생성 규칙과 연결하면:

- PIN 추측 가능성 증가
- 불필요한 개인정보 의존
- 휴대폰 번호 변경 처리
- 직원 전화번호 수집 의존

이 생긴다.

### 최종 수정

**휴대폰 번호 뒷 6자리 기본 PIN 정책을 제거한다.**

최종 PIN 정책:

```text
숫자 6자리

직원별 고유

관리자 또는 시스템에서 발급

평문 저장 금지

중복 금지

약한 패턴 제한
```

예:

```text
582914
274683
905217
```

전화번호는 PIN 생성에 사용하지 않는다.

---

# 6. PIN 최종 정책

```text
로그인 입력
→ PIN 6자리 하나

직원 식별
→ PIN Lookup

실제 인증
→ PIN Hash 검증
```

서버 구조:

```text
PIN
↓
HMAC 기반 Lookup Key
↓
employeeId
↓
PIN Hash 검증
↓
Custom Token
↓
Firebase Authentication
```

---

# 7. 로그인 지속 정책

최종 정책:

```text
최초 PIN 로그인
↓
Firebase 로그인 유지
↓
앱 종료
↓
로그인 유지
↓
다음 실행
↓
바로 업무 화면
```

다음 이유로 자동 로그아웃하지 않는다.

```text
앱 종료
브라우저 종료
일정시간 미사용
```

---

# 8. 재로그인이 필요한 경우

다음 경우에만 PIN을 다시 입력한다.

```text
사용자 직접 로그아웃

관리자 세션 폐기

직원 비활성화

권한 변경

PIN 변경 + 세션 폐기

보안상 강제 로그아웃
```

---

# 9. 관리자 인증

일반 직원 PIN 인증과 관리자 인증은 분리한다.

최종:

```text
일반 직원
→ PIN

관리자
→ 강화된 별도 인증
```

MVP 권장 관리자 인증:

```text
Google 로그인
+
관리자 Allowlist
+
admin 권한
```

일반 직원 PIN만으로 관리자 권한을 취득하는 구조를 만들지 않는다.

---

# 10. 정합성 이슈 03 — 역할명

과거 일부 설계에서:

```text
manager
```

역할 가능성이 언급됐다.

최종 지원 Role:

```text
delivery

sales

viewer

admin
```

MVP에서 `manager` Role은 사용하지 않는다.

필요해질 경우 이후 Permission 기반 확장을 우선한다.

---

# 11. 학교 정보 구조 최종 확정

```text
schools/{schoolId}
```

학교 공식 기본정보.

```text
schoolFieldProfiles/{schoolId}
```

회사 공용 학교 현장정보.

```text
schools/{schoolId}/photos/{slotId}
```

학교 공용 사진.

---

# 12. 폐기 Collection 이름

다음 이름은 더 이상 사용하지 않는다.

```text
deliveryProfiles

deliveryPhotos
```

최종:

```text
schoolFieldProfiles

schools/{schoolId}/photos
```

기획서·DB 문서·코드에서 과거 명칭을 모두 제거해야 한다.

---

# 13. 학교 현장정보 최종 정의

과거의 `납품정보`라는 개념은 폐기한다.

최종 이름:

> **학교 현장정보**

포함:

```text
급식실 위치

건물 / 층

출입구

이동 동선

검수시간

대차 필요 여부

엘리베이터

계단

차량 진입

하역 위치

주차

현장 특이사항
```

납품과 홍보 모두 사용할 수 있는 회사 공용 자산이다.

---

# 14. 학교 사진 최종 권한

사진 역시 납품 전용 자산이 아니다.

```text
Delivery
→ Read / 업무상 수정

Sales
→ Read / 업무상 수정

Viewer
→ Read

Admin
→ 관리
```

MVP에서는 사진마다:

```text
common
delivery
sales
```

같은 visibility 구분을 만들지 않는다.

모든 학교 현장사진은 기본적으로 공용 현장정보다.

---

# 15. 사진 개수

최종:

```text
학교당 최대 3장
```

Slot:

```text
01
02
03
```

권장 의미:

```text
01 학교 / 접근

02 급식실 출입구

03 검수 / 하역 위치
```

---

# 16. 사진 Version

기존 사진을 같은 Storage Object에 덮어쓰지 않는다.

```text
schools/{schoolId}/photos/{slotId}/{versionId}/
```

하위:

```text
thumbnail.webp

preview.webp

original.webp
```

---

# 17. 정합성 이슈 04 — 사진 삭제와 Undo

UX 문서에는:

```text
사진 삭제
→ 실행 취소
```

가 존재한다.

Storage 설계에서는 Version 보존을 사용한다.

이를 다음 방식으로 통일한다.

### 최종 정책

사용자 삭제:

```text
현재 Photo Metadata
→ deleted 상태
```

즉시 물리 파일 삭제하지 않는다.

Undo:

```text
deleted
→ active
```

관리자 Cleanup 정책 또는 보존기간이 지난 후 과거 Version을 물리 정리할 수 있다.

이 방식으로:

- Undo
- 감사
- 실수 복구
- Version 관리

를 일관되게 지원한다.

---

# 18. 정합성 이슈 05 — Firestore 직접 Write

일부 보안 문서의 권한표에서는:

```text
schoolFieldProfiles
Delivery RW

Sales RW
```

로 표현했다.

이는 **업무상 수정 권한**을 의미하며 Client Firestore SDK에서 직접 Document를 Write한다는 뜻으로 해석하면 안 된다.

구현 명세에서는 중요한 변경을 Cloud Functions로 처리하도록 정의했다.

### 최종 Architecture

```text
Client
↓
Callable Function
↓
Authorization
↓
Validation
↓
Revision
↓
Firestore
↓
Audit
```

를 사용한다.

---

# 19. Client 직접 Write 정책

최종 원칙:

### 직접 Read

역할이 허용하면 Firestore Client Read 가능.

### 중요 업무 Write

Cloud Functions 사용.

대상:

```text
schoolFieldProfiles

salesProfiles

salesVisits

salesCycles

assignments

사진 Metadata

직원

PIN

CSV

NEIS Sync

Kakao Confirm
```

즉 Security 문서의 `RW`는:

```text
업무 권한
```

을 의미한다.

실제 Database Mutation은 서버 경유를 기본으로 한다.

---

# 20. 이 구조를 선택하는 이유

학교 현장정보를 Function으로 수정하면 한 곳에서:

```text
권한

Validation

revision

updatedBy

updatedAt

Audit Log
```

를 모두 처리할 수 있다.

홍보 기록도 동일하다.

따라서 MVP에서는 Client 직접 업무 Document Write를 최소화한다.

---

# 21. 홍보정보 최종 구조

학교별 현재 상태:

```text
salesProfiles/{schoolId}
```

방문 Event:

```text
salesVisits/{visitId}
```

월별 업무 배정:

```text
salesCycles/{YYYY-MM}/assignments/{schoolId}
```

세 가지 역할을 섞지 않는다.

---

# 22. Sales Profile 영구 데이터

월이 바뀌어도 유지:

```text
제품 관심도

관심 제품

커뮤니케이션 참고

최근 방문

현재 후속 활동

다음 행동
```

---

# 23. 월별 데이터

새 달마다 새로 생성:

```text
구역

주 담당자

담당 직원

월 방문 상태

월 홍보지 상태

월 샘플 상태
```

---

# 24. 방문 History

```text
salesVisits
```

는 월이 변경돼도 삭제하지 않는다.

과거 Cycle 역시 보존한다.

---

# 25. 담당자와 실제 방문자

항상 구분한다.

```text
primaryAssigneeId
```

= 월 주 담당자.

```text
visitedBy
```

= 실제 방문 직원.

```text
recordedBy
```

= 기록을 입력한 직원.

세 값이 서로 다를 수 있다.

---

# 26. 팀 조회 정책

홍보 직원:

```text
내 구역
→ 기본

전체 보기
→ 사용자가 선택
```

팀 전체 활동은 Read 가능하다.

단:

```text
직원 순위
실적 Ranking
저성과자 강조
```

를 만들지 않는다.

전체 보기 목적은 협업이다.

---

# 27. 통계 문서의 의미

과거 DB 설계의:

```text
employeeStats

team stats
```

는 직원 평가용 데이터로 사용하지 않는다.

허용 목적:

```text
이번 달 방문 완료 수

방문 전 학교 수

후속 필요 수

구역 진행률
```

등 업무 진행상황의 계산 Cache.

직원 성과 Ranking을 만들지 않는다.

---

# 28. 제품 관심도 최종 정의

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

Label:

```text
0
미평가 / 관심도 미확인

20
관심 낮음

40
관심 보통

60
관심 있음

80
구체 검토

100
도입 협의
```

---

# 29. 정합성 이슈 06 — 관심도 0과 방문 완료

방문 완료 시 관심도 입력이 필요하지만:

```text
0
```

은 `미평가`라는 실제 값이다.

문제:

사용자가 아무 행동도 하지 않은 것과:

```text
"이번 방문에서는 관심도를 판단하지 못함"
```

은 다르다.

### 최종 UX

방문 Form 내부 State:

```text
undefined
```

= 아직 선택하지 않음.

사용자가 명시적으로:

```text
관심도 미확인
```

을 선택하면:

```text
0
```

저장.

또는 하트 1~5개를 선택한다.

따라서 방문 완료에는 **관심도에 대한 명시적인 선택**이 필요하다.

---

# 30. 방문 완료 최소 정보

최종:

```text
방문 날짜

실제 방문자

홍보지
전달 / 미전달

샘플
전달 / 미전달

제품 관심도
0/20/40/60/80/100 중 명시적 선택

방문 결과 한 줄
```

---

# 31. 커뮤니케이션 태그와 활동 태그

두 체계를 절대 합치지 않는다.

## Persistent

```text
communicationTags
```

학교별 업무 커뮤니케이션 참고.

## Event

```text
activityTags
```

특정 방문 상황.

---

# 32. 검색 최종 구조

학교 타이핑:

```text
Memory Search Index
```

에서 처리한다.

검색 중:

```text
Firestore Request = 0

NEIS Request = 0

Kakao Request = 0
```

---

# 33. Search Catalog 구조

단일 거대 Firestore Document에 의존하지 않는다.

논리 구조:

```text
searchCatalogs/{catalogId}
```

필요 시:

```text
행정구
또는
고정 Chunk
```

기준으로 분할한다.

Catalog Meta에서 Version을 관리한다.

---

# 34. Catalog 구성

공통:

```text
Common Catalog

Field Catalog
```

홍보:

```text
Sales Catalog

Monthly Assignment Catalog
```

---

# 35. 정합성 이슈 07 — Sales Persistent Cache

성능 문서에서는 개인 기기에 Sales Summary를 Persistent Cache할 수 있도록 여지를 남겼다.

그러나 MVP에서는:

- 로그인 지속
- 공유 PC 가능성
- 영업정보 민감성
- Offline Sales Write 미지원

을 함께 고려해야 한다.

### 최종 MVP 정책

Persistent IndexedDB의 핵심 대상:

```text
학교 Search Catalog

학교 기본정보 Summary

학교 현장정보 Cache

최근 학교

Version Metadata
```

홍보 민감정보:

```text
salesProfiles

salesVisits

communicationTags

follow-up 상세
```

는 **MVP 기본 Persistent Cache 대상에서 제외**한다.

Memory 중심으로 사용한다.

---

# 36. Sales Offline 수준

MVP에서 반드시 지원하지 않는다.

```text
전체 Sales Offline 업무
```

Online 상태에서 서버 최신 Sales 정보를 가져온다.

Offline에서 Cache가 우연히 남아 있는지에 의존하는 기능을 제품 요구사항으로 만들지 않는다.

---

# 37. 학교 현장정보 Offline

반드시 지원을 목표로 한다.

이유:

납품 현장에서 Network가 좋지 않아도 다음은 중요하다.

```text
학교 검색

급식실 위치

검수시간

대차

출입구

차량 진입

Cache된 사진
```

---

# 38. 로그인 지속과 Cache는 별개

다음을 혼동하지 않는다.

```text
Firebase Auth Persistence
```

와:

```text
업무 데이터 Persistent Cache
```

는 별도 정책이다.

즉 사용자는 로그인 상태가 유지되더라도 홍보 민감 데이터 전체가 IndexedDB에 영구 저장될 필요는 없다.

---

# 39. NEIS Source 경계

NEIS가 수정 가능:

```text
학교명

학교급

공식 주소

전화

홈페이지

공식 Metadata
```

NEIS가 수정 불가:

```text
학교 현장정보

학교 사진

Sales Profile

Sales Visits

Assignments
```

---

# 40. 학교 식별

학교명 기준 ID 금지.

최종:

```text
NEIS 학교 행정표준코드 기반 schoolId
```

동일 코드에서 교명 변경:

```text
same schoolId
```

유지.

---

# 41. 교명 변경

```text
기존 이름
→ aliases
```

에 보존한다.

따라서 과거 이름으로도 검색할 수 있다.

---

# 42. 학교 누락

NEIS 최신 결과에서 한 번 사라졌다고:

```text
삭제
```

하지 않는다.

최종:

```text
inactiveCandidate
```

관리자 검토.

---

# 43. Kakao Source 경계

Kakao:

```text
latitude
longitude
placeId
matched address
match metadata
```

만 담당한다.

학교 현장정보를 Kakao 데이터와 합치지 않는다.

---

# 44. Kakao 확정 우선순위

```text
관리자 Manual Confirm
>
관리자 Kakao Confirm
>
Auto Match
>
Address-only
>
Unmatched
```

관리자가 확정한 위치를 자동 Sync가 쉽게 덮어쓰지 않는다.

---

# 45. 외부 API Secret

Client에 포함 금지:

```text
NEIS API Key

Kakao REST API Key

PIN Secret

PIN Pepper

Firebase Admin Credential
```

---

# 46. 관리자 기능

관리자 인증 후 다음을 제공한다.

```text
직원 관리

PIN 관리

권한

세션 폐기

월별 Cycle

Assignment

NEIS Sync

Kakao Review

CSV

Audit
```

관리자 작업은 서버 Function 중심으로 구현한다.

---

# 47. CSV 최종 정책

Client-side 전체 데이터 Export 금지.

```text
Client
↓
exportCsv()
↓
Server 권한 확인
↓
CSV 생성
↓
exportJobs
```

한글 Excel 호환:

```text
UTF-8 BOM
```

---

# 48. CSV 임시파일

DB 상세 설계에서 제안된 임시 Export 정책을 유지한다.

권장:

```text
Export File
→ 임시 Storage

유효기간
→ 24시간 수준
```

실제 만료시간은 구현 시 설정값으로 둔다.

---

# 49. Audit 정책

Client가 직접 Audit Log를 작성하지 않는다.

Server Mutation 성공 시:

```text
actor
target
event
time
changedFields
```

기록.

PIN·Secret·민감 원문은 Audit에서 제외한다.

---

# 50. 구현 Stack 정합성

현재 구현 명세:

```text
Next.js App Router

TypeScript

Firebase Web SDK

Cloud Functions

Firestore

Storage

App Check

Emulator
```

은 다른 문서들과 충돌하지 않는다.

따라서 MVP 구현 Stack으로 유지한다.

---

# 51. Next.js Version 정책

구현 명세에 특정 Major Version을 명시했더라도 프로젝트 Bootstrap 시 설치되는 버전은 다음 원칙을 적용한다.

```text
현재 검증된 Stable Version
+
App Router
```

Major Version 숫자보다 Architecture 기준을 Source of Truth로 한다.

즉 구현 시점에 Patch/Minor 변화가 있더라도 설계를 바꾸는 것으로 간주하지 않는다.

---

# 52. Client / Server 최종 책임

## Client

```text
UI

Local Search

IndexedDB

Memory Cache

사진 표시

Form State

Optimistic UX
```

## Server

```text
Authentication

Authorization

Business Mutation

Validation

Revision

Audit

CSV

NEIS

Kakao

사진 Finalize
```

---

# 53. 최종 Architecture

```text
                 ┌───────────────┐
                 │     NEIS      │
                 └──────┬────────┘
                        │
                        ▼
               ┌─────────────────┐
               │ Cloud Functions │◄──── Kakao
               └────────┬────────┘
                        │
        ┌───────────────┴──────────────┐
        │                              │
        ▼                              ▼
   Firestore                        Storage
        │                              │
        ▼                              ▼
   Repository                     Photo Loader
        │                              │
        ├──────── IndexedDB ───────────┤
        │                              │
        ▼                              ▼
      Memory                          UI
        │
        ▼
       UI
```

---

# 54. 인증 Architecture

```text
PIN 6자리
↓
App Check
↓
employeeLogin()
↓
PIN Lookup + Hash 검증
↓
Custom Token
↓
Firebase Auth
↓
Persistent Login
↓
Role + sessionVersion
↓
업무 데이터
```

---

# 55. 납품 최종 Flow

```text
앱 실행
↓
기존 로그인 확인
↓
납품 홈
↓
학교 검색
↓
학교 상세
↓
사진
↓
급식실 위치
↓
검수시간
↓
대차
↓
길안내
```

---

# 56. 홍보 최종 Flow

```text
앱 실행
↓
기존 로그인 확인
↓
내 구역
↓
학교 선택
↓
관심도 / 이전 기록
↓
현장정보
↓
방문
↓
방문 기록
↓
홍보지
↓
샘플
↓
관심도
↓
결과
↓
후속
↓
저장
```

---

# 57. 문서별 수정 필요 상태

## 01. MVP 기획서

**수정 필요**

확인/수정:

```text
납품정보
→ 학교 현장정보

deliveryProfiles
→ 제거

직원코드 + PIN
→ PIN 단독

제품 관심도 %
→ UI Heart

로그인 지속 정책 추가
```

---

## 02. 데이터베이스 상세 설계서

**수정 필요**

```text
deliveryProfiles
→ schoolFieldProfiles

deliveryPhotos
→ schools/{schoolId}/photos

loginAlias
→ 인증용으로 제거

pinIndexes 추가

사진 visibility 제거

사진 deleted/version 정책 추가
```

---

## 03. 인증·권한·보안 설계서

**수정 필요**

가장 중요한 수정:

```text
휴대폰 번호 뒷 6자리 기본 PIN
→ 제거
```

그리고:

```text
업무상 RW
≠ Client Firestore 직접 Write
```

를 명시한다.

관리자 Google Allowlist 인증도 최종 기준으로 명확히 한다.

---

## 04. 디자인 시스템

**큰 수정 없음**

현재 설계 유지.

관심도 Heart / Status / Glass / Motion 모두 최신 정책과 일치한다.

---

## 05. 화면·UX 상세 명세서

**소폭 수정 필요**

관리자 PIN 화면에서:

```text
휴대폰 번호 기반 PIN
```

관련 표현 제거.

방문 관심도에서:

```text
미선택
vs
미평가 0
```

를 구분.

---

## 06. 검색·캐시·성능 설계서

**소폭 수정 필요**

Sales Persistent Cache 정책을:

```text
MVP 기본 제외
```

로 명확하게 수정.

공통 학교/현장정보 Offline Cache를 핵심으로 유지한다.

---

## 07. 외부 API·동기화 설계서

**큰 수정 없음**

현재 NEIS/Kakao 경계가 최종 Architecture와 일치한다.

---

## 08. 테스트·인수 기준서

**소폭 수정 필요**

추가 Test:

```text
휴대폰 번호가 PIN으로 자동 사용되지 않음

방문 Interest 미선택 저장 차단

Interest 0 명시 선택 저장 가능

Client 직접 Field Write 차단

Server Function Mutation 성공
```

---

## 09. 구현 명세서

**소폭 수정 필요**

추가 명확화:

```text
Admin Google Auth

Core Domain Client Write DENY

Sales Persistent Cache 기본 제외

Photo Soft Delete

Interest undefined vs 0
```

---

# 58. 수정 우선순위

구현 전에 반드시 수정:

```text
02 데이터베이스

03 인증·권한·보안

05 화면·UX

09 구현 명세
```

테스트 시작 전 수정:

```text
06 검색·캐시

08 테스트·인수
```

기획서:

```text
01
```

도 최종 통합본으로 정리하는 것이 좋다.

---

# 59. 최종 Collection 기준표

```text
schools/{schoolId}

schoolFieldProfiles/{schoolId}

schools/{schoolId}/photos/{slotId}

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

products/{productId}

communicationTags/{tagId}

activityTags/{tagId}

searchCatalogs/{catalogId}

exportJobs/{jobId}

auditLogs/{logId}

neisSyncRuns/{runId}

appSettings/public

secureSettings/*
```

`employeeStats`는 성과평가가 아니라 월별 업무 진행 Summary Cache로만 사용한다.

---

# 60. 최종 권한 기준표

| 데이터 | 납품 | 홍보 | Viewer | 관리자 |
|---|---:|---:|---:|---:|
| 학교 기본정보 | R | R | R | R/M |
| 학교 현장정보 | R/M | R/M | R | R/M |
| 학교 사진 | R/M | R/M | R | R/M |
| Sales Profile | - | R/M | - | R/M |
| Sales Visits | - | R/제한 M | - | R/M |
| 월별 Assignment | - | R | - | R/M |
| 직원 공개 Directory | 필요 범위 R | R | 필요 범위 R | R |
| 인증정보 | - | - | - | 서버 |
| Audit | - | - | - | R |
| CSV | - | 권한범위 | - | 전체 |

여기서 `M`은 **Mutation 권한**이며, 핵심 데이터는 Server Function을 통해 수행한다.

---

# 61. 구현 전 남아 있는 비결정 사항

개발을 막는 수준의 미결정 사항은 거의 없다.

구현 중 조정 가능한 사항:

```text
정확한 HEX Color

사진 Thumbnail 실제 Pixel

Preview 실제 Pixel

Animation 미세 Duration

검색 Ranking Weight

Kakao Match Score

CSV 파일 만료시간

NEIS 자동 Sync 주기
```

이들은 Architecture 결정이 아니므로 개발 중 테스트를 통해 조정할 수 있다.

---

# 62. 구현 전 반드시 확정된 사항

다음은 Codex가 임의 변경할 수 없다.

```text
PIN 단독 로그인

PIN 6자리 고유값

로그인 지속

Admin 강화 인증

학교코드 기반 ID

학교 현장정보 공용

사진 최대 3장

Sales 정보 Delivery 차단

월별 Assignment

Sales Profile 영구 유지

방문 History 보존

관심도 6단계 값

UI Heart 표시

로컬 학교검색

NEIS Runtime 검색 금지

외부 Sync의 업무 데이터 보호

Server 중심 Mutation
```

---

# 63. 프로젝트 현재 상태

전체 문서를 대조한 결과:

```text
제품 구조
→ 확정

데이터 구조
→ 확정

권한 구조
→ 확정

인증 구조
→ 확정

화면 구조
→ 확정

디자인 방향
→ 확정

검색·Cache
→ 확정

외부 Sync
→ 확정

테스트 기준
→ 확정

구현 순서
→ 확정
```

따라서 **Architecture를 추가로 설계할 필요는 없다.**

---

# 64. 다음 작업

본 정합성 검토 결과를 각 관련 문서에 반영한다.

권장 순서:

```text
1. 데이터베이스 상세 설계서 개정

2. 인증·권한·보안 설계서 개정

3. 화면·UX 상세 명세서 개정

4. 검색·캐시·성능 설계서 개정

5. 테스트·인수 기준서 개정

6. 구현 명세서 개정

7. MVP 기획서 최종 통합
```

그 후 문서 변경을 멈추고:

```text
Codex Phase 0
```

부터 개발을 시작한다.

---

# 65. 정합성 검토 최종 판정

**판정: 개발 착수 가능**

단, 본 검토에서 발견된 정책 충돌을 기존 문서에 반영한 뒤 구현 명세서 최종 Version을 Codex의 Source of Truth로 사용한다.

가장 중요한 수정 사항은 다음 5가지다.

```text
1.
휴대폰 번호 기반 PIN 제거

2.
학교 현장정보 명칭과 Collection 통일

3.
핵심 업무 Mutation을 Cloud Functions로 통일

4.
Sales Persistent Cache를 MVP 기본 범위에서 제외

5.
방문 관심도에서 "미선택"과 "미평가 0"을 구분
```

---

# 66. 한 줄 정의

> **급식길의 최종 설계는 고유 6자리 PIN으로 한 번 로그인한 뒤 인증을 지속하고, 학교 공식정보·공용 현장정보·홍보정보를 명확히 분리하며, 역할별 직접 조회와 서버 중심 변경, 로컬 학교검색, 버전형 사진, 월별 홍보 Cycle 및 안전한 외부 데이터 동기화를 결합한 내부 현장업무 PWA 구조로 확정한다.**

---

# 67. 문서 상태

본 문서는 **급식길 PWA 전체 문서 정합성 검토서 v1.0**이다.

기존 문서에 충돌하는 내용이 남아 있는 동안에는 본 문서의 최종 결정사항을 우선 적용한다.

관련 문서 개정이 완료되면 본 문서는 설계 변경 기록 및 Architecture Decision 기준 문서로 보존한다.