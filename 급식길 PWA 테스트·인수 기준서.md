# 급식길 PWA 테스트·인수 기준서

**문서 버전:** 1.1  
**대상:** 급식길 PWA MVP  
**목적:** 기능 구현 완료 여부 및 Production 배포 가능 여부 판정  
**관련 문서:** MVP 기획서 v1.3 / 데이터베이스 상세 설계서 v1.3 / 인증·권한·보안 설계서 v1.3 / 디자인 시스템 v1.0 / 화면·UX 상세 명세서 v1.2 / 검색·캐시·성능 설계서 v1.1 / 외부 API·데이터 동기화 설계서 v1.0

---

# 1. 문서 목적

본 문서는 급식길 MVP가 실제 업무에 투입 가능한 상태인지 판단하기 위한 테스트 기준을 정의한다.

단순히 화면이 열리고 버튼이 작동하는 수준을 완료로 보지 않는다.

다음 조건을 모두 만족해야 한다.

```text
기능이 작동한다
+
권한이 정확하다
+
데이터가 보존된다
+
충분히 빠르다
+
현장에서 사용하기 쉽다
+
오류가 발생해도 복구 가능하다
```

---

# 2. 테스트 최상위 원칙

급식길의 테스트는 코드 단위보다 **실제 직원 행동 흐름**을 우선한다.

예:

```text
로그인 함수 테스트
```

만으로 끝내지 않는다.

실제 인수 테스트:

```text
앱 설치
↓
PIN 로그인
↓
앱 종료
↓
다시 실행
↓
로그인 유지
↓
학교 검색
↓
학교 상세 확인
```

전체 Flow가 정상이어야 한다.

---

# 3. 완료의 정의

개발자가 다음과 같이 보고하는 것만으로 완료로 인정하지 않는다.

```text
"구현했습니다."
```

각 기능은 최소한 다음 네 조건을 충족해야 한다.

```text
기능 구현
+
자동 테스트
+
수동 사용자 Flow 테스트
+
문서 인수 기준 통과
```

---

# 4. 결함 중요도

## P0 — 배포 차단

서비스를 배포할 수 없는 문제.

예:

- 납품 사용자가 홍보정보 조회 가능
- 다른 직원 PIN으로 인증 우회
- 사진 또는 방문기록 유실
- 로그인 불가능
- 학교 검색 불가능
- 서버 Secret 노출
- 전체 앱 Crash

P0가 하나라도 있으면 Production 배포 불가.

---

## P1 — 반드시 수정

핵심 업무에 큰 영향을 주는 문제.

예:

- 특정 학교 상세가 열리지 않음
- 방문 기록 저장 실패
- 사진 업로드 실패
- 앱 재실행 시 반복 로그인
- 내 구역 학교 누락
- 잘못된 관심도 저장
- NEIS Sync가 현장정보를 덮어씀

Production 이전 수정이 원칙이다.

---

## P2 — 개선 가능

핵심 업무는 가능하지만 품질이 떨어지는 문제.

예:

- Animation 미세한 부자연스러움
- 카드 간격 불균형
- Toast 위치 문제
- 일부 Desktop Hover 문제

MVP 배포 이후 개선할 수 있다.

---

# 5. 테스트 환경

최소 다음 환경에서 확인한다.

## 모바일

- Android Chrome
- Android PWA 설치 상태
- iPhone Safari
- iPhone 홈 화면 추가 상태

## Desktop

- Windows Chrome
- Desktop 관리자 화면

---

# 6. 네트워크 환경

다음 환경을 각각 테스트한다.

```text
빠른 Wi-Fi
일반 모바일 네트워크
느린 모바일 네트워크
Offline
사용 중 Network 단절
Network 재연결
```

---

# 7. 테스트 사용자

최소 다음 계정을 준비한다.

```text
DELIVERY_USER
납품 권한

SALES_USER_A
홍보 A

SALES_USER_B
홍보 B

MULTI_ROLE_USER
납품 + 홍보

VIEWER_USER
읽기 전용

ADMIN_USER
관리자

DISABLED_USER
비활성 직원
```

---

# 8. 테스트 학교 데이터

최소 다음 학교 상태를 준비한다.

### SCHOOL_A

```text
현장정보 완전 등록
사진 3장
홍보 방문 이력 존재
관심도 존재
```

### SCHOOL_B

```text
현장정보 일부 등록
사진 1장
홍보 방문 이력 없음
```

### SCHOOL_C

```text
현장정보 없음
사진 없음
```

### SCHOOL_D

```text
교명 변경 이력
이전 이름 Alias 존재
```

### SCHOOL_E

```text
inactiveCandidate
```

---

# 9. 인증 TEST — 최초 로그인

### Given

로그인 이력이 없는 정상 직원

### When

올바른 6자리 PIN 입력

### Then

```text
인증 성공
↓
사용자 Role 확인
↓
업무 홈 진입
```

직원코드 입력은 요구하지 않는다.

**PASS 조건:** PIN 하나만으로 정상 로그인.

---

# 10. 인증 TEST — 잘못된 PIN

잘못된 PIN 입력.

예상:

```text
PIN을 확인해주세요.
```

계정 존재 여부 등의 내부 정보는 노출하지 않는다.

