# Phase 5 완료 기록

- 완료일: 2026-08-23
- 기준 문서: 구현 명세서 v1.1, 외부 API·데이터 동기화 설계서 v1.0, 테스트·인수 기준서 v1.1, ADR 0005
- 검증 환경: `demo-onnuriway`, Firestore Standard Edition Emulator

## Phase

Phase 5 — NEIS Initial School Data

## 변경 파일

- `functions/src/neis/contract.ts`
- `functions/src/neis/neis-client.ts`
- `functions/src/neis/school-mapper.ts`
- `functions/src/neis/initial-import-service.ts`
- `functions/src/neis/school-import-repository.ts`
- `functions/src/neis/import-cli.ts`
- `functions/tests/neis-initial-import.test.ts`
- `functions/tests/neis-import.emulator.test.ts`
- `scripts/fixtures/neis-school-info.json`
- `scripts/run-phase5-neis-gate.mjs`
- `scripts/firebase-emulators.mjs`
- `functions/.env.example`, `package.json`, `README.md`

## 구현

### NeisClient

- 공식 `schoolInfo` Endpoint와 `KEY`, `Type=json`, `pIndex`, `pSize`, `ATPT_OFCDC_SC_CODE` 요청 계약
- `list_total_count`에 따라 모든 Page를 순차 수집
- Page별 총수 변경, 최종 행 수 불일치, HTTP/JSON/API Result 오류, 과도한 Page 수를 구분해 Fail Closed
- API Key와 요청 URL을 오류 또는 결과 Log에 기록하지 않음
- 실제 Key가 없는 현재 환경에서는 외부 API를 호출하지 않고 동일 Envelope의 Fixture Fetcher 사용

### Normalize & Validation

- NEIS 학교 Code 기반 `SCH-NEIS-{schoolCode}` 안정 ID
- NFKC·공백 정리된 학교명과 검색용 `normalizedName`
- 도로명주소, 우편번호, 전화번호, 홈페이지 정규화
- 대전 5개 자치구를 내부 District Enum으로 변환
- 신규 학교의 Kakao 상태는 좌표를 추정하지 않고 `unmatched`
- Alias는 빈 배열로 초기화하며 Phase 13 교명 변경에서 이전 이름을 추가
- 중복 Code, 빈 학교명, 잘못된 Code/Homepage, 대전 밖 주소는 전체 Import 차단
- 대전광역시교육청과 초·중·고등학교만 Initial Import 대상

### Initial Import

- 외부 데이터의 수집·정규화·전체 검증이 끝난 후에만 Repository 호출
- 빈 `schools`와 One-time Marker를 사전 확인
- 학교 문서, `neisSyncRuns/{runId}`, `secureSettings/neisInitialImport`를 최대 500 Write 이내의 단일 Atomic Batch로 생성
- 기존 학교나 Marker가 있으면 두 번째 실행을 거부
- Fixture 실행은 `demo-*` Emulator로 제한
- Live 실행은 `NEIS_API_KEY`와 `ALLOW_LIVE_NEIS_IMPORT=true`를 모두 요구

## 테스트

- NEIS Paging과 공식 Query Parameter
- Page 총수 변경/부분 응답 차단
- 잘못된 행과 API 오류 차단
- 타 교육청과 비대상 학교급 Filter
- School Code 안정성, 중복 차단, 학교명·주소·홈페이지 정규화
- 생성 School이 공용 Zod `schoolSchema`와 일치
- Validation 실패 전 Repository 미호출
- Firestore Atomic Batch로 학교 3개·Sync Run·Marker 동시 생성
- 기존 DB에서 두 번째 Import 거부 및 기존 데이터 보존
- Fixture CLI 최초 성공·재실행 실패·문서 수 불변

## 검증 결과

- `npm run lint`: 통과, 경고 0건
- `npm run typecheck`: App·Functions 모두 통과
- `npm test`: 테스트 파일 10개 통과·1개 조건부 Skip, 테스트 36개 통과·3개 Emulator 전용 Skip
- `npm run test:neis:emulator`: Initial Import 3개 테스트와 Fixture CLI Gate 통과
- `npm run test:rules`: Firestore Rules 23개 테스트 통과
- `npm run seed:verify`: Auth 사용자 5명·Firestore 문서 53개 생성 검증 통과
- `npm run build:functions`, `npm run build`: Functions와 Next.js Production Build 통과
- `npm run test:e2e`: Desktop·Mobile 기본·접근성 4개 테스트 통과
- `npm run test:e2e:phase4`: 인증·권한·화면 누적 회귀 7개 테스트 통과
- Client Bundle 및 `NEXT_PUBLIC_*` 외부 Key Scan: 통과
- `npm audit --audit-level=high`: 종료 코드 0, High·Critical 0건

## Security Impact

- NEIS Key는 Functions/CLI 서버 경계에만 있으며 Client Source와 `NEXT_PUBLIC_*`에 존재하지 않는다.
- Fixture는 실제 Project에서 실행되지 않는다.
- Live Import는 명시적 승인 Flag 없이 실행되지 않는다.
- Client Firestore Write Rule은 변경하지 않았고 기존 Default DENY를 유지한다.
- 외부 Sync는 `schoolFieldProfiles`, 사진, 영업 Profile·Visit·Cycle·Assignment에 접근하지 않는다.

## Performance Impact

- 기본 Page Size는 1,000이고 대상 교육청 Filter를 서버 요청에 포함한다.
- Page는 Rate Burst를 만들지 않도록 순차 수집한다.
- 대전 초·중·고 전체가 하나의 Atomic Batch 한도에 들어오지 않으면 적용 전 중단한다.
- Runtime 학교 검색에서는 NEIS API를 호출하지 않는다.

## Known Issues

- 실제 NEIS Key와 승인된 Firebase Project가 없어 Live Import는 실행하지 않았다.
- 현재 공식 포털은 갱신 주기를 실시간/수시로 안내하므로 첨부 문서의 주간 주기를 코드에 고정하지 않았다.
- `npm audit`의 `firebase-tools` 계열 전이 의존성에 Moderate 10건이 남아 있다. 자동 수정은 강제·호환성 변경을 요구하므로 High/Critical Gate와 분리해 후속 갱신 대상으로 관리한다.
- 교명·주소 변경 Diff, 누락 학교 `inactiveCandidate`, Preview/Apply와 Kakao Matching은 Phase 13 범위다.
- 한국어 초성 Search Catalog는 Phase 6 범위다.

## 다음 Phase 참고사항

Phase 6은 이 학교 문서의 `name`, `normalizedName`, `shortName`, `aliases`, `initials`, `district`, 주소를 사용해 Versioned Search Catalog를 생성한다. NEIS Runtime 호출 없이 Memory Search가 가능해야 한다.

실제 Firebase Project, NEIS Key, Secret Manager 또는 Cloud 배포는 변경하지 않았다.
