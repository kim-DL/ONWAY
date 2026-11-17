# 납품사진 촬영 비활성 복구

## 조사와 근거

현장 제보: Android 설치 PWA에서 간헐적으로 촬영 아이콘이 동작하지 않음. 카카오맵 길안내 후였을 가능성은 있으나 정확한 시각·안내 문구·기기 이벤트는 확인되지 않았다. 특정 직원의 기기 장애 원인을 확정한 기록은 아니다.

- 실제 카메라 버튼은 사진 coordinator의 준비·권한·원본 읽기·전송함 한도에 따라 비활성화된다.
- `PhotoOutboxWorker`는 모든 `pagehide`에서 polling과 Web Lock을 해제하고 coordinator의 `authorized`를 영구 false로 바꿨다. 반면 `pageshow.persisted=true`에서만 재시작용 reload를 수행했다. 동일 문서로 non-persisted 복귀하면 화면은 남아도 `canBegin`이 계속 false였다.
- 실제 coordinator와 IndexedDB를 사용하는 모바일 Chromium 합성 테스트에서 `pagehide(false) → pageshow(false) → focus` 후 `canBegin=false`를 재현했다. 수정 전 단위·브라우저 테스트 모두 실패, 수정 후 촬영부터 서버 응답을 모사한 완료까지 통과했다. 실제 Android/KakaoMap이 이 이벤트 순서를 발생시켰다는 증거는 아직 없다.
- 카카오 길안내는 새 창 예약이 실패하면 현재 창의 `location.assign`을 사용하는 경로가 있다. 길안내 자체는 수정하지 않았다.
- 저장소 최초 activate 실패도 같은 세션의 coordinator 캐시에 남아 화면 내 재진입으로 회복되지 않았다. 명시적 화면 다시 열기로 복구하는 검사를 추가했다.

공식 lifecycle 참고: https://developer.chrome.com/docs/web-platform/page-lifecycle-api . 문서 종료와 캐시 복귀, 모바일 이벤트의 불확실성을 구분한다.

## 읽기 전용 운영 로그

기존 Firebase CLI 인증으로 Cloud Logging을 조회했다. 프로젝트 `onnuriway`, Cloud Run service `createdeliveryphoto`, 시작 `2026-11-10T00:00:00Z`, 조회 시점까지 WARNING 이상 0건(후속 페이지 없음). 최근 일반 로그 200건 표본에는 HTTP 200 73건·204 27건, DEBUG 74건·INFO 26건이 있었다. 표본 기간은 11월 13~17일 UTC이며 전체 요청 수가 아니다. 개인정보·계정·사진·요청 본문은 출력하거나 저장하지 않았다.

초기 Firebase MCP는 internal error, gcloud는 활성 계정 없음으로 실패했고 CLI 기존 인증을 재사용한 읽기 조회가 성공했다. 서버 호출 전 버튼 차단은 서버 로그에 남지 않으므로, 경고 0건으로 현장 문제가 없었다고 판단하지 않는다.

## 수정

1. 캐시 보관되는 `pagehide.persisted=true`에만 기존 중단/복원 reload를 적용한다. 일반 이탈에서는 살아 있는 문서의 업로드 권한을 취소하지 않는다. 실제 문서 종료 시 브라우저가 timer와 Web Lock을 정리한다. 숨김·복귀·온라인 재확인, 로그아웃/권한 취소는 유지한다.
2. 저장소 오류 안내에 **화면 다시 열기** 버튼을 제공한다. 촬영 준비 자체가 실패한 화면에서 사용자가 명시적으로 새로 열어 초기화한다. 앱 데이터 삭제·로그아웃을 요구하지 않으며 기존 전송함을 보존한다.

Callable·App Check·사진 보관·request ID·서버 확인 후 완료 계약과 전송함 한도는 유지한다. 운영 데이터 변경 및 서버 배포는 없다.

## 검증