**PASS 조건:** 인증 실패 + 데이터 접근 불가.

---

# 11. 인증 TEST — 반복 실패

PIN을 연속 실패시킨다.

예상:

```text
설정된 실패 횟수 도달
↓
일시적 로그인 제한
```

**PASS 조건:** 무제한 PIN 추측 불가능.

---

# 12. 인증 TEST — 로그인 지속

### Flow

```text
PIN 로그인
↓
업무 화면
↓
앱 종료
↓
앱 재실행
```

### Expected

```text
PIN 화면 없음
↓
기존 로그인 유지
↓
업무 화면
```

**PASS 조건:** 정상 세션에서 반복 인증 요구 없음.

---

# 13. 인증 TEST — 브라우저 재실행

```text
로그인
↓
브라우저 완전 종료
↓
재실행
↓
급식길 접속
```

**PASS:** 로그인 유지.

---

# 14. 인증 TEST — 명시적 로그아웃

```text
설정
↓
로그아웃
↓
앱 재실행
```

**PASS:**

```text
PIN 로그인 화면 표시
```

---

# 15. 인증 TEST — 관리자 강제 로그아웃

사용자 로그인 상태에서 관리자가 세션을 폐기한다.

다음 데이터 요청 또는 앱 재실행 시:

```text
로그인 정보가 변경되었습니다.
다시 로그인해주세요.
```

**PASS:** 기존 권한으로 업무 데이터 접근 불가.

---

# 16. 인증 TEST — 비활성 직원

`disabled` 사용자의 PIN 로그인 시도.

**PASS:** 로그인 거부.

이미 로그인된 상태에서 disabled 처리 후에도 새 데이터 접근은 거부되어야 한다.

---

# 17. 인증 TEST — PIN 중복

관리자 직원 등록 또는 PIN 변경에서 기존 PIN과 동일한 PIN 입력.

**PASS:**

```text
이미 사용 중인 PIN
```

으로 거부.

---

# 17A. 인증 TEST — 휴대폰 정보 비사용

직원 등록 시 휴대폰 번호가 존재하거나 변경되더라도 해당 번호의 전체 또는 일부를 PIN으로 자동 사용하지 않는다.

**PASS:** 서버가 별도의 고유한 무작위 6자리 PIN을 발급하고, 휴대폰 번호 변경은 기존 PIN에 영향을 주지 않는다.

---

# 18. 권한 TEST — 납품 사용자

납품 사용자는 다음을 조회할 수 있어야 한다.

```text
학교 기본정보
학교 사진
학교 현장정보
```

---

# 19. 권한 TEST — 납품 사용자의 홍보정보 접근

납품 사용자로 다음에 직접 접근한다.

```text
salesProfiles
salesVisits
salesCycles
assignments
```

Expected:

```text
DENY
```

화면 메뉴가 보이지 않는 것만으로 PASS가 아니다.

**Firestore Rules 자체에서 차단돼야 한다.**

---

# 20. 권한 TEST — URL 직접 접근

납품 사용자가 홍보 화면 URL을 직접 입력한다.

예상:

```text
화면 접근 차단
+
홍보 데이터 요청 DENY
```

---

# 21. 권한 TEST — 홍보 사용자

홍보 사용자는:

```text
학교 기본정보
학교 사진
학교 현장정보
홍보정보
```

전체를 읽을 수 있어야 한다.

---

# 22. 권한 TEST — 홍보 사용자 현장정보 수정

홍보 사용자가 검수시간 또는 출입구 정보를 수정한다.

**PASS:** 정상 저장.

즉 홍보 사용자에게 학교 현장정보는 Read Only가 아니다.

---

# 23. 권한 TEST — 팀 활동 조회

SALES_USER_A가 SALES_USER_B의 방문 기록 조회.

**PASS:** 조회 가능.

---

# 24. 권한 TEST — 타 직원 기록 수정

SALES_USER_A가 SALES_USER_B의 방문 기록을 임의 수정한다.

**PASS 조건:** DENY.

관리자만 필요한 경우 수정 가능.

---

# 25. 학교 검색 TEST — 정확 검색

입력:

```text
대전둔산초등학교
```

Expected:

해당 학교가 최상위.

---

# 26. 학교 검색 TEST — 축약 검색

입력:

```text
둔산초
```

Expected:

대전둔산초등학교가 가장 높은 결과.

---

# 27. 학교 검색 TEST — 초성

입력:

```text
ㄷㅈㄷㅅㅊ
```

Expected:

대전둔산초등학교 검색 가능.

---

# 28. 학교 검색 TEST — 이전 교명

SCHOOL_D의 과거 학교명 입력.

Expected:

현재 학교명으로 연결.

---

# 29. 학교 검색 TEST — 오타

예:

```text
둔산쵸
```

Expected:

적절한 후보 제공.

단, Fuzzy Match가 정확한 학교 검색 결과보다 우선해서는 안 된다.

---

# 30. 학교 검색 TEST — 타이핑 Network

검색창에 다양한 학교명을 20회 입력한다.

Browser Network Log 확인.

**PASS:**

```text
타이핑 중 Firestore Query = 0
NEIS 요청 = 0
Kakao 요청 = 0
```

