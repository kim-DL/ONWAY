# Phase 18 상태 기록

- 준비일: 2026-08-24
- Staging 기반 연결일: 2026-08-25
- Phase: 18 — Pilot
- 상태: `PREPARED · STAGING DEPLOYED · PILOT NOT STARTED`

## 준비 완료

- 실제 직원 3~5명과 72시간 이상 기간을 강제하는 Pilot 계획 계약
- Demo/Production이 아닌 HTTPS Staging과 별도 Firebase Project 요구
- 참여자 실명 대신 역할별 코드만 허용하는 개인정보 최소화
- 최근 7일 내 Phase 17 수용 리포트가 없으면 차단하는 `pilot:readiness` Gate
- 무안내 역할별 UX 과제, 일일 관찰 항목, P0/P1/P2 분류, 즉시 중단·Rollback 절차
- 개인정보 없는 로컬 기기 진단 내보내기
- 세션 기록과 Issue Register 양식

## Staging 기반 연결 완료

- Firebase CLI의 `staging` 별칭을 `onnuriway` 프로젝트에 고정
- Firestore Standard/Native를 서울 리전(`asia-northeast3`)에 생성하고 Rules·Index 배포 및 Rules 회귀 검증 완료
- Firebase Authentication Google Provider 활성화, 공개 프로젝트 이름·지원 이메일 및 Authorized Domain 4개 확인
- 웹 앱을 reCAPTCHA Enterprise App Check에 등록하고 토큰 TTL을 1시간으로 설정
- Authentication과 reCAPTCHA Enterprise 허용 Domain에 `onnuriway.vercel.app`을 기존 3개 Domain을 보존하는 병합 방식으로 추가
- 앱의 App Check Provider를 `ReCaptchaEnterpriseProvider`로 전환하고 공개 Site Key는 Git 제외 환경 파일에만 반영
- 환경별 PIN HMAC Lookup·scrypt Pepper Secret을 각각 독립 난수로 생성하여 Secret Manager `version 1 / ENABLED` 확인
- `NEIS_API_KEY` `version 1 / ENABLED`, `KAKAO_REST_API_KEY` `version 2 / ENABLED` 확인
- 중단된 입력 과정에서 생긴 신뢰할 수 없는 Kakao `version 1`은 즉시 `DESTROYED` 처리
- Cloud Functions 32개를 서울 리전(`asia-northeast3`)·Node.js 22로 배포하고 전부 `ACTIVE` 확인
- Firestore Rules·Index와 Storage Rules를 Staging에 배포하고 익명 Firestore REST 조회가 403으로 차단됨을 확인
- Functions Artifact Registry 정리 정책을 7일로 설정
- Vercel Preview 환경에 Next.js 16 앱을 배포하고 안정 주소 [onnuriway.vercel.app](https://onnuriway.vercel.app)을 해당 Staging 배포에 연결
- Vercel Preview·Production 환경에 동일한 공개 Firebase Web 설정 8개를 등록하되 Secret과 OIDC Token은 Client 환경에 포함하지 않음

Callable Functions는 배포 코드의 `enforceAppCheck`로 보호한다. App Check 없는 `phase0Health` 요청은 401로 차단됐고, 실제 Staging 브라우저에서는 reCAPTCHA Enterprise Token 교환 200과 App Check가 포함된 `employeeLogin` 호출의 정상적인 PIN 거부 응답을 확인했다. Firebase Console의 제품별 강제 적용은 실제 호출 지표를 더 관찰한 뒤 단계적으로 켠다. 외부 NEIS·Kakao 실제 호출 Gate는 계속 꺼 둔다.

## Staging 브라우저 검증 완료

- HTTPS 로그인 화면과 핵심 접근성 구조 렌더링
- `/api/connectivity` HEAD 204, 브라우저 콘솔 경고·오류 0개
- App Check Token 교환 200과 Callable UI 오류 처리 확인
- Service Worker `active`·페이지 제어 상태, Web App Manifest, Cache 2개 확인
- 390×844 모바일에서 가로 넘침 없음
- 새 버전 알림이 PIN 제출 버튼을 덮는 문제를 수정·재배포하고 겹침 없음 확인

## 완료되지 않은 외부 조건

- 실제 납품 직원 1~2명, 홍보 직원 1~2명, 관리자 1명 선정
- 비식별 Staging 데이터와 실제 Pilot 계정 준비
- 개인정보 안내 및 Pilot 책임자 승인
- 72시간 이상 실제 사용과 피드백 회수
- P0 0, 핵심 P1 0 확인 후 관리자 Production 승인

이 조건은 코드나 Emulator로 대체하지 않는다. 모두 충족되기 전에는 Phase 18 완료 또는 Production PASS로 표시하지 않는다.

## 기술 검증

- Pilot 계획·진단 계약: 4/4 단위 테스트 통과
- 전체 단위 회귀: 31개 파일 통과·1개 명시적 Skip, 100개 테스트 통과·3개 명시적 Skip
- ESLint·App/Functions TypeScript: 오류 0개
- Emulator 브라우저: 로그인 → 설정 → 44px 진단 버튼 → 비식별 JSON 복사·다운로드 2/2 통과
- Next.js 16 Webpack Production Build: 두 차례 통과
- PWA Artifact: Service Worker와 4개 필수 Icon 통과
- Bundle: 초기 Raw 465,729B, gzip 138,309B, 최대 Chunk gzip 66,841B, Dynamic Boundary 12개
- Firebase App Check Enterprise 반영 후 단위 테스트 100개 통과·3개 명시적 Skip, ESLint·App/Functions TypeScript 오류 0개
- Next.js 16 Webpack Production Build, PWA Artifact, Production Bundle 성능 Gate 재통과
- `npm audit --audit-level=high`: High·Critical 0개, 개발·관리 도구 전이 의존성의 Moderate 항목만 존재
- `pilot:readiness`: 실제 Local 계획 파일이 없어 의도대로 `blocked`
- Staging 배포 수정 후 PWA 단위 테스트 8개, ESLint, App/Functions TypeScript, Next.js 16 Production Build 재통과

Vercel의 깨끗한 Linux Build에서도 optimized compile·TypeScript·정적 생성과 Service Worker 생성이 통과했다. Pilot 시작 전 GitHub 기준 후보 Commit과 현재 Staging Deployment가 같은지 다시 확인한다.
