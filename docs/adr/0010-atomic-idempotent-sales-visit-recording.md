# ADR 0010: 원자적·멱등 방문 기록

- 상태: Accepted
- 날짜: 2026-08-24

## 배경

한 번의 영업 방문은 단일 메모가 아니다. 원본 방문 이력, 학교별 최신 영업 상태, 월 배정 진행 상태, 직원·팀 통계와 감사 로그가 같은 사실을 반영해야 한다. 일부 문서만 저장되면 홈 화면과 학교 상세, 후속 일정과 통계가 서로 달라진다. 현장 네트워크에서 저장 버튼을 다시 누르거나 응답을 받기 전에 연결이 끊겨도 같은 방문이 중복 생성되어서는 안 된다. 주 담당자, 실제 방문자와 기록 입력자 역시 서로 다를 수 있으므로 하나의 직원 필드로 합칠 수 없다.

## 결정

- Client의 Firestore 직접 쓰기는 계속 거부하고 `recordSalesVisit` Callable만 방문 기록을 만든다.
- Callable은 Production App Check, Firebase Auth, 활성 `authz`, Claim 일치와 `sales | admin` 역할을 매 요청 확인한다. 일반 영업 직원은 해당 Assignment의 `assigneeIds`에 포함된 학교만 기록할 수 있고 Admin은 운영 경계에서 예외로 허용한다.
- 입력은 Strict Zod 계약으로 검증한다. 활성 Cycle, 존재 학교·배정, 활성 영업 방문자, 활성 제품·활동 태그와 Expected Assignment Revision을 확인한다.
- 날짜는 `Asia/Seoul` 업무일 기준으로 해석한다. 방문일은 해당 Cycle 안의 미래가 아닌 날짜여야 하고 최신 방문보다 과거로 되돌릴 수 없다. 후속일은 방문일보다 빠를 수 없다.
- `interestScore`는 `0 | 20 | 40 | 60 | 80 | 100`만 허용한다. 미선택은 유효하지 않으며 사용자가 명시적으로 고른 0점은 `interestEvaluated=true`인 ‘관심도 미확인’으로 저장한다.
- 샘플 ‘전달’에는 중복 없는 제품과 1 이상의 수량을 요구하고 ‘미전달’에는 제품 행을 허용하지 않는다. 홍보지·샘플 상태는 기본 선택을 두지 않는다.
- `visitedBy`는 실제 방문자, `recordedBy`는 인증된 요청자, Assignment의 `primaryAssigneeId`는 주 담당자로 각각 보존한다.
- 방문 원본은 `salesVisits/{requestId}`에 불변 이벤트로 기록한다. 같은 Request ID·Actor·Payload는 기존 결과를 재생하고 다른 Payload로 ID를 재사용하면 거부한다.
- 방문 이벤트, `salesProfiles/{schoolId}`, 해당 월 Assignment, 직원·팀 Stats, Audit Log와 Request Lock을 하나의 Firestore Transaction으로 기록한다.
- Assignment Revision이 다르면 현재 Revision과 함께 충돌로 응답한다. 성공 시 새 Assignment/Sales Revision과 월 상태를 반환해 Client가 즉시 낙관적으로 표시하고 상세·영업 Workspace Cache를 무효화한다.
- 학교 상세은 영업 모드에서만 활성 Cycle의 Assignment·Profile·제품·태그·직원 정보를 추가로 읽는다. 납품 모드는 영업 데이터 요청을 만들지 않는다.

## 결과

- 재시도와 더블 탭이 한 건의 방문만 만들며 응답 유실 뒤에도 같은 결과를 복구할 수 있다.
- 방문, 최신 학교 상태, 월 진행 상태와 통계가 부분 성공 없이 같은 시점으로 전환된다.
- 대리 입력이나 동행 방문에서도 주 담당자·실제 방문자·기록 입력자의 책임 관계가 사라지지 않는다.
- 0점의 업무 의미가 ‘관심 없음’으로 왜곡되지 않고 미평가 상태와 명시적 미확인을 구분한다.
- 학교 상세은 저장 직후 핵심 결과를 먼저 표시하고 Background Refresh로 서버 상태를 재확인한다.
- 현재 팀 Stats는 MVP Cycle당 최대 50개 Assignment 경계 안에서 Transaction 중 재계산한다. 더 큰 운영 규모에서는 증분 집계 또는 비동기 재계산을 별도 설계한다.
- 전체 방문 이력 Timeline, 필터와 편집 정책은 Phase 11 범위다. Phase 10은 최신 요약과 안전한 원본 생성까지만 제공한다.
- `requestLocks`의 운영 TTL/Cleanup은 실제 Project 배포 Phase에서 구성해야 한다.