---

# 31. 검색 성능 TEST

일반 모바일 기기 기준.

목표:

```text
키 입력
→ 검색 결과 체감 표시
100ms 이내
```

반복 입력에도 UI Freeze 없어야 한다.

---

# 32. 검색 결과 없음

존재하지 않는 학교명 입력.

Expected:

```text
검색 결과가 없습니다.
학교명을 다시 확인해주세요.
```

외부 API 자동 호출 금지.

---

# 33. 납품 Flow TEST

```text
앱 실행
↓
학교 검색
↓
학교 선택
↓
사진 확인
↓
급식실 위치 확인
↓
검수시간 확인
↓
대차 여부 확인
↓
길안내
```

**PASS 조건:** 핵심 정보를 여러 별도 화면을 왕복하지 않고 확인 가능.

---

# 34. 현장정보 TEST — 등록

현장정보가 없는 SCHOOL_C에서:

```text
급식실 위치
검수시간
대차
차량 진입
특이사항
```

입력 및 저장.

**PASS:** 재조회 후 동일 값 유지.

---

# 35. 현장정보 TEST — 부분 수정

검수시간만 변경한다.

**PASS:**

- 검수시간만 변경
- 다른 현장정보 유지
- updatedBy 기록
- revision 증가

---

# 36. 대차 상태 TEST

가능한 값:

```text
필요
불필요
확인 안 됨
```

다른 값 저장 불가.

---

# 37. 검수시간 TEST

시작·종료시간과 추가 설명을 저장한다.

앱 종료 후 재실행.

**PASS:** 값 유지.

---

# 38. 사진 TEST — 업로드

사진이 없는 학교에 사진 1장을 추가한다.

**PASS:**

```text
Thumbnail 생성
Preview 생성
Original 저장
Metadata 저장
```

---

# 39. 사진 TEST — 최대 3장

3장 존재 상태에서 4번째 사진 추가 시도.

**PASS:** 차단.

---

# 40. 사진 TEST — Viewer

사진 터치.

Expected:

```text
Thumbnail
→ 자연스럽게 확대
→ Viewer
```

지원:

- 좌우 Swipe
- Pinch Zoom
- Double Tap
- 닫기
- 현재 사진 번호

---

# 41. 사진 TEST — 원래 크기로 복귀

Viewer 종료.

**PASS:** 원래 학교 상세 화면 맥락 유지.

가능한 경우 기존 Thumbnail 위치로 자연스럽게 복귀.

---

# 42. 사진 TEST — 교체

기존 사진 교체.

**PASS:**

```text
새 versionId 생성
새 사진 표시
기존 Cache로 오래된 사진이 계속 보이지 않음
```

---

# 43. 사진 TEST — 권한

비로그인 사용자:

```text
사진 직접 접근
```

**PASS:** 거부.

Viewer:

```text
조회 가능
업로드 불가
```

---

# 44. 홍보 홈 TEST

SALES_USER_A 로그인.

Expected 기본 화면:

```text
홍보·영업
↓
내 구역
```

전체 보기로 자동 진입하면 FAIL.

---

# 45. 내 구역 TEST

현재 월 배정에 해당하는 학교만 표시.

**PASS:** 다른 직원 전용 학교가 기본 목록에 섞이지 않음.

---

# 46. 전체 보기 TEST

사용자가 `전체 보기` 선택.

**PASS:** 팀 전체 학교/활동 조회 가능.

다시 앱을 실행하면 기본적으로 `내 구역`으로 복귀.

---

# 47. 상태 Rail TEST

학교 상태:

```text
방문 전
방문 완료
후속 필요
재방문 필요
보류
```

에 따라 Rail과 Badge 표시.

**PASS:** 색상만으로 상태를 구분하지 않음.

---

# 48. 관심도 TEST — 표시

DB:

```text
60
```

Expected UI:

```text
♥♥♥♡♡
관심 있음
```

`60%`를 일반 화면 기본 표현으로 사용하지 않는다.

---

# 49. 관심도 TEST — 입력

세 번째 하트 선택.

저장 후 DB:

```text
60
```

---

# 50. 관심도 TEST — 허용값

허용:

```text
0
20
40
60
80
100
```

예:

```text
73
```

저장 시도.

**PASS:** 서버 또는 Rules에서 거부.

---

# 51. 관심도 0 TEST

DB:

```text
0
```

UI:

```text
♡♡♡♡♡
관심도 미확인
```

`관심 없음`으로 표시하면 FAIL.

---

# 51A. 관심도 미선택 TEST

방문 기록 폼을 열고 관심도를 한 번도 선택하지 않은 상태로 저장한다.

**PASS:** 저장이 거부되고 관심도 선택 안내가 표시된다.

그 뒤 사용자가 빈 하트 단계인 `관심도 미확인`을 직접 선택하면 DB에 명시적 `0`이 저장되어야 한다.

---

# 52. 방문기록 TEST — 필수값

방문 완료를 저장하려면 최소:

- 방문 날짜
- 실제 방문자
- 홍보지 전달 여부
- 샘플 전달 여부
- 제품 관심도
- 방문 결과

필요.

필수 항목 누락:

**PASS:** 저장 불가 + 누락 항목 안내.

---

# 53. 홍보지 TEST

반드시 사용자가:

```text
전달
또는
미전달
```

을 선택해야 한다.

기본값을 자동으로 `미전달`로 두지 않는다.

---

# 54. 샘플 TEST

`전달` 선택.

제품과 수량 입력 가능해야 한다.

여러 제품 지원 시 각 제품별 수량 유지.

---

# 55. 방문 기록 저장 TEST

정상 입력 후 저장.

Expected:

```text
salesVisits 생성
salesProfiles 최신화
월 assignment summary 최신화
관련 통계 최신화
```

화면은 즉시 방문 완료 상태로 변경.

---

# 56. 방문 기록 중복 TEST

저장 버튼 빠르게 두 번 터치.

**PASS:** 동일 방문기록이 중복 생성되지 않아야 한다.

---

# 57. 실제 방문자 TEST

주담당과 실제 방문자가 다른 경우:

```text
담당 김대인
방문 박○○
```

정확하게 별도 저장·표시되어야 한다.

---

# 58. 활동 태그 TEST

복수 선택:

```text
샘플 반응
가격 문의
후속 필요
```

저장 후 재조회.

**PASS:** 동일 태그 유지.

---

# 59. 커뮤니케이션 참고 TEST

학교 단위 커뮤니케이션 참고 태그 수정.

다음 달 Cycle 생성 후 확인.

**PASS:** 그대로 유지.

월별 초기화되면 FAIL.

---

# 60. 월 변경 TEST

8월 → 9월.

새 Cycle 생성 후:

초기화 대상:

```text
월 담당
월 구역
월 방문 상태
월 홍보지
월 샘플
월 방문 완료
```

유지 대상:

```text
학교정보
사진
현장정보
관심도 Profile
관심 제품
커뮤니케이션 참고
과거 방문 History
```

---

# 61. 후속 활동 TEST

8월 방문에서 9월 3일 후속 활동 등록.

9월 진입.

**PASS:** 활성 후속 일정은 계속 확인 가능.

---

# 62. 이전 방문 Timeline TEST

학교 상세 첫 진입.

**PASS:** 모든 역사 데이터를 한 번에 읽지 않고 최근 소수 기록만 표시.

`전체 기록 보기`에서 추가 조회.

---

# 63. CSV TEST — 자신의 범위

홍보 사용자가 자신의 담당 범위 CSV 생성.

**PASS:**

- 현재 Filter 반영
- 행 수 확인
- 정상 다운로드
- 한글 Excel 호환

---

# 64. CSV TEST — 팀 전체 권한 없음

전체 팀 Export Permission 없는 직원.

전체 Export 시도.

**PASS:** 거부.

---

# 65. CSV TEST — Audit

CSV Export 후 감사 로그 확인.

포함:

```text
exportedBy
exportedAt
scope
rowCount
filter
```

---

# 66. 캐시 TEST — 재실행

로그인 + Search Catalog Cached 상태.

앱 종료 후 재실행.

**PASS:**

```text
업무 화면 진입
+
학교 검색 즉시 가능
```

---

# 67. 캐시 TEST — Offline 검색

Network 차단.

학교 검색.

**PASS:** Search Catalog 기반 검색 정상.

---

# 68. 캐시 TEST — 이전 학교 Offline

이전에 조회한 학교 상세 열기.

**PASS:** Cache된 현장정보 표시.

화면에는:

```text
오프라인 · 저장된 정보를 표시하고 있습니다.
```

안내.

---

# 69. Cache TEST — 처음 보는 학교 Offline

Cached Detail 없음.

**PASS:**

- 앱 Crash 없음
- 명확한 Offline 안내
- 학교 검색 결과 자체는 가능

---

# 70. Cache TEST — 권한 변경

홍보 → 납품 Role 변경.

**PASS:**

```text
기존 홍보 Cache 접근 불가
Sales 화면 없음
Sales API 접근 DENY
```

---

# 71. Cache TEST — logout user switching

직원 A 로그아웃 후 직원 B 로그인.

**PASS:** A의 홍보정보가 B 화면에 잠깐이라도 나타나지 않음.

---

# 72. 성능 TEST — App Boot

앱이 이미 설치되고 Cache가 있는 정상 환경.

목표:

```text
약 1초 내 기본 UI 표시
```

저사양 기기에서 별도 측정.

---

# 73. 성능 TEST — Cached Detail

Cached 학교 선택.

목표:

```text
약 200ms 내 핵심정보 표시
```

---

# 74. 성능 TEST — 사진 목록

학교 상세 진입.

**PASS:** Original 사진 3개가 자동 다운로드되지 않음.

Thumbnail/Preview 전략 사용.

---

# 75. 성능 TEST — Layout Shift

사진 로딩 전후 비교.

**PASS:** 사진 때문에 화면 콘텐츠가 크게 밀리지 않는다.

---

# 76. 성능 TEST — Real-time Listener

Network/Firestore Debug 확인.

**PASS:** 전체 학교·전체 방문History에 지속 Listener가 열리지 않는다.

---

# 77. NEIS TEST — 초기 Import

대전 대상 학교를 Import.

확인:

