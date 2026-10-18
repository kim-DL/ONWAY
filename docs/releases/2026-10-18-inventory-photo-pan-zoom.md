# 재고 제품 사진 Pan & Zoom 운영 릴리스 — 2026-10-18

## 소스와 승인 범위

사용자가 요청한 PC·모바일 Pan & Zoom을 구현하고 테스트 통과 후 Git 저장·운영 Hosting 배포를 완료했다. 기준 main은 `e9293120779aa4dfc37d02feecb90d81c7dce230`, 최종 제품 source는 **`634bfdc0eb49336ebd1ecec764edab3c6e513af0`**이다. `codex/inventory-photo-pan-zoom-20261018`을 보존하고 main을 같은 source로 fast-forward했다. 이 문서는 제품 source 이후 문서 전용 후속 커밋이며 중복 배포하지 않는다.

PhotoSwipe·react-zoom-pan-pinch와 비교해 기존 BottomSheet·인증된 Blob URL·사진 전환을 재사용하는 경량 자체 구현을 선택했다. 새 실행 의존성은 없다. 휠 커서 기준 확대·드래그·더블클릭, 모바일 핀치·한 손가락 이동·더블탭, 축별 경계와 키보드 조작을 제공한다. 기본 맞춤 1배, 빠른 확대 1.8배, 최대 2.5배이며 제공된 실제 픽셀이 충분한 경우만 3배다. 안내 문구와 확대/축소/화면 맞춤/닫기를 제공한다. [구현·비교·조작 계약](../inventory-photo-pan-zoom-20261018.md)을 참고한다.

Aside localhost 합성 사진의 실제 컴포넌트를 직접 조작했고 휠·이동·더블클릭·닫기·원래 버튼 포커스를 확인했다. 이 과정에서 모달을 연 채 새로고침하면 React ID와 남은 history.state가 충돌해 닫기가 무시되는 문제를 발견했다. Chromium PC·모바일에서 실패를 재현한 뒤 공통 BottomSheet 이력 키에 인스턴스 식별자를 더하고 동일 회귀를 통과했다. DOM/ARIA ID·기존 중첩 모달 소유권·뒤로가기 계약은 유지했다.

## 정확한 source의 검증

