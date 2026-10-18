# 최초 거래처 검색·재고 상세 응답 개선

기준일: 2026-10-18. 이전 릴리스의 최초 거래처 검색 448ms와 재고 600행 상세 warm 중앙값 312ms를 추가 개선한다. 범위는 프런트엔드 거래처/재고 렌더링이다.

## 원인과 구현

- Chrome DevTools의 Event Timing·Layout·Forced Reflow를 조사하고 CSS를 한 조건씩 비교했다. 거래처 최초 결과는 중간 글꼴 굵기의 cold layout 비용이 컸다. 검색 결과와 공통 정보의 글꼴 굵기를 regular 400/bold 700으로 정리했다. 제목·암호·연락처의 강조, 크기·색·배치와 32개/+32 더보기는 유지한다. 검색 debounce/지연 렌더링이나 검색 결과 축소로 지표만 낮추지 않았다.
- 재고 상세를 열 때 뒤쪽의 큰 목록까지 style/layout 계산에 참여했다. 목록 JSX를 전체 의존성(filtered, limit, location, calendarReady, context, countMode, openProduct)으로 memo하고, 20행씩 묶은 목록에 `content-visibility:auto`와 `contain-intrinsic-block-size:auto`를 적용했다. 한 번 렌더된 그룹은 실제 높이를 기억한다. 모든 불러온 행은 DOM에 남아 native 찾기·키보드 접근을 유지한다. 가상 목록이나 데이터 페이지 축소가 아니다.
- 마지막 그룹은 항상 실제로 렌더해 하단 이동 후 높이 추정이 바뀌면서 마지막 행/더보기 조작이 고정 버튼 아래로 밀리지 않도록 한다. 재고 행에도 기존 더보기와 같은 하단 scroll margin을 적용해 native 자동 스크롤이 고정 조작부 공간을 남기도록 한다. 실제1000품목 회귀에서 확인한360/768px 하단 문제를 보완한 것이며 기존 위치/클릭 가능성 assertion을 유지했다. 최종360/768/1280px 검사를 통과했다.
- 재고 제목·제품 정보·상세 버튼/안내도 기존 regular/bold 글꼴을 재사용한다. 목록 포커스 outline을 안쪽으로 옮겨 containment 경계에서 잘리지 않도록 했다. 새 의존성은 없다.
- content-visibility를 지원하지 않는 브라우저에서는 해당 CSS를 무시하고 기존처럼 전체 행을 렌더한다. 데이터/DOM/조작은 유지되지만 같은 성능 이득을 보장하지 않는다.
- 전체 검색·초성·정렬·총건수, 거래처32/재고60 더보기, 가변 높이·스크롤 복원·실사 상태를 보존한다. 서버 목록/상세·Callable/App Check·revision/request ID·감사·권한·freshness·사진 outbox·MCP는 변경하지 않는다. 최신 상세가 확인되기 전 쓰기를 허용하지 않는 기존 조건도 그대로다.

## 측정 방법과 해석

기준 소스 `98f3118be750d8061ca04f4b964cf5c98e8f6dab`는 이전 제품 source `ccc544c10106b91359a4d6f200102e0b9500aede`와 제품 코드가 같다. 기준과 후보 모두 실제 Next/Serwist production export·합성 거래처500/재고1000·demo 전용 Firebase Emulators를 사용했다. 운영 env와 업무 데이터는 사용하지 않았다.

로컬 Chrome DevTools MCP의 trace/insight로 원인을 조사했다. 최종 비교는 설치된 Chrome 155.0.8059.82의 CDP를 사용해 같은 자동 절차로 수행했다. headful·390×844 DPR1 mobile/touch·CPU4×·Fast4G(latency165ms/download1012500B/s/upload168750B/s), 새 브라우저 컨텍스트 3개다. 측정 중 다른 빌드/테스트를 실행하지 않았다. 입력/클릭은 native trusted 이벤트이며 PerformanceEventTiming을 사용한다.

각 컨텍스트에서 검색 데이터 준비 뒤 검색창을 열고 1500ms 안정화 후 첫 `0` 입력을 측정했다. 재고는60행에서9회 더보기로600행을 만든 뒤 첫 행의 상세를4번 열었다. 첫1회를 cold로 보존하고 이후3회를 warm으로 집계했다. 과거448/312ms는 이전 도구 실행의 값이며 이번 동일 절차 기준값으로 대체하지 않는다. Trace를 켠 진단과 끈 최종 비교 수치도 섞지 않는다.

하단 스크롤 보완 전 후보의 별도 실행 비교에서는 최초 검색320→152ms, 첫 상세272→192ms, warm 상세200→176ms의 중앙값을 얻었다. 해당 후보의 warm 상세9회 중288/600ms도 기록됐다. 예외를 버리거나 임의 평균으로 감추지 않고 전체 값을 보존했다. 재현/순서 영향을 확인하기 위해 같은 emulator 데이터에 기준 export(3104)와 후보 export(3103)를 동시에 제공하고, 하나의 Chrome 실행에서 before/after를 세 번 번갈아 측정했다. 각 측정은 새 컨텍스트이며 나머지 조건/대기시간/절차는 같다. 두 측 모두 long-animation-frame 관측도 추가했다. 하단 스크롤 회귀 보완 후 최종 소스로 이 교차 측정을 다시 수행한 결과가 아래 표다. 이전 후보 결과는 JSON의 earlierCandidateBeforeScrollFix에 별도로 보존한다.

