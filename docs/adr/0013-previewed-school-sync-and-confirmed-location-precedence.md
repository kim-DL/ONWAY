# ADR 0013: Preview 기반 학교 동기화와 관리자 확정 위치 우선

- 상태: Accepted
- 날짜: 2026-08-24

## 배경

NEIS 학교정보는 검색의 기준 데이터지만 외부 API의 부분 응답, 페이지 누락, 일시 장애를 실제 폐교로 오인하면 학교와 연결된 현장정보·사진·영업 이력을 잃을 수 있다. Kakao 위치 검색도 같은 이름의 타 지역 학교나 복수 후보를 반환할 수 있으며, 기존에 관리자가 확인한 위치를 자동 결과가 덮으면 길안내가 잘못된 학교로 연결될 수 있다.

## 결정

- `previewNeisSchoolSync`는 전체 Pagination을 통과한 NEIS 응답을 정규화한 뒤 현재 학교와 비교하고 `neisSyncRuns/{runId}/changes/{changeId}`에만 Staging한다. Preview에서는 `schools`를 수정하지 않는다.
- 동기화 상태는 `FETCHING → NORMALIZING → DIFF_READY | SUSPICIOUS_RESULT → APPLYING → COMPLETED | FAILED`로 관리한다. 기존 대상 학교가 3곳 이상일 때 기본 50% 이상이 누락되면 `SUSPICIOUS_RESULT`로 분류하고 확인 플래그와 무관하게 Apply를 차단한다. 이 임계값은 운영 학교 수를 확인한 뒤 서버 설정으로 조정한다.
- `applyNeisSchoolSync`는 위험 변경에 명시적 확인을 요구하고 학교별 Transaction으로 적용한다. 교명 변경은 같은 `schoolId`를 유지하며 이전 이름을 Alias로 남긴다. 주소 변경은 위치 좌표를 교체하지 않고 `possibleRelocation`만 표시한다. 누락은 `inactiveCandidate`로 전환하며 Hard Delete하지 않는다.
- NEIS Apply는 `schoolFieldProfiles`, 사진 Subcollection, `salesProfiles`, `salesVisits`, `salesCycles/assignments`를 읽거나 쓰는 Mutation 경로를 갖지 않는다. 학교 기본 변경과 Audit만 같은 Transaction에 기록한다.
- 검색에 영향을 주는 Apply가 끝나면 버전형 Common Search Catalog를 새로 만들고 마지막에 `catalogMeta/current`를 전환한다. 기존 Catalog는 덮어쓰지 않는다.
- Kakao REST Key와 NEIS Key는 Functions Secret으로만 사용한다. 실제 호출은 각각 `ALLOW_LIVE_KAKAO_MATCH=true`, `ALLOW_LIVE_NEIS_SYNC=true`가 추가로 있어야 하며 Client Bundle에 Key를 넣지 않는다.
- Kakao는 주소 좌표와 학교명 Keyword 후보를 결합해 이름 40, 도로명 주소 40, 행정구 10, 500m 이내 거리 10으로 평가한다. 단일 대전 후보가 90점 이상일 때만 `autoMatched`로 반영한다. 복수 후보, 타 지역, 낮은 신뢰도는 `needsReview`, API 장애와 무후보는 `failed`로 격리한다.
- 후보는 서버 전용 `kakaoMatchReviews/{schoolId}`에 저장한다. 관리자 확정 후보와 직접 입력 위치는 `confirmed`가 되며, 이후 자동 결과보다 우선한다. 이미 확정된 위치와 새 후보가 다르면 기존 위치를 보존하고 Review로 보낸다.
- 학교 상세 길안내는 `confirmed | autoMatched` 좌표만 Kakao 목적지 링크로 사용한다. 신뢰 좌표가 없으면 공식 학교명 검색으로 연결하며, 급식실·하역 좌표를 학교 공식 목적지로 사용하지 않는다.
- Sync 실행·Apply·Kakao 확정 Callable은 활성 `authz`, Admin 역할, `adminApproved`, Google Provider와 활성 Employee를 모두 확인한다. 실제 Admin Desktop UI는 Phase 15에서 이 서버 계약을 사용한다.

## 결과

- 외부 API가 실패하거나 일부만 반환돼도 기존 학교와 현장·사진·영업 데이터가 유지된다.
- 동일 학교의 교명 변경은 검색 Alias와 과거 연결을 보존하고, 검색 카탈로그는 Apply 이후 새 버전으로 일관되게 전환된다.
- 관리자 확정 위치가 자동 재매칭보다 우선하며 타 지역·다중 후보는 사람이 확인하기 전 길안내 좌표로 승격되지 않는다.
- 학교별 Transaction 때문에 전체 Sync의 즉시 Rollback은 제공하지 않는다. 실패 시 적용된 학교와 변경 전·후 값은 Audit와 Change 문서로 추적하고, 같은 Run의 미적용 변경은 재시도할 수 있다.
- `kakaoMatchReviews`의 직접 Client Read는 Default DENY이며 Phase 15 목록·상세는 권한 검증 Callable로 제공한다.
