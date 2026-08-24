# Phase 13 완료 기록

- 완료일: 2026-08-24
- 기준 문서: 구현 명세서, 외부 API·데이터 동기화 설계서, 데이터베이스 상세 설계서, 테스트·인수 기준서, ADR 0013
- 검증 환경: `demo-onnuriway`, Firestore Standard Edition Emulator, Auth/Functions/Storage Emulator, Chromium, Node.js 22.23.2

## Phase

Phase 13 — Safe External School Sync & Kakao Matching

## 구현

### NEIS Preview → Diff → Apply → Audit

- `previewNeisSchoolSync`, `applyNeisSchoolSync` Admin Callable과 서버 전용 Live Gate 구현
- 전체 응답 정규화 뒤 `NEW`, `NAME_CHANGED`, `ADDRESS_CHANGED`, `PHONE_CHANGED`, `HOMEPAGE_CHANGED`, `TYPE_CHANGED`, `MISSING` Diff Staging
- UUID Run 재요청 시 동일 Preview를 재생하고 다른 관리자 Request ID 충돌 거부
- 기존 3곳 이상에서 기본 50% 이상 누락, 빈 대상 결과를 `SUSPICIOUS_RESULT`로 분류하고 Apply 강제 차단
- 위험 변경 명시 확인, Preview Revision 검증, 학교별 Transaction Apply와 변경별 Audit
- 교명 변경 시 동일 ID·이전 이름 Alias, 주소 변경 시 좌표 보존·`possibleRelocation`, 누락 시 `inactiveCandidate`, 신규 학교 `unmatched`
- 현장정보·사진·영업 Profile·방문·월 배정 Hard Delete 및 Mutation 경로 없음
- Apply 성공 뒤 Common Search Catalog 새 Version 발행과 Meta 전환

### Kakao Match → Review → Confirm

- 서버 전용 Kakao Local 주소/Keyword Client, 최대 3회 제한 재시도와 응답 Validation
- 학교명·도로명 주소·행정구·거리 Confidence Scorer와 대전 좌표·주소 이중 지역 검증
- 단일 90점 이상만 `autoMatched`, 다중/저신뢰/타 지역은 `needsReview`, 장애/무후보는 `failed`
- `kakaoMatchReviews`에 서버 검증 후보를 보관하고 Client 직접 Read는 기존 Default DENY 유지
- 후보 확정과 관리자 직접 좌표 입력, Expected Revision, 대전 범위 재검증, 멱등 Audit
- 관리자 확정 위치와 Manual 위치를 자동 후보보다 우선하며 Place 변경·이전 후보가 나타나면 기존 좌표 보존
- 학교 생성·검색·현장·사진·영업 기능은 Kakao 실패와 독립적으로 유지

### 직원 길안내

- 학교 상세 Header와 Floating Context Bar의 일관된 Kakao 길안내
- `confirmed | autoMatched`만 공식 학교 좌표 목적지로 사용
- 미확정·실패 학교는 공식 학교명 검색으로 안전하게 Fallback
- 급식실·하역 현장 좌표는 학교 공식 길안내 목적지에 사용하지 않음
- 링크 전환으로 발견된 빠른 작업 Bar 색 대비를 WCAG AA 기준으로 보완

## Security Impact

- NEIS/Kakao Secret은 `functions/.env.example`의 서버 전용 이름만 제공하며 `NEXT_PUBLIC_*`로 노출하지 않는다.
- 실제 외부 호출은 Secret 외에도 별도 `ALLOW_LIVE_*` 승인이 없으면 실패한다.
- Sync·Match·Confirm은 승인된 Google Admin, 활성 `authz`, Session/Permission Version과 활성 Employee를 서버에서 교차검증한다.
- NEIS Preview는 Production 학교를 수정하지 않으며, 대량 누락은 관리자 확인 플래그로도 우회할 수 없다.
- 후보 Payload와 Audit는 Client가 직접 만들거나 읽지 못하며, 외부 API에는 학교 공식명·주소 외 현장/영업정보를 보내지 않는다.

## Performance Impact

- NEIS는 기존 Pagination 안전장치를 재사용하고 전체 학교를 하나의 거대한 Transaction으로 묶지 않는다.
- Apply는 학교별 일관성 단위로 처리하고 Change 저장은 400개 Batch로 분할한다.
- Kakao는 최대 15개 후보만 평가하며 Confirmed+주소 불변 학교는 운영 UI에서 재호출하지 않는 계약을 제공한다.
- Search Catalog는 Versioned Document를 만든 뒤 Meta를 전환해 Client가 중간 상태를 읽지 않는다.

## 검증 결과

- TypeScript App·Functions, ESLint: 통과, 경고 0개
- 전체 Vitest: Test File 25개 통과·1개 스킵, Test 82개 통과·3개 스킵
- Phase 13 단위 계약: 8개 통과
- Firestore·Storage Rules: 23개 통과, `kakaoMatchReviews`는 승인된 Admin을 포함한 모든 Client 직접 Read 거부
- Firestore Emulator Gate: 4개 Diff, Preview 재생, 4개 Apply, Catalog v2, 현장·사진·영업 보존, 대량 누락 차단 통과
- Kakao Emulator Gate: Exact 자동 매칭, 다중 후보 Review, 후보 확정, API 실패 격리, 수동 위치 확정 통과
- Phase 13 집중 Chromium E2E: 확정 좌표 목적지, 미확정 공식명 검색 Fallback, Axe WCAG AA 통과
- Phase 0~13 누적 Chromium E2E: 29개 통과
- Client Production Chunk Secret 이름/Live Gate Scan: 노출 없음
- Functions TypeScript Production Build, Next.js 16 Webpack Production Build: 통과

## Known Issues

- 실제 NEIS/Kakao Key를 설정하거나 외부 API를 호출하지 않았고 Firebase Project에 Function·Rules·Index·Hosting을 배포하지 않았다.
- 운영 학교 수 기반 누락 임계값과 Kakao Confidence Weight의 실데이터 Calibration은 Secret이 연결된 Staging에서 승인 후 수행해야 한다.
- NEIS/Kakao Preview·Review를 조작하는 Desktop Admin 화면은 계획대로 Phase 15 범위다. Phase 13은 서버 계약과 검토 데이터를 먼저 완성했다.
- 전체 Run 즉시 Rollback UI는 MVP 필수가 아니다. 실패·부분 적용은 Run Change와 Audit로 추적한다.

실제 외부 서비스, Firebase Project, 운영 데이터는 변경하지 않았다.
