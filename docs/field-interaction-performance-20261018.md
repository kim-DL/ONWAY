# 최초 거래처 검색·재고 상세 응답 개선

기준일:2026-10-18. 사용자 요청의 최초 검색448ms·재고600행 상세 warm312ms를 추가 개선했다. 배포 소스는 a5b120ea6be2d3ad96e95340b330d5fcda3c377b다.

## 원인과 구현

거래처 결과의 중간 글꼴 굵기를 regular400/bold700으로 정리해 첫 결과의 font/layout 비용을 줄였다. 강조·크기·색·배치와32/+32·전체 검색/초성/정렬/총건수는 유지한다. debounce·지연 렌더링·결과 축소를 추가하지 않았다.

재고 목록 JSX를 전체 의존성(filtered, limit, location, calendarReady, context, countMode, openProduct)으로 memo하고20행 DOM 그룹에 content-visibility:auto/contain-intrinsic-block-size:auto를 적용했다. 마지막 그룹은 항상 실제 높이를 계산하고 행 scroll margin으로 하단 고정 조작 공간을 남긴다. 모든 불러온 행은 DOM에 남으며60/+60·native 찾기·키보드·가변 높이·스크롤 복원을 유지한다. outline은 containment 경계 안쪽으로 옮겼다. 미지원 브라우저는 전체 행을 렌더하는 기존 동작으로 돌아간다.

정렬/이름 수정으로 품목이 다른 그룹으로 이동하면 버튼이 다시 만들어질 수 있다. 상세 닫기 시 기존 모달이 복원하지 못한 경우에만 제품 ID로 포커스를 복원하며, 다른 요소에 이미 포커스가 있으면 유지한다. 공유 모달 코드는 변경하지 않았다.

새 의존성은 없다. Callable/App Check·revision/request ID·감사·권한·freshness·실사·사진 outbox·MCP 경계를 유지하며 최신 상세 확인 전 쓰기를 허용하지 않는 조건도 그대로다.

## 같은 조건의 변경 전후 측정

Chrome DevTools MCP의 trace/insight·Event Timing·Layout·Forced Reflow와 조건별 CSS 비교로 원인을 조사했다. 기준98f3118be750d8061ca04f4b964cf5c98e8f6dab는 이전 배포ccc544c10106b91359a4d6f200102e0b9500aede와 제품 코드가 같다. 최종 측정 제품 소스e67439d와 배포a5b120e의 차이는 문서화한 번들 예산 검사뿐이다. 운영 env/업무 데이터는 측정에 사용하지 않았다.

동일한 production demo export·합성500거래처/1000재고·표시600행·Chrome155.0.8059.82·390×844 DPR1 mobile/touch·CPU4×·Fast4G(latency165ms/download1012500B/s/upload168750B/s) 조건이다. 하나의 headful Chrome에서 기준과 후보를 번갈아 각각 새 컨텍스트3개로 측정했다. native trusted 입력/클릭의 PerformanceEventTiming duration 최댓값을 각 상호작용 값으로 사용했고, 측정 중 빌드/테스트를 병행하지 않았다.

데이터 준비 후 검색창을 열고1500ms 대기한 뒤 첫0 입력을 측정했다. 재고는60행에서9회 더보기로600행을 만든 뒤 첫 품목을4회 열어 첫1회와 이후3회를 분리했다. 과거448/312ms는 이전 도구 실행값이며 이번 동일 조건 기준값으로 대체하지 않았다. 기존312ms는 warm 상세였다.

| 지표 | 변경 전 중앙값(범위) | 변경 후 중앙값(범위) |
|---|---:|---:|
| 최초 거래처 검색, 각3회 |320ms (320~344)|144ms (136~152)|
| 재고 반복 상세, 각9회 |200ms (184~256)|176ms (160~176)|
| 재고 첫 상세, 각3회 |272ms (240~272)|192ms (192~208)|

최초 검색과 반복 상세는 변경 후 모든 표본이200ms 이내다. 첫 상세도 중앙값192ms지만1회208ms였으므로 모든 첫 실행까지 목표를 충족했다고 주장하지 않는다. 작은 로컬 표본으로 운영p75·모든 기기200ms·실제 iPhone/설치 PWA 인수 결과가 아니다. 합성 데이터에는 실제 사진·지도·연락처·lot가 없으며 서버 최신 상세 확인 완료 시간과 첫 화면 반응을 구분한다.

개별 표본은 [측정 JSON](field-interaction-performance-20261018-metrics.json)에 있다. 스크롤 보완 전 후보의 별도 실행에서 warm288/600ms도 기록했다. 이후 세 차례 교차 측정에서는600ms가 재현되지 않았지만 원인을 확정하지 않으며 OS/GC 탓으로 단정하지 않는다. 예외를 버리지 않고 earlierCandidateBeforeScrollFix와 beforeFocusRestore에 이전 비교를 보존한다. Trace를 켠 진단값과 끈 비교값도 섞지 않는다.

