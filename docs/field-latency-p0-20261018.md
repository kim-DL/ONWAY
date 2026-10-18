# 현장 지연 P0 — 2026-10-18

대상 브랜치: `perf/field-latency-count-photo-20261018`. 기준선은 `main`의 `04272ec8b4a80c60dd74326cda6cd3f61f53ad36`이다. 아래는 구현·측정 당시 기록이며, 이후 사용자 승인으로 PR #5를 main에 병합하고 필요한 Functions/Hosting을 배포한 결과는 [2026-10-18 릴리스 기록](releases/2026-10-18-field-latency-p0.md)을 따른다.

## 저장소 확인

- 원격 ref를 fetch하고 로컬 main을 `pull --ff-only`로 동기화했다. PR #1·#2·#3은 merge 상태를 확인했다.
- PR #4의 `codex/mcp-1.8.0`은 draft/open이며 main보다 8커밋 앞선 별도 작업이다. 이 변경을 P0에 합치지 않았다.
- P0 원격 브랜치의 기존 12커밋을 먼저 검토한 뒤 tracking branch에서 이어서 작업했다. 다른 worktree·stash·비공개 환경 설정을 보존한다.

## 재고 수량 일치 확인

실사 cycle 문서를 product/settings/lots와 같은 트랜잭션의 병렬 읽기에 포함한다. 인가와 request receipt 확인은 기존 순서를 유지한다. lot 수량과 변경 전 lot 조회는 Map으로 한 번 구성해 반복 선형 탐색을 줄인다. 정확한 request receipt replay, revision 충돌, 원자적 재고·실사·감사 이력 저장과 응답 계약은 유지한다.

`recordInventoryCount`마다 `field_latency` 구조화 로그를 남긴다. 인가 전/후, 트랜잭션, 트랜잭션 인가, receipt, count 읽기, stock 계산, 응답 검증의 시간 및 트랜잭션 시도/읽기 batch/관찰한 document/쓰기 시도 수를 기록한다. 개인정보·문서 경로·입력·오류 본문은 기록하지 않는다. document 수는 관찰한 snapshot 수이며 청구량 추정치가 아니다. 트랜잭션 재시도 시간은 합산될 수 있고 병렬 구간과 전체 시간도 서로 더해서는 안 된다. 로그 기록 실패가 저장 결과를 바꾸지 않도록 격리한다.

기존 서버 재인가를 제거하거나 캐시하지 않는다. 브라우저 비교 측정은 실제 버튼 클릭부터 응답과 완료 UI 관찰까지 별도로 수행한다. 재고 UI에는 추가 진단 모듈을 넣지 않아 기존 JavaScript 예산을 유지한다.

## 납품사진 대기열과 안내

1. 사용자가 카메라 또는 앨범 버튼을 누를 때만 native picker를 연다. 다음 촬영을 자동으로 열지 않는다.
2. provider 소유 File의 바이트를 독립 복사하고 IndexedDB에 원본을 먼저 보관한다. 이 단계가 끝나기 전 이탈은 beforeunload로 보호하며, 업무 화면 이동 시에도 세션 coordinator가 복사를 계속한다.
3. 이미지 준비는 한 번에 1장, Callable 업로드는 최대 2장 진행한다. 거래처당 미완료 3장, 전체 8장, 보관 바이트 96MiB로 제한한다. 원본을 준비된 전송 Blob과 작은 local preview로 원자적으로 교체한다.
4. 촬영 미리보기는 기존 canvas에서 만들며 새 사진을 확인하려고 서버 사진을 내려받지 않는다. 작은 사진을 누르면 보관된 전송 Blob을 크게 볼 수 있다. 완료 사진의 미리보기는 해당 화면에서 제한적으로 유지하며 화면 이탈/만료/로그아웃 때 URL을 해제한다.
5. 상태는 `기기에 보관 중`, `사진 준비 중`, `업로드 대기`, `업로드 중`, 실패 또는 날짜 확인, `✓ 저장 완료`로 구분한다. `createDeliveryPhoto`의 정상 응답과 완료 상태의 로컬 기록 저장이 끝나야 완료 표시와 당일 집계를 반영한다. 응답 순서와 관계없이 photo ID로 중복을 막고 서버 시간을 기준으로 최신 사진을 고른다.
6. 일시적 전송 실패는 2/8/30초의 대기 후 최대 3회 자동 재시도한다(기본 poll 3초이므로 실제 시작은 늦을 수 있음). 오프라인에서는 기다린다. 수동 재시도도 원래 request ID·준비된 바이트·거래처·사진 출처를 유지한다. 저장 공간/권한 실패 시 전송을 시작하지 않으며 독립 복사본을 유지하고 보관 재시도를 제공한다.
7. 이전 날짜의 미전송 사진은 `날짜 확인 후 전송`을 누를 때까지 정지한다. 서버의 기존 접수일 기준 기록을 바꾸거나 촬영일을 임의로 소급하지 않는다. 완료 카드에 서버 등록일을 표시한다.

