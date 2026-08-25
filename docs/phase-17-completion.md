# Phase 17 완료 기록

- 완료일: 2026-08-24
- 기준 문서: 구현 명세서, 테스트·인수 기준서
- 검증 환경: `demo-onnuriway`, Auth/Firestore/Functions/Storage Emulator, Production Mode Chromium, Node.js 22.23.2, Next.js 16.3.2

## Phase

Phase 17 — Full Acceptance Test

## 구현

- 정적 분석, 단위·성능, Production Build, PWA, Bundle, Safe Configuration, Emulator, Rules, 전체 브라우저 여정을 순서대로 실행하는 `test:acceptance` 단일 진입점
- 각 Emulator 하위 Gate 전에 Firestore를 초기화해 순서 의존과 Seed 오염을 제거한 격리 실행기
- Auth/Firestore/Functions/Storage를 한 번 기동하고 기능별 통합 Gate 10개, Rules, Production E2E를 누적 실행하는 CI 경로
- 실패 즉시 중단하고 `output/acceptance`에 기계 판독 가능한 Gate 결과를 기록하는 리포터
- GitHub Actions에 성능, PWA, Bundle, 전체 Emulator 수용 Gate 통합
- P0 11개, P1 17개, 보안 공격군 6개를 코드 증적에 연결한 수용 매트릭스

## 발견 및 수정

- Dynamic Auth Boot 화면에 문서 제목이 없어 접근성 검사 시점에 `h1`이 없던 문제를 수정했다.
- Offline 상세와 전역 연결 상태에 같은 문구가 표시될 때 E2E 선택자가 모호해지는 문제를 상세 영역으로 한정했다.
- Admin Callable E2E가 Custom Token을 사용해 Google Provider 전용 관리자 경계를 재현하지 못하던 문제를 Auth Emulator의 Google IdP 연결 흐름으로 교정했다.
- 연속 Emulator Gate가 이전 Gate의 Firestore 데이터를 공유해 월별 Sales Seed가 충돌하던 문제를 Gate별 초기화로 제거했다.

## 검증 결과

- P0: 0건
- 핵심 P1: 0건
- 기능별 Emulator Gate: 10/10 통과
- Firestore/Storage Rules: 23/23 통과, 보안 평가 5/5, 미해결 Finding 0건
- Production 브라우저: 30개 시나리오 각각 통과 확인
- Safe Configuration 모바일·데스크톱 접근성: 4/4 통과
- 단위 계약: 96개 통과·3개 명시적 Skip
- Next.js 16 Webpack Production Build, PWA Artifact, Bundle Budget: 통과
- `npm audit --audit-level=high`: High/Critical 0건

정량 성능과 항목별 연결은 `docs/phase-17-acceptance-matrix.md`, Rules 평가는 `docs/security/phase-17-rules-audit.json`에 기록했다.

## 릴리스 판정

Phase 17 기술 수용 기준은 통과했다. 현재 결과는 Phase 18 Pilot에 투입할 수 있는 릴리스 후보이며 Production 배포 승인은 아니다. 실제 납품 1~2명, 홍보 1~2명, 관리자 1명의 Pilot과 그 결과에 대한 관리자 승인이 완료되어야 최종 Production Gate를 통과한다.

실제 외부 서비스, Firebase Project, 운영 데이터는 변경하지 않았다.
