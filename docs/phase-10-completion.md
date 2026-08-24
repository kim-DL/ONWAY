# Phase 10 완료 기록

- 완료일: 2026-08-24
- 기준 문서: 구현 명세서 v1.1, 화면·UX 상세 명세서, 데이터베이스 상세 설계서, 검색·캐시·성능 설계서, 인증·권한·보안 설계서, 테스트·인수 기준서 v1.1, ADR 0010
- 검증 환경: `demo-onnuriway`, Firestore Standard Edition Emulator, Auth/Functions/Storage Emulator, Chromium

## Phase

Phase 10 — Sales Visit Recording

## 구현

### Visit Recording Experience

- 학교 영업 상세에서 여는 전용 방문 기록 Bottom Sheet와 저장 직후 Sales Pulse 요약
- 방문일, 실제 방문자, 홍보지·샘플 전달 여부, 제품별 샘플 수량, 관심도, 활동 태그, 결과와 후속 일정 입력
- 홍보지·샘플·관심도에 기본 선택을 두지 않고 누락을 명시적으로 검증
- `20~100`의 5단계 Heart Selector와 별도 ‘관심도 미확인’ 0점 선택
- 샘플 전달 시 제품·수량 필수, 여러 제품 추가와 안정적인 행 ID, 중복 제품 거부
- 주 담당자, 실제 방문자와 인증된 기록 입력자를 분리해 화면 안내와 저장 계약에 반영
- 오류 Summary 자동 Focus, 입력 재개 시 오래된 오류 제거, 실패 시 Draft와 동일 Request ID 보존
- 저장 중 재입력·닫기·중복 제출 차단과 성공 후 관심도·전달 상태·후속 행동 즉시 표시
- 다른 직원 배정은 팀 전체 보기에서 조회 전용, 납품 모드는 영업 상세 데이터를 요청하지 않음
- Mobile/Desktop 반응형, 44px 이상 터치 목표와 Bottom Sheet Axe WCAG AA 검증

### Atomic Visit Mutation

- `recordSalesVisit` Callable과 App/Functions 공용 Strict Zod 입력·결과 계약
- Production App Check, Firebase Auth, 활성 `authz`, Claim 일치와 `sales | admin` 역할 재검증
- 일반 영업 직원의 Assignment 관계 검증과 활성 Cycle·학교·배정·방문자·제품·태그 참조 검증
- `Asia/Seoul` 기준 Cycle·미래·최근 방문 순서와 후속일 논리 검증
- Expected Assignment Revision으로 동시 변경 충돌 거부
- UUID Request ID, Actor와 Payload 지문 기반 멱등 재생·다른 Payload 충돌 거부
- 불변 `salesVisits` 이벤트, 최신 `salesProfiles`, Assignment 요약, 직원·팀 Stats, Audit와 Request Lock을 단일 Firestore Transaction으로 기록
- 성공 결과에 Assignment/Sales Revision과 월 상태를 반환해 Client Cache 무효화와 Background Refresh 수행

### Detail Data & Cache Boundary

- 영업 모드에서만 활성 Cycle Assignment·학교 Sales Profile·제품·활동 태그·영업 직원 Directory를 로드
- 독립 기준 문서를 병렬 조회하고 실제 활성 Cycle의 Assignment 관계로 방문자 후보 제한
- 역할별 기존 학교 상세 Cache에 nullable Sales Data를 추가하고 이전 Schema Cache는 안전하게 폐기
- 방문 성공 시 현재 Cycle의 Sales Workspace Cache를 제거해 목록 재진입에서 최신 통계를 조회
- 학교별 Component Key와 서버 Revision 결과로 학교 전환·연속 기록 간 Draft와 Revision 혼선을 방지

## Security Impact

- 방문과 관련 상태의 Client Firestore 직접 쓰기는 계속 거부한다.
- Callable은 활성 Session, 역할과 Assignment 관계를 서버에서 다시 확인한다.
- Strict Input, 참조 무결성, Cycle 날짜, Expected Revision, Request ID Payload 지문을 검증한다.
- `recordedBy`는 Client 입력을 신뢰하지 않고 인증된 Actor에서 결정한다.
- 권한 없는 납품 계정의 직접 Callable 호출과 다른 영업 직원 배정 기록을 Emulator에서 거부했다.
- 방문 생성과 관련 상태·통계·Audit는 한 Transaction으로 처리해 부분 저장을 허용하지 않는다.

## Performance Impact

- 납품 상세은 Phase 10 영업 문서를 전혀 읽지 않는다.
- 영업 상세의 설정·Profile·제품·태그·직원 Directory는 병렬로 가져온다.
- 성공 시 전체 Cache를 비우지 않고 현재 직원 Session과 Cycle의 영업 Workspace만 무효화한다.
- 저장 응답으로 상세의 핵심 요약을 먼저 갱신하고 Firestore 재조회는 Background에서 수행한다.
- 팀·직원 Stats 재계산은 기존 Cycle당 최대 50개 Assignment Transaction 경계 안에서 제한한다.

## 검증 결과

- `npm run typecheck` / `npm run lint`: App·Functions 통과, 경고 0개
- `npm test`: Test File 18개 통과·1개 스킵, Test 65개 통과·3개 스킵
- `npm run test:visit`: Test File 3개, Test 12개 통과
- `npm run test:rules`: Firestore·Storage Rules Test 23개 통과
- `npm run test:visit:emulator`: 방문 1건, Profile/Assignment/직원·팀 Stats/Audit 동시 반영, Assignment Revision 2, Sales Revision 1, 멱등 재생, Payload 충돌·Revision 충돌·타 구역 저장 거부로 통과
- `npm run test:e2e:phase10:focus`: 완전 입력·명시적 0점·읽기 전용/권한·Axe·Touch Target Chromium E2E 3개 통과
- `npm run test:e2e:phase10`: Phase 0~10 누적 Chromium E2E·Axe·Touch Target 23개 통과
- `npm run seed:verify`: Auth User 6명, Firestore Document 63개 시드 및 검증
- `npm run functions:build` / `npm run build`: Functions TypeScript와 Next.js Production Build 통과
- `.next/static` 서버 비밀 이름 검색과 Code `TODO | FIXME | HACK` 검색: 노출 0건
- `npm audit --audit-level=high`: High 0개, Critical 0개. Firebase 도구 체인의 전이 의존성 Moderate 10개는 강제 다운그레이드 없이 기록

## Known Issues

- 실제 Firebase Project에 Function·Rules·Hosting을 배포하지 않았다.
- 전체 방문 이력 Timeline, 날짜·직원·활동 필터와 편집 정책은 Phase 11 범위다.
- Cycle당 50개를 넘는 운영 규모에서는 Stats 증분 집계 또는 비동기 재계산이 필요하다.
- 월 생성·대량 배정·담당 변경 관리자 UI와 Google 관리자 로그인은 후속 관리자 Phase 범위다.
- `requestLocks` 문서의 TTL/Cleanup은 실제 Project 배포 Phase에서 구성해야 한다.

실제 Firebase Project, Cloud Functions 배포, Hosting, Secret Manager, 영업 운영 데이터는 변경하지 않았다.
