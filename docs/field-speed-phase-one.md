# 현장 체감 속도 개선 1차

작성일: 2026-09-30. 대상 브랜치: `codex/field-speed-phase-one`. 변경 전 비교 기준: `f52442e`.

이 문서는 실사 저장 후 다음 재고로 이동, 신규 품목 등록 후 중복 상세 조회 제거, 거래처 편집의 저장·취소 버튼 개선을 기록한다. 구현과 아래 Chrome DevTools MCP 실험 측정, 변경 범위 검증을 완료했다. 전이 의존성 보안 패치와 최신 콜백 보강 이후 Canonical acceptance 10/10개 gate 및 내부 Emulator 12/12개 gate가 PASS했다. 최신 소스의 별도 재고 통합 검증과 최종 운영 설정 build·PWA·성능·Hosting 검증도 PASS했다. Git과 운영 배포는 대기다. 실험 결과와 실제 기기 체감 확인을 구분한다.

## 확인한 효과

사진 없는 신규 등록에서 저장 클릭부터 최신 상세를 사용할 수 있을 때까지의 p50은 1,448.4ms에서 972.8ms로 줄었다. 이 실험의 관찰값으로 약 32.8% 감소다. 저장 응답에 확정 상세를 함께 담아 필수 상세 조회 한 번을 없앴고, 변경 후 유효 표본 10회 모두 추가 상세 조회가 0회였다.

실사는 저장을 서버가 확정한 뒤 다음 미확인 재고를 자동으로 연다. 사용자가 상세를 닫고 다음 품목을 선택하는 두 번의 조작이 사라진다. 저장 확정 시간 자체는 개선되지 않았다. 다음 품목을 실제로 쓸 수 있기까지 이전 전체 흐름을 측정하지 않았으므로, 실사 전체 처리 시간의 개선율은 계산하지 않는다.

| 관찰 항목 | 변경 전 | 변경 후 | 해석 |
| --- | ---: | ---: | --- |
| 사진 없는 신규 등록: 클릭 → 상세 사용 가능 p50 | 1,448.4ms, N=3 | 972.8ms, N=10 | 실험 관찰값 약 32.8% 감소 |
| 사진 없는 신규 등록: 클릭 → 등록 창 닫힘 p50 | 820.2ms | 971.4ms | 이 구간의 속도 개선 주장은 하지 않음 |
| 신규 등록 뒤 추가 `getInventoryProduct` | 매회 1회 | 10/10회에서 0회 | 새 저장 응답의 확정 상세 재사용 |
| 실사: 클릭 → 저장 창 닫힘 p50 | 753.4ms, N=10 | 813.9ms, N=10 | 저장 자체가 더 빨라졌다는 근거 없음 |
| 실사: 클릭 → 다음 품목 상세 틀 p50 | 미측정 | 814.7ms | 저장 확정 뒤 자동 전환 |
| 실사: 클릭 → 다음 품목 최신 상세 사용 가능 p50 | 미측정 | 1,411.9ms | 다른 품목의 신선한 상세 조회는 유지 |
| 실사 저장 후 다음 품목으로 이동하는 수동 조작 | 닫기 + 다음 품목 선택, 2회 | 10/10회에서 0회 | 조작 감소이며 전체 시간 개선율 아님 |

거래처의 `내 납품처 편집`과 `오늘 거래처 추가`가 사용하는 편집 창은 저장·취소 버튼을 가운데 정렬한다. 흰색 취소와 남색 저장, 하단 그림자, 누름·포커스·비활성 상태를 정리한다. 두 버튼의 최소 높이는 52px이고 각 열의 최대 폭은 128px이다. 이 변경은 조작성과 디자인 개선이며 거래처 저장 서버 지연을 줄인 변경은 아니다.

## 측정 방법과 한계

