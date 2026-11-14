# 운영 모드 PIN 및 Google 계정 개편

2026-11-14, 로컬 구현과 검증 기록. 기준은 main `3f7bfdf`이며 작업 브랜치는 `codex/operations-pin-access-renewal`이다. 운영 데이터, 실제 직원 PIN, Google 계정 권한은 변경하지 않았다. 커밋과 운영 배포 전 단계이다.

## 기존 로그인 유지가 우선이다

기존 PIN 인증에는 PIN 버전과 로그인 세션 버전이 분리되어 있다. 개인 PIN 변경은 PIN 버전과 보호된 인증 자료만 바꾼다. 직원 문서, authz, Firebase claims와 토큰 취소 기준은 유지한다. 앱 업데이트만으로 기존 직원에게 PIN 변경이나 재로그인을 요구하지 않는다.

현재 Google 운영자 로그인도 특정 소유자 이메일을 코드에 고정한 방식은 아니다. 서버의 이메일 허용목록과 검증된 Google 로그인을 사용한다. 이번에 등록·해제 화면과 서버 API를 추가했다. 실제 운영 허용목록은 조사하거나 수정하지 않았다.

서버의 권한 부여와 세션 취소를 구분하는 설계는 [Firebase custom claims](https://firebase.google.com/docs/auth/admin/custom-claims)와 [Firebase 세션 관리](https://firebase.google.com/docs/auth/admin/manage-sessions)의 계약을 따른다. PIN은 Firebase 비밀번호가 아닌 급식길의 별도 인증 자료이므로 Firebase 비밀번호 변경 API를 호출하지 않는다.

## 두 설계를 비교했다

| 항목 | 기존 구조 확장, 채택 | 별도 등록·초대 구조, 보류 |
| --- | --- | --- |
| 직원 PIN | 기존 PIN 로그인과 인덱스 유지 | 별도의 등록 토큰과 제한된 등록 세션 |
| Google 운영자 | 기존 허용목록에 등록·해제 API 추가 | 초대와 조직 멤버 컬렉션 신설 |
| 기존 기기 | 데이터 이전과 세션 교체 없음 | 기존 직원의 호환 상태와 이전 절차 필요 |
| 복구 | 운영자가 임시 PIN 발급, 직원이 설정에서 변경 | 별도 토큰 만료와 복구 절차 필요 |
| 판단 | 현재 회사 규모와 업무 흐름에 적합 | 여러 조직·대규모 초대가 필요해질 때 재검토 |

`poteto-mode`로 PIN과 Google 권한 경로를 독립 조사하고 구현 뒤 별도 보안·UI 검토를 받았다. `unslop-ui`는 기존 브랜드 색과 유리 버튼을 유지하면서 작은 글자와 기술 용어를 정리하는 데 적용했다.

## 직원과 운영자의 사용 흐름

- 직원은 각 업무 모드의 공통 **설정 → PIN 변경**에서 현재 PIN, 새 PIN, 새 PIN 확인을 입력한다. 현재 로그인은 그대로 유지하고 다음 로그인부터 새 번호를 사용한다.
- PIN은 선행 0을 포함한 숫자 6자리이다. 기존 정책대로 같은 숫자 6개와 단순 연속 번호는 허용하지 않는다. 다른 직원 또는 유효한 발급 예약과 겹치면 다른 번호를 요청한다. 소유자의 정보는 알려주지 않는다.
- 새 직원에게는 운영자가 처음 로그인할 임시 PIN을 전달한다. 직원은 로그인한 뒤 원하는 번호로 바꾼다. 임시 PIN은 자동 만료되거나 한 번 사용 후 폐기되는 번호가 아니다. 등록 전 예약만 10분간 유지된다.
- PIN을 잊은 직원에게는 **임시 PIN 발급**을 사용한다. 기본값은 기존 로그인 유지이다. 기기 분실이나 노출이 의심될 때만 운영자가 **기존 로그인도 종료하기**를 선택한다.
- Google 운영자는 **직원 관리 → Google 운영자**에서 이름과 Google 이메일을 등록한다. 해당 계정의 첫 검증된 Google 로그인에서 UID를 고정 연결한다. 첫 로그인 대기자는 일반 직원 편집 대신 Google 관리로 안내한다.
- 운영자 해제는 대상 계정의 접근과 세션만 종료한다. 본인 계정과 마지막 접속 가능 운영자의 해제를 차단한다. 해제한 동일 이메일의 재활성화는 이번 화면에서 제공하지 않는다.

## 서버에서 지키는 경계

새 `changeEmployeePin`은 App Check, 현재 직원 인증, 현재 PIN 확인, 직원별·출처별 시도 제한을 적용한다. 기존 PIN 삭제와 새 PIN 점유는 하나의 트랜잭션이다. 다른 직원의 동시 변경과 임시 PIN 예약도 같은 점유 문서를 확인한다. 현재 자격 정보가 중간에 바뀌면 저장을 거절한다.

PIN 원문은 문서, 감사 기록, 재시도 영수증에 저장하지 않는다. 현재 scrypt와 비밀키를 사용하는 HMAC 구조를 유지한다. 개인 변경의 같은 요청 재시도는 한 번의 변경 결과를 반환한다. 운영자 재발급의 응답을 받지 못했을 때는 같은 요청으로 다시 발급하지 않는다. 이미 처리됐다는 안내 후 창을 닫고 새 발급을 진행한다.

Google 등록·해제는 검증된 Google 계정과 최신 허용목록·직원·authz를 확인한다. revision과 request ID를 검증하며 이메일만 같다는 이유로 이미 연결된 UID를 다른 계정에 옮기지 않는다. 클라이언트에서 권한 문서를 직접 쓰는 경로는 없다.

독립 검토에서 발견한 직원 편집·권한 해제 경합도 보완했다. 직원 편집은 트랜잭션 안에서 작업자와 대상 직원·authz를 다시 읽는다. 사전 조회 이후 변경됐으면 저장을 거절하므로 늦은 이름 수정이 해제를 되돌리지 못한다. 운영자의 납품·영업·조회 역할 편집은 유지한다.

## 화면 변경

- 직원 계정과 Google 운영자를 밑줄 탭으로 구분했다. 방향키, Home, End 이동을 제공한다.
- 운영 화면의 12~13px 보조 글자를 14px로 높이고 제목의 굵기와 자간을 완화했다. 직원 등록의 기술 용어를 실제 작업 안내로 바꿨다.
- PIN 입력은 메모리에서만 보관하고 닫거나 성공하면 지운다. 통신 결과가 불확실하면 같은 요청으로 재시도한다. 저장 중 중복 제출과 창 닫기를 막는다.
- Google 목록은 운영 화면 새로고침과 연동한다. 갱신 실패 시 이전 목록과 실패 안내를 함께 보여주고 권한 변경은 막는다.
- PIN 변경 폼은 열 때 불러오며 운영자 화면은 기존 운영 모드의 지연 로딩 경계 안에 둔다.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| 새 PIN·Google 서버 단위 검사 | 고유 41개 통과 |
| 기존 로그인·암호화·운영 계약·저장 수명 검사 | 고유 63개 최종 통과 |
| 운영 화면·새 계정 관리 브라우저 검사 | 고유 26개 최종 통과 |
| Auth·Firestore 에뮬레이터 | 기존 phase15 흐름, PIN 13개, Google 17개, 추가 경합 2개 통과 |
| 모바일·데스크톱 레이아웃 | 320·390·900·1280px, 확대 글자, 키보드, 접근성 확인 |
| 정적 검증 | 타입 검사, lint, 운영용 빌드 통과 |
| 최종 산출물 | 성능·PWA·Hosting 파일 검사 통과, 정적 파일145개 |

통과한 전체 검사를 반복하지 않았다. 구현 변경, 실패, 독립 검토 지적과 직접 관련된 부분만 다시 확인했다.

첫 브라우저 검사 4개는 보안 주소가 아닌 테스트 페이지에서 `crypto.randomUUID`를 사용할 수 없어 실패했다. loopback 주소에서 테스트하도록 수정했다. 기존 운영 화면 테스트 준비는 새 저장소 이름이 옛 mock 정규식과 겹쳐 실패했고 이름을 구분했다. 기존 단위 5개는 바뀐 PIN 버튼 문구를 반영한 뒤 통과했다. 타입 검사에서 테스트 정리 API와 배열 요소의 선택적 접근을 보완했고, lint에서 렌더 중 ref 조회와 effect의 동기 상태 변경을 수정했다.

첫 운영 빌드의 운영 CSS는 67,109B로 기존 65,536B 한도를 넘었다. 반복되는 모듈 범위 이름을 `workspace`에서 `root`로 줄여 스타일 의미를 유지했다. 최종 운영 CSS는 **64,759B**, gzip **9,710B**로 기존 한도를 충족한다.

새 PIN 폼의 별도 CSS가 처음에는 기존 학교·공통 영역으로 합산되어 두 번째 용량 검사가 실패했다. 성능 검사에 PIN 폼의 독립 영역을 추가했다. 측정값은 CSS **888B / gzip 444B**, JS **gzip 1,947B**이다. 이 새 기능만 CSS 1,280B / gzip 640B, JS gzip 2,304B로 제한하고 최초 로딩 제외·다른 모드 미포함·PWA 사전 캐시를 함께 검사한다. 기존 앱과 기능의 한도는 늘리지 않았다. 최초 JS는 gzip **144,046B**이다.

Aside에서는 가상 데이터의 직원·Google 탭과 등록 입력, PIN 변경 진입을 확인했다. Aside 캡처는 CDP 시간 초과로 완료하지 못해 Playwright 캡처를 별도로 시각 검토했다. 운영 사이트는 로그아웃 상태였으며 실제 계정으로 시험하지 않았다. 실제 Google OAuth 등록, 실사용 기기와 설치 PWA 검증은 남아 있다.

검사 실행 진입점은 `npm run test:operations:emulator`이다. 이 명령은 demo 프로젝트와 로컬 에뮬레이터만 사용한다. 새 경합만 다시 확인할 때는 `node scripts/firebase-emulators.mjs operations-access --race-only`를 사용한다. 에뮬레이터의 별도 demo 프로젝트 경고와 외부 메타데이터 조회 경고가 있었으나 검사 요청은 로컬에서 완료됐다.

## 운영 반영 전 범위

초기 구현 요청에서는 운영 배포를 수행하지 않았다. 이후 사용자가 커밋·main 병합·인증 서버와 Hosting 운영 배포를 명시적으로 승인하여 아래 기록대로 반영했다. 실제 계정 등록은 운영자가 새 화면에서 직접 수행하는 별도 업무이다.

향후 반영에는 Hosting만으로 충분하지 않다. 새 함수 `changeEmployeePin`, `listGoogleAdminAccess`, `registerGoogleAdminAccess`, `disableGoogleAdminAccess`와 `admin/callables.ts`의 기존 운영 함수 10개를 함께 검토해야 한다. 기존 직원·PIN·authz의 일괄 변경이나 비밀키 변경은 필요하지 않다. Firestore·Storage 규칙도 이번에 변경하지 않았다.

Hosting은 프로젝트 지침대로 `--project onnuriway --only hosting:onnuriway` 범위를 지킨다. 인증 서버 변경과 Hosting은 승인 후 관련 함수부터 배포하고 앱을 반영해야 한다. 운영자 화면을 되돌리더라도 기존 UID 고정과 해제 보호가 느슨해지는 서버 롤백은 별도 검토한다.

## 운영 배포 결과 — 2026-11-14

- 구현 커밋: `3926686`. main 병합: `d93614e1249ecba2c50771d259d05a9e3672161d`. 원격 main까지 반영했다.
- 사용자가 이미 통과한 검사 반복을 금지했으므로 단위·브라우저·에뮬레이터·전체 CI와 Hosting 빌드를 반복하지 않았다. 커밋 메시지의 `[skip ci]`로 중복 CI를 막았다. 앞 절의 검증 결과와 앱 소스 변경 후 생성된 최종 산출물을 재사용했다. 배포 직전 소스/산출물 시간 순서, 운영 플래그, Git 상태와 배포 대상을 확인하고 145개 산출물의 SHA-256을 고정했다.
- 인증 서버는 `--project onnuriway --only functions:<각 함수명> --non-interactive`로 새 함수4개와 기존 운영 함수10개만 배포했다. 새 함수는 `changeEmployeePin`, `listGoogleAdminAccess`, `registerGoogleAdminAccess`, `disableGoogleAdminAccess`이다. 기존 함수는 `activateAdminSession`, `createEmployee`, `getAdminWorkspace`, `listAdminAuditLogs`, `reserveEmployeePin`, `revokeEmployeeSessions`, `rotateEmployeePin`, `updateEmployee`, `updateActivityTags`, `updatePublicAppSettings`이다.
- 배포 predeploy에서 필요한 Functions TypeScript 컴파일이 통과했다. 14개 함수 모두 `asia-northeast3`, Node.js22, `ACTIVE`를 확인했다. SDK 버전 업데이트 안내는 있었으나 배포 오류는 없었다. 의존성은 변경하지 않았다.
- `employeeLogin`, `employeeLogout`은 배포 대상에서 제외했고 배포 전후 함수 메타데이터 전체가 동일했다. 직원/authz 일괄 변경, 토큰 취소, 비밀키 변경, PIN 데이터 이전 작업을 실행하지 않았다. 서버 배포가 기존 직원 세션을 종료시키는 별도 작업은 없다.
- 새 함수4개에 인증·App Check 없는 빈 요청을 보내 모두 HTTP401 / `UNAUTHENTICATED`로 거절됨을 확인했다. 실제 PIN·직원 계정·운영자 허용목록을 시험 목적으로 변경하지 않았다.
- 인증 서버 성공 후 `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project onnuriway --only hosting:onnuriway --non-interactive`로 Hosting을 배포했다.
- Hosting 버전: **`a496fe2b76589e2c`**, 공개 시각 **2026-11-14 21:13:59 KST**. 이전 버전은 `645108293059dda2`이다.
- `https://onnuriway.com`, `https://onnuriway.web.app` 각각 공개 Hosting 검사 통과, 각145개 파일이 고정한 로컬 산출물과 SHA-256 일치했다. 공개 검사는 배포 후 확인이며 기존 회귀 검사 재실행이 아니다.
- 기록과 산출물 목록은 ignored `output/ops-renewal-20261114/`의 `functions-deploy.log`, `functions-before.json`, `functions-after.json`, `function-boundary.json`, `hosting-deploy.log`, `hosting-before.json`, `hosting-after.json`, `release-artifacts.json`, `public-domain.json`, `public-firebase.json`, `public-artifact-hashes.json`에 보관했다. 배포 계정·서버 설정이 포함될 수 있는 원본 메타데이터는 커밋하지 않는다.
- 실제 직원 기기의 로그인 유지, 인증된 Google 최초 연결, 실제 PIN 변경, 설치 PWA 업데이트는 직접 확인하지 않았다. 기존 로그인 유지 계약은 앞선 에뮬레이터 검사와 이번 배포 범위로 확인했으며 실기기 결과와 구분한다.
