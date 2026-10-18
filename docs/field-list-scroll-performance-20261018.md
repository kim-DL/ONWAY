# 거래처 검색·재고 목록·스크롤 성능 개선

기준일: 2026-10-18. 범위는 거래처 검색과 재고 목록/스크롤이며 Functions·Rules·MCP API는 변경하지 않는다.

## 구현

- 거래처 검색은 기존 전체 데이터 검색·초성·정렬·총건수를 유지하고 처음 32개를 표시한다. '거래처 더 보기'로 32개씩 추가한다. 검색어 변경·지우기는 32개로 초기화하고, 화면 재진입 시 검색어와 표시 개수를 같은 세션의 메모리에서 복원한다. 권한 폐기·계정 변경·오프라인 정리 시 추가된 표시 개수도 초기화한다.
- 재고 카드는 React 기본 shallow memo를 적용하고 onOpen 콜백을 안정화했다. product 전체, context 전체, location, countMode를 그대로 비교하므로 수량/revision·날짜/실사 주기·보관 장소·실사 상태 변경을 생략하지 않는다. 기존 60개씩 더보기, 전체 검색, native 키보드/브라우저 찾기를 유지한다.
- 스크롤은 session 기준 화면 진입 시 한 번 복원하고 passive scroll 이벤트로 기록한다. DOM commit 뒤 cleanup에서 scrollTop을 다시 읽거나 이미 기록한 값을 중복 저장하지 않으며 목록 변경마다 layout effect를 해제/재설치하지 않는다. 복원 위치는 기존 scrollHeight/clientHeight 경계로 제한한다.
- 기존 Callable 인가/App Check, request ID·revision·감사, 재고 reconcile/최신 상세 확인, 60초 freshness, 사진 outbox, MCP는 유지한다. 페이지 크기/서버 조회 구조는 이번에 바꾸지 않았다.
- 운영 설정의 번들 상한을 유지하기 위해 directions/지도/행정동 조회의 같은 좌표 범위 검증을 순수 함수로 공통화했다. SDK는 기존 지도 지연 로딩 경계 안에 두고, 기존 isDeliveryMapPoint export와 좌표 검증 조건을 보존한다. 새 더보기 버튼에는 기존 공통 조작부를 재사용한다.

## 방식 선택

새 가상 목록 의존성 대신 검색 표시 개수 제한과 재고 카드 재사용/스크롤 effect 수정을 선택했다. 기존 재고 더보기·포커스·모드 복귀·가변 높이를 그대로 유지하면서 측정된 주요 비용을 줄였다. 재고는 불러온 카드가 DOM에 남으며 가상 목록이라고 부르지 않는다.

DevTools에서 content-visibility 적용도 별도 임시 비교했지만 최종 코드에는 포함하지 않았다. 목록 높이 추정·스크롤 복원/포커스 영향까지 늘리는 대신 이번 범위의 작은 변경을 유지했다. 최종 전후 값은 이 임시 CSS를 넣기 전에 측정한 값이다.

## 같은 조건의 전후 측정

기준 소스 main `a11fee6b8be1c0ed2a96fe410206a4ee345eb9ea`와 변경 소스를 각각 격리 production build로 만들었다. 원본 Next/Serwist 설정, 운영 env 복사 없음, 합성 거래처 500개/재고 1,000개, 같은 로컬 Chrome DevTools 격리 프로필, 390×844 DPR 1 mobile/touch, CPU 4× slowdown, Fast 4G다. source 파일을 기준 Git blob과 대조해 before build의 일치도 확인했다.

| 측정 | 변경 전 | 변경 후 | 감소 |
|---|---:|---:|---:|
| 거래처 500곳 검색, 3회 중앙값 | 1,488ms | 144ms | 90.3% |
| 거래처 첫 검색 | 1,584ms | 448ms | 71.7% |
| 거래처 검색 DOM 요소 | 12,616 | 917 | 92.7% |
| 재고 더보기 540→600개 | 280ms | 176ms | 37.1% |
| 재고 더보기 9회 중 최장 | 296ms | 184ms | 37.8% |
| 재고 600개 상태 상세 열기, warm 3회 중앙값 | 456ms | 312ms | 31.6% |

- 거래처 개별 값: before 1,584/1,224/1,488ms → after 448/144/136ms. trusted 실제 키 입력과 결과 카드 500→32를 확인했다. 전체 결과는 500개로 같다.
- 상세는 양쪽 모두 첫 1회를 warmup으로 별도 보존하고 다음 3회를 집계했다. before 456/440/544ms → after 312/328/312ms.
- 더보기 trace의 스크롤 저장 함수에 귀속된 forced reflow: before trace 전체 452ms, after insight에서는 문제 없음. 이 시간을 개별 클릭에서 제거한 시간으로 해석하지 않는다.
- [조건·개별 수치](field-list-scroll-performance-20261018-metrics.json). 원본 계측/trace 분석 응답·실험·로그는 ignored `output/field-list-perf-20261018/`에 보존한다. raw trace 원본을 파일로 내보냈다는 의미는 아니다.

이는 작은 로컬 lab 표본이며 운영 사용자 p75나 실제 iPhone/설치 PWA 수치가 아니다. 최초 검색 448ms, 큰 목록 상세 312ms는 여전히 200ms를 넘는다. 변경 후 모두 200ms 이하라고 주장하지 않는다. 사진/GPS/연락처/lot가 없는 합성 데이터이며 실제 사진/지도/서버 내부 지연은 별도다.

## 검증

- app/Functions typecheck, 전체 lint PASS.
- 전체 unit 1,747 PASS / 기존 조건부 15 SKIP.
- 관련 고객/재고 lifecycle/스크롤 unit 311 PASS.
- PC·모바일 Chromium 거래처 검색 browser 22 PASS: 새 500곳 검색/마지막 결과/32→64/재진입/검색 초기화, 기존 초성·IME/Enter/Escape·포커스·320~1280px·200% 글자·접근성 포함.
- 최종 운영 설정 production build 및 기존 PWA/성능/Hosting gate PASS. initial JS gzip 140,104B(+1B), customer JS 36,851B, inventory JS 25,563B로 기존 상한을 유지했다.
- 실제 demo 재고 static browser 18 PASS, transaction integration 12 PASS. 1,000품목 전체 페이지/최초 60행/더보기/검색/모드 복귀 스크롤, 수량 변경·실사 연속 진행, 사진 및 역할/권한 회수 경계를 실제 Callable로 검증했다. 전후 측정에 사용한 동일 demo build의 out을 보존해 guarded runner에서 재사용했다.
- 검색/캐시 성능 18 unit 및 5,000학교 검색 p95 2.4ms PASS. 정확한 source의 CI·운영 build/배포 결과는 릴리스 기록에 갱신한다.


## 운영 반영 완료

제품 source ccc544c10106b91359a4d6f200102e0b9500aede의 CI 전체 SUCCESS 후 2026-10-18 16:45:52 KST에 Hosting만 배포했다. live version 18c07fe9fdc79407, 직전 복구 version b9cbb96b32a7bc6c이다. 두 origin 각25개·browser worker/로그인 검증과 Functions/MCP 전후 metadata 검증을 통과했다. [릴리스 기록](releases/2026-10-18-field-list-scroll-performance.md)을 참고한다.
