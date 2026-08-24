# ADR 0011: 커서 기반 팀 방문 이력과 학교별 협업 메모리

- 상태: Accepted
- 날짜: 2026-08-24

## 배경

학교 방문 준비에는 최신 영업 상태만으로 부족하다. 이전 방문의 실제 방문자, 전달한 자료와 샘플, 관심도, 활동 태그, 대화 요약과 당시 후속 일정을 팀원이 이어서 볼 수 있어야 한다. 그러나 학교 진입 때 전체 이력을 한 번에 읽으면 오래 거래한 학교일수록 Firestore Read와 렌더링 비용이 계속 증가한다. 월별 활동과 무관하게 유지되어야 하는 연락 방식은 방문 활동 태그나 월 Assignment에 넣으면 다음 Cycle에서 사라지거나 의미가 섞인다. 팀 조회 권한이 방문 원본 수정 권한으로 확대되어서도 안 된다.

## 결정

- `salesVisits`는 Phase 10에서 생성된 불변 이벤트를 그대로 사용하며 Phase 11 UI는 수정·삭제 동작을 제공하지 않는다.
- 영업 직원은 유효한 Session이면 팀 방문 이력을 읽을 수 있다. 일반 영업 직원의 `salesProfiles` 수정은 현재 활성 Cycle Assignment의 `assigneeIds`에 포함된 학교로 제한하고, 납품 역할에는 영업 데이터를 로드하지 않는다.
- 초기 학교 상세은 `schoolId ==`, `deleted == false`, `visitedAt DESC`, `documentId DESC`로 최근 3건만 표시한다. `pageSize + 1`건으로 다음 페이지 존재 여부만 확인하고 사용자가 요청할 때 5건씩 `startAfter(visitedAt, visitId)`로 읽는다.
- 동시각 방문에서도 안정적인 순서를 위해 문서 ID를 두 번째 정렬·Cursor 필드로 사용한다. 페이지 병합은 `visitId`로 중복을 제거하고 같은 정렬 규칙을 다시 적용한다.
- 방문 이력은 장기 Sensitive Cache에 저장하지 않는다. 화면 수명 동안만 Memory에 유지하고 학교 전환 시 Cursor와 펼침 상태를 폐기한다.
- Timeline에는 당시 Assignment Snapshot의 주 담당자, `visitedBy`, `recordedBy`, 홍보지·샘플, Heart 관심도, 활동 태그, 결과 요약과 당시 후속 일정을 표시한다. 현재 Directory에서 이름을 찾지 못한 과거 직원·제품·태그도 원본 ID 또는 보존 라벨로 안전하게 표시한다.
- 학교에 지속되는 커뮤니케이션 태그와 다음 행동은 `salesProfiles/{schoolId}`에 둔다. 커뮤니케이션 태그는 `communicationTags`, 방문 활동 태그는 `activityTags` 기준 문서를 사용해 계약과 UI를 분리한다.
- `updateSalesProfile` Callable은 Production App Check, Firebase Auth, 활성 `authz`, `sales | admin` 역할, 현재 활성 Cycle, Assignment 관계, 활성 태그, Expected Assignment/Sales Revision과 Request ID Payload 지문을 검증한다.
- Profile, `SALES_PROFILE_UPDATED` Audit와 Request Lock은 하나의 Transaction으로 저장한다. 통신 응답을 잃은 재시도는 같은 결과를 재생하고, 같은 ID의 다른 Payload는 거부한다.
- 프로필 태그 변경은 관심도, 최근 방문, 후속 일정, 다음 행동과 방문 원본을 변경하지 않는다.

## 결과

- 학교 상세 진입 비용은 방문 수가 늘어도 최근 3건 중심으로 제한되고 전체 이력은 사용자의 명시적 요청만큼만 증가한다.
- 영업 A가 남긴 방문 맥락을 영업 B가 이어서 읽되 B는 A 담당 학교의 협업 정보를 변경할 수 없다.
- 월이 바뀌어 Assignment가 새로 만들어져도 학교 단위 커뮤니케이션 참고와 다음 행동은 같은 Profile에서 유지된다.
- 실제 방문자, 기록자와 당시 담당 관계가 현재 배정 변경 때문에 덮어써지지 않는다.
- 이력 Memory가 학교 전환과 함께 폐기되어 사용자·학교 간 Sensitive Data 혼선을 줄인다.
- 대규모 분석, 날짜·직원·태그 복합 필터와 서버 Export는 후속 Phase에서 별도 Query/Index 경계로 설계한다.
