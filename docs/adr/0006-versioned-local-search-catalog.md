# ADR 0006: Versioned Local Search Catalog

- 상태: Accepted
- 날짜: 2026-08-23

## 배경

학교 검색은 키 입력마다 Firestore나 외부 API를 호출하지 않고 100ms 이내에 결과를 표시해야 한다. 동시에 NEIS 동기화나 관리자 변경으로 학교명이 바뀌어도 사용 중인 기기가 부분 발행된 Catalog를 읽어서는 안 된다. Common 학교 정보와 영업 정보를 같은 Persistent Cache에 섞으면 납품 역할의 권한 경계도 약해진다.

## 결정

- `schools`와 현장정보·사진 Metadata를 Source로 Common Search Catalog를 생성한다.
- Catalog 문서는 `common-v{version}-{district}-{chunk}` ID를 사용하며 발행 후 수정하지 않는다.
- 행정구 단위로 나누고 각 문서는 내부 목표 300KB 이하로 유지한다. 초과 시 같은 행정구를 고정 Chunk로 더 분할한다.
- 모든 새 문서를 생성하고 `catalogMeta/current`의 Version·문서 ID·학교 수를 같은 Firestore Transaction에서 전환한다.
- Client는 Collection List Query 없이 Meta 1건과 Meta가 가리키는 문서만 `get`한다.
- Common Catalog만 모든 유효 업무 역할에 제공한다. Sales·Assignment Catalog는 납품 Client가 요청하지 않으며 기존 Rules가 읽기도 거부한다.
- IndexedDB Key는 `employeeId`, 현재 역할, `sessionVersion`, Catalog Version을 포함한다.
- 앱은 IndexedDB Catalog로 Memory Index를 먼저 만들고, 서버 Meta 확인은 뒤에서 수행한다. 버전이 같으면 Catalog 문서를 다시 받지 않는다.
- 로그아웃 또는 세션 무효화 시 IndexedDB 검색 Catalog와 최근 학교를 지운다.
- 검색 입력은 Memory Index만 사용하며 Firestore·NEIS·Kakao 요청을 만들지 않는다.
- Ranking은 공식명 정확 일치, 축약명, Alias, Prefix, 초성, 포함, 제한적 편집거리 순서를 고정한다.

## 결과

- 발행 실패 전후로 기존 활성 Meta와 Catalog는 유지된다.
- 이전 Version 문서는 즉시 삭제하지 않아 이미 실행 중인 Client가 계속 읽을 수 있다.
- Offline에서도 한 번 저장된 Catalog로 학교명·축약·초성·Alias 검색이 가능하다.
- 긴 메모, 방문 이력, 홍보 정보는 Common Catalog와 IndexedDB에 들어가지 않는다.
- 오래된 Version 정리 정책은 사용 중 Client의 최소 지원 Version을 고려해 후속 운영 단계에서 추가한다.
