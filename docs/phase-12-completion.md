# Phase 12 완료 기록

- 완료일: 2026-08-24
- 기준 문서: 구현 명세서 v1.1, 화면·UX 상세 명세서, 데이터베이스 상세 설계서, 인증·권한·보안 설계서 v1.2, 테스트·인수 기준서 v1.1, ADR 0012
- 검증 환경: `demo-onnuriway`, Firestore Standard Edition Emulator, Auth/Functions/Storage Emulator, Chromium, Node.js 22.23.2

## Phase

Phase 12 — Filtered CSV Export

## 구현

### Export Center & Preview

- 영업 활동 메뉴를 월별 배정/방문 이력 전용 Export Center로 완성
- 기간, 내 담당/팀, 구역, 담당자, 행정구, 학교급, 방문 상태, 관심도, 후속 필요, 커뮤니케이션/활동 태그와 방문일 범위 Filter
- 팀 Export 권한이 없으면 팀 Scope와 담당자 Filter 자체를 숨김
- Filter 변경 후 320ms Debounce 서버 미리보기와 예상 행 수·적용 조건 표시
- 생성 전/후를 한 장의 Export Paper로 연결하고 파일명, 행 수, 보관 기한, 파일 열기 상태 제공
- Offline 생성·다운로드 차단, 재연결 시 현재 조건 Preview 재계산
- Desktop 2열·Mobile 1열 반응형, 44px 이상 주요 Touch Target, Axe WCAG AA 통과

### Server-filtered CSV

- `getCsvExportOptions`, `previewCsvExport`, `exportCsv`, `downloadCsvExport` Callable 구현
- Production App Check, Firebase Auth, 활성 `authz`, Claim 일치, `sales | admin` 역할과 Employee 상태 재검증
- 일반 직원 `own`, `permissions.exportTeam` 보유자 `team`, Admin `admin` Scope의 서버 강제
- Preview와 생성이 동일 Dataset Builder를 사용하며 Client는 CSV 생성을 위해 Firestore 원본 전체를 받지 않음
- 월별 배정 18열, 방문 이력 19열의 별도 한글 Header와 학교·담당자·구역·태그·제품 Server Join
- 방문 이력 Soft Delete 제외, Assignment Snapshot 기준 소유 범위 보존
- 원본 5,000행·CSV 8MB 상한과 범위 축소 안내

### Encoding, Idempotency & Audit

- UTF-8 BOM `EF BB BF`, CRLF, 쉼표·따옴표·개행 Escape와 한글 보존
- `= + - @ Tab CR` 시작 셀 Apostrophe 처리로 CSV/Spreadsheet Formula Injection 방어
- UUID Request ID와 Actor/Payload SHA-256 지문, 결정적 Job·Storage 경로
- 같은 요청 재생, 다른 Payload 충돌 거부, 동시 재시도에도 Job/Audit 한 번만 생성
- `exportJobs`와 `CSV_EXPORTED` Audit에 요청자, Scope, Filter, 행 수, 완료·만료 Context 기록

### Expiring Server-mediated Download

- `exports/{employeeId}/{jobId}/{fileName}` 서버 전용 Storage 경로
- Storage Client SDK 직접 접근 Default DENY 유지
- 다운로드 Callable의 Job 소유자/Admin, 완료 상태, 만료 시각 재검증
- 기본 24시간 보관, `CSV_EXPORT_TTL_HOURS=1..168` 설정 지원
- 매시간 Scheduled Cleanup이 만료 Object를 삭제하고 Job을 `expired`, `storagePath: null`로 전환

## Security Impact

- Client는 Preview·생성·다운로드에서 권한, 요청자 ID, 팀 허용 여부, 행 수를 결정하지 않는다.
- 다른 직원의 Export Job 직접 읽기와 Storage 직접 읽기는 기존 Rules로 계속 거부된다.
- 팀 권한 없는 직원의 Payload 위조, 다른 직원 다운로드, Request ID Payload 충돌을 서비스·브라우저 Gate에서 거부했다.
- CSV Formula Injection 위험을 파일 생성 경계에서 방어하고 Audit는 Client가 아닌 서버 Transaction만 생성한다.

## Performance Impact

- 화면 초기 로드는 Cycle·구역·직원 Directory·태그 정의만 받고 Assignment/Visit 원본은 받지 않는다.
- Preview는 320ms Debounce하고 Filter 변경 중의 오래된 응답을 화면에 반영하지 않는다.
- 이름 Join은 서버 `Map` Lookup, 학교·Profile은 최대 100개씩 `getAll` Batch로 처리한다.
- 동기 Export를 5,000행/8MB로 제한해 Callable Memory·응답 Base64와 모바일 Browser 부담을 제한한다.
- 만료 Cleanup은 한 실행 최대 100개 Job을 처리한다.

## 검증 결과

- TypeScript App·Functions, ESLint: 통과, 경고 0개
- React Best Practices 점검: Client 원본 전체 Fetch 없음, Filter 변경 시 오래된 Preview 무효화, Debounce Cleanup, 안정 Request ID 재사용, Object URL 해제 확인
- 전체 Vitest: Test File 22개 통과·1개 스킵, Test 74개 통과·3개 스킵
- Phase 12 단위 계약: 10개 통과
- Firestore·Storage Rules: 23개 통과
- Firestore·Storage Emulator Gate: 내 담당 2행, 팀 5행, Filter 1행, BOM·한글, 멱등 재생, Payload 충돌, 팀 권한 거부, 타인 다운로드 거부, Job/Audit/Object 1개, 만료 Object 삭제 통과
- Phase 12 집중 Chromium E2E: 실 Filter Preview, 권한 UI, 생성, 실제 Download, BOM·한글·제외 학교, Job/Audit, 팀 권한 동적 표시, Axe 2개 통과
- Phase 0~12 누적 Chromium E2E: 28개 통과
- Functions TypeScript Production Build 통과
- Next.js 16 Production Build: 공식 Webpack 경로로 TypeScript, 정적 페이지 4개, Build Trace까지 통과

## Known Issues

- 실제 Firebase Project에 Function·Scheduled Function·Rules·Index·Hosting을 배포하지 않았다.
- 5,000행 또는 8MB를 넘는 운영 Export는 비동기 Queue/Worker와 관리자 진행률 화면이 필요하다.
- `requestLocks`의 장기 TTL은 실제 Project 배포 Phase에서 Firestore TTL Policy로 구성해야 한다.
- Next.js 기본 Turbopack Production Build는 현재 Codex Windows 작업 Job에서 PostCSS Pooled Worker 생성이 `os error 5`로 차단되어 공식 `--webpack` Production Build를 사용한다. 개발 Turbopack과 E2E는 정상 동작한다.

실제 Firebase Project, Cloud Functions 배포, Scheduler, Hosting, Secret Manager, 영업 운영 데이터는 변경하지 않았다.