| 최종 소스 교차 측정 | 변경 전 중앙값(범위) | 변경 후 중앙값(범위) |
|---|---:|---:|
| 최초 거래처 검색, 각3회 | 328ms (304~336) | 144ms (136~152) |
| 재고 첫 상세, 각3회 | 240ms (240~288) | 208ms (192~208) |
| 재고 반복 상세, 각9회 | 192ms (168~240) | 160ms (144~192) |

요청의 기존448ms 최초 검색과312ms warm 상세에 대응하는 두 지표는200ms 미만이다. 최종 최초 상세는 중앙값208ms(3회 중2회208ms)로 목표를 조금 넘는다. 최초 상세까지 모두200ms 이하라고 주장하지 않는다. 이전 후보의600ms는 두 교차 실행에서 재현되지 않았지만 원인을 확정할 증거가 부족하므로 OS/GC 탓으로 단정하지 않는다. 모든 호출/모든 기기에서200ms 이하라고 보장하지 않는다.

최종 개별 값과 두 실행의 중앙값은 [측정 JSON](field-interaction-performance-20261018-metrics.json)에 기록한다. 작은 로컬 표본이며 운영 p75/실제 휴대폰/설치 PWA 성능을 증명하지 않는다. 합성 데이터에는 실제 사진·지도·연락처·재고 lot가 없으며 서버 응답 완료 시간과 첫 화면 반응을 구분한다.

## 회귀 검증과 검사 이력

- app/Functions typecheck·전체 lint, 전체 unit1747 PASS/기존 조건부15 SKIP.
- 거래처 검색 Chromium22·지도18·Windows WebKit11 PASS. 전체500번째 결과·32→64·재진입·초성/IME·검색 초기화·포커스·접근성을 확인했다.
- 새 재고600행 컴포넌트 검사 Chromium PC/모바일2·WebKit1 PASS. 그룹 경계 Tab, 320/1280px 마지막 행 포커스·상세 닫기 후 자동 복원, native 찾기와 선택된 행 스크롤, 가로 넘침 없음, Axe 위반0을 확인했다.
- WebKit에서 테스트 fixture의 비동기 remount와 `about:blank` History API가 실패 원인이었다. fixture remount를 flushSync로 완료하고, 실제 URL을 가진 격리 페이지에서 native 모달 이력을 검사하도록 고쳤다. 제품 모달 코드를 바꾸거나 assertion·timeout·skip을 완화하지 않았다. 초기 실패 로그도 보존한다.
- 최종 production demo export의 재고 업무18개를 검증했다(전체 실행15 PASS + 아래 제조사 등록/권한 묶음3 PASS). 실제 Callable·1000품목 전체 조회·60/+60·120번째 항목 포커스/상세 복원·검색/모드 복귀·360/768/1280px 하단 버튼을 포함한다. transaction12 PASS, 재고 관련 unit517 PASS다. 이 export를 최종 성능 측정에도 재사용한다.
- 마지막 전체 실행에서는 기존 제조사 선택 화면의44px 터치 크기 검사가1회 실패하고 같은 serial 묶음의2개가 실행되지 않았다. 높이 진단 메시지만 추가해 같은 빌드에서 묶음3개를 단독 재실행했고 모두 통과했다. 원래44px 기준/timeout을 유지했으며 원인을 확정하지 않는다. 앞선 scroll 후보 실패와 별도로 로그/스크린샷을 보존한다.
- 새 상세 복원 검사는 `scrollTop`의 내부 절대값 대신 사용자가 보던 행의 viewport y 좌표(0.5px 미만 오차)와 포커스를 확인한다. 화면 밖 그룹의 추정 높이가 실제 높이로 바뀔 때 native scroll anchoring이 scrollTop을6px 조정했기 때문이다. 기존 모드 재진입의 절대 scrollTop 복원 assertion은 그대로다.
- 지연 로딩 재고 JavaScript의 기존25KiB 예산에256B만 추가했다. 목록 그룹/JSX memo를 포함한 사전 production 측정은25735B로 기존25563B보다172B 증가했다. 초기 JS140104B·거래처 JS36851B는 같다. 초기 자산·CSS·전체 재고/사진31KiB 한도는 유지한다. 최종 정확한 commit의 새 production build/gate와 CI를 배포 전 확인한다.

원본 로그·모든 후보/실험·최종 CDP 이벤트는 ignored `output/field-interaction-20261018/`에 있다. DevTools MCP의 파일 export 경로 제한은 변경하지 않았으며, 로컬 raw trace는 별도 CDP 수집 파일이다. 기존 MCP 연결/설정은 유지한다. 운영 배포 상태는 인수인계와 별도 릴리스 기록을 따른다.