- Chrome DevTools MCP에서 412×915 모바일·터치 뷰포트, Slow 4G 네트워크, CPU 4배 감속을 사용했다. 정적 production 모드 빌드와 격리된 로컬 Emulator의 실제 인증 Callable 경로를 실행했다.
- 합성 재고 1,000품목과 합성 거래처 100곳을 사용했다. 운영 데이터와 실사용자 정보는 측정에 사용하지 않았다. 운영 서울 리전의 함수 지연, 실제 통신망, iPhone Safari 성능과 동일한 조건이라는 의미는 아니다.
- 실사 변경 전·후는 워밍업을 제외한 각 10회다. 사진 없는 등록 변경 전은 워밍업 제외 3회, 변경 후는 워밍업 제외 10회다. 변경 후 JSON은 이미 워밍업 1회를 제외했으므로 다시 제외하지 않는다.
- 분위수는 정렬한 N개 값에서 `ceil(N × p)`번째 값을 택하는 nearest-rank 방식이다. p50은 짝수 표본 두 값의 평균이 아니다. 3회짜리 등록 기준선은 범위도 함께 제시하며 통계적 유의성을 주장하지 않는다.
- 실사는 변경 전·후 trace ON, 등록은 변경 전·후 trace OFF였다. 기준선 MCP 기록 `012→030`, `042→054`는 trace 시작·종료이고 등록 표본은 `066`에 있다. `055~066`에는 새 trace 시작이 없다. 변경 후에는 `016→019`의 실사 trace 종료 뒤 `021`에서 등록을 측정했다.
- `confirmedMs`는 저장 클릭부터 인증된 성공 후 저장 창이 닫힌 DOM 상태까지다. `detailReadyMs`/`nextReadyMs`는 최신 상세가 준비되어 후속 조작이 가능한 DOM 상태까지다. 실제 화면 표시 시각이나 INP가 아니다. 반복 측정은 페이지 스크립트의 DOM 클릭으로 실행했다.
- 전후 실행은 동시에 진행한 짝지은 비교가 아니다. 표본 수, 백그라운드 작업, 로컬 실행 부하의 차이가 남는다. 32.8%는 이 조건의 등록 완료 흐름 관찰값이며 현장 전체 작업 시간의 보장값이 아니다.
- 기존 iPhone PASS 피드백은 앞선 수정에 대한 확인이다. 이번 자동 이동·등록 개선·버튼 디자인의 실기기 만족도는 새 배포본에서 별도로 확인해야 한다.

| 유효 표본의 범위·분위수 | 최솟값 | p50 | p75 | 최댓값 |
| --- | ---: | ---: | ---: | ---: |
| 등록 전: 상세 사용 가능, N=3 | 1,438.6ms | 1,448.4ms | 1,458.2ms | 1,458.2ms |
| 등록 후: 상세 사용 가능, N=10 | 929.5ms | 972.8ms | 984.0ms | 999.5ms |
| 실사 전: 저장 창 닫힘, N=10 | 745.3ms | 753.4ms | 772.2ms | 808.9ms |
| 실사 후: 저장 창 닫힘, N=10 | 793.3ms | 813.9ms | 868.8ms | 891.3ms |
| 실사 후: 다음 상세 틀, N=10 | 794.1ms | 814.7ms | 869.4ms | 891.9ms |
| 실사 후: 다음 상세 사용 가능, N=10 | 1,392.1ms | 1,411.9ms | 1,453.0ms | 1,477.4ms |

## 구현과 데이터 경계

### 실사 다음 흐름

`InventoryDetail`의 상위 상세 창을 유지하면서 저장된 품목과 장소를 기준으로 다음 대상을 선택한다. 검색·필터가 적용된 현재 목록 순서를 따르고, 이번 실사 대상인 active 품목의 미확인 또는 변동 후 미확인 장소만 선택한다. 전체 장소에서는 같은 품목의 남은 장소를 먼저 확인한다. 고정 장소에서도 사용자가 다른 장소를 확인했다면 현재 필터의 남은 장소로 돌아온다. 다음 행이 없으면 앞쪽 미확인 행으로 순환한다.

제품·장소·열기 순번이 바뀔 때 이전 상세의 편집 상태와 입력 대상을 초기화한다. 같은 제품의 다음 장소에는 방금 서버가 확정한 상세를 재사용한다. 다른 제품은 최신 상세를 읽을 때까지 쓰기를 비활성화한다. 사진과 로트도 새 제품의 확정 상세를 기준으로 보여준다.

저장 응답이 정상 확정 상세를 포함할 때만 즉시 다음 대상으로 진행한다. 재시도 영수증이나 상세 없는 호환 응답은 최신 상세를 다시 읽고, 해당 장소가 이번 실사에서 확인 상태인지 검증한 뒤 진행한다. 응답 유실·revision 충돌·조회 실패를 성공으로 표시하거나 미리 이동하지 않는다. 이전 제품의 늦은 응답은 취소 및 읽기 세대 검사를 통과하지 못한다. 인증 폐기 시 선택 상태도 정리한다.

목록의 추가 페이지를 읽는 중 다음 대상이 없으면 `추가 품목을 불러오고 있어요`라고 알린다. 그 외에도 완료 문구는 `현재 목록`의 미확인 재고로 범위를 제한한다. 조회하지 않은 전체 재고의 완료를 주장하지 않는다. 공통 BottomSheet 구현은 바꾸지 않으며 연속 실사 후 Back/Escape와 중첩 창 처리는 기존 경계를 따른다.

