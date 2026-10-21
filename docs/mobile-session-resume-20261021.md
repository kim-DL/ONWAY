# 모바일 홈 복귀 시 로그인·업무 화면 유지

기준일: 2026-10-21. 브랜치: `codex/mobile-resume-20261021`. 로컬 구현이며 운영 미배포다.

## 피드백과 확인 범위

직원들이 홈 화면이나 카메라를 사용한 뒤 급식길로 돌아오면 로그인 확인과 정보 로딩을 반복한다는 피드백을 받았다. 한 번 PIN으로 로그인하면 시간 경과나 홈 이동으로 로그아웃하지 않아야 한다.

코드에서 확인한 원인은 다음과 같다. 실제 직원 휴대폰의 OS 종료 이력이나 네트워크 로그는 아직 확보하지 않았으므로 특정 기기의 원인으로 단정하지 않는다.

- Firebase는 이미 `browserLocalPersistence`를 사용하고 있으며 유휴 시간에 따른 로그아웃 타이머는 없다.
- 새 문서는 연결 확인 → 토큰 확인 → 두 번째 연결 확인 → 서버 authz 확인을 기다린 뒤 업무 화면을 표시했다. 마지막 서버 검증 세션은 오프라인 판정 뒤에만 복구했다.
- 토큰·권한 조회 실패는 연결 확인 URL만 응답하면 세션을 무효화할 수 있었다. 이 URL의 성공이 Firebase 서비스의 정상 응답을 보장하지는 않는다.
- 거래처 목록 구독과 화면 훅은 `offline` 이벤트에서 메모리 목록과 선택·편집 상태를 폐기했다. 잠깐의 네트워크 전환에도 다시 목록을 받아야 했다.
- 업무 모드는 저장했지만 탭은 재시작할 때 기본 탭으로 초기화했다.

## 변경한 동작

1. Firebase SDK가 저장된 UID를 복원하면 그 UID에 연결된 최근 서버 검증 직원 세션으로 업무 화면을 먼저 연다. 연결·토큰·authz 확인은 계속 수행한다. 관리자 캐시와 Google 관리자 활성화 중의 캐시는 이 복구에 사용하지 않는다.
2. authz 앞의 중복 연결 확인을 제거했다. 동일 UID의 토큰 갱신은 기존 화면을 유지한다.
3. 일시적 연결·서비스 실패는 로그아웃 대신 재검증을 예약한다. 5초 후 또는 온라인·포커스·화면 복귀 시 한 번 재시도하고, 숨겨진 화면에서는 재시도 요청을 시작하지 않는다. 정리되거나 로그아웃한 세대의 늦은 콜백은 무시한다.
4. 화면 복구용 검증 캐시의 기존 24시간 보관 한도는 유지한다. 이것은 로그인 만료 시간이 아니다. 캐시가 없거나 오래된 상태에서 오프라인이면 Firebase 인증은 보존하고, 연결 복구 후 PIN 없이 토큰·authz를 다시 확인한다. 미래 시각으로 변조되거나 UID가 다른 레코드는 복구하지 않는다.
5. 거래처의 같은 로그인 세션에 있는 목록·검색·선택·입력은 잠깐 오프라인이 되어도 메모리에서 유지한다. 기존 응답의 세대는 무효화하고, 복구 후 갱신한다. 오프라인 저장은 사진 업로드와 저장 요청 전에 차단한다. 서버 권한 거부나 로그아웃이면 기존처럼 민감한 상태를 폐기한다.
6. 마지막 업무 모드·탭만 UID·세션 버전·권한 버전에 묶어 저장한다. 역할이나 기능 플래그에 맞지 않는 위치는 사용하지 않는다. 계정·권한 버전 변경 시 AppShell을 별도로 마운트하여 다른 세션의 화면 상태를 공유하지 않는다.

거래처·재고 원문, 사진, 편집 초안을 새로 디스크에 저장하지 않는다. 기존 사진 outbox와 서버 확인 후 완료 판정, 요청 ID, revision, 감사 이력, Callable·App Check·Rules 경계는 변경하지 않았다. 서버 authz의 삭제·비활성화·버전 불일치와 명시적인 인증 거부는 계속 세션을 종료한다.

