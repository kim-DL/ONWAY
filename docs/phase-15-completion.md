# Phase 15 완료 기록

- 완료일: 2026-08-24
- 기준 문서: 구현 명세서, 화면·UX 상세 명세서, 인증·권한·보안 설계서, 외부 API·데이터 동기화 설계서, 테스트·인수 기준서, ADR 0015
- 검증 환경: `demo-onnuriway`, Auth/Firestore/Functions/Storage Emulator, Chromium, Node.js 22.23.2, Next.js 16.3.2

## Phase

Phase 15 — Google-approved Desktop Administration Console

## 구현

### 관리자 인증·권한 경계

- Google Popup 로그인과 Email Verified·Provider 확인
- 서버 전용 Email → Employee 허용목록 기반 `activateAdminSession`
- 기존 관리자 Employee를 Google UID로 재결합하고 이전 UID Authz·Refresh Token 폐기
- `adminApproved`, 역할, 권한, Session/Permission Version Custom Claim 발급
- 모든 Admin·NEIS/Kakao·Admin CSV Callable에서 공용 Verified Admin Guard 재검증
- 승인 관리자 Offline Session 복원 금지와 일반 직원 PIN의 Admin Scope 발급 거부 유지

### 직원·보안 운영

- 직원 Master/Detail, 이름·역할·팀 CSV 권한·활성 상태 변경
- 암호학적 6자리 PIN 예약, 10분 만료, 원문 한 번 표시, HMAC Lookup Key와 scrypt Hash 저장
- PIN 재발급, 전체 세션 종료와 Session Version 증가
- 일반 관리 화면의 Admin 역할 부여·해제 금지와 마지막 활성 관리자 보호
- 변경 사유, 변경 필드, 대상과 Actor를 남기는 불변 Audit Timeline

### 학교·월별 영업 운영

- 학교명·주소 검색, 행정구·학교급·Kakao 위치 상태와 Revision 목록
- 새 월 Cycle 생성, 전월 배정 복사, 활성 Cycle 전환
- 학교·A/B/C 구역·주 담당자 배정 추가와 Expected Revision 기반 변경
- 직원·학교·Cycle·구역·배정·동기화·설정·감사 정보를 서버 DTO로 집계

### NEIS·Kakao·CSV

- NEIS Preview/Diff 뒤 낮은 위험 기본 선택, 위험 항목 확인, 선택한 Change ID만 Apply
- 비정상 대량 누락 강제 차단과 Apply 이후 Search Catalog Version 갱신
- Kakao 검토 대기·후보 없음 학교, 후보 점수, 직접 좌표/도로명 입력, 관리자 확정
- 관리자 CSV의 `admin` Scope와 전체 담당자 Filter, 서버 Preview·생성·만료 다운로드 재사용

### PC 우선 관리자 UX

- 역할별 App Shell에서 관리자 Bundle을 Dynamic Import하고 승인 관리자를 전용 Console로 분기
- 운영 개요, 학교, 직원, 월별 구역, 동기화, CSV, 감사, 설정의 8개 업무 영역
- 1440px Desktop Sidebar, 900px Compact Sidebar, 560px 이하 4×2 Bottom Navigation
- 숨겨진 Compact Navigation에도 명시적 Accessible Name 유지
- 관리자 전용 Button Color/Radius Token, Keyboard Focus, Reduced Motion과 Responsive Table/Panel
- 내부 Status·Revision을 한국어 운영 문구와 접근성 라벨로 표시

## 검증 결과

- App·Functions TypeScript와 ESLint 경고 0개: 통과
- 전체 Vitest 28개 파일 통과·1개 스킵, 92개 테스트 통과·3개 스킵
- Firestore/Storage Rules 23개: 통과
- Phase 15 Admin Emulator Gate: Google 승인, 직원 생성, 최초 PIN 로그인, 기존 PIN 거부, PIN 재발급 로그인, 세션 폐기, Workspace/Audit 집계 통과
- Phase 13 Sync Emulator 회귀: 선택 Apply와 기존 전체 Apply 호환성 통과
- Next.js 16 Webpack Production Build와 Phase 14 PWA Artifact Gate: 통과
- Chromium Production Mode: Google Popup → 관리자 활성화 → 8개 메뉴 순회, 관리자 CSV Scope, Console Error/Warning 0건 확인
- 1440×1000, 900×900, 390×844 Viewport에서 시각·접근성 점검
- `npm audit --audit-level=high`: high/critical 0건으로 통과. Firebase CLI/Admin 전이 의존성의 moderate 10건은 강제 주요 버전 하향만 제시되어 적용하지 않음

## 운영 전 필수 사항

- 실제 Firebase Project의 Google Provider, Authorized Domain과 App Check를 등록한다.
- `secureSettings/adminAccess`에 최소 2명의 운영 관리자 Email·Employee ID를 서버 권한으로 등록하고 정기 검토한다.
- Production Secret과 `ALLOW_LIVE_NEIS_SYNC`, `ALLOW_LIVE_KAKAO_MATCH`는 각 외부 연동 승인 뒤 별도로 설정한다.
- Staging에서 실데이터 기반 NEIS 누락 임계값과 Kakao Confidence를 재검증한다.
- 배포 전 IAM 최소 권한, Audit 보존·Alert, 관리자 퇴사·계정 회수 Runbook을 승인한다.

실제 외부 서비스, Firebase Project, 운영 데이터는 변경하지 않았다.
