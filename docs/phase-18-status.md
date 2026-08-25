# Phase 18 상태 기록

- 준비일: 2026-08-24
- Staging 기반 연결일: 2026-08-25
- Phase: 18 — Pilot
- 상태: `PREPARED · STAGING CONNECTED · PILOT NOT STARTED`

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
- Firebase Authentication Google Provider 활성화, 공개 프로젝트 이름·지원 이메일 및 기본 Authorized Domain 3개 확인
- 웹 앱을 reCAPTCHA Enterprise App Check에 등록하고 토큰 TTL을 1시간으로 설정
- reCAPTCHA Enterprise 허용 Domain을 `localhost`, `onnuriway.web.app`, `onnuriway.firebaseapp.com`으로 제한
- 앱의 App Check Provider를 `ReCaptchaEnterpriseProvider`로 전환하고 공개 Site Key는 Git 제외 환경 파일에만 반영
- 환경별 PIN HMAC Lookup·scrypt Pepper Secret을 각각 독립 난수로 생성하여 Secret Manager `version 1 / ENABLED` 확인
- `NEIS_API_KEY` `version 1 / ENABLED`, `KAKAO_REST_API_KEY` `version 2 / ENABLED` 확인
- 중단된 입력 과정에서 생긴 신뢰할 수 없는 Kakao `version 1`은 즉시 `DESTROYED` 처리
- Cloud Functions API 활성화 및 원격 함수가 아직 0개임을 확인하여 Secret 등록 외의 함수 배포가 없었음을 검증

App Check API 강제 적용은 아직 켜지 않았다. Staging Functions·Hosting 배포 후 정상 App Check Token 수신과 실제 호출 지표를 먼저 확인한 다음 API별로 단계적으로 강제한다. 외부 NEIS·Kakao 실제 호출 Gate도 계속 꺼 둔다.

## 완료되지 않은 외부 조건

- 실제 납품 직원 1~2명, 홍보 직원 1~2명, 관리자 1명 선정
- Staging Functions·Firebase Hosting 배포와 실제 HTTPS URL 검증
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

로컬 Webpack 증분 캐시가 resolve dependency snapshot을 저장하지 못했다는 경고가 두 Build에서 반복됐지만, 매번 optimized compile·TypeScript·정적 생성·PWA·Bundle 검증은 통과했다. Pilot 시작 전 Staging CI의 깨끗한 Linux 환경에서 동일 Build Gate를 다시 확인한다.