Firebase의 [기기 로그인 유지](https://firebase.google.com/docs/auth/web/auth-state-persistence)와 [토큰·세션 수명](https://firebase.google.com/docs/auth/admin/manage-sessions)은 별개다. 토큰 갱신이나 화면 복구 캐시의 만료를 유휴 로그아웃으로 취급하지 않는다.

## 검증

- 전체 unit: 1,771 PASS / 기존 조건부 15 SKIP. `output/playwright/mobile-resume-20261021/unit-final.log`. 이후 오류 처리 공통화와 중복 offline listener 정리에 관련 63개를 확인했고, 최종 customer 전체 280개가 통과했다. 최종 빌드의 TypeScript 검사도 PASS다.
- 앱·Functions `typecheck`, 전체 `lint` PASS.
- 느린 연결 확인 전 직원 캐시 복원, 관리자 캐시 제외, 오래된 캐시로 오프라인 대기 후 PIN 없이 복구, 토큰·authz 일시 실패, 실제 권한 회수, 로그아웃 뒤 늦은 재시도, UID·권한 버전 분리와 private 상태 정리를 검사했다.
- 거래처 편집·사진 단위 테스트 41 PASS. 오프라인에서 사진 업로드·저장 요청이 없고 초안과 요청 ID가 유지됨을 포함한다.
- Chromium 인증·거래처 browser 14 PASS. `emulator-browser-final.log`의 Chromium 결과다. 사진 포함 등록·교체·제거·감사, 오프라인 목록·선택 유지, 권한 회수, 명시적 로그아웃과 private 저장소 정리를 포함한다. 아래 함수 프로세스 준비를 끝낸 demo 환경 결과이며 cold start나 현장 지연 수치가 아니다.
- 정적 demo build의 홈 복귀/재시작: Chromium 2 PASS (`emulator-static-resume-final.log`), Windows WebKit 2 PASS (`emulator-static-webkit-final.log`). 서비스 워커를 활성화한 상태에서 연결 확인 실패를 문서 fetch로 구성했고, 오래된 캐시는 navigator 연결 상태를 구성했다. 실제 Firebase Emulator 인증 저장·토큰·authz를 사용했다. 실제 휴대폰의 OS 프로세스 종료 시험은 아니다.
- 최종 운영 형식 build와 PWA·성능·Hosting gate PASS. 사진·재고 ON / Emulator OFF이며 운영 배포는 하지 않았다. initial JS gzip 140,104B, customer 36,834B / 기존 36,864B 상한, inventory 25,861B다. 기존 상한과 검사 스크립트는 변경하지 않았다. Hosting 산출물 113개 / precache 100개 / initial assets 9개다. `production-build-complete.log`, `performance-build-complete.log`, `pwa-build-complete.log`, `hosting-build-complete.log`를 참고한다. 검증 로그는 모두 `output/playwright/mobile-resume-20261021/` 안에 있다.

### 실패와 재실행 이력

- 첫 타입 검사에서 optional prop의 `undefined` 타입을, lint에서 타이머 선언과 effect 의존성을 보완했다.
- 기존 shell 스크롤 테스트의 훅 모의 구현에 추가된 `useCallback`과 상태 위치를 반영했다. 편집 테스트 VM에는 `navigator.onLine`을 명시하되 기존 mutable context 참조를 유지했다. 기대 동작은 완화하지 않았다.
- 첫 로컬 Functions 발견이 기본 10초 제한에 걸려 검증 프로세스를 종료했다. 로컬 검증 실행에만 `METADATA_SERVER_DETECTION=none`과 `FUNCTIONS_DISCOVERY_TIMEOUT=60`을 설정해 정상 시작했다. 앱·테스트의 제한 시간과 운영 설정은 바꾸지 않았다.
- Chromium 첫 실행 14개 중 12개 PASS. 새 네트워크 차단 테스트는 만료된 차단 요청을 정리하면서 `Route is already handled`가 발생했다. 기존 사진 포함 거래처 저장은 5초 내 상세 표시 검사에서 실패했고 화면은 저장 중이었으며 saveCustomer 실행이 늦게 기록되었다. 해당 경로만 별도로 실행해도 저장 대기에서 실패했고, saveCustomer만 미리 준비한 실행에서는 listCustomers의 최초 로딩에서 5초를 넘겼다.
- 함수 실행 프로세스 준비를 별도 검사했다. 인증 없는 빈 요청은 listCustomers/saveCustomer/uploadCustomerPhoto/getCustomerPhoto 각각 HTTP 401로 거부됐고, 최초 준비에 각각 2,811/2,750/2,780/2,837ms가 걸렸다. 이후 기존 5초 기준의 browser 14개가 모두 통과했다. 운영 cold start가 원인이라고 단정하거나 업무 데이터 쓰기로 서버를 예열하지 않는다. 준비는 로컬 demo 환경에서만 했으며 인증된 쓰기가 없다.
- 개발 WebKit은 복원 후 AppShell의 개발용 모듈 로딩 단계에서 5초를 넘긴 실행이 있다. 정적 build에서는 화면이 정상 복구됐지만 서비스 워커가 page.route를 우회해 차단 요청 횟수 검사가 실패했다. 문서의 연결 확인 fetch에만 503을 구성해 이 차이를 제거했다.
- WebKit은 새로고침 중 이전 문서의 local Firestore Listen 스트림 취소를 native access-control pageerror로 올리기도 했다. **WebKit + localhost:8080의 정확한 Listen 경로 + access-control 종료 문구**만 별도 첨부로 기록했다. 새 문서는 연결 확인 실패로 authz Listen을 열지 않으며, 그 밖의 JavaScript pageerror 0 검사는 유지했다. 최종 정적 WebKit 2개는 통과했다. 임의 오류 무시나 skip·검사 시간 확대는 하지 않았다.
- 용량 검사는 거래처 JS gzip 36,945→36,896→36,884→36,867→36,869B 후보에서 기존 36KiB(36,864B)를 초과했다. 마지막 두 값은 gzip 사전 변화로 단순 코드 축약이 크기 감소를 보장하지 않음을 보여준다. 오프라인 문구와 코드 기반 오류 생성 함수를 공통화하고 중복 offline listener를 제거한 최종값은 **36,834B PASS**다. 관련 회귀와 빌드를 확인했으며 기존 용량 상한은 변경하지 않았다.

## 한계와 후속 현장 확인

이 변경은 일반적인 홈 복귀와 일시적인 네트워크 전환에서 기존 세션·업무 화면을 유지하기 위한 것이다. OS가 메모리 부족 등으로 웹앱 프로세스를 완전히 종료하면 HTML·JavaScript를 다시 시작하는 짧은 과정과 메모리에만 있던 업무 데이터의 재조회는 필요하다. 이 경우에도 Firebase 인증 저장소가 남아 있고 서버가 세션을 철회하지 않았다면 PIN을 다시 요구하지 않는다. 사용자가 브라우저 저장소를 삭제하거나 OS가 사이트 데이터를 삭제하는 경우까지 인증 보존을 보장할 수는 없다.

자동 브라우저와 에뮬레이터 결과는 실제 iPhone·설치 PWA 현장 인수 결과가 아니다. 운영 반영 후 한 번 PIN 로그인 → 촬영·홈 이동·앱 복귀 반복, 장시간 백그라운드 후 복귀, 비행기 모드 전환과 입력 유지, 직접 로그아웃 후 PIN 화면과 비공개 상태 정리를 실제 직원 기기에서 확인해야 한다. 카메라는 기존대로 사용자의 버튼 조작으로만 열린다.

커밋·push·전체 CI·운영 배포는 이번 로컬 검증과 별도 상태로 보고한다. 기존 `AGENTS.md` 사용자 변경은 수정하지 않았다.

## 릴리스 준비 중 확인한 의존성 검사 실패

- 첫 제품 커밋 `ccb5249b73340479b59d7b795550aff4b3a74bfb`의 [Quality Gate 39578039882](https://github.com/kim-DL/ONWAY/actions/runs/39578039882)는 dependency audit에서 중단됐다. 로컬에서도 9 moderate / 1 high가 재현됐고, high 항목은 Vitest가 사용하는 `vite 8.2.2`였다. 모바일 기능 테스트까지 도달한 실패가 아니다.
- [GitHub 보안 공지 GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm)의 수정 버전 `vite 8.2.4`로 제한해 잠금 파일의 version/resolved/integrity 3개 필드만 갱신했다. 앱/Functions 의존성, package.json, CI 보안 기준과 용량 상한은 바꾸지 않는다.
- npm 10.9.8의 직접 갱신은 현재 폴더와 깨끗한 별도 manifest 폴더에서 모두 `edgesOut` 계산 오류로 실패했다. Vite만 둔 별도 폴더에서 npm이 정상 생성한 lock 항목을 사용했으며, 다른 모든 package metadata가 기존과 같다는 assertion을 통과했다. 변경한 전체 lock의 깨끗한 `npm ci --ignore-scripts --engine-strict=true`와 기존 high/critical audit 기준이 통과했다. moderate 9개는 남아 있다.
- 의존성 재설치 완료 전에 실행한 unit 명령 1회는 `vitest` 실행 파일을 찾지 못해 시작하지 못했다. 설치 완료 후의 실제 테스트 결과와 구분한다. 상세 증거는 ignored `output/mobile-resume-release-20261021/`에 보관한다.
- 재설치 완료 후 전체 unit 1,771 PASS / 기존 조건부 15 SKIP, 검색·캐시 성능 gate PASS다. 최초 제품 커밋의 CI를 그대로 재실행하지 않고 이 수정까지 포함한 새 최종 커밋에서 전체 CI를 실행한다.
