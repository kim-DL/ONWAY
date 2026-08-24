# ADR 0012: 서버 필터 기반 임시 CSV 내보내기

- 상태: Accepted
- 날짜: 2026-08-24

## 배경

영업 직원은 월별 학교 배정과 누적 방문 이력을 외부 정리·보고에 사용할 CSV로 내려받아야 한다. Client가 Firestore 전체 문서를 읽어 CSV를 만들면 화면 권한과 별개로 원본 데이터가 기기에 과도하게 노출되고, 팀 범위 권한·현재 Filter·삭제 기록 제외를 우회하기 쉽다. 대용량 결과를 Callable 응답에 바로 싣는 방식은 재시도 때 파일과 Audit를 중복 생성하며, 장기간 남는 다운로드 URL은 직원 변경·기기 공유 뒤에도 데이터 접근 경로가 될 수 있다.

## 결정

- Client는 CSV 행 원본을 조회하거나 조립하지 않는다. `previewCsvExport`와 `exportCsv`가 같은 서버 Dataset Builder를 사용해 현재 인증 직원, 범위, 기간과 모든 Filter를 다시 적용한다.
- 일반 영업 직원은 Assignment Snapshot의 `assigneeIds`에 포함된 `own` 범위만 내보낸다. `team`은 서버의 `employees/{employeeId}.permissions.exportTeam` 또는 Admin 역할이 있을 때만 허용한다. UI의 팀 선택 표시도 서버 응답을 따르지만 최종 권한 판단은 생성 시 다시 수행한다.
- 월별 배정과 방문 이력은 별도 CSV 계약과 한글 Header를 사용한다. 방문 이력은 Cycle 또는 전체 기간을 선택할 수 있으며 Soft Delete 기록은 제외한다.
- CSV는 UTF-8 BOM과 CRLF를 사용한다. 쉼표·따옴표·개행을 RFC 4180 방식으로 Escape하고 `=`, `+`, `-`, `@`, Tab, CR로 시작하는 값에는 Apostrophe를 붙여 Spreadsheet Formula Injection을 방어한다.
- 생성 결과는 `exports/{employeeId}/{jobId}/{fileName}`에 저장하고 `exportJobs/{jobId}`가 소유자, Filter, 행 수, 상태, Storage 경로, 만료 시각을 기록한다. Storage Client 직접 접근은 계속 거부하고 `downloadCsvExport`가 세션·소유권·상태·만료를 확인한 뒤 파일을 중계한다.
- UUID `requestId`, 인증 UID와 전체 Payload SHA-256 지문을 `requestLocks`에 저장한다. 같은 요청 재시도는 같은 Job 결과를 재생하고 같은 ID의 다른 Payload는 거부한다. Job, Lock, `CSV_EXPORTED` Audit는 단일 Firestore Transaction에서 한 번만 생성한다.
- 기본 보관 시간은 24시간이며 `CSV_EXPORT_TTL_HOURS`로 1~168시간 범위에서 바꿀 수 있다. 다운로드는 만료 즉시 거부하고 `expireCsvExports` Scheduled Function이 매시간 만료 Object를 삭제한 뒤 Job을 `expired`로 전환한다.
- 원본 조회는 5,000행, 완성 CSV는 8MB로 제한한다. 초과 시 기간이나 Filter를 좁히도록 안내한다.

## 결과

- 미리보기 행 수와 실제 CSV가 한 서버 Filter Pipeline을 공유해 화면 조건과 파일 내용의 Drift를 줄인다.
- 권한 없는 Client가 팀 Scope를 Payload로 위조하거나 다른 직원의 Job ID를 알아도 생성·다운로드할 수 없다.
- 응답 유실·더블 탭·동시 재시도에서도 논리 Job, Audit, Storage 경로가 하나로 유지된다.
- 한글 Excel 호환성과 Formula Injection 방어를 동시에 제공한다.
- 만료 파일은 URL 유출 여부와 관계없이 서버에서 열리지 않고 정기적으로 Storage에서도 제거된다.
- 대규모 비동기 Export Queue, 관리자 Export 대시보드와 실시간 진행률은 5,000행을 넘는 운영 요구가 확인될 때 별도 Queue/Worker Phase로 확장한다.