- 학교코드
- 학교명
- 학교급
- 주소
- 전화
- 홈페이지

정상 Mapping.

---

# 78. NEIS TEST — 신규 학교

새 학교코드 등장.

**PASS:**

```text
신규 schools 생성
현장정보 미등록
사진 없음
Kakao Match 대상
```

현재 월 구역에는 자동 배정하지 않는다.

---

# 79. NEIS TEST — 교명 변경

동일 schoolCode에서 이름 변경.

**PASS:**

- 동일 schoolId 유지
- 새 이름 적용
- 이전 이름 Alias 유지
- 사진 유지
- 현장정보 유지
- 홍보 History 유지

---

# 80. NEIS TEST — 주소 변경

주소 변경.

**PASS:**

- 변경 Candidate 감지
- Kakao 재검토
- 현장정보 삭제 없음
- 필요 시 Review 상태

---

# 81. NEIS TEST — 학교 누락

학교 한 곳이 새 NEIS 결과에서 없음.

**PASS:**

```text
Hard Delete 하지 않음
inactiveCandidate
```

---

# 82. NEIS TEST — 비정상 응답

기존 학교 수에 비해 극단적으로 적은 데이터 응답.

**PASS:**

```text
SUSPICIOUS_RESULT
Apply 차단
```

---

# 83. NEIS TEST — 현장정보 보호

Sync 전:

```text
대차 필요
검수시간 08:30
사진 3장
```

Sync 후:

**PASS:** 모두 보존.

---

# 84. NEIS TEST — 홍보정보 보호

Sync 전:

```text
♥♥♥♥♡
샘플 기록
방문 History
```

Sync 후:

**PASS:** 모두 보존.

---

# 85. Kakao TEST — 정상 자동 매칭

학교명·주소가 명확히 일치.

**PASS:**

```text
autoMatched
```

---

# 86. Kakao TEST — 다중 후보

같은 학교명 또는 유사 후보 다수.

**PASS:**

```text
needsReview
```

자동 확정하지 않는다.

---

# 87. Kakao TEST — 타 지역 후보

대전과 타 지역에 동일 학교명 존재.

**PASS:** 타 지역 후보를 자동 확정하지 않는다.

---

# 88. Kakao TEST — 수동 확정

관리자가 Kakao 후보 하나를 확정.

**PASS:**

```text
confirmed
confirmedBy
confirmedAt
```

저장.

---

# 89. Kakao TEST — API 장애

Kakao API 실패.

**PASS:**

다음 기능 정상:

- 학교 검색
- 현장정보
- 사진
- 홍보업무

지도 기능만 제한 가능.

---

# 90. Kakao 길안내 TEST

Place ID 존재.

`길안내` 선택.

**PASS:** 올바른 학교 목적지로 이동.

---

# 91. External API Secret TEST

Production Client Bundle 검색.

다음 값이 없어야 한다.

```text
NEIS API Secret
Kakao REST API Secret
PIN Server Secret
Admin Credential
```

P0 기준.

---

# 92. 디자인 TEST — Typography

모바일 주요 화면 전체:

- Pretendard 적용
- 학교명 가독성
- 숫자/시간 명확성
- 지나치게 작은 Text 없음

---

# 93. 디자인 TEST — Liquid Glass

Liquid Glass는 다음과 같은 핵심 Control에 제한적으로 사용한다.

- PIN
- Segmented Control
- Floating Bar
- 주요 버튼
- Viewer Control

학교 목록 전체가 투명 Glass로 뒤덮이면 디자인 기준 실패.

---

# 94. 디자인 TEST — 입체감

주요 버튼:

```text
Rest
Press
Release
```

상태 차이가 명확해야 한다.

Press 시 실제 눌리는 느낌을 제공하되 업무 속도를 늦추지 않는다.

---

# 95. 디자인 TEST — Motion

일반 Motion:

```text
160~220ms
```

정도 기준.

긴 Animation 때문에 사용자가 기다려야 하면 FAIL.

---

# 96. 디자인 TEST — 관심도 하트

하트 선택 시:

- 선택 상태 명확
- Label 존재
- 짧은 반응
- 44px 수준 Touch 영역

---

# 97. 디자인 TEST — Aurora Gradient

Gradient가 존재하더라도:

- 학교명
- 주소
- 검수시간
- 버튼 Label

가 명확하게 읽혀야 한다.

시각 효과가 정보보다 강하면 조정.

---

# 98. 접근성 TEST — Touch

모든 주요 Touch Target:

```text
최소 44 × 44px
```

---

# 99. 접근성 TEST — 색상

Status Rail 색상을 제거하거나 흑백으로 봐도:

```text
방문 완료
후속 필요
```

등을 텍스트로 구분 가능해야 한다.

---

# 100. 접근성 TEST — 관심도

Screen Reader:

```text
제품 관심도 5단계 중 3단계, 관심 있음
```

처럼 전달 가능해야 한다.

---

# 101. 접근성 TEST — Reduce Motion

운영체제 Reduce Motion 활성화.

**PASS:**

- Spring 최소화
- Parallax 제거
- 기능에는 영향 없음

---

# 102. 접근성 TEST — Keyboard

Desktop:

- Tab
- Enter
- Escape

