# Phase 11 완료 기록

- 완료일: 2026-08-24
- 기준 문서: 구현 명세서 v1.1, 화면·UX 상세 명세서, 데이터베이스 상세 설계서, 검색·캐시·성능 설계서, 인증·권한·보안 설계서, 테스트·인수 기준서 v1.1, ADR 0011
- 검증 환경: `demo-onnuriway`, Firestore Standard Edition Emulator, Auth/Functions/Storage Emulator, Chromium, Node.js 22.23.2

## Phase

Phase 11 — Sales History & Collaboration

## 구현

### Visit Timeline & Progressive Disclosure

- 학교 영업 상세의 최근 방문 Timeline과 명시적 `전체 기록 보기`
- 초기 최근 3건, 이후 5건씩 `visitedAt DESC + documentId DESC + startAfter` Cursor 페이지네이션
- 동시각 문서까지 안정적인 정렬, `visitId` 기반 페이지 중복 제거와 학교 전환 시 Memory 폐기
- 당시 Assignment 주 담당자, 실제 방문자, 인증 기록자 분리 표시
- 홍보지·샘플과 제품별 수량, 5단계 Heart 관심도, 활동 태그, 결과 요약, 당시 후속 일정 표시
- 비활성 또는 Directory에서 사라진 과거 참조도 기록 맥락을 잃지 않는 Fallback Label
- 전체 방문 이력의 수정·삭제 UI 없음과 팀 조회 전용 상태 명시

### School Memory & Next Action

- 월별 활동 태그와 분리된 학교 단위 커뮤니케이션 참고 태그
- 다음 행동·기한과 ‘다음 달에도 유지’ 의미를 학교 협업 카드에 표시
- 담당 직원 전용 태그 편집 Bottom Sheet, 복수 선택, 실패 시 Draft와 재시도 Request ID 보존
- 방문 기록 또는 프로필 저장으로 Sales Revision이 바뀌면 학교별 Component Key로 편집 경계를 재동기화
- 응답 유실 뒤 동일 Payload 재시도와 오류 뒤 선택 변경 시 새 Request ID 사용
- Revision 충돌의 서버 `actualRevision`을 받아 Draft를 버리지 않고 다음 재시도 기준 갱신

### Atomic Profile Mutation

- `updateSalesProfile` Callable과 App/Functions 공용 Strict Zod 입력·결과 계약
- Production App Check, Firebase Auth, 활성 `authz`, Claim 일치와 `sales | admin` 역할 재검증
- 활성 Cycle·학교·현재 Assignment·담당 관계·활성 커뮤니케이션 태그 참조 검증
- Expected Assignment/Sales Revision의 이중 낙관적 동시성 제어
- UUID Request ID, Actor와 Payload 지문 기반 멱등 재생·다른 Payload 충돌 거부
- Profile, `SALES_PROFILE_UPDATED` Audit와 Request Lock의 단일 Firestore Transaction 저장
- 태그 갱신 시 관심도·최근 방문·후속 일정·다음 행동·방문 원본 보존

### Role & Data Boundary

- 다른 영업 직원의 학교에서 최근/전체 방문과 학교 참고를 읽되 모든 편집 동작 제거
- 서버에서 다른 Assignment 직원의 직접 Callable 수정 거부
- 납품 상세은 Sales Profile, Assignment, 기준 태그와 방문 이력을 요청하거나 표시하지 않음
- Sensitive 전체 방문 이력은 IndexedDB에 장기 저장하지 않고 현재 학교 화면의 Memory에서만 유지
- 44px 이상 터치 목표, Mobile/Desktop 반응형, Axe WCAG AA 검증

## Security Impact

- 기존 Firestore Client Mutation Default DENY를 유지한다.
- `salesVisits`는 읽기만 하며 Phase 11에서 과거 이벤트를 수정하는 서버 경로를 만들지 않았다.
- `updateSalesProfile`은 활성 Session·역할·현재 Assignment 관계를 서버 Transaction 안에서 재검증한다.
- Client의 `expectedSalesRevision`, `updatedBy` 또는 권한 표시를 신뢰하지 않고 서버 Profile과 인증 Actor를 사용한다.
- 권한 없는 영업 직원의 직접 Callable 수정과 납품 화면의 영업 데이터 노출을 Emulator/Chromium에서 거부·비노출 확인했다.

## Performance Impact

- 학교 진입 시 표시 3건, 다음 페이지 확인을 포함해 최대 4문서만 읽는다.
- 전체 기록은 사용자가 요청할 때 5건씩 추가하며 Offset이 아닌 Cursor를 사용한다.
- 페이지 병합은 Map 기반이며 Timeline의 직원·활동 태그·제품 이름 Lookup Map은 React `useMemo`로 유지한다.
- 긴 Timeline 항목은 CSS `content-visibility: auto`로 화면 밖 Layout/Paint 비용을 줄인다.
- 납품 모드는 영업 Fetch 자체를 만들지 않는다.

## 검증 결과

- TypeScript App·Functions, ESLint: 통과, 경고 0개
- 전체 Vitest: Test File 20개 통과·1개 스킵, Test 70개 통과·3개 스킵
- Phase 11 단위 계약: Test File 3개, Test 11개 통과
- Firestore·Storage Rules: Test 23개 통과
- Phase 11 Firestore Gate: 최근 3건·추가 5건, Sales Revision 2, 다음 행동 유지, 멱등 재생, Payload/Revision 충돌, 타 담당자 수정 거부, 방문 원본 Update Time 보존, Audit 1건 통과
- Phase 11 집중 Chromium E2E: 팀 조회 전용·태그 저장·배송 비노출·Axe·Touch Target 3개 통과
- Phase 0~11 누적 Chromium E2E: 26개 통과
- Functions TypeScript Production Build 통과
- Next.js 16 Production Build: 공식 Webpack 경로로 TypeScript, 정적 페이지 4개, Build Trace까지 통과

## Known Issues

- 실제 Firebase Project에 Function·Rules·Index·Hosting을 배포하지 않았다.
- 날짜·직원·활동 태그 복합 필터, 팀 Export와 CRM형 분석은 후속 Phase 범위다.
- 방문 원본의 정정이 필요한 운영 예외는 기존 Soft Delete 감사 정책을 사용하는 별도 관리자 흐름으로 설계해야 한다.
- `requestLocks` 문서의 TTL/Cleanup은 실제 Project 배포 Phase에서 구성해야 한다.
- Next.js 기본 Turbopack Production Build는 현재 Codex Windows 작업 Job에서 PostCSS Pooled Worker 생성이 `os error 5`로 차단되어, 공식 `--webpack` Production Build를 프로젝트 명령으로 고정했다. 개발 Turbopack과 전체 E2E는 정상 통과했다.

실제 Firebase Project, Cloud Functions 배포, Hosting, Secret Manager, 영업 운영 데이터는 변경하지 않았다.
