# ADR 0005: NEIS Initial Import 안전 경계

- 상태: Accepted
- 날짜: 2026-08-23

## 배경

Phase 5는 NEIS 학교기본정보를 급식길의 `schools` 계약으로 최초 적재한다. 이후 교명·주소 변경, 누락 학교, 관리자 Preview/Apply는 Phase 13의 동기화 책임이다. Initial Import가 기존 학교에 덮어쓰기 형태로 재사용되면 현장정보와 후속 업무 데이터의 기준이 흔들릴 수 있다.

## 결정

- Initial Import는 `schools` 컬렉션이 비어 있고 `secureSettings/neisInitialImport` Marker가 없을 때만 허용한다.
- 외부 응답의 전체 Paging, 행 수 일치, 필수값, 중복 Code, 대전 교육청, 대상 학교급, 대전 주소를 모두 검증한 다음 쓰기를 시작한다.
- 대전 초·중·고등학교와 Sync Run, One-time Marker를 하나의 Firestore Atomic Batch로 생성한다.
- 같은 학교 Code는 항상 `SCH-NEIS-{schoolCode}`로 매핑한다.
- 특수학교와 타 교육청 데이터는 Phase 5 기본 대상에서 제외한다.
- Existing School을 덮어쓰는 기능, Diff, Missing 처리, Alias 변경, Preview/Apply는 Initial Import CLI에 넣지 않는다.
- Fixture Import는 `demo-*` Firestore Emulator에서만 허용한다.
- Live Import는 서버 전용 NEIS Key와 명시적 실행 승인 Flag가 모두 없으면 Fail Closed한다.

## 결과

- Validation, HTTP, Paging 또는 Firestore 오류가 발생하기 전 기존 Database에는 쓰기가 없다.
- 최초 Atomic Batch가 실패하면 학교·Sync Run·Marker가 함께 생성되지 않는다.
- 두 번째 실행은 기존 학교를 변경하지 않는다.
- Phase 13은 이 CLI를 확장해 쓰지 않고 별도의 Preview/Diff/Apply 경계를 구현한다.