- 사진 관련 Vitest 최종20파일·121개 통과. 최종 선택된 변경은 복귀 lifecycle 단위 회귀와 명시적 reload 복구 브라우저 검사다.
- 모바일 Chromium 관련 브라우저 30개 통과: 외부 앱 복귀 이벤트, 초기화 재시도, 로그아웃 후 차단, 원본/준비 파일 보존, 응답 유실 후 동일 request ID 재시도, 저장 실패, 거래처 사진 진입/복귀.
- 변경 파일 lint 및 Functions 타입 검사 통과. 앱 타입 검사는 최종 운영 빌드에 포함한다.
- 초기 신규 fixture의 roleScopes 타입 추론 오류를 명시적 AuthenticatedSession 타입으로 수정했다. 최초 빌드 성능 검사에서 납품사진 JS가 34B, 준비 runtime이 최대46B 초과했다. 추가 초기화 상태 기계 대신 기존 세션/전송함을 유지하는 명시적 화면 다시 열기로 단순화했다. 성능 한도는 유지한다. 중간에 빌드 완료 전 확인한 Hosting 검사는 worker 불일치를 반환했으며 최종 산출물로 재검사한다.
- npm audit 조회 high/critical 0, moderate 38, low 1. 기존 Next 16.4.3의 moderate cache 관련 권고가 빌드에 표시됨. 의존성은 이번 기능 수정에서 변경하지 않는다.

최종 운영 빌드(앱 타입 포함)·성능/PWA/Hosting 검사 통과. 납품사진 workspace gzip10479B, runtime5244B로 기존 한도를 유지했다. 초기 로딩 gzip144050B, Hosting145개 파일·precache129개다. Next 보안 안내로 중단된 빌드는 동일 명령 재시도 후 성공했으며, 첫 실행 성공으로 집계하지 않는다.

정확한 후보 CI와 운영 배포 결과는 아래에 기록한다. 실제 휴대폰·설치 PWA·카카오맵 왕복·운영 사진 저장은 별도 현장 확인이 필요하다.

## 전체 CI에서 발견한 기존 테스트 불일치

첫 후보 `4f6ed39`, PR #10, Quality Gate `44123645864`에서 기존 테스트 기대값 불일치를 발견했다. `59e4c2f`와 해당 앱 코드·테스트가 동일함을 확인했고 로컬에서도 단위4건을 재현했다.

- 관리자 CSS scope는 `.workspace`가 아니라 현재 `.root`를 검사한다. 기존 avatar 크기·공통 스타일 분리 검사는 유지한다.
- 제조사 필드의 persisted 값은 `props.current`의 kind/productId/name을 검사한다. 제조사 연결 해제·레거시 보존의 저장 payload 검사는 유지한다.
- 재고 변동 표시는 옛 문자 ↻ 대신 장식용 SVG/path를 검사한다. 서버 파생 상태·표시 문구·버튼 수 검사는 유지한다.
- 재고 상세 버튼은 현재 승인된 중립 배경과 각 글자 색을 검사한다. 터치 영역·아이콘 수·배치 검사는 유지한다.
- 사진 확대 방향키는 준비된 사진 영역에 포커스를 준 뒤 입력한다. 기존 테스트는 다음 버튼에 포커스를 둔 채 사진 영역 전용 키 입력을 기대했다. URL 폐기·추가 수신·페이지 위치 검사는 유지한다.
- 영업 이력은 현재 `방문 기록` 제목, 거래처 홈은 현재 마지막 확인 freshness를 검사한다. 관리자 fixture는 실제 최초 Google 연결 계약의 `pending-google-` UID로 준비한다. 테스트용 `phase32-ui-before-login` 값을 이미 연결된 계정으로 간주한403을 우회하지 않고 잘못된 fixture를 수정했다.

위 수정은 테스트만 변경한다. 관련 단위61개 통과. 전체 로컬 단위 재검사에서는2143개 통과·23개 조건부 skip, 변경 없는 runtime identity 테스트1개가5초 timeout으로 실패했다. 동일 파일의4개를 별도 재실행해 통과했다. timeout이나 기존 실패를 첫 실행 성공으로 기록하지 않는다. 최종 후보의 CI 결과는 별도로 확인한다.

첫 CI의 전체 browser·production-build·typecheck·lint·audit·functions-build·search-performance·deferred-tools는 통과했다. unit4건, inventory-photos1건, delivery-photos1건, phase17의4건(사진 키보드1건 중복)이 위 불일치로 실패했다. 해당 실패들을 숨기거나 검사를 제외하지 않고 테스트 보완 후보에서 재확인한다.