기본 Navigation 가능.

Focus Indicator가 보여야 한다.

---

# 103. 오류 TEST — 서버 오류

Firestore 또는 Function 일시 장애.

**PASS:**

```text
정보를 불러오지 못했습니다.
다시 시도
```

등 사용자가 이해할 수 있는 메시지.

기술 Error Stack 노출 금지.

---

# 104. 오류 TEST — 저장 실패

방문 기록 저장 중 서버 오류.

**PASS:**

- 작성 내용 즉시 소실되지 않음
- 실패 안내
- 다시 시도 가능

---

# 105. Offline 전환 TEST

온라인 상태에서 방문기록 작성 중 Network 끊김.

**PASS:**

- 입력 내용 유지
- 연결 없음 안내
- 앱 Crash 없음

---

# 106. Network 복구 TEST

다시 Online.

순서:

```text
인증 확인
↓
권한 확인
↓
데이터 Refresh
```

권한이 무효하면 이전 민감 데이터 계속 표시 금지.

---

# 107. 관리자 TEST — 직원 생성

관리자가 신규 직원 등록.

확인:

- 직원 생성
- PIN 고유성
- Role 설정
- 로그인 가능

---

# 108. 관리자 TEST — PIN 변경

PIN 변경 후 새 PIN으로 로그인.

보안상 세션 폐기를 선택한 경우 기존 기기 세션 접근 불가.

---

# 109. 관리자 TEST — 월 구역

새 월 Cycle 생성.

학교별 구역/담당 배정.

**PASS:** 홍보 직원 `내 구역`에 정확히 반영.

---

# 110. 관리자 TEST — NEIS Preview

`학교 목록 최신화`.

**PASS:**

즉시 DB 수정하지 않고:

```text
신규
변경
누락
```

Preview 표시.

---

# 111. 관리자 TEST — Sync Apply

관리자가 변경을 승인.

**PASS:**

- 해당 학교만 변경
- Audit 생성
- Catalog Version 반영
- 업무 데이터 보존

---

# 112. 데이터 무결성 TEST

방문 기록 100건, 사진, 월 Cycle 등이 존재하는 학교에서 학교명 수정.

**PASS:** schoolId가 유지되며 모든 연관 기록 정상 조회.

---

# 113. 동시 수정 TEST

두 사용자가 같은 학교 현장정보를 거의 동시에 수정한다.

**PASS 조건:**

- 앱 Crash 없음
- revision 충돌 정책 적용
- 최소한 조용한 데이터 유실이 없어야 함

구체적인 충돌 UI는 구현 명세에서 확정한다.

---

# 114. Double Tap TEST

다음 버튼을 빠르게 여러 번 누른다.

- 저장
- 방문 완료
- 사진 업로드
- CSV 생성

**PASS:** 중복 서버 작업이 발생하지 않는다.

---

# 115. PWA TEST — 설치

Android/지원 Browser에서 PWA 설치.

확인:

- 앱 아이콘
- App Name
- Standalone 실행
- 기본 App Shell 정상

---

# 116. PWA TEST — Offline 실행

한 번 정상 사용 후 Network 차단.

PWA 실행.

**PASS:**

- App Shell 표시
- 학교 검색 가능
- Cache된 학교 조회 가능

---

# 117. PWA TEST — 업데이트

새 Version 배포.

기존 사용자가 방문 기록 작성 중.

**PASS:** 즉시 강제 Reload되어 작성 내용이 사라지지 않는다.

---

# 118. 보안 TEST — Firestore 기본 DENY

등록되지 않은 Collection 경로 직접 접근.

**PASS:** DENY.

새 Collection이 Security Rules 없이 자동 허용되면 P0.

---

# 119. 보안 TEST — Storage 기본 DENY

허용되지 않은 Storage 경로 직접 접근.

**PASS:** DENY.

---

# 120. 보안 TEST — Audit 변조

일반 Client가 auditLogs 생성/수정/삭제.

**PASS:** 모두 DENY.

---

# 121. 보안 TEST — authCredentials

일반 사용자:

```text
authCredentials
pinIndexes
```

접근.

**PASS:** DENY.

관리자 Client에서도 직접 노출되지 않는다.

---

# 122. 보안 TEST — Client Role 조작

Browser DevTools에서:

```text
role = admin
```

등 Client State 변경.

**PASS:** 실제 서버 권한 변화 없음.

---

# 123. 보안 TEST — employeeId 변조

방문 기록 요청에서 다른 직원 ID 전달.

**PASS:** 서버 인증 사용자 기준으로 처리하거나 요청 거부.

---

# 124. 감사 로그 TEST

다음 주요 행동을 수행한다.

- 직원 비활성화
- Role 변경
- 사진 교체
- 방문 기록
- CSV Export
- NEIS Sync

**PASS:** 필요한 Audit Event 생성.

---

# 124A. 보안 TEST — 핵심 Collection Client 직접 쓰기

일반 Client와 관리자 Client에서 `schools`, `schoolFieldProfiles`, `salesProfiles`, `salesVisits`, `employees`, `auditLogs`에 직접 create/update/delete를 시도한다.

**PASS:** Security Rules가 모두 DENY한다.

---

