# Phase 9 완료 기록

- 완료일: 2026-08-24
- 기준 문서: 구현 명세서 v1.1, 화면·UX 상세 명세서, 데이터베이스 상세 설계서, 검색·캐시·성능 설계서, 인증·권한·보안 설계서, 테스트·인수 기준서 v1.1, ADR 0009
- 검증 환경: `demo-onnuriway`, Firestore Standard Edition Emulator, Auth/Functions/Storage Emulator, Chromium

## Phase

Phase 9 — Sales Cycle & Assignment

## 구현

### Monthly Sales Workspace

- 활성 월과 최근 18개월을 선택할 수 있는 월별 영업 Workspace
- 로그인 영업 직원의 배정만 표시하는 ‘내 구역’ 기본 범위와 명시적 ‘전체 보기’ 전환
- A/B/C 세 영업 직원의 서로 다른 담당 학교 Fixture와 구역 필터
- 구역 → 직원 → 학교 순의 안정 정렬과 방문 전·완료·후속·재방문·보류 상태 Rail
- 담당자, 홍보지·샘플 상태, 최근 방문 정보를 한 카드에서 확인
- 과거 Cycle 읽기 전용 표시와 직원 성과 순위 없는 협업 중심 팀 화면
- Mobile/Desktop 반응형, 44px 이상 터치 목표, Axe 색 대비와 키보드 접근성

### Cycle & Assignment Administration Boundary

- `createSalesCycle`로 새 월 생성, 선택적 전월 배정 복사와 활성 월 원자 전환
- 전월 복사 시 방문·월 상태·홍보지·샘플·Revision을 새 달 기준으로 초기화
- `createSalesAssignments`로 최대 50개 학교 배정 원자 생성
- `changeSalesAssignment`로 Expected Revision·필수 변경 사유 기반 담당 변경
- 존재 학교·활성 구역·활성 영업 직원 참조 검증과 닫힌 Cycle 변경 거부
- UUID Request ID, Payload 지문과 Request Lock 기반 멱등 재생·충돌 거부
- Cycle/Assignment/Audit/Settings를 Firestore Transaction으로 기록
- App Check, Firebase Auth, 활성 `authz`, Claim 일치, Admin 역할을 Callable마다 재검증

### Cache & Data Loading

- `appSettings/public`, 최근 Cycle, 활성 구역, 직원 Directory 병렬 조회
- 선택 월의 배정 확인 후 실제 배정된 학교 문서만 20개씩 조회
- 직원·역할·`sessionVersion`·Cycle로 분리한 Cache Key
- Memory → IndexedDB → Firestore 순의 Cache-first 표시와 최신화 실패 안내
- 직원 Session당 최대 18개월 Workspace 유지
- 로그아웃·세션 무효화 시 Sales Workspace Memory·IndexedDB 제거

## Security Impact

- 영업 Cycle과 배정의 Client 직접 쓰기는 계속 거부한다.
- 관리자 Callable은 활성 Session과 `admin` 역할을 서버에서 다시 확인한다.
- Strict Input, 참조 무결성, Cycle 상태, Expected Revision과 Request ID Payload 지문을 검증한다.
- 담당 변경 사유와 변경 필드를 Audit Log에 남긴다.
- 일반 영업 계정의 관리자 Callable 호출 거부를 Emulator E2E로 검증했다.
- 실제 직원·학교 데이터나 실제 PIN을 Fixture에 사용하지 않았다.

## Performance Impact

- 최근 Cycle 조회를 18개로 제한하고 학교 전체 Collection을 읽지 않는다.
- 독립 기준 데이터는 병렬로 요청하고 학교는 배정 ID가 정해진 뒤에만 Batch 조회한다.
- 필터와 정렬에서 직원·학교 Lookup Map과 담당자 Set을 재사용한다.
- 긴 카드 Grid는 `content-visibility`로 화면 밖 렌더링 비용을 줄인다.
- Cache-first 화면으로 재방문과 일시적 Offline에서 마지막 정상 월 정보를 먼저 제공한다.

## 검증 결과

- `npm run typecheck` / `npm run lint`: App·Functions 통과, 경고 0개
- `npm test`: Test File 16개 통과·1개 스킵, Test 59개 통과·3개 스킵
- `npm run test:sales`: Test File 2개, Test 9개 통과
- `npm run test:rules`: Firestore·Storage Rules Test 23개 통과
- `npm run test:sales:emulator`: A/B/C 배정, 3건 생성·3건 전월 복사, 담당 변경 Revision 2, 멱등 재생·Payload 충돌 거부, Audit 4건으로 통과
- `npm run test:e2e:phase9:focus`: Phase 9 집중 Chromium E2E·Axe·Touch Target 3개 통과
- `npm run test:e2e:phase9`: Phase 0~9 누적 Chromium E2E·Axe·Touch Target 20개 통과
- `npm run seed:verify`: Auth User 6명, Firestore Document 63개 시드 및 검증
- `npm run functions:build` / `npm run build`: Functions TypeScript와 Next.js Production Build 통과
- `.next/static` 서버 비밀 이름 검색과 `TODO | FIXME | HACK` 검색: 노출 0건
- `npm audit --audit-level=high`: High 0개, Critical 0개. Firebase 도구 체인의 전이 의존성 Moderate 10개는 강제 다운그레이드 없이 기록

## Known Issues

- 실제 Firebase Project에 Function·Rules·Hosting을 배포하지 않았다.
- 월 생성·대량 배정·담당 변경 관리자 UI와 Google 관리자 로그인은 후속 관리자 Phase 범위다.
- 방문 기록 생성, 월 상태·홍보지·샘플 갱신과 통계 집계는 Phase 10 범위다.
- 전월 복사와 한 번의 배정 생성은 MVP Transaction 경계를 위해 50개로 제한한다.
- `requestLocks` 문서의 TTL/Cleanup은 실제 Project 배포 Phase에서 구성해야 한다.

실제 Firebase Project, Cloud Functions 배포, Hosting, Secret Manager, 영업 운영 데이터는 변경하지 않았다.
