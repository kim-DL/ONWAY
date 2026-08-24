# Phase 1 완료 기록

- 완료일: 2026-08-23
- 기준 문서: 급식길 PWA 구현 명세서 v1.1, 데이터베이스 상세 설계서 v1.3
- Firestore 계약: Standard Edition / Native mode

## 구현 결과

### Domain Contract

- 학교, 현장정보, 사진
- 영업 Profile, 방문, Cycle, Assignment, Zone, 월 통계
- 직원, 공개 Directory, 인증 자격정보, PIN Index, authz
- 제품, 태그, 검색 Catalog Item, Catalog Meta
- Export, Audit, NEIS Sync, Public Settings

런타임 Enum은 `as const` 값 목록과 Zod Schema에서 단일 출처로 관리하고 TypeScript Type은 Schema에서 추론한다. UI는 이후 Phase에서 이 Domain Contract를 직접 사용한다.

### 핵심 검증 규칙

- Interest: `0 | 20 | 40 | 60 | 80 | 100`만 허용하고 `interestEvaluated`로 미선택과 명시적 0을 구분
- Visit: 방문자, 기록자, 홍보지/샘플 상태, 명시적 관심도, 비어 있지 않은 Summary 필수
- Cycle: `YYYY-MM`과 `year`/`month` 일치, 상태별 활성·종료 시각 일관성
- Assignment: 주 담당자가 `assigneeIds`에 포함되고 최근 방문 ID/시각이 함께 존재
- Photo: `01 | 02 | 03` Slot만 허용하고 학교당 Slot 중복 금지, Soft Delete Metadata 일관성
- School: 위·경도 쌍, 확인자·확인시각 쌍, 행정구·학교유형·운영상태 Enum 검증
- Field Profile: 시간 형식, 0~100 완성도, Revision 검증

### Firestore 경계

- 모든 문서·Subcollection·사진 Storage 경로를 Path Helper로 통일
- Document ID에 빈 값과 `/` 사용 방지
- Firebase 비의존 Domain `Date`와 Firestore `Timestamp` 재귀 변환
- Snapshot Read 시 Zod 검증 및 Document ID와 저장된 ID 불일치 차단

### Seed

고정 ID와 고정 시각을 사용해 다음 시나리오를 재현한다.

- Delivery, Sales A, Sales B, Admin, Disabled 사용자
- 완전정보, 부분정보, 정보없음/신규, 교명변경, `inactiveCandidate` 학교
- A/B/C Zone, 2026-08 Cycle과 Assignment
- 사진 Slot 3개, 제품/태그, Sales Profile과 Visit

`npm run seed`는 실행 중인 Local Emulator의 전체 대상 Collection과 Auth 사용자를 초기화하므로 `demo-*` 프로젝트만 허용한다. 실제 Hash 규격이 확정되지 않은 PIN 자격증명은 넣지 않았으며 Phase 3에서 Secret 기반으로 생성한다.

```bash
# Terminal 1
npm run emulators

# Terminal 2
npm run seed

# 독립적인 일회성 실제 실행 검증
npm run seed:verify
```

### Index Skeleton

`salesVisits`에 다음 복합 Index를 선언했다.

- `schoolId + deleted + visitedAt desc`
- `visitedBy + visitedAt desc`
- `cycleId + visitedAt desc`
- `followUp.required + followUp.dueDate`

## Phase 1 Gate

검증 결과:

- Lint: PASS, warning 0
- Typecheck: PASS
- Unit: 5 files, 17 tests PASS
- Firestore/Storage Rules: 2 files, 4 tests PASS
- Emulator Seed: Auth 5 users, Firestore 45 documents PASS
- Functions Build: PASS
- Production Build: PASS
- Playwright E2E: 4 tests PASS

Phase 1 명시 Gate인 School, Field Profile, Interest, Visit, Cycle, Photo Slot Validation은 모두 자동 테스트로 검증했다.

## Phase 2 진입 조건

- Firestore/Storage Rules는 여전히 안전한 전 경로 Default DENY다.
- 실제 Firebase 프로젝트와 Index는 아직 배포하지 않았다.
- Phase 2에서는 이 Domain Contract를 기준으로 역할별 Rules와 Emulator Rules Test를 구현한다.
