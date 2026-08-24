# ADR 0007: Cache-first School Detail과 서버 전용 현장정보 수정

- 상태: Accepted
- 날짜: 2026-08-23

## 배경

납품 직원은 학교 검색 직후 검수시간, 대차, 급식실 위치와 진입·하역 동선을 빠르게 확인해야 한다. 네트워크가 불안정한 현장에서는 이전에 본 학교의 정보가 즉시 열려야 하지만, Search Catalog의 Summary를 최신 상세정보의 Source of Truth로 사용할 수는 없다. 동시에 납품·영업이 공유하는 `schoolFieldProfiles`는 여러 직원이 수정할 수 있으므로 직접 Firestore Write, 마지막 저장 우선 덮어쓰기, 중복 요청을 허용해서는 안 된다.

## 결정

- 학교 상세는 `Memory → IndexedDB → Firestore` 순서로 읽고 Cache가 있으면 즉시 표시한 뒤 최신화한다.
- IndexedDB Key는 `employeeId`, 현재 역할, `sessionVersion`, `schoolId`를 포함한다.
- Cache에는 학교 기본정보, 공용 현장정보와 사진 Metadata만 저장한다. Sales Profile, Visit, Assignment는 포함하지 않는다.
- 로그아웃과 세션 무효화 시 학교 상세 Memory·IndexedDB Cache를 검색 Cache와 함께 제거한다.
- Browser Offline 상태가 확인되면 Firestore 재시도를 기다리지 않고 Cache를 표시하며 명시적인 Offline 상태를 제공한다. `online` 복구 Event에서 최신화를 다시 시도한다.
- 학교 사진은 Rules를 넓히는 Collection List 대신 계약으로 고정된 `01`, `02`, `03` 슬롯을 각각 `get`한다.
- 현장정보 수정은 `updateSchoolFieldProfile` Callable만 사용하고 Client Firestore Write는 계속 거부한다.
- Callable은 App Check, Firebase Auth, 활성 `authz`, Token·세션·권한 Version과 `delivery | sales | admin` 역할을 확인한다. Viewer는 읽기만 가능하다.
- Client는 수정할 섹션 전체, 예상 Revision, UUID Request ID와 App Version을 전송한다. 서버는 Strict Zod 계약으로 추가 필드·크기·Enum·시간 순서를 검증한다.
- 서버 Transaction은 학교 존재, 현재 Revision, Request Lock을 읽은 후 Profile, Request Lock과 Audit Log를 원자적으로 기록한다.
- 동일 Request ID·동일 Payload는 같은 Revision을 반환하고, 동일 Request ID의 다른 Payload는 SHA-256 요청 지문 불일치로 거부한다.
- 예상 Revision이 현재 Revision과 다르면 `aborted` 충돌을 반환한다. Client는 작성 내용을 유지한 채 최신 Detail을 다시 읽고 충돌 안내를 표시한다.
- 완성도와 `reviewRequired`는 신뢰할 수 없는 Client 입력을 받지 않고 서버가 현장 항목으로 다시 계산한다.
- 사진 Upload·Processing·Version 교체는 Phase 8 책임으로 유지한다. Phase 7은 사진 Metadata와 슬롯 상태만 표시한다.

## 결과

- 이전에 본 학교는 Offline에서도 핵심 현장정보를 확인할 수 있다.
- Search Catalog는 탐색 Summary로 남고 학교·현장정보의 최신 Revision은 개별 문서가 담당한다.
- 동시 수정이 조용히 덮어써지지 않고 사용자에게 복구 가능한 충돌로 표시된다.
- 재시도나 네트워크 중복으로 동일 Mutation과 Audit가 반복 생성되지 않는다.
- 사진 목록을 위해 Rules의 고정 슬롯 제약을 완화하지 않는다.
- Request Lock 정리 주기와 사진 Binary Cache는 후속 운영·사진 Phase에서 별도로 정의한다.