같은 거래처에서 첫 저장이 끝나도 촬영 영역이 접히지 않도록 현재 거래처를 `추가 촬영 납품처`에 유지한다. 사용자는 영역을 닫거나 다른 거래처 촬영으로 이동할 수 있다. 안내 문구는 `저장 중에도 거래처별 3장까지 촬영할 수 있어요`, `사진은 이 기기에 보관 중이에요`, `미전송 사진은 이 기기에 임시 보관되며, 로그아웃하면 삭제됩니다`처럼 실제 상태와 연결한다. 서버 삭제가 확인되면 해당 촬영 미리보기도 제거하고 Blob URL을 해제한다.

### 보관·권한 경계

IndexedDB `onnuriway:private:delivery-photo-outbox:v1`의 전용 jobs/scope store만 사용한다. uid/employee/sessionVersion/permissionsVersion으로 소유권을 나누고 무작위 scope token으로 로그아웃 뒤 늦게 돌아오는 쓰기를 차단한다. 로그아웃은 기능이 아직 로드되지 않은 경우에도 전용 store를 명시적으로 비운다. 서버에 이미 시작된 요청의 취소를 보장하지 않으므로 재시도/조정은 기존 서버 receipt에 의존한다.

탭 간 준비/업로드 lease 획득과 용량 검사는 IndexedDB 트랜잭션으로 수행한다. 문서 수명 Web Lock을 조회할 수 있으면 닫힌 탭의 lease를 즉시 회수하고, 미지원 환경은 180초 lease 만료를 기다린다. 장시간 정지한 문서나 브라우저 저장소의 강제 삭제/OS 종료까지 영구 보관을 보장하지는 않는다. 백그라운드 전송이 정지되면 앱을 다시 열어 복구한다. 민감 사진을 localStorage·Service Worker cache에 넣거나 Firestore/Storage에 직접 쓰지 않는다. 기존 Callable/Auth/App Check/감사 경계는 그대로 사용한다.

## 성능 비교

원시 결과는 ignored `output/playwright/field-latency/`에 보존한다. 수치·조건·fixture/source hash 요약은 [측정 JSON](field-latency-p0-20261018-metrics.json)에도 저장한다. 아래는 합성 데이터 실험이며 운영/실기기 성능으로 일반화하지 않는다.

### 실제 Firestore 에뮬레이터 트랜잭션

`scripts/benchmark-field-count.ts`: 각 조건 전후 30회, 별도 warmup 1회, 순서 교대. 동일한 실제 SDK 트랜잭션과 합성 데이터에서 비교한다. 120ms 조건은 각 읽기 RPC에 명시적으로 추가한 지연이다. Callable 외곽 인가·인터넷·UI·Functions cold start는 제외한다.

| lot 수 / 읽기 추가 지연 | 변경 전 p50 / p95 | 변경 후 p50 / p95 |
| --- | ---: | ---: |
| 1 / 0ms | 76.3 / 90.9ms | 55.1 / 72.0ms |
| 1 / 120ms | 585.9 / 596.8ms | 445.9 / 454.5ms |
| 200 / 0ms | 99.8 / 120.8ms | 91.2 / 114.3ms |
| 200 / 120ms | 618.5 / 631.0ms | 474.5 / 481.2ms |

두 버전 모두 읽기 batch 6회, 관찰 document 7/206개, 쓰기 시도 5회다. 순차 왕복 하나를 제거한 효과이며 인가/감사 쓰기를 줄여 얻은 수치가 아니다. 원시 `count.json`에는 소스 SHA-256과 모든 표본을 포함한다.

### 실제 PWA 버튼 → Callable 응답 → 완료 화면

`scripts/benchmark-field-count-client.ts`를 기존 격리형 inventory static runner의 `field-count` campaign으로 실행했다. 앱·Functions 모두 기준선 main과 변경본을 각각 빌드하며 실제 demo Auth/Callable/Firestore를 사용한다. 1 lot 합성 품목, 각 버전 30회 및 warmup 1회, 412×915 Chromium, CPU 4배 제한, RTT 120ms/down 200,000B/s/up 100,000B/s다. 로그인·catalog 시작은 측정 밖에서 준비한 뒤 제한을 적용한다. 전후는 별도 에뮬레이터 수명에서 순서대로 측정했으며 표본을 교차 실행한 위 트랜잭션 실험과 구분한다.

