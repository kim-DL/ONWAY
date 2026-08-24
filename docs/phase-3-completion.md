# Phase 3 완료 기록

- 완료일: 2026-08-23
- 기준 문서: 구현 명세서 v1.1, 인증·권한·보안 설계서 v1.3, ADR 0003
- 검증 환경: `demo-onnuriway`, Firebase Auth·Firestore·Functions·Storage Emulator

## 구현 범위

일반 직원의 6자리 PIN을 서버에서 검증하고 Firebase Custom Token으로 교환하는 인증 경계를 구현했다.

- `employeeLogin`: App Check 적용, 출처 제한, HMAC Lookup, scrypt 검증, 활성 직원·authz·Session 교차검증, 최소 Claim Custom Token 발급
- `employeeLogout`: 유효한 Auth·authz를 확인하고 민감값 없는 Logout Audit 기록
- 직원 Claim: `employeeId`, `sessionVersion`, `permissionsVersion`, `roleScopes`
- 관리자: PIN Index를 생성하지 않으며 `admin` Scope가 발견되면 PIN Token 발급 거부
- 운영 리전: `asia-northeast3`, Callable별 `maxInstances: 10`

## PIN 보호와 제한

- PIN은 정확히 숫자 6자리이며 선행 0을 보존한다.
- Lookup Key는 `PIN_LOOKUP_SECRET` 기반 HMAC-SHA256으로 만든다.
- 검증 Hash는 별도 `PIN_PEPPER`, 무작위 Salt, scrypt `N=32768, r=8, p=1`을 사용한다.
- PIN 원문은 Firestore, Audit, 응답, 브라우저 저장소에 기록하지 않는다.
- 동일 Lookup 실패 5회부터 15분 잠그며 반복 잠금은 30분, 60분 순으로 증가하고 24시간에서 제한한다.
- App Check 식별자와 네트워크 출처 조합은 10분 30회까지 허용하고 초과 시 60분 제한한다.
- 존재하지 않는 PIN에도 scrypt 비용을 소비하며, 오류는 존재·비활성·Hash 불일치를 구분하지 않는다.

## 클라이언트 세션

- Firebase Auth는 `browserLocalPersistence`를 명시해 앱 화면을 닫았다 열어도 세션을 복원한다.
- 초기 Auth 상태가 확정될 때까지 `AuthSplash`만 표시하여 로그인 화면 Flash를 막는다.
- ID Token Claim을 Zod로 검증한 뒤 자신의 `authz/{uid}`를 실시간 구독한다.
- 직원·Session·권한 Version 또는 활성 상태가 달라지면 즉시 Firebase Auth를 로그아웃하고 Session Invalid 화면을 표시한다.
- 명시적 로그아웃은 서버 Audit을 best-effort로 기록한 뒤 Firebase Auth, 앱 전용 Local/Session Cache, 등록된 Blob URL을 정리한다.
- Production Firebase 설정에서 App Check Site Key가 빠지면 로그인 요청을 보내지 않고 구성 필요 화면으로 Fail Closed한다.

## UI

- 모바일 우선 PIN Login, 6칸 입력 Indicator, 제출·오류 상태
- 로그인 상태 확인 Splash
- Session Invalid와 구성 누락 화면
- Phase 4 연결 전 인증 완료 Home과 명시적 Logout
- 키보드 Focus, Screen Reader Label, Live Error, Reduced Motion 대응

## Emulator 계약

- 테스트 전용 PIN 4개는 `scripts/fixtures/phase3-auth.ts`에만 존재한다.
- Seed는 5명의 Auth 사용자와 기존 45개 문서에 `authCredentials` 4개, `pinIndexes` 4개를 더한 Firestore 53개 문서를 만든다.
- Admin 사용자는 PIN Credential/Index가 없고 비활성 사용자 시나리오는 별도로 유지한다.
- `npm run test:e2e:auth`는 Functions를 빌드하고 4개 Emulator, Seed, Next 개발 서버, Playwright를 한 번에 실행한 뒤 모두 종료한다.

## 검증 결과

- Lint: PASS, warning 0
- Typecheck: App·Functions PASS
- Unit: 8 files, 27 tests PASS
- Rules: 2 files, 23 tests PASS
- Emulator Seed: Auth 5 users, Firestore 53 documents PASS
- Functions Build: PASS
- Production Build: PASS
- 기본 Playwright: mobile/desktop 4 tests PASS
- Phase 3 Emulator Playwright: 5 tests PASS
  - 유효 PIN 로그인, 화면 재오픈 지속, Logout
  - 잘못된 PIN 일반 오류와 5회 잠금
  - 비활성 직원 거부
  - `sessionVersion` 변경 즉시 폐기
  - PIN 화면 자동 접근성 검사
  - Login/Logout Audit 존재 및 PIN 원문 부재
- npm audit: high/critical 0, Firebase 도구 전이 의존성 moderate 10건

## 실제 Firebase 연결 전 필수 작업

현재 구현과 검증은 Demo Emulator에만 적용했으며 실제 Firebase 프로젝트를 생성·변경·배포하지 않았다.

1. 승인된 Development/Staging/Production 프로젝트와 Web App을 연결한다.
2. 환경별로 서로 다른 `PIN_LOOKUP_SECRET`, `PIN_PEPPER`를 Secret Manager에 등록한다.
3. Firebase App Check와 reCAPTCHA v3 Site Key를 등록하고 허용 Domain을 점검한다.
4. 테스트 Seed가 아닌 승인된 서버 Provisioning 절차로 Auth 사용자와 무작위 고유 PIN을 발급한다.
5. 배포 전 Custom Token 생성 권한, Audit 보존, Secret 회전, Rate Limit 운영 알림을 검증한다.
6. 관리자는 후속 관리자 Phase에서 Google 로그인, 서버 Allowlist, `adminApproved` Claim을 사용한다.

이 선행 작업에는 실제 Cloud 프로젝트 변경과 Secret 등록 권한이 필요하므로 별도 승인 없이 수행하지 않는다.
