# Phase 2 Security Rules Red-team 기록

- 검증일: 2026-08-23
- 대상: `firestore.rules`, `storage.rules`
- 환경: Firebase Local Emulator, Firestore Standard Edition

## 공격 결과

| # | 공격 벡터 | 결과 | 근거 |
| --- | --- | --- | --- |
| 1 | Public List Exploit | 차단 | 비인증 학교·영업·Directory·Unknown read/query 거부 |
| 2 | Unauthorized Read/Write | 차단 | Delivery→Sales, Viewer→Sales, 일반 사용자→관리 영역 거부 |
| 3 | Update Bypass | 차단 | 모든 Client update가 역할과 무관하게 거부 |
| 4 | Ownership Hijacking(Create) | 차단 | Client create 전면 거부, 사용자 입력을 권한 원본으로 사용하지 않음 |
| 5 | Ownership Hijacking(Update) | 차단 | Employee 및 업무 문서 update 전면 거부 |
| 6 | Immutable Field Modification | 차단 | Client update 전면 거부 |
| 7 | Type Juggling | 차단 | 잘못된 Timestamp/Interest payload를 포함한 Client write 거부 |
| 8 | Create/Update Validation Bypass | 차단 | 허용된 create/update 규칙이 없어 Validator 우회면이 없음 |
| 9 | Resource Exhaustion/DoS | 차단 | 1MB 문자열, 11MiB Storage payload 모두 Client 경계에서 거부 |
| 10 | Required Field Omission | 차단 | 불완전한 Visit/Employee create 거부 |
| 11 | Privilege Escalation | 차단 | roleScopes Firestore 조작 거부, Claim은 authz와 교차검증 |
| 12 | Schema Pollution | 차단 | 임의 `extraData`를 포함한 update 거부 |
| 13 | Invalid State Transition | 차단 | 상태 변경은 Client에서 불가, 향후 Server Validator 책임 |
| 14 | Path Traversal/Scoping | 차단 | Storage 모든 직접 접근 거부, 비정상 Slot/확장자 경로도 거부 |
| 15 | Timestamp Manipulation | 차단 | Client create/update 전면 거부 |
| 16 | Negative/Overflow | 차단 | Client create/update 전면 거부 |
| 17 | Mixed Content Leak | 차단 | 공개 Directory를 분리하고 employees는 관리자 전용, 인증자료는 전면 차단 |
| 18 | Counter/Action Replay | 해당 없음 | Stats는 서버 파생 Cache이며 Client write가 없음 |
| 19 | Orphaned Subcollection | 권한 우회 없음 | 중첩 Sales 문서는 Sales/Admin만 읽고 모든 Client write는 거부; 참조 무결성은 서버 책임 |
| 20 | Query Mismatch | 통과 | 현재 앱 Query 미구현, Sales collection read 및 알려진 Catalog direct-get 경계를 테스트 |
| 21 | Validator Pattern | 해당 없음 | 허용된 Client create/update 규칙이 전혀 없음 |

## 남은 통합 위험

Security Rules는 Firebase Admin SDK를 사용하는 서버 코드를 검사하지 않는다. 따라서 향후 Callable/HTTPS Mutation은 역할, App Check, `sessionVersion`, 입력 Zod Schema, Revision, 멱등성, Audit를 자체 검증해야 한다. 해당 통합 테스트가 없으면 Client Rules가 통과해도 전체 시스템 보안 완료로 간주하지 않는다.

Storage는 Firestore `authz` 문서를 조회할 수 없으므로 ADR 0002에 따라 직접 Client 읽기·쓰기를 모두 거부하고 서버 경계를 유지한다.