| 클릭 이후 관찰 | 변경 전 p50 / p95 | 변경 후 p50 / p95 |
| --- | ---: | ---: |
| 정상 Callable 응답 관찰 | 196.7 / 225.7ms | 192.8 / 213.9ms |
| 서버 확인 후 완료 UI 관찰 | 230.3 / 263.3ms | 216.4 / 249.8ms |

모든 표본에서 count POST 1회, 저장 중 추가 detail POST 0회, `count_match` 결과와 완료창 닫힘을 확인했다. 현재 Callable 로그는 바깥 인가까지 포함해 read batch 8회/document 11개/write 시도 5회를 관찰했다. 이 로컬 UI 차이는 작으며 클라우드 Firestore 왕복·Functions cold start를 재현하지 않는다. 운영 p95 개선율로 사용하지 않는다. 원시는 `count-client-before.json`, `count-client-after.json`이다.

### 사진 연속 촬영

`scripts/benchmark-field-photo.mjs`: 실제 Chromium/native file input/이미지 준비/coordinator, 각 버전 30회 및 warmup 1회, 순서 교대, 매회 새 context. 640×480 동일 합성 JPEG, CPU 4배 제한, RTT 120ms, down 200,000B/s, up 100,000B/s, 확인 endpoint의 고정 응답 지연 800ms. 앱 로딩 이후 제한을 적용한다. endpoint는 loopback 실험용이며 Firebase 서버 측 성능 측정이 아니다. 시간은 browser actionability/DOM 관찰 비용을 포함한다.

| 관찰 구간 | 변경 전 p50 / p95 | 변경 후 p50 / p95 |
| --- | ---: | ---: |
| 파일 선택 이벤트 → 다음 사용자 클릭으로 촬영 요청 수락 | 2,947.2 / 4,820.1ms | 76.1 / 86.3ms |
| 파일 선택 → 서버 확인 후 완료 UI | 2,914.4 / 2,953.6ms | 2,959.4 / 2,997.2ms |

변경 후 local preview의 중앙값은 126.7ms다. 최종 코드로 다른 무거운 검증과 겹치지 않게 다시 측정했으며 `photo.json`에 실험 bundle SHA-256도 기록했다. 핵심 효과는 서버 저장 중 촬영 차단 해소이며 서버 업로드 자체가 빨라졌다는 주장이 아니다. 다음 촬영 요청은 browser의 filechooser 수락 시점이며 실제 OS 카메라가 표시되거나 촬영되는 시간은 아니다. 소형 fixture이므로 고해상도 사진/HEIC/provider 다운로드/실제 카메라 시간은 이 수치로 추정하지 않는다.

## 검증 및 릴리스 경계

Windows의 Playwright WebKit 26.5를 추가 실행했다. 기본 격리 프로필의 별도 최소 재현에서 IndexedDB string/ArrayBuffer는 성공했으나 Blob과 File은 모두 `UnknownError: Error preparing Blob/File data to be stored in object store`로 실패했다. 이 프로필의 대기열 검증을 PASS로 취급하지 않는다. 앱은 보관 실패를 표시하고 사진을 메모리에 유지하며 서버 업로드/완료 표시를 시작하지 않았다. 같은 엔진에서 실제 JPEG 복사→이미지 디코딩→WebP 전송 Blob·JPEG local preview 생성은 별도 검증을 통과했다. `webkit-capability.json`에 환경과 결과를 보존한다.

추가로 일반 영구 프로필에서는 Blob/File 저장을 확인했다(`webkit-persistent-capability.json`). 실제 IndexedDB와 demo Auth/Callable/Firestore/Storage를 사용하고 원래 assertion을 유지한 P0 5개 및 PNG fallback의 핵심 **6개 PASS**다. 지연/실패 주입을 위해 이 추가 harness에서 Service Worker를 차단했다. 별도 삭제 케이스는 기능·권한·재시도·목록·Blob URL 해제 검사 후 Playwright의 `Service Worker registration blocked by Playwright` 경고 1건으로 마지막 무경고 검사를 실패했다. 전체 7 PASS로 보고하지 않는다. 실제 Safari/iPhone의 저장소 지원 또는 실기기 카메라·설치 PWA 검증을 이 Windows 결과로 추정하지 않는다.

기존 용량 상한은 유지한다. 새 촬영 행/미리보기/보관 worker/전송 경계에는 각각 gzip JS 2/2/4/2KiB, 새 미리보기 CSS에는 raw 2KiB/gzip 1KiB 한도를 추가했다. 사진 공용 CSS를 중복 계산하지 않고 전체 stylesheet의 정확한 1회 귀속·지연 로딩·PWA precache를 함께 검사한다. 기존 upload runtime 5KiB 및 inventory 25KiB 상한도 유지한다.