## 회귀 검증과 검사 이력

- app/Functions typecheck·lint PASS, 전체 unit1747 PASS/기존 조건부15 SKIP, 최종 재고 관련517 PASS.
- 거래처 검색 Chromium22·지도18·Windows WebKit11 PASS. 전체500번째 결과·32→64·초성/IME·재진입·초기화·포커스·접근성을 검증했다.
- 실제 InventoryListChunks/Card/BottomSheet600행 검사 Chromium PC/모바일4·WebKit2 PASS. 그룹 경계 Tab·native 찾기·320/1280px·가로 넘침·Axe0·상세 닫기/정렬 후 같은 품목 포커스를 확인했다.
- 최종 제품 코드의 production demo export에서 실제 재고 업무18개와 transaction12개 모두 한 번의 최종 전체 실행에서 PASS. 실제 Callable·1000품목 전부 조회·60/+60·120번째 상세/포커스·모드 복귀·360/768/1280px 하단 조작을 포함한다.
- 초기 후보에서360/768px 하단 가림을 발견해 마지막 그룹 실측과 행 scroll margin으로 보완했다. 새 복원 검사는 내부 scrollTop 대신 보던 행의 viewport y(0.5px 미만 오차)를 확인하며, 기존 모드 재진입 절대 scrollTop 검사는 유지한다.
- 정렬 시 포커스 유실을 새 테스트로 먼저 재현한 뒤 수정했다. 이전 전체 실행의 제조사44px 검사1회 실패/serial2개 미실행과 같은 빌드3개 재검증 통과도 보존한다. 최종 전체18개는 재시도 없이 통과했다. 기존44px/timeout/skip 기준을 완화하지 않았다.
- WebKit fixture 비동기 remount는 flushSync로 완료하고 about:blank의 History API 문제는 실제 URL의 격리 페이지로 수정했다. 제품 모달 동작을 바꾸거나 assertion을 완화하지 않았다.
- 최종 source CI 최초 시도는 Phase17에서80 PASS/1 FAIL/재고전용18 SKIP이었다. 납품사진 이력 테스트에서 공통 사진 CSS의 unused preload 경고1건이 수집되어 실패했다. 해당 CSS72d5daebc5fa40da는 기준/후보/별도 재현 빌드에서 동일한6711B·SHA-256이었다. 소스와 경고 assertion을 그대로 유지한 별도 production demo 납품사진16개가 통과했고, 동일 commit CI의두번째 시도 전체가 성공했다. 경고의 특정 타이밍 원인은 확정하지 않으며 최초 로그/비교 증거를 보존한다.
- 정확한 배포 소스의 [Quality Gate 39125562195](https://github.com/kim-DL/ONWAY/actions/runs/39125562195) 전체 SUCCESS, 운영 build·PWA·성능·Hosting gate PASS.
- CI 두번째 시도의 일반 browser는310 PASS/기존 환영 애니메이션 정지 검사2개 자동 재시도 통과(flaky)/플랫폼8 SKIP이다. 해당 화면과 테스트는 이번에 변경하지 않았고 첫번째 시도에서는312개가 한 번에 통과했다. Phase17은81 PASS/재고전용18 SKIP, 별도 재고사진4·transaction12·납품사진16 PASS다. 재시도 이력을 성공 수치에 숨기지 않는다.
- 초기 JS gzip140104→140101B(-3B), 거래처 JS36851B 동일/CSS9437→9432B, 재고 JS25563→25861B(+298B)/CSS6581→6604B(+23B). 재고 지연JS 예산만 기존25KiB에384B를 추가했다. 초기/CSS/전체 재고사진31KiB 한도는 유지한다. 포커스 보완 후256B 할당을5B 초과한 최초 게이트 실패도 기록하며, 최종 할당은 기능 비용을 명시해128B 추가한 것이다.

## 운영 반영

Hosting version ff64054ec6bac356, 2026-10-18 21:46:32 KST. [릴리스 기록](releases/2026-10-18-field-interaction-performance.md)을 따른다. Functions72/MCP1.14.2·공개 정책·MCP 전용 Hosting은 전후 동일하다. 기존 연결/설정과 private env·다른 작업 트리/브랜치/stash를 보존한다. 원본 로그·모든 후보·최종 CDP 이벤트는 ignored output/field-interaction-20261018/에 있다. DevTools MCP export 제한은 변경하지 않았고 raw trace는 별도 CDP로 수집했다.
