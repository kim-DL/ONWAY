# Phase 2 완료 기록

- 완료일: 2026-08-23
- 기준 문서: 구현 명세서 v1.1, 데이터베이스 상세 설계서 v1.3, 인증·권한·보안 설계서 v1.3
- 검증 환경: `demo-onnuriway`, Firestore Standard Edition Emulator

## Firestore 접근 경계

모든 업무 읽기는 다음 조건을 먼저 충족해야 한다.

- Firebase Auth 로그인
- Token의 `employeeId`, `sessionVersion`, `permissionsVersion`, `roleScopes` 타입·허용값 검증
- `authz/{uid}`가 존재하고 `active == true`
- Token과 authz의 employee/session/permission version 일치

역할별 읽기:

- Delivery: 학교, 현장정보, 사진 Metadata, 직원 Directory, 공용 Catalog/설정
- Sales: Delivery 영역 + 영업 Profile/Visit/Cycle/Assignment/Stats/제품/태그
- Viewer: 학교, 현장정보, 사진 Metadata, 직원 Directory, 공용 Catalog/설정
- Admin: Google Provider + 서버 승인 Claim + admin Scope를 모두 충족한 경우 관리정보 포함
- Unauthenticated/Disabled/Stale Session: 거부

`authCredentials`, `pinIndexes`, `secureSettings`, `requestLocks`는 관리자 Client에도 공개하지 않는다. `authz`는 로그인 사용자가 자신의 문서만 `get`할 수 있으며 목록과 타인 문서는 거부한다.

## Mutation 경계

문서의 Server Mutation 원칙에 따라 모든 역할과 Admin Client의 Firestore create/update/delete를 거부한다. 향후 승인된 Callable/HTTPS Function만 Admin SDK로 변경하며 다음을 서버에서 검증해야 한다.

- App Check, 인증, 역할, 활성 세션
- Zod 입력 계약과 사용자 식별값 재구성
- Revision, Soft Delete, 멱등성
- Audit Log

## Storage 경계

ADR 0002에 따라 다음 경로를 명시하되 모든 Client SDK read/write를 거부한다.

- `schools/{schoolId}/photos/{slotId}/{versionId}/{variant}`
- `temporaryUploads/{uid}/{uploadId}/{fileName}`
- `exports/{employeeId}/{jobId}/{fileName}`

사진 다운로드·업로드와 CSV 다운로드는 Firestore authz, App Check, 역할, Session을 확인할 수 있는 서버 경계에서만 제공한다.

## Emulator Rules Test

- Firestore 역할별 Read Matrix
- Delivery→Sales DENY
- Viewer→Sales DENY
- Google/승인 관리자 경계
- Disabled/Missing/Stale/권한 Version 불일치 Session
- authCredentials/PIN/Server-only/Unknown 경로
- Catalog Scope, Export 소유권, 사진 Slot
- 모든 역할의 핵심 Collection 직접 create/update/delete
- Role 조작, Update Bypass, 1MB 문자열, Type Juggling, Schema Pollution
- Storage 비인증/전 역할 다운로드·업로드·삭제
- Storage 11MiB/MIME/비정상 경로 공격

결과: **2 files, 23 tests, 0 failures**.

## 전체 품질 Gate

- Lint: PASS, warning 0
- Typecheck: PASS
- Unit: 5 files, 17 tests PASS
- Rules: 2 files, 23 tests PASS
- Emulator Seed: Auth 5 users, Firestore 45 documents PASS
- Functions Build: PASS
- Production Build: PASS
- Playwright E2E: 4 tests PASS
- npm audit: high/critical 0, 기존 Firebase 도구 전이 의존성 moderate 10건

## Red-team 감사

- Security Validator 점수: 5/5
- 21개 공격 벡터 검토
- Rules 범위에서 재현 가능한 권한 우회 없음
- 상세: `docs/security/phase-2-red-team.md`, `docs/security/phase-2-rules-audit.json`

이는 Rules 범위 평가이며 미래 Server Function의 보안을 보증하지 않는다.

## Phase 3 진입 조건

- Rules와 Emulator Test는 통과했지만 실제 Firebase 프로젝트에는 배포하지 않았다.
- Phase 3 PIN 인증은 발급 Token에 Phase 2 필수 Claim을 모두 포함해야 한다.
- Admin 로그인은 일반 직원 Custom Token이 아니라 Google Provider와 서버 승인 Claim을 사용해야 한다.
- 인증/세션 구현 중 Rules 거부가 발생하면 Rules를 느슨하게 하기 전에 Token과 authz 불일치를 먼저 진단한다.
