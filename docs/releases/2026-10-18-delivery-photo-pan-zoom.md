# 거래처 납품사진 Pan & Zoom 운영 릴리스 — 2026-10-18

## 변경과 소스

사용자가 요청한 재고 Pan & Zoom 추가 적용을 저장된 납품사진과 업로드 중인 촬영 미리보기에 구현하고 Git·Hosting 운영 반영을 완료했다. 기준 main은 `be494755694b07cfe080f8ba6c4f8672a7a45e20`, 제품 source는 **`3493d7b84285d9ef89aabecd7541cf50d75ad6fe`**다. `codex/delivery-photo-pan-zoom-20261018`을 보존하고 main을 같은 source로 fast-forward했다.

재고에서 검증한 계산·제스처·조작 UI를 공통 `src/components/ui/photo-*`로 옮겨 세 진입점이 같은 자산을 지연 로딩한다. PC 휠·드래그·더블클릭과 모바일 핀치·한 손가락 이동·더블탭, 맞춤 1배/빠른 확대 1.8배/최대 2.5배(충분한 실제 픽셀은 3배), 이동 경계와 안내·버튼을 제공한다. 확대 중 pan과 맞춤 상태의 사진 넘기기를 구분하고 사진 변경 시 100%로 초기화한다. 업로드 상태 갱신은 열린 미리보기의 확대를 유지하며 저장 완료는 기존 서버 확인 경계를 따른다. 인증된 evidence·Blob URL 해제·outbox·서버·Rules·의존성은 보존했다. [구현과 계약](../delivery-photo-pan-zoom-20261018.md)을 참고한다.

## 검증