재고 변경 이력은 이력 창을 열 때 별도 코드로 불러온다. 다음 제품 흐름을 추가하면서 기존 재고 초기 JavaScript 예산을 유지하기 위한 조정이며, 실사 저장 폼이나 최신 상세 조회를 미루는 변경은 아니다. 성능 예산과 verifier 기준은 높이지 않는다.

### 신규 품목의 확정 상세 재사용

새 클라이언트의 신규 등록만 `includeDetail: true`를 요청한다. `saveInventoryProduct`는 초기 입고를 확정한 같은 트랜잭션의 제품·로트 상세를 기존 제품 응답에 선택적으로 포함한다. 제조사 참조와 재고 요약을 포함한 계약도 상세 안의 제품에 적용한다. 편집기는 상세를 분리하여 전달하고, 일반 목록에는 제품 정보만 저장한다.

제품 ID와 metadata/stock revision이 일치하는 상세만 최초 상세 조회 대신 사용할 수 있다. 이후 재조회에는 같은 초기 응답을 반복 사용하지 않는다. 상세가 없거나 재시도 영수증인 경우 최신 조회 경로를 유지한다. 다른 클라이언트의 변경 이후 오래된 로트를 쓰기 근거로 사용하지 않는다.

기존 클라이언트는 `includeDetail`을 보내지 않으므로 기존 응답 형태를 받는다. 선택적 응답 필드는 요청 ID의 명령 지문에 포함하지 않으며, 저장 영수증에는 상세를 보관하지 않는다. 인증·App Check·revision·요청 ID·감사 이력과 기존 사진 업로드 경계를 유지한다. 운영 데이터를 직접 쓰거나 새 캐시를 쓰기 권한의 근거로 사용하는 경로는 추가하지 않는다.

### 거래처 버튼

두 편집 모드가 공유하는 `DeliveryPhotoEditor`의 action 영역에만 새 스타일을 적용한다. CSS module 이름을 줄이고 동등한 선언을 합쳐 기존 납품사진 CSS 예산 안에 맞춘다. 공통 BottomSheet와 다른 화면의 footer 디자인을 일괄 변경하지 않는다. 저장 중 중복 실행 방지, 변경 없는 저장 비활성화, 취소와 충돌 처리는 기존 동작을 유지한다.

## 아직 해결하지 않은 지연

이번 범위는 실사 조작 감소와 사진 없는 신규 등록의 후속 조회 제거다. 입고·출고·조정·유통기한 저장, 거래처 서버 저장, 학교납품·영업/홍보 모드 전반이 더 빨라졌다고 주장하지 않는다. 운영 함수의 cold start, 현장망, 전체 목록 페이지 로딩도 이번 실험으로 해소 여부를 판정하지 않는다.

기준선의 사진 등록은 합성 1,600×1,200 JPEG 1,361,107B를 이용한 1회 표본에서 저장 창 닫힘 23,170.4ms, 상세 준비 23,788.0ms였다. 대용량 사진은 남은 주요 병목이다. 이번에는 사진 변환·압축·업로드 파이프라인을 바꾸지 않았고 변경 후 사진 등록 지연을 재측정하지 않았다. 이 1회 값을 대표 현장 지연으로 일반화하거나 사진 저장 개선 성과로 사용하지 않는다.

후속 연구는 현장 사진 크기와 업로드 구간, 실제 기기에서 연속 실사 조작 시간, 상세 조회·페이지 로딩의 네트워크 구간을 구분해 측정한다. 이번 1차 결과만으로 사용자의 체감 목표가 최종 충족됐다고 판정하지 않는다.

## 릴리스 검증에서 추가한 보안 패치