테스트 의존성으로 `fake-indexeddb@6.2.6`을 추가했으며 제품에서는 기존 `idb`를 재사용한다. audit에서 발견한 high/critical 항목은 기존 허용 범위 안에서 SDK 1.32.1, compression 1.8.2, proxy-addr 2.0.8, sharp 0.35.5, source-map-js 1.2.2로 제한 갱신했다. 전체 major 업그레이드나 Functions dependency 변경은 하지 않았다. 기존 moderate 8개는 별도 관리 대상이다.

로컬 검증 결과:

- 앱·Functions typecheck, 전체 lint, Functions build PASS.
- 전체 unit 1,736 PASS / 기존 조건부 emulator 15 SKIP. 이 중 재고 트랜잭션 12개는 별도 실제 emulator integration에서 12 PASS로 실행했다.
- 실제 demo Auth/Callable/Firestore/Storage의 재고 static PWA browser 18 PASS. 상품 사진 HEIC·등록/입출고/실사·권한 회수·viewer 거절·다음 실사 이동·1,000품목 paging을 포함한다.
- 사진 Chromium 16개 검증: 전체 실행 15 PASS와 화면 변경 후 중복 문자열 선택자를 고친 해당 1개 재실행 PASS. 새 P0 5개(빈 파일 후 재촬영, 3각도 연속 촬영/서버 대기/로컬 확대, reload 복구, 응답 유실 replay, 복사 중 화면 이동), 기존 camera/album·PNG fallback·이력·삭제·정렬·revision 충돌을 포함한다. 320px/200% 글자 크기 overflow 및 새 미리보기 modal/페이지의 WCAG A/AA axe 검사를 포함한다. 기존 알림 영역에는 유효한 region 역할을 추가해 ARIA 오류를 수정했다. CI에도 전체 사진 회귀 단계를 추가했다.
- 검색/캐시 성능 unit 18 PASS. 5,000품목 index 109.23ms, 검색 p95 1.24ms, 입력 중 요청 0회.
- 사진·재고 flag ON / Emulator OFF production-mode build, PWA·기존 및 신규 JS/CSS 한도·Hosting artifact gate PASS. export/shipped 109개, precache 96개, Hosting initial assets 9개다. 현재 상세 gzip 수치는 측정 JSON의 productionBundle에 저장한다.
- audit high 0 / critical 0 / 기존 moderate 8. 비공개 env 3종의 전후 SHA-256 일치를 확인했다.

실제 운영 데이터에 테스트 쓰기를 하지 않았다. 실제 iPhone/설치 PWA의 카메라·앱 종료·저장소 정책은 자동 Chromium 검증과 구분해 현장 인수 대상으로 남긴다. GitHub의 최종 합성 main/branch 검증은 이 브랜치의 Quality Gate와 PR 본문을 확인한다.

재현은 기준선 `04272ec8b4a80c60dd74326cda6cd3f61f53ad36`을 `.cache/field-p0/baseline`에 archive/extract한 뒤 아래 명령을 사용한다. 프로젝트/credential 안전 guard를 우회하지 않는다.

```text
node scripts/firebase-emulators.mjs exec "node node_modules/tsx/dist/cli.mjs scripts/benchmark-field-count.ts"
node scripts/benchmark-field-photo.mjs
```

첫 명령은 `GCLOUD_PROJECT=GOOGLE_CLOUD_PROJECT=demo-onnuriway`, production credentials 없음이 필요하다. `count-client`는 `INVENTORY_E2E_STATIC=true`, `INVENTORY_BENCHMARK=true`, `INVENTORY_BENCHMARK_CAMPAIGN=field-count`, `INVENTORY_BENCHMARK_LABEL=before|after`로 `node scripts/run-inventory-e2e.mjs`를 실행한다. before만 `INVENTORY_BENCHMARK_SOURCE`를 위 baseline 절대 경로로 지정하고 after에는 해제한다. 이미지/fixture 바이트, 모든 표본과 조건은 ignored raw JSON을 확인한다.

운영 반영 시 별도 승인을 받은 정확한 source에서 `recordInventoryCount` 관련 Functions를 먼저 배포하고, 사진·재고 flag ON/Emulator OFF로 재빌드한 Hosting 후보를 검증한다. 사진 서버 API가 바뀌지 않아 기존 Functions와도 호환된다. 로그로 cold/warm 및 단계별 지연을 관찰하고 현장 네트워크에서 인수한다. 클라이언트 rollback 시에는 미전송 사진을 먼저 정리해야 하며, 기존 버전은 새 outbox를 처리하지 못하므로 단순 rollback이 대기 사진 전송을 완료해 주지는 않는다. Functions/Hosting/Rules를 함께 무분별하게 배포하지 않는다.