정확한 source의 [Quality Gate 39099168789](https://github.com/kim-DL/ONWAY/actions/runs/39099168789)는 **2026-10-18 14:24:14 KST SUCCESS**다.

| 원격 CI 검사 | 결과 |
| --- | --- |
| audit high/critical, lint, app/Functions typecheck | PASS |
| 전체 unit / 검색·캐시 unit | 1,746 PASS·조건부 15 SKIP / 18 PASS |
| 일반 Chromium browser | 304 PASS / 2 flaky 재시도 통과 / 8 SKIP |
| Deferred sales tools | 2 PASS |
| NEIS emulator / Firestore·Storage Rules | 3 PASS / 50 PASS |
| Phase 17 업무 여정 | 81 PASS / 재고 전용 18 SKIP |
| 재고사진 / 실제 transaction integration | 4 PASS / 12 PASS |
| 납품사진 현장·영속 대기열 | 16 PASS |
| Functions build, production build, PWA·JS/CSS gate | PASS |

일반 browser의 flaky 2건은 변경하지 않은 `welcome-greeting.spec.ts:217`의 애니메이션 정지/재개 검사(PC·모바일)이며 기존 재시도 설정으로 통과했다. 새 사진 검사의 실패를 제외하거나 assertion/timeout/retry 설정을 완화하지 않았다. 8 SKIP은 기존 조건부 4개와 재고·납품사진 조작의 플랫폼 분리 4개다. unit 조건부 15개는 별도 NEIS 3·transaction 12 검사로 실행한다. Phase 17 재고 전용 18개는 아래 전용 로컬 회귀로 실행했다.

최종 source의 로컬 검증도 완료했다.

- 전체 unit 1,746 PASS / 기존 조건부 15 SKIP, 납품사진·공통 geometry 선택 unit 94 PASS, 전체 lint·typecheck PASS.
- 새 납품사진과 기존 재고 조작 합계 Chromium PC/모바일 **20 PASS / 4 SKIP**, Windows WebKit desktop **10 PASS / 2 SKIP**. 실제 mouse wheel/drag/double click·CDP native touch의 핀치/한 손가락 전환·double tap·취소 뒤 복구·맞춤 swipe, 사진별 확대 초기화, 오류 재조회·Blob URL 해제, pending 유지·서버 상태 갱신 중 확대 유지, 320px/200% 글자·axe를 검사했다.
- 실제 demo Auth·Callable·Firestore·Storage 납품사진 **16 PASS**, 재고 static PWA 업무 여정 **18 PASS**, 실제 재고 transaction **12 PASS**. 업무 데이터 쓰기는 demo emulator로 한정했다.
- Aside localhost에서 실제 viewer·upload panel과 합성 사진을 직접 조작했다. 저장 사진 180%→휠 220%·약 85px pan 후 순서 유지·다음 사진 100% 초기화·닫기 포커스 복원을 확인했다. 최종 source로 다시 만든 촬영 미리보기의 180% 확대 화면을 시각 확인하고 확인 후 pending·원래 버튼 포커스 유지를 확인했다. 소유한 검증 탭과 helper만 종료했다.

## 운영 빌드와 성능

Node 22.23.2/npm 10.9.8, 기존 비공개 운영 설정, 사진·재고 ON/Emulator OFF, source revision `3493d7b84285d9ef89aabecd7541cf50d75ad6fe`로 새 production build를 만들었다. build·PWA·성능·Hosting artifact gate PASS다. 중간 demo/local-validation 빌드는 배포하지 않았다.

| 같은 PC·설정의 gzip bytes | 이전 | 배포본 |
| --- | ---: | ---: |
| 초기 JS | 140,071 | 140,103 (+32B) |
| 납품사진 workspace JS | 10,160 | 10,160 |
| 저장된 납품사진 viewer JS | 2,918 | 2,941 |
| 공통 Pan & Zoom JS | 3,306 | 3,408 |
| 공통 Pan & Zoom CSS | 473 | 462 |
| 재고와 사진을 모두 연 JS | 28,822 | 28,926 |
| 재고와 사진을 모두 연 CSS | 8,982 | 8,971 |

기존 모든 성능 상한을 유지했다. 새 촬영 확인 경계는 JS 2KiB/CSS raw 1KiB·gzip 512B로 제한하고, 기존 preview CSS 상한을 넘기지 않도록 별도 로딩한다. 세 caller가 같은 물리 Pan & Zoom 자산을 사용하며 초기/다른 업무 유입이 없고 CSS가 한 번만 계산되며 precache에 포함되는지 검사했다. Export/shipped **113개**, precache **100개**, initial assets **9개**다. 용량 비교를 현장 네트워크·기기 조작 지연 실측으로 보고하지 않는다.

## 운영 배포와 보존 확인

배포 직전 clean HEAD·origin/main 일치, 정확한 source CI 성공, 후보 파일·비공개 env digest를 확인했다. 실행 명령은 `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project onnuriway --only hosting:onnuriway --non-interactive`다.

- Live version **`b9cbb96b32a7bc6c`**, release **`1792301133437000`**, FINALIZED.
- 배포 시각 **2026-10-18 14:25:33.437 KST** (`2026-10-18T05:25:33.437Z`). 직전 복구 version은 `835cf1d98b6d7230`이다. 이번 변경에는 데이터/서버 schema 변경이 없다.
- [운영 도메인](https://onnuriway.com)과 [기본 Hosting 도메인](https://onnuriway.web.app)의 canonical HTTP 검사 **각 25개 PASS**, www→apex 301.
- 별도 새 Chromium 익명 세션 양쪽에서 로그인 UI·서비스 워커 **activated**·page error **0**. 공개 worker와 후보 SHA-256 **`089ddfec8fcc44a63af1434df22ff6fda231e10379b91dbe02bb54dcd93217ea`**가 일치한다.
- 후보 **113파일**과 비공개 env **3종**의 digest가 배포 전후 같다. 서버·Rules·자격 증명·의존성 변경이 없는 18파일 diff도 확인했다.
- 전체 **72개 Functions CLI metadata**와 `recordInventoryCount`/`employeeMcp`의 GCF v2 전체 metadata가 전후 동일하다. 실사 revision `recordinventorycount-00009-yum`, MCP revision `employeemcp-00031-muy`다.
- MCP 전용 Hosting version `392f487ef50a6a9c`/release `1791529886712000`은 동일하다. 공개 health/OAuth metadata 3개 모두 200, MCP **1.14.2**, `writesRequireApproval=true` 유지다. Functions·Rules·Auth 설정·운영 업무 데이터는 배포하거나 수정하지 않았다.

릴리스 문서는 제품 source 이후 main에 후속 저장·push하며 제품이 같아 중복 배포하지 않는다. 최종 로컬 감사로 clean main/live origin/main 대비 0 ahead·0 behind, 기존 브랜치·다른 worktree·stash·비공개 설정과 배포 후보 보존을 확인한다.

## 증거와 한계

ignored `output/delivery-pan-zoom-20261018/`에 `ci-main.json`, `ci-test-summary.txt`, 후보 manifest, 전후 Hosting·Functions·MCP metadata, 양쪽 HTTP/browser 결과, `release-verification.json`, `final-local-audit.json`, Aside 합성 화면과 관찰 기록을 보존한다. 비공개 원시 cloud/env 기록은 출력하거나 커밋하지 않는다.

합성 컴포넌트 회귀는 실제 viewer·image hook·panel·제스처를 사용하고 인증 I/O·private registry·삭제를 대체한다. 실제 인증 업무는 demo emulator로 별도 검사했다. **실제 iPhone Safari/설치 PWA의 손가락 조작·OS 제스처·lifecycle은 미확인**이다. 운영 직원 로그인/App Check 성공과 실제 사진 저장을 이번 공개 배포 검사로 주장하지 않는다. 기존 사용자의 운영 브라우저 탭과 운영 업무 데이터를 검증에 사용하지 않았다.