[Quality Gate 39094014994](https://github.com/kim-DL/ONWAY/actions/runs/39094014994), head `634bfdc0eb49336ebd1ecec764edab3c6e513af0`, **2026-10-18 12:58:18 KST SUCCESS**다.

| 검사 | 결과 |
| --- | --- |
| audit high/critical, lint, app/Functions typecheck | PASS |
| 전체 unit | 1,746 PASS / emulator 조건 15 SKIP |
| 검색·캐시 성능 unit | 18 PASS |
| 일반 Chromium browser | 296 PASS / 6 SKIP |
| Deferred sales tools | 2 PASS |
| NEIS emulator / Firestore·Storage Rules | 3 PASS / 50 PASS |
| Phase 17 업무 여정 | 81 PASS / 재고 전용 18 SKIP |
| 재고사진 회귀 / 실제 transaction integration | 4 PASS / 12 PASS |
| 납품사진 현장·영속 대기열 회귀 | 16 PASS |
| Functions build, production build, PWA·JS/CSS gate | PASS |

unit에서 건너뛴 NEIS 3개와 transaction 12개는 별도 emulator 단계에서 실행했다. 일반 browser의 6 SKIP은 기존 조건부 4개와 새 PC/모바일 전용 조작의 플랫폼 분리 2개다. Phase 17의 재고 전용 18개는 로컬의 최종 source 전용 static PWA 여정에서 **18 PASS**, 실제 transaction도 **12 PASS**로 실행했다.

새 Pan & Zoom 로컬 회귀는 Chromium PC/모바일 **10 PASS / 2 SKIP**, Windows WebKit desktop **5 PASS / 1 SKIP**다. 커서 기준 확대·capture 드래그·핀치/한 손가락 전환·더블탭·취소 복구·범위·해상도별 상한·다양한 비율·resize·Back·Escape·재열기·320px/200% 글자/axe·가려진 창의 frame 정지·새로고침 후 닫기를 검사했다. 새로고침 충돌은 수정 전 PC/모바일 모두 실패하고 수정 후 모두 통과했다.

최초 build 동시 실행 중 기존 SDK 동적 import의 5초 timeout 1회가 있었고, 테스트를 완화하지 않은 채 단독 4개와 전체 순차 unit을 통과했다. 최종 원격 CI도 전체 통과했다.

## 운영 빌드와 전후 용량

Node 22.23.2/npm 10.9.8, 기존 비공개 운영 설정, 사진·재고 flag ON/Emulator OFF로 새로 빌드했다. PWA source revision을 최종 source로 고정했다. `npm run build`, `verify:pwa:build`, `verify:performance:build`, `verify:hosting:build`가 모두 통과했다. 중간 합성 source marker 빌드는 배포하지 않았다.

아래는 같은 PC·production-mode 설정에서 측정한 gzip bytes다. 기존 모든 상한을 유지했고 새 조작 JS/CSS와 전체 방문 흐름에 별도 상한을 추가했다.

| 항목 | 이전 | 배포본 |
| --- | ---: | ---: |
| 초기 JS | 140,034 | 140,071 (+37B, 약 0.026%) |
| 재고 workspace JS | 23,306 | 23,293 |
| 기존 지연 사진 뷰어 JS | 2,231 | 2,223 |
| 기존 재고 JS 검사 범위 | 25,537 | 25,516 |
| 기존 재고 CSS | 6,649 | 6,581 |
| 새 지연 Pan & Zoom JS | — | 3,306 |
| 새 지연 Pan & Zoom CSS | — | 473 (raw 932) |
| 재고와 사진을 모두 연 JS | 25,537 | 28,822 |
| 재고와 사진을 모두 연 CSS | 8,577 | 8,982 |

새 조작 코드는 기존 지연 사진 뷰어 내부에서 요청한다. 초기/다른 업무 경로의 코드 유입, CSS 중복, precache 포함 여부를 gate로 검사했다. export/shipped **111개**, precache **98개**, initial assets **9개**다. 용량 비교는 네트워크나 실제 기기의 조작 지연 측정과 구분한다.

## 운영 배포와 확인

명령은 `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project onnuriway --only hosting:onnuriway --non-interactive`다. 배포 직전 clean HEAD·origin/main·정확한 source CI·후보 manifest·비공개 env digest를 확인했다.

- Live Hosting version: **`835cf1d98b6d7230`** / release `1792295945130000` / FINALIZED.
- 배포 시각: **2026-10-18 12:59:05.130 KST**, `2026-10-18T03:59:05.130Z`.
- 직전 복구 version: `a21113ad828fdb0a`. 데이터 형식이나 서버 변경이 없는 UI 릴리스다.
- 공개 worker SHA-256: `35be801b5a92ed0fc5fda47c8f8e01f864022f42507ef07b680701aa3ac64357`.
- [운영 도메인](https://onnuriway.com)과 [기본 Hosting 도메인](https://onnuriway.web.app)의 canonical HTTP 검사 **각 25개 PASS**. www는 apex로 301 이동한다. 공개 worker·자산은 후보와 일치한다.
- 별도 새 Chromium 익명 세션 양쪽 origin에서 로그인 UI·서비스 워커 **activated**·page error **0**을 확인했다. 기존 사용자의 운영 브라우저 탭은 새로고침하거나 수정하지 않았다.
- 배포 전후 후보 **111파일**과 비공개 env **3종**의 digest가 동일하다.

전체 **72개 Functions의 CLI metadata가 전후 동일**하고, `recordInventoryCount` 및 `employeeMcp`의 GCF v2 전체 metadata도 같다. 실사 revision은 `recordinventorycount-00009-yum`, MCP revision은 `employeemcp-00031-muy`다. MCP 전용 Hosting `392f487ef50a6a9c`/release `1791529886712000`도 유지한다. 공개 MCP health/OAuth metadata 3개는 모두 200이며 버전 **1.14.2**·`writesRequireApproval=true`를 유지한다. Functions·Rules·Auth 설정·운영 업무 데이터는 배포/수정하지 않았다.

Git 후속 문서를 main에 저장·push한 뒤 clean 상태, live origin/main 대비 0 ahead/0 behind, 다른 브랜치·worktree·stash 보존과 후보/env 일치를 최종 로컬 감사로 확인한다. `codex/mcp-1.8.0`과 `perf/field-latency-count-photo-20261018`을 독립 보존한다.

## 증거와 검증 범위

ignored `output/inventory-pan-zoom-20261018/`에 `ci-main.json`, `ci-test-summary.txt`, 후보 manifest, 전후 Hosting·Functions·MCP metadata, 두 origin 검사, 익명 browser 결과, `release-verification.json`, `final-local-audit.json`을 보존한다. 비공개 원시 cloud/env 기록은 출력하거나 커밋하지 않는다.

Aside는 localhost의 실제 컴포넌트 PC 조작 근거이며 일부 화면 캡처에서 CDP timeout/clip 제한이 있었다. Chromium native touch와 Windows WebKit은 자동 브라우저 근거다. **실제 iPhone Safari/설치 PWA의 손가락 조작·OS 제스처·lifecycle 검증은 아직 하지 않았다.** 운영 직원 로그인·App Check 성공과 실제 업무 데이터 저장도 이번 공개 배포 검사의 범위가 아니다. 실제 데이터 생성·변경·삭제를 검증에 사용하지 않았다.