최초 Canonical acceptance의 audit gate는 기존 전이 의존성 `brace-expansion`, `undici`의 High 2건 때문에 실패했다. 이를 제품 기능의 속도 개선과 구분하여 기록한다. 관련 upstream 보안 공지는 [brace-expansion 재귀 처리](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-qhr7-859c-m2p7), [brace-expansion 반복 확장](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-q2hr-2g5m-vwhr), [undici retry interceptor](https://github.com/nodejs/undici/security/advisories/GHSA-r53p-7pc4-xj5r)에서 확인했다.

개발·빌드 도구의 해당 전이 의존성을 같은 major의 patch 버전으로 올렸다. 앱 직접 의존성을 선언한 `package.json`은 변경하지 않고 `package-lock.json`의 해석 결과를 갱신했다.

| 의존성 | 기존 잠금 버전 | 갱신 버전 |
| --- | --- | --- |
| `brace-expansion` 1.x | 1.1.18 | 1.1.21 |
| `brace-expansion` 2.x | 2.1.4 | 2.1.7 |
| `brace-expansion` 5.x | 5.0.9 | 5.0.12 |
| `undici` 6.x | 6.28.0 | 6.28.1 |
| `undici` 8.x | 8.10.0 | 8.10.2 |

`balanced-match` 4.0.4는 npm hoisting으로 설치 경로만 이동했으며 버전이 같다. 의존성 갱신 후 `npm audit --audit-level=high`는 High 0건·Moderate 8건으로 통과했다. 전체 취약점 0건이라는 의미는 아니다. 패치 이후 Canonical 전체 검증, 별도 재고 통합 검증, 최종 운영 설정 build와 관련 gate를 모두 통과했다. 이 문서는 의존성을 직접 변경하지 않고 적용된 변경 범위와 결과를 기록한다.

## 품질 검증과 운영 승격 기록

변경 범위에서 확인한 결과와 패치 이후의 전체 릴리스 결과를 구분한다. 독립 코드 검토에서 발견한 장소 복귀, 같은 제품 재선택 상태 초기화, 저장 완료 시 최신 부모 콜백 사용 문제는 구현과 회귀 사례에 반영했다. 최신 콜백 수정은 회귀 17개 PASS 후 독립 재검토에서 해소를 확인했다.

| 검증 항목 | 확인된 결과와 남은 확인 |
| --- | --- |
| 변경 범위 단위 테스트 | 10개 파일·222/222 PASS: `output/field-speed/focused-final.log`. 기존 상세 harness 갱신 후 28/28 PASS, 최신 콜백 처리 회귀 17/17 PASS |
| 앱/Functions typecheck, lint | 최종 `acceptance-final-5.log`에서 모두 PASS |
| 인증된 재고 static/demo Emulator 통합 검증 | 최신 소스·의존성의 `inventory-e2e-final-3.log`: browser 15/15 PASS(2.9분), Functions 통합 12/12 PASS(17.65초), 종료 code 0 |
| 신규 등록 0회 추가 조회, 재시도·오류·late 응답·권한 폐기 검증 | 변경 단위 및 인증된 재고 검증 PASS. 별도 MCP 등록 표본에서도 10/10회 추가 상세 조회 0회 |
| 실사 전체/고정 장소·필터·역순 재선택·연속 이동·Back/Escape | 변경 단위 및 최신 소스의 인증된 재고 통합 검증 PASS |
| 거래처 편집 기능 | 전체 인증 browser 11/11 PASS: `output/field-speed/customer-e2e-final.log` |
| 거래처 두 편집 모드 레이아웃·포커스 | 별도 focused 1/1 PASS: `customer-layout-final.log`. 320/360/390/412px × 100%/200% × 두 모드 16개 clean 캡처 |
| 의존성 audit | 패치 후 High 0건·Moderate 8건으로 `--audit-level=high` gate PASS: `audit-patched.log` |
| Canonical acceptance 10개 gate 및 내부 Emulator 12개 gate | 최종 `acceptance-final-5.log`에서 10/10·12/12 PASS. report 생성 시각 `2026-09-30T12:36:06.854Z` |
| 전체 unit·공통 browser·Rules | 최종 전체 unit 1,690 PASS/15 SKIP, 공통 browser 290 PASS, Firestore·Storage Rules 50/50 PASS |
| Full user journey | 최종 76 PASS/15 SKIP. guarded inventory launcher 전용 재고 15개는 별도 `final-3`에서 15/15 PASS |
| 최종 운영 설정 build, PWA·성능·Hosting verifier | `production-build-final.log`·`production-pwa-final.log`·`production-budget-final.log`·`production-hosting-final.log` 모두 PASS. Hosting export/shipped 102개·precache 89개·initial assets 9개 |
| Git commit/push 및 배포 소스 식별 | 대기 |
| `saveInventoryProduct` 대상 Functions 배포 | 대기 |
| Hosting 배포와 두 운영 origin의 자원·worker 대조 | 대기 |
| 이번 변경의 실제 iPhone/설치 PWA 현장 피드백 | 대기 |

등록 fixture를 실제 strict schema 계약에 맞춰 인증된 재고 검증을 실행했다. 최신 소스·의존성의 최종 `final-3`에서 browser 15개·Functions 통합 12개를 모두 통과했다. 이 별도 검증에서는 테스트를 건너뛰거나 단언을 완화하여 통과시키지 않았다.

기존 상세 unit harness는 이전 effect dependency 배열의 첫 값을 제품 ID로 찾는 가정을 제거했다. 호출 횟수·최신 응답 적용·오류 뒤 쓰기 비활성화 등 기존 행동 검증을 보존했고 28개 사례를 모두 통과했다. 저장 응답을 기다리는 동안 부모 콜백이 바뀌더라도 확정·재조회·삭제 결과를 최신 콜백으로 전달하도록 수정했으며, 관련 회귀 17개 PASS와 독립 재검토에서 해소를 확인했다.

Rules 검증은 전역 `VITEST_MAX_WORKERS=6` override를 제거해 기존 `fileParallelism: false`에 따른 순차 실행을 회복했다. 기존 Vitest 4.1.11의 환경 변수 우선순위로 발생한 공유 Emulator 초기화 충돌을 해소했고, 최종 `final-5`에서 Rules 50/50과 full user journey 76 PASS/15 SKIP를 확인했다. Rules·Rules runner·프로젝트 설정을 바꾸거나 권한 경계를 완화하지 않았다.

최신 콜백 수정 후 최종 `acceptance-final-5.log`와 재고 최종 검증 이후의 `production-budget-final.log`에서 통과한 운영 후보 bundle은 아래와 같다. 기존 ceiling을 변경하지 않았다. 특히 거래처 JavaScript는 ceiling과 같으므로 추가 변경 시 재측정이 필요하다.

| 후보 bundle | 실제 크기 | 기존 ceiling |
| --- | ---: | ---: |
| 재고 JavaScript gzip | 25,565B | 25,600B |
| 납품사진 CSS raw | 6,123B | 6,144B |
| 납품사진 JavaScript gzip | 10,189B | 10,240B |
| 거래처 JavaScript gzip | 36,864B | 36,864B |

중복 저장·응답 유실 재시도는 같은 요청 ID를 유지해야 한다. 다른 품목의 조회 실패나 인증 폐기 뒤 이전 제품 데이터로 쓰기할 수 없어야 한다. 재조회에서 동료의 변경을 발견한 실사 영수증은 확인되지 않은 다음 대상으로 미리 이동하면 안 된다. 이 조건과 연속 이동 뒤 Back, 추가 페이지 로딩 중 완료 문구를 관련 자동 검증에서 확인한다.

정식 인수 검증의 demo build가 만든 산출물과 구분하기 위해 모든 demo 검증이 끝난 뒤 운영 설정으로 다시 build했다. `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`, `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false`를 적용한 최종 운영 산출물에서 PWA·성능·Hosting gate를 모두 재통과했다. 배포 대상으로 검증한 이 산출물을 사용하고 비밀 값은 기록하지 않는다.

새 프런트엔드의 `includeDetail` 입력은 기존 서버의 strict schema에서 거부될 수 있으므로, 최종 품질 검증 뒤 `firebase deploy --project onnuriway --only functions:saveInventoryProduct`로 해당 Callable을 먼저 배포한다. 성공을 확인한 뒤 검증한 운영 산출물을 `firebase deploy --project onnuriway --only hosting`으로 배포한다. 프로젝트와 대상을 명시하며 다른 Functions·Rules·Auth나 운영 데이터는 검증 목적으로 변경하지 않는다. 배포 완료와 운영 확인은 실제 결과가 생긴 뒤에만 기록한다.

## 로컬 측정 근거

원시 자료는 개발 PC의 로컬 실험 산출물이며 이 문서와 함께 운영 데이터로 취급하거나 커밋하지 않는다.

- [기준선 요약](<C:/Users/HOME/Documents/ChatGPT/내 컴퓨터 환경 설정/outputs/performance-research-20260930/lab-summary.json>)
- [실사 기준선](<C:/Users/HOME/Documents/ChatGPT/내 컴퓨터 환경 설정/outputs/performance-research-20260930/inventory-count-baseline.json>)
- [등록·입출고·유통기한·사진 기준선](<C:/Users/HOME/Documents/ChatGPT/내 컴퓨터 환경 설정/outputs/performance-research-20260930/inventory-extra-baseline.json>)
- [실사 개선 후 10회](<C:/Users/HOME/Documents/ChatGPT/내 컴퓨터 환경 설정/outputs/field-speed-verification-20260930/inventory-count-after.json>)
- [등록 개선 후 10회](<C:/Users/HOME/Documents/ChatGPT/내 컴퓨터 환경 설정/outputs/field-speed-verification-20260930/inventory-register-after.json>)
- [개선 후 실사 trace](<C:/Users/HOME/Documents/ChatGPT/내 컴퓨터 환경 설정/outputs/field-speed-verification-20260930/inventory-after.trace.json.gz>)
