# ADR 0009: 서버 관리형 월별 영업 배정

- 상태: Accepted
- 날짜: 2026-08-24

## 배경

영업 업무의 기준 단위는 학교의 영구 담당자가 아니라 월별 `salesCycle`과 그 하위 `assignments`다. 전월 배정을 새 달에 재사용할 수 있어야 하지만 방문 상태, 홍보지·샘플 전달 상태와 최근 방문 연결은 새 달의 시작 상태로 초기화되어야 한다. 일반 영업 직원에게는 자기 담당 학교가 첫 화면이어야 하며 팀 전체는 협업 맥락으로만 명시적으로 열어야 한다. 월 생성과 담당 변경은 여러 문서를 함께 바꾸므로 Client 직접 쓰기나 부분 성공을 허용할 수 없다.

## 결정

- 월은 `salesCycles/{YYYY-MM}`로 만들고 학교별 배정은 `salesCycles/{cycleId}/assignments/{schoolId}`에 둔다.
- Client의 Firestore 쓰기는 계속 거부하고 `createSalesCycle`, `createSalesAssignments`, `changeSalesAssignment` Callable만 사용한다.
- 세 Callable은 App Check, Firebase Auth, 활성 `authz`, Claim 일치와 `admin` 역할을 확인한다. 일반 영업 직원은 호출할 수 없다.
- 모든 입력은 Strict Zod 계약으로 검증한다. 배정은 학교 중복을 허용하지 않고 주 담당자를 담당자 목록에 포함하며, 존재하는 학교와 활성 구역·영업 직원 참조만 받는다.
- 월 생성은 선택적으로 이전 Cycle의 배정을 복사한다. 복사한 배정은 담당 관계만 계승하고 `monthlyStatus=before`, 방문 연결 없음, 홍보지·샘플 상태 `unknown`, Revision 1로 초기화한다.
- 활성화 요청은 `appSettings/public.currentSalesCycleId`를 같은 Transaction에서 전환하고 기존 활성 월을 `closed`로 닫는다. 닫힌 월은 배정 생성·변경을 거부한다.
- 담당 변경은 Expected Revision을 요구하고 Revision이 다르면 현재 Revision과 함께 충돌로 응답한다. 변경 사유는 2~200자로 필수화한다.
- Request ID와 Actor를 포함한 Payload 지문을 `requestLocks`에 기록한다. 같은 요청은 같은 결과를 재생하고 다른 Payload로 ID를 재사용하면 거부한다.
- 월 생성, 배정 생성, 담당 변경은 결과 문서와 Audit Log를 하나의 Firestore Transaction으로 기록한다. 전월 복사 또는 한 번의 배정 생성은 최대 50개로 제한한다.
- 영업 화면은 `appSettings/public`, 최근 18개 Cycle, 활성 구역, 직원 Directory를 병렬로 읽은 뒤 선택 월의 배정과 실제 배정된 학교만 가져온다.
- 첫 범위는 로그인 직원이 `assigneeIds`에 포함된 ‘내 구역’이다. ‘전체 보기’는 명시적 전환 뒤에만 표시하고 직원 성과 순위는 만들지 않는다.
- 월 Workspace Cache는 직원·역할·`sessionVersion`·Cycle로 격리해 Memory와 IndexedDB에 최대 18개월 보관한다. 로그아웃과 세션 무효화 시 전체 영업 Cache를 제거한다.
- 지난 월은 읽기 전용으로 표현한다. 방문 기록과 월 상태 변경은 Phase 10에서 같은 Assignment Revision 경계를 확장한다.

## 결과

- A/B/C 영업 직원은 같은 월 데이터를 사용하면서도 진입 시 자기 배정만 서로 다르게 본다.
- 전월 복사로 반복 입력을 줄이면서 새 달의 방문 진행 상태가 이전 달에서 잘못 이어지는 것을 막는다.
- 활성 월 전환, 기존 월 종료, 배정 복사와 Audit가 원자적으로 처리되어 부분 생성 상태가 남지 않는다.
- 담당 변경의 멱등성과 Revision 충돌이 재시도·동시 관리자 작업의 덮어쓰기를 막는다.
- 팀 전체 보기는 협업을 돕되 개인 성과 경쟁 화면으로 변하지 않는다.
- 현재 관리 기능은 서버 Callable과 계약까지만 제공한다. 월 생성·대량 배정·담당 변경 관리자 UI와 Google 관리자 로그인은 후속 관리자 Phase 범위다.
- `requestLocks`의 운영 TTL/Cleanup은 실제 Project 배포 Phase에서 구성해야 한다.
