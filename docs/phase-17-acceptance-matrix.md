# Phase 17 수용 테스트 매트릭스

- 실행일: 2026-08-24
- 환경: `demo-onnuriway`, Auth/Firestore/Functions/Storage Emulator, Production Mode Chromium, Node.js 22.23.2, Next.js 16.3.2
- 판정: P0 0건, 핵심 P1 0건, 보안 회귀 23/23 통과
- 범위: 기술적 릴리스 후보. 실제 직원 Pilot과 Production 승인은 Phase 18 범위다.

## P0

| 인수 항목 | 자동화 증적 | 결과 |
| --- | --- | --- |
| 로그인 불가 | Phase 3 PIN 정상·비활성·실패 제한 E2E, Auth Emulator | PASS |
| 로그인 유지 불가 | Phase 3 재실행 세션 유지·명시적 로그아웃 E2E | PASS |
| 납품 → 홍보정보 접근 가능 | Phase 10/11 Delivery 거부 E2E, Firestore Rules | PASS |
| 사진 권한 우회 | Phase 8 Viewer 업로드 거부 E2E, Storage Rules | PASS |
| PIN 정보 노출 | Firestore Rules의 `authCredentials`·`pinIndexes` 전 역할 거부 | PASS |
| 서버 Secret 노출 | Production Build 및 Safe Configuration 브라우저 검사 | PASS |
| 학교 검색 실패 | Phase 6 정확·축약·초성·별칭·오타 검색 E2E | PASS |
| 방문 기록 데이터 유실 | Phase 10 원자적 방문 기록 Emulator Gate와 E2E | PASS |
| NEIS Sync가 업무 데이터 삭제 | Phase 13 Preview/Apply·보존·대량 누락 방어 Gate | PASS |
| 앱 실행 Crash | Production Build, 모바일·데스크톱 Boot 및 전체 여정 E2E | PASS |
| 사용자 전환 후 이전 직원 정보 노출 | Phase 3 로그아웃 정리, Phase 9 A/B/C 구역 격리 E2E | PASS |

## P1

| 인수 항목 | 자동화 증적 | 결과 |
| --- | --- | --- |
| 학교 검색 | Phase 6 로컬 검색 E2E | PASS |
| 초성 검색 | Phase 6 `ㄷㅈ` 검색 E2E | PASS |
| 학교 상세 | Phase 4/7 상세 화면 E2E | PASS |
| 사진 확대 | Phase 8 Viewer 확대·Original 지연 요청 E2E | PASS |
| 현장정보 수정 | Phase 7 Callable 수정·Revision 충돌 복구 E2E | PASS |
| 내 구역 | Phase 9 A/B/C 독립 배정 E2E | PASS |
| 전체 보기 | Phase 9 명시적 팀 전체 보기 E2E | PASS |
| 하트 관심도 | Phase 10 방문 기록 E2E | PASS |
| 방문 기록 | Phase 10 원자적 기록·무관심 명시 E2E | PASS |
| 홍보지 | Phase 10 방문 기록 E2E | PASS |
| 샘플 | Phase 10 방문 기록 E2E | PASS |
| 후속 활동 | Phase 10 방문 기록 E2E | PASS |
| 월 변경 | Phase 9 월별 Cycle·Assignment Gate와 E2E | PASS |
| CSV | Phase 12 필터·권한·만료 CSV Gate와 E2E | PASS |
| Offline 조회 | Phase 6 검색·Phase 7 상세 IndexedDB Offline E2E | PASS |
| NEIS Preview | Phase 13 Preview/Diff/Apply Emulator Gate | PASS |
| Kakao 길안내 | Phase 13 확정 좌표·공식명 Fallback E2E | PASS |

## Security Regression

| 공격군 | 방어 증적 | 결과 |
| --- | --- | --- |
| Delivery → Sales | Sales Cycle·Visit·History·Export 읽기 거부 | PASS |
| `employeeId` 변조 | Token과 `authz/{uid}`의 employeeId 불일치 거부 | PASS |
| `role` 변조 | 불완전·위조 Claim 및 Client 역할 상승 거부 | PASS |
| Storage 직접 접근 | 전 역할 직접 Read/Write/Delete, 비정상 경로·MIME·크기 거부 | PASS |
| Audit 변조 | 일반 사용자와 Admin의 Create/Update/Delete 모두 거부 | PASS |
| Auth Credential 접근 | Admin 포함 `authCredentials`·`pinIndexes` 읽기 거부 | PASS |

Firestore 18개와 Storage 5개, 총 23개 Rules 공격 테스트가 통과했다. 상세 평가는 `docs/security/phase-17-rules-audit.json`에 있다.

## 실행 증적

- 기능별 Emulator Gate 10개: NEIS Import, Search Publication, Field Mutation, Photo Lifecycle, Sales Assignment, Visit, History, CSV, NEIS/Kakao Sync, Admin
- Rules: 2개 파일, 23개 테스트 통과
- 단위 계약: 29개 파일 통과·1개 명시적 Skip, 96개 테스트 통과·3개 명시적 Skip
- Production 브라우저: 30개 시나리오 각각 통과 확인
- Safe Configuration 접근성: 모바일·데스크톱 4개 시나리오 통과
- 성능: 검색 최대 0.7ms, Cached Detail 0.3ms, Warm Relaunch 795.3ms, 첫 Image Preview 222.5ms, Cache Preview 5.3ms, CLS 0
- Bundle: 초기 Raw 465,720B, gzip 138,301B, 최대 Chunk gzip 66,841B, Dynamic Boundary 12개
- 의존성: High/Critical 취약점 0건. Firebase 개발 도구 전이 의존성 Moderate 10건은 운영 Bundle 비포함이며 강제 하위 메이저 변경을 적용하지 않았다.

전체 자동 Gate는 `npm run test:acceptance`로 재현한다. 중간에 발견된 Boot fallback 제목 누락, Offline 메시지 선택자 충돌, Admin Emulator의 Google Provider 인증 재현 문제를 수정하고 해당 경로를 다시 검증했다.
