# Phase 6 완료 기록

- 완료일: 2026-08-23
- 기준 문서: 구현 명세서 v1.1, 검색·캐시·성능 설계서, 데이터베이스 상세 설계서, 테스트·인수 기준서 v1.1, ADR 0006
- 검증 환경: `demo-onnuriway`, Firestore Standard Edition Emulator, Chromium

## Phase

Phase 6 — Search Catalog

## 주요 변경 파일

- `src/features/search/search-normalizer.ts`
- `src/features/search/memory-search-index.ts`
- `src/features/search/common-catalog-builder.ts`
- `src/features/search/search-catalog-cache.ts`
- `src/features/search/search-catalog-repository.ts`
- `src/features/search/use-school-search-catalog.ts`
- `src/features/search/school-search.tsx`
- `scripts/search-catalog-publisher.ts`
- `scripts/publish-search-catalog.ts`
- `scripts/run-phase6-search-gate.ts`
- `tests/e2e-auth/phase6-search.spec.ts`
- `src/domain/catalog.ts`, `src/seed/phase1.ts`, `src/app/globals.css`
- `package.json`, `package-lock.json`, `README.md`, `.env.example`

## 구현

### Search Normalizer & Ranker

- NFKC, 공백·구두점 제거, Latin 소문자화를 동일한 Query·학교명 규칙으로 적용
- 한글 완성형 음절의 초성을 생성하고 이미 입력된 자모와 영문·숫자는 보존
- `대전` 지역명과 초·중·고 학교급을 이용한 안전한 축약명 생성
- 관리자·교명 변경 Alias를 보존하고 지역 제거·학교급 축약 Alias를 중복 없이 추가
- 공식명 정확 일치 → 축약명 → Alias → Prefix → 초성 → 포함 → 제한적 Fuzzy 순서 고정
- 3글자 이상 Query만 편집거리 1~2의 Fuzzy 후보를 허용하고 직접 일치보다 항상 낮게 배치
- 최대 10개 결과만 UI에 전달하고 500개 학교 반복 검색의 계산 Budget을 테스트로 고정

### Versioned Firestore Catalog

- Common Item에 학교명·축약·초성·Alias·학교급·행정구·주소 요약·상태·사진 수·현장정보 여부만 포함
- 행정구와 고정 Chunk로 분할하며 문서별 내부 Size Budget 300KB 적용
- Version이 포함된 불변 Document ID와 `catalogMeta/current`의 명시적 문서 ID 목록 사용
- 학교·현장정보·사진을 같은 Transaction Snapshot에서 읽고 Catalog 문서와 Meta를 원자적으로 발행
- 잘못된 Source, 중복 학교, Size 초과, 문서 계약 불일치 시 활성 Meta를 변경하지 않음
- 이전 Version을 보존해 전환 중인 Client가 읽던 문서를 잃지 않음
- Demo Emulator 밖 Publish는 `ALLOW_LIVE_SEARCH_CATALOG_PUBLISH=true` 없이는 거부

### IndexedDB & Memory Search

- `idb` 8.0.3을 직접 의존성으로 사용하고 명시적 DB Schema와 Migration Version 적용
- `employeeId:roleScope:sessionVersion:catalogVersion` Namespace로 Catalog와 최근 학교 분리
- IndexedDB Hit를 먼저 Memory Index로 올린 뒤 서버 Meta를 확인
- Version이 같으면 Catalog 문서 재다운로드 없이 Cache 사용
- 새 Version은 검증 후 하나의 IndexedDB Transaction으로 교체
- 로그아웃·세션 무효화 시 Catalog와 최근 학교 Persistent State 제거
- 검색 입력 중 Repository·Firestore·외부 API를 호출하지 않음

### Search UI

- 납품·영업 App Shell에서 같은 검색 오버레이 사용
- 학교명·축약·초성·Alias·Fuzzy 결과와 Match 이유 표시
- 학교급·행정구·주소·사진·현장정보 Summary 표시
- 최근 학교 저장, Offline Catalog 상태, Empty·Error·Loading 상태 제공
- Combobox/Listbox 의미 구조, Arrow Up/Down, Enter, Escape, Focus, 44px Touch Target 지원
- 모바일 Full-screen과 Desktop Dialog, Reduced Motion 및 기존 역할별 Accent 유지