# 124B. 보안 TEST — Callable Mutation

권한 있는 사용자가 동일 업무 변경을 승인된 Callable Function으로 요청한다.

**PASS:** 서버가 권한·세션·입력값·멱등성 키를 검증하고, 업무 데이터와 Audit Event를 원자적 업무 흐름에서 기록한다.

---

# 125. 인수 테스트 — 납품 실제 시나리오

### Scenario D01

```text
앱 실행
↓
자동 로그인
↓
"둔산초" 검색
↓
학교 선택
↓
사진 확대
↓
급식실 위치 확인
↓
검수시간 확인
↓
대차 확인
↓
카카오 길안내
```

**인수 기준:** 직원이 별도 설명 없이 수행 가능.

---

# 126. 인수 테스트 — 홍보 실제 시나리오

### Scenario S01

```text
앱 실행
↓
자동 로그인
↓
내 구역
↓
학교 선택
↓
♥ 관심도 확인
↓
과거 방문 확인
↓
학교 현장정보 확인
↓
방문 기록
↓
홍보지 전달
↓
샘플 전달
↓
♥♥♥♥♡ 입력
↓
방문 결과
↓
후속 날짜
↓
저장
```

**인수 기준:** 한 화면 흐름에서 자연스럽게 완료 가능.

---

# 127. 인수 테스트 — 팀 협업

### Scenario S02

```text
전체 보기
↓
B 직원 담당 학교
↓
최근 방문 기록 확인
↓
다시 내 구역
```

**PASS:**

- 타 직원 기록 조회 가능
- 수정은 불가
- 순위/실적 경쟁 UX 없음

---

# 128. 인수 테스트 — 다음 달

### Scenario S03

8월 업무 완료 후 9월 Cycle 생성.

**PASS:**

```text
9월 배정 새로 시작
+
과거 홍보 History 유지
+
현재 관심도 유지
+
커뮤니케이션 참고 유지
```

---

# 129. 인수 테스트 — 사진 현장 수정

### Scenario F01

홍보 직원이 학교 방문 중 오래된 급식실 출입구 사진 발견.

```text
사진 선택
↓
교체
↓
새 사진 촬영
↓
저장
```

납품 직원 로그인 후 동일 학교 조회.

**PASS:** 새 사진 표시.

---

# 130. 인수 테스트 — 권한 경계

### Scenario SEC01

납품 직원 로그인 후 Browser DevTools를 이용해 홍보 Collection 요청.

**PASS:** DENY.

이 테스트는 Production 배포 전 반드시 수행한다.

---

# 131. 인수 테스트 — 느린 Network

### Scenario PERF01

Slow Network 상태.

이전에 본 학교 선택.

**PASS:**

```text
Cached 현장정보 즉시 표시
↓
뒤에서 최신정보 갱신
```

빈 Loading 화면만 계속 표시하면 실패.

---

# 132. 인수 테스트 — Offline

### Scenario OFF01

현장 Network 없음.

```text
앱 실행
↓
학교 검색
↓
이전에 본 학교
↓
급식실 위치 / 검수시간 확인
```

**PASS:** 가능.

---

# 133. 테스트 자동화 범위

자동화 우선순위:

## 반드시 자동화

- Search Normalizer
- Search Ranking
- 관심도 허용값
- Security Rules
- Role Matrix
- PIN Login 서버 로직
- 휴대폰 정보 비사용 및 무작위 PIN 발급
- sessionVersion
- NEIS Diff
- Kakao Match Scoring
- 방문 기록 Validation
- 관심도 미선택 거부와 명시적 `0` 허용
- 핵심 Collection 직접 쓰기 DENY / Callable Mutation 성공
- 사진 Slot 제한

## 가능하면 자동화

- 주요 UI Flow
- 로그인 유지
- 학교 검색
- 방문 기록
- Photo Viewer 기본 동작

---

# 134. Firebase Emulator 테스트

다음 영역은 Emulator에서 자동 테스트한다.

```text
Firestore Rules
Storage Rules
Cloud Functions
Role별 접근
Session Version
```

Security Test 없이 Rules 변경을 Production에 배포하지 않는다.

---

# 135. 테스트 데이터 분리

Production 학교·방문 데이터를 개발 테스트에 직접 사용하지 않는다.

환경:

```text
Development
Test / Emulator
Production
```

을 분리한다.

---

# 136. 테스트 증거

각 Phase 완료 시 Codex는 최소 다음을 제공한다.

```text
실행한 테스트
PASS / FAIL
실패 이유
수정 내용
남은 Known Issue
```

핵심 Security Test는 명령 결과 또는 Test Log를 남긴다.

---

# 137. 기능 완료 보고 형식

각 기능 완료 보고:

```text
기능명

구현 파일
변경 내용

자동 테스트
PASS x건
FAIL x건

수동 인수 테스트
PASS / FAIL

보안 영향

성능 영향

Known Issues
```

---

# 138. 배포 전 P0 체크

다음 중 하나라도 실패하면 배포하지 않는다.

- 로그인 불가
- 로그인 유지 불가
- 납품 → 홍보정보 접근 가능
- 사진 권한 우회
- PIN 정보 노출
- 서버 Secret 노출
- 학교 검색 실패
- 방문 기록 데이터 유실
- NEIS Sync가 업무 데이터 삭제
- 앱 실행 Crash
- 사용자 전환 후 이전 직원 정보 노출

