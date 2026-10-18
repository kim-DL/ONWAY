# 2026-10-18 거래처 검색·재고 목록·스크롤 Hosting 릴리스

- 제품 소스: ccc544c10106b91359a4d6f200102e0b9500aede
- 정확한 소스의 [Quality Gate](https://github.com/kim-DL/ONWAY/actions/runs/39107223888): SUCCESS.
- 대상: Firebase project onnuriway, hosting:onnuriway. Functions/Rules/Auth/MCP 배포 없음.
- 운영 배포: 2026-10-18 16:45:52 KST / live version 18c07fe9fdc79407.
- release: projects/onnuriway/sites/onnuriway/releases/1792309552741000.
- 직전 복구 version: b9cbb96b32a7bc6c.
- worker SHA-256: 1eebd1ef345b6dccec882bd82502525ae510e9c4f6e8e40846c292473b37e4e3.

## 변경과 보존 계약

거래처는 전체 검색·초성·정렬·총건수를 유지하고 32개씩 표시한다. 더보기/검색 초기화/재진입 표시 개수와 권한 정리를 보존한다. 재고는 전체 제품/context/location/countMode에 대한 기본 memo와 안정적인 onOpen을 사용한다. 기존 60개씩 더보기·데이터 변경 반영·키보드 찾기를 유지한다.
스크롤은 진입 시 한 번 복원하고 passive 이벤트에서 기록하며 cleanup에서 DOM 위치 읽기나 중복 저장을 하지 않는다. directions/지도/행정동의 동일 좌표 검증을 공통화했고 SDK의 지연 로딩 경계와 기존 export는 유지한다.
Callable/App Check·request ID·revision·감사·freshness·서버 목록 page 크기·사진 outbox·MCP API는 변경하지 않는다. 새 가상 목록 의존성은 추가하지 않았다.

## 최종 코드 전후 측정

기준 a11fee6b8be1c0ed2a96fe410206a4ee345eb9ea와 배포 소스 ccc544c10106b91359a4d6f200102e0b9500aede의 src 파일을 각 격리 build와 대조했다. 같은 production build/합성 500거래처·1,000재고/390×844 DPR1 mobile·touch/CPU4×/Fast4G/로컬 Chrome DevTools다. 단일 입력의 Event Timing을 사용하며 운영 사용자 p75가 아니다.

| 항목 | 전 | 후 | 감소 |
|---|---:|---:|---:|
| 거래처 검색 3회 중앙값 | 1488ms | 144ms | 90.3% |
| 재고 더보기 540→600개 | 280ms | 176ms | 37.1% |
| 재고 600개 상세 warm 3회 중앙값 | 456ms | 312ms | 31.6% |

거래처 첫 입력은 1,584→448ms, DOM은 12,616→917개다. 더보기 trace의 스크롤 저장 함수 forced reflow 452ms는 수정 후 insight에서 문제 없음이다. 최초 검색 448ms·큰 목록 상세 312ms의 잔여 지연은 구분하며 모두 200ms 이하라고 주장하지 않는다. 개별 값은 [metrics](../field-list-scroll-performance-20261018-metrics.json)를 참고한다.

## 검증

- 전체 unit 1,747 PASS / 기존 조건부 15 SKIP, 관련 unit 311 PASS, lint·app/Functions typecheck PASS.
- Chromium 검색 22 PASS, 지도 PC/모바일 18 PASS, Windows WebKit 검색 11 PASS.
- 최종 계측에 사용한 동일 demo build의 out을 guarded runner에서 재사용해 실제 재고 static browser 18 PASS·transaction 12 PASS.
- 기존 학교 검색/캐시 성능 18 unit 및 합성 5,000학교 검색 p95 2.4ms PASS. 거래처/재고 UI 계측과 별도다.
- 정확한 제품 소스의 CI 전체 PASS. 일반 browser308 PASS/기존8 SKIP, NEIS3·Rules50·Phase17 browser81 PASS/재고 전용18 SKIP, 재고사진4·transaction12·납품사진16 PASS다. 재고 전용18개는 위 로컬 최종 static runner에서 모두 실행·통과했다.
- 운영 flags는 사진/재고 ON, Emulator OFF, 원래 비공개 설정 유지, PWA revision을 제품 source로 고정한 새 build다. build·PWA·성능·Hosting gate PASS.
- 초기 JS gzip 140,103→140,104B(+1B), 거래처 36,830→36,851B, 재고 25,518→25,563B. 기존 36KiB/25KiB 등 모든 상한을 유지했다.
- 후보 113파일, precache100. 두 origin HTTP 검사 각 25 PASS, www→apex 301, 로그인 화면/worker activated/page error0 및 공개 worker=후보 hash 일치.
- 전체 Functions72 metadata, 실사/MCP API metadata, MCP 전용 Hosting release/version은 전후 동일. MCP1.14.2 및 승인 필요 정책 유지.
- MCP PR#4 draft/open 및 head86ce19328bf0074328b43512745f284aeb7df740과 다른 브랜치/작업 트리/stash를 보존한다. 비공개 env3종과 배포 후보 digest도 검증했다.

## 검사 이력과 범위

첫 운영 후보는 거래처 JS가 기존 상한을 93B 초과해 배포하지 않았다. 중복 좌표 검증과 렌더/스크롤 중복 처리를 줄여 수정했으며 assertion·timeout·skip·성능 상한을 완화하지 않았다.
추가 로컬 fixtures의 지도 버튼 geometry가 43.99993896484375px로 보고된 1건과 WebKit 재마운트 직후 boundingBox null 1건을 확인했다. 같은 테스트 조건에서 지도 전체18·WebKit 전체11을 재실행해 통과했고, 로그에 초기 실패도 남겼다.
검증을 위해 운영 업무 데이터를 생성·수정·삭제하지 않았다. 실사용자 로그인/App Check 성공과 실제 iPhone/설치 PWA의 현장 조작·lifecycle은 자동·Emulator·공개 검사와 구분한다.
증거는 ignored output/field-list-perf-20261018/에 보존한다. 구현은 [설계·검증](../field-list-scroll-performance-20261018.md), Git/PC 보존 결과는 final-local-audit.json을 참고한다.
릴리스 문서는 후속 docs-only 커밋으로 main에 저장하며 제품 코드가 같아 중복 배포하지 않는다.