## 검증 결과

- `npm run lint`: 통과, 경고 0건
- `npm run typecheck`: App·Functions 모두 통과
- `npm test`: 테스트 파일 13개 통과·1개 조건부 Skip, 테스트 50개 통과·3개 Emulator 전용 Skip
- `npm run test:search`: 검색 단위·성능 테스트 14개 통과
- `npm run test:search:emulator`: v1→v2 원자 전환, 5개 학교·5개 Catalog, 이전 Version 보존, 실패 시 Meta·문서 수 불변 통과
- `npm run test:rules`: Firestore·Storage Rules 23개 통과
- `npm run test:neis:emulator`: Phase 5 Fixture·Atomicity 3개 통과
- `npm run seed:verify`: Auth 사용자 5명·Firestore 문서 58개 생성 검증 통과
- `npm run functions:build`, `npm run build`: Functions와 Next.js Production Build 통과
- `npm run test:e2e`: Desktop·Mobile 기본·접근성 4개 통과
- `npm run test:e2e:phase6`: 누적 10개 통과; 검색 5종, 입력 20회 Network 0, IndexedDB, Offline, 최근 학교, 키보드, Axe, Touch Target 포함
- Client Bundle 및 외부 API Key Namespace Scan: 통과
- `npm audit --audit-level=high`: 종료 코드 0, High·Critical 0건

## Security Impact

- Client Firestore Write 권한은 추가하지 않았고 기존 Default DENY를 유지한다.
- 카탈로그 Client는 `list`가 아니라 승인된 ID의 `get`만 사용한다.
- Common Catalog에 PIN, 직원정보, 방문기록, 관심도, 담당자, 후속조치, 긴 메모를 포함하지 않는다.
- 납품 Role은 Sales·Assignment Catalog를 요청하지 않으며 기존 Rules에서도 읽을 수 없다.
- 로그아웃·`sessionVersion` 무효화가 IndexedDB와 최근 학교를 제거한다.
- Catalog Publish는 Admin 서버 경계에서만 실행한다.

## Performance Impact

- 검색 타이핑은 Memory Array와 사전 계산 Key만 사용한다.
- 500개 Fixture의 검색 계산은 테스트 환경에서 입력별 50ms Budget 안에 통과했다.
- 최초 또는 Version 변경 시에만 Meta가 가리키는 분할 Catalog를 다운로드한다.
- 결과는 최대 10개만 렌더링하며 300ms Debounce를 사용하지 않는다.
- Firestore 전체 학교 Listener는 기존 App Shell 호환 표시용 8건으로 남아 있고 검색에는 사용하지 않는다.

## Known Issues

- 실제 Firebase Project에는 Catalog를 발행하지 않았다.
- 오래된 불변 Catalog Version 자동 정리는 아직 없다. 안전한 보존기간과 최소 지원 App Version을 정한 뒤 추가한다.
- Phase 6은 Common Search Catalog만 구현했다. Field 상세, Sales, Assignment Catalog는 해당 업무 Phase에서 별도 권한·수명으로 연결한다.
- 브라우저 저장공간은 영구 저장소가 아니므로 Eviction 시 온라인에서 다시 받아야 한다.
- `npm audit`의 `firebase-tools` 계열 전이 의존성 Moderate 10건은 강제·호환성 변경을 요구해 후속 갱신 대상으로 유지한다.

## 다음 Phase 참고사항

Phase 7은 검색에서 선택한 학교의 Detail과 `schoolFieldProfiles`를 연결한다. Search Catalog는 탐색 Summary로만 유지하고 최신 Detail·Revision의 Source of Truth로 사용하지 않는다.

실제 Firebase Project, Cloud Functions 배포, Hosting, Secret Manager, Catalog Live Publish는 변경하지 않았다.
