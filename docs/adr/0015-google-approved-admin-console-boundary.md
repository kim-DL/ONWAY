# ADR 0015: Google 승인 관리자와 서버 매개 운영 콘솔 경계

- 상태: Accepted
- 날짜: 2026-08-24

## 배경

급식길의 일반 직원 PIN은 현장 기기에서 빠르게 로그인하기 위한 수단이다. 같은 인증 수단으로 직원 권한, PIN, 월별 배정, 외부 데이터 동기화와 앱 운영 정책까지 변경하게 하면 PIN 노출 한 번이 전체 운영 권한 탈취로 확대될 수 있다. 반대로 관리자 화면이 Firestore의 민감 Collection을 직접 읽거나 쓰면 Security Rules와 화면 구현이 함께 관리자 정책을 떠안고, 변경 사유·멱등성·Revision·감사 기록을 일관되게 강제하기 어렵다.

## 결정

- 관리자는 PIN으로 로그인하지 않는다. Firebase Google Provider, 검증된 Email, 서버 전용 `secureSettings/adminAccess` 허용목록, 활성 Employee의 `admin` 역할을 모두 만족해야 한다.
- `activateAdminSession`은 허용목록의 Email과 Employee ID를 결합한다. 승인되면 기존 Employee UID를 현재 Google UID로 재결합하고 `authz`, Custom Claim의 `adminApproved`, 역할·권한·Session Version을 함께 갱신한다. 이전 UID의 `authz`와 Token은 폐기한다.
- 모든 관리자 Callable은 Firebase Auth 존재만 확인하지 않고 Google Provider, Email Verified, `adminApproved`, Claim과 `authz`의 Employee/Session 일치, 활성 Employee와 실제 UID를 매 요청 다시 확인한다.
- 관리자 화면은 `employees`, `authCredentials`, `secureSettings`, `pinReservations`, `kakaoMatchReviews`를 Client에서 직접 조회하지 않는다. 권한 검증 Callable이 필요한 DTO만 집계해 반환하며 Firestore Rules는 민감 Collection을 계속 거부한다.
- 새 직원 PIN은 암호학적 난수로 생성한 10분 예약이다. 서버는 HMAC Lookup Key와 scrypt Hash만 저장하고 원문은 예약·등록·재발급 응답에서 한 번만 반환한다. PIN 교체와 세션 종료는 Session Version을 증가시키고 기존 Token을 폐기한다.
- 일반 직원 관리 폼으로 `admin` 역할을 부여하거나 해제할 수 없다. 관리자 승인은 서버 허용목록 절차만 사용하며 마지막 활성 관리자를 비활성화하는 변경도 거부한다.
- 월별 Cycle·배정 변경은 기존 Expected Revision과 멱등 Request Lock을 재사용한다. NEIS Apply는 Preview의 전체 변경이 아니라 관리자가 선택한 Pending Change ID만 적용하고 위험 변경은 별도 확인을 요구한다.
- 관리자 변경은 Event Type, Actor, Target, Changed Fields, Change Reason을 Audit에 남긴다. Client가 Audit를 수정하거나 삭제하는 경로는 제공하지 않는다.
- 관리자 PWA는 온라인 운영 도구다. 승인 관리자 Session은 Offline Session으로 복원하지 않으며, 민감 운영 DTO를 Service Worker나 Persistent IndexedDB에 저장하지 않는다.

## 결과

- 현장 PIN이 유출돼도 관리자 콘솔로 권한이 상승하지 않는다.
- Email만 허용목록에 있거나 Google 로그인만 성공한 상태로는 관리 작업을 수행할 수 없다.
- 직원 등록·권한·PIN·세션, 월별 배정, NEIS/Kakao 검토, CSV, Audit와 공개 운영 설정이 하나의 PC 우선 콘솔에서 동작하지만 최종 권한과 데이터 정합성은 서버가 통제한다.
- Google 계정 교체, 관리자 퇴사와 허용목록 변경은 서버 운영 절차가 필요하다. 허용목록은 공개 앱 설정이나 Client UI에서 편집하지 않는다.
- 실제 Firebase Project의 Google Provider, Authorized Domain, App Check, IAM과 운영 관리자 허용목록 등록은 배포 승인 단계에서 별도로 완료해야 한다.