---

# 139. 배포 전 P1 체크

다음 핵심 기능도 모두 정상이어야 한다.

- 학교 검색
- 초성 검색
- 학교 상세
- 사진 확대
- 현장정보 수정
- 내 구역
- 전체 보기
- 하트 관심도
- 방문 기록
- 홍보지
- 샘플
- 후속 활동
- 월 변경
- CSV
- Offline 조회
- NEIS Preview
- Kakao 길안내

---

# 140. 디자인 인수 기준

MVP 화면 전체에서 다음 인상이 일관되어야 한다.

```text
Aurora Gradient
+
Soft Solid Card
+
Liquid Glass Control
+
Tactile Interaction
+
Pretendard
```

한 화면만 다른 디자인 시스템처럼 보여서는 안 된다.

---

# 141. UX 인수 기준

새 직원에게 별도의 매뉴얼 없이 앱을 제공하고 다음 세 과제를 수행하게 한다.

### 과제 1

```text
둔산초 검수시간 확인
```

### 과제 2

```text
학교 사진 확대
```

### 과제 3

홍보 사용자:

```text
오늘 방문 기록 남기기
```

기본 기능을 별도 설명 없이 발견하고 수행할 수 있어야 한다.

---

# 142. 현장 Pilot

Production 전체 배포 전 실제 사용자 소수로 Pilot을 권장한다.

예:

```text
납품 직원 1~2명
홍보 직원 1~2명
관리자 1명
```

실제 업무에서 며칠간 사용한다.

확인:

- 검색 속도
- 사진 유용성
- 검수정보 정확성
- 방문기록 입력 부담
- 관심도 하트 이해도
- 버튼 크기
- 네트워크 문제
- 로그인 유지
- 배터리/성능 문제

---

# 143. Pilot에서 수집할 질문

직원에게 다음을 확인한다.

```text
학교를 찾기 쉬웠는가?

급식실 정보를 빠르게 찾았는가?

사진 크기와 확대 방식은 편했는가?

방문 기록은 번거롭지 않았는가?

하트 관심도의 의미는 이해하기 쉬웠는가?

내 구역 / 전체 보기 구분은 명확했는가?

버튼 반응은 자연스러운가?

화면이 느리다고 느낀 순간이 있었는가?
```

---

# 144. Pilot 이후 수정

Pilot 결과는 다음처럼 분류한다.

```text
업무 차단
→ 즉시 수정

반복 불편
→ MVP 전 수정

취향 / 미세 디자인
→ v1.1 후보
```

---

# 145. 최종 Production 승인 조건

다음 조건을 모두 충족해야 한다.

```text
P0 = 0

핵심 P1 = 0

Security Rules Test PASS

Storage Rules Test PASS

주요 User Flow PASS

Offline 핵심 조회 PASS

Search Performance PASS

NEIS Sync 보호 PASS

Role Cache 격리 PASS

Pilot 완료

관리자 승인
```

---

# 146. 인수 체크리스트

- [ ] PIN 단독 로그인 성공
- [ ] 로그인 상태 유지
- [ ] 로그아웃 정상
- [ ] 세션 강제 폐기
- [ ] 납품 권한 정상
- [ ] 홍보 권한 정상
- [ ] 납품의 홍보정보 접근 차단
- [ ] 학교 검색 즉시 반응
- [ ] 초성 검색
- [ ] Alias 검색
- [ ] Offline 검색
- [ ] 학교 현장정보
- [ ] 사진 3장 제한
- [ ] 사진 확대 Viewer
- [ ] 사진 Version 교체
- [ ] 내 구역
- [ ] 전체 보기
- [ ] 하트 관심도
- [ ] 방문 기록
- [ ] 홍보지·샘플
- [ ] 활동 태그
- [ ] 커뮤니케이션 참고
- [ ] 후속 활동
- [ ] 월별 Cycle
- [ ] 과거 History 보존
- [ ] CSV 권한
- [ ] Cache 역할 분리
- [ ] NEIS 신규 학교
- [ ] NEIS 교명 변경
- [ ] NEIS 누락 보호
- [ ] Kakao Match
- [ ] Kakao 길안내
- [ ] 외부 Secret 보호
- [ ] Audit Log
- [ ] PWA 설치
- [ ] Offline App Shell
- [ ] 접근성
- [ ] 모바일 성능
- [ ] 관리자 기능
- [ ] Pilot 완료

---

# 147. 문서 한 줄 정의

> **급식길의 기능 완료는 화면이 만들어졌다는 의미가 아니라, 실제 납품·홍보 직원의 업무 흐름이 올바른 권한·데이터 보존·속도·오프라인·보안 조건 아래 처음부터 끝까지 정상적으로 수행된다는 것이 검증된 상태를 의미한다.**

---

# 148. 문서 상태

본 문서는 **급식길 PWA 테스트·인수 기준서 v1.1**이다.

실제 구현 과정에서 기능이 추가되거나 정책이 변경되면 해당 기능의 인수 테스트도 반드시 함께 변경한다.
