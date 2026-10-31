# 재고 제조사 선택 캐시 Hosting 릴리스

- 승인: 사용자가 제조사 선택 개선의 커밋과 Hosting 배포를 명시적으로 요청했다.
- 제품 source: `974f3b1660c7dcf117c67c6ec93f6980795ad57a`, main에 커밋·push했다. [구현·관련 로컬 검증](../inventory-manufacturer-cache-20261031.md)의 결과를 재사용하고 제품 코드를 추가로 변경하지 않았다.
- [Quality Gate 41156169851](https://github.com/kim-DL/ONWAY/actions/runs/41156169851): attempt 1 SUCCESS. `full` 필수 14개(plan/verify 포함) 모두 SUCCESS, presentation은 계획에 따라 제외됐다. job 재실행과 flaky summary가 없었다. unit 1,832 PASS/15 조건부 SKIP, 일반 browser 348 PASS/8 SKIP, Phase17 83 PASS/19 SKIP, 재고 사진 4 PASS와 통합 12 PASS, 납품사진 16 PASS다. 조건부 SKIP은 전체 테스트 통과 수에 포함하지 않는다.
- 로컬 운영 build·PWA·성능·Hosting gate PASS. 사진·재고 flag ON, emulator OFF, private env digest 동일. 117개 후보 파일과 source/tree/hash를 고정했고 CI 완료 후 같은 후보를 배포했다.
- 배포 명령 범위: `--project onnuriway --only hosting:onnuriway --non-interactive`.
- **2026-10-31 10:47:40.995 KST**, version **d712b93e977f7449**, release **1793411260995000**. 직전 복구 version은 **93a62db89377f0f1**이다.
- [onnuriway.com](https://onnuriway.com)·[onnuriway.web.app](https://onnuriway.web.app)의 공개 HTTP 검사 각 28 PASS, www 301 확인. 두 주소의 제조사 필드·picker JS/CSS 각 3개가 고정 후보 해시와 일치했다.
- 새 Chromium 세션 360×780/DPR3에서 양쪽 로그인 화면, 활성 service worker, 초기 workspace CSS 분리, CSS 19개의 PWA 캐시, pageerror 0을 확인했다.
- Aside의 실제 로그인된 운영 탭에서 최신 worker 적용 후 재고 등록창을 열었다. 제조사 선택 버튼 클릭 전에 사전 조회가 끝났고, 연속 두 번 열기에서 목록 조회가 총 1회로 유지됐다. 품목/제조사 저장 요청은 0회였다. 선택창과 빈 등록창을 취소하고 거래처 화면으로 복귀했다. 검증 중 Aside 연결이 재시작되어 탭·참조를 다시 확인한 뒤 새 세션에서 연속 열기 검증을 완료했다.
- Functions 72개 metadata·MCP 전용 Hosting·private env digest 동일. Functions/Rules/Auth 배포와 재고·제조사 운영 쓰기 없음.
- 증거: ignored `output/manufacturer-cache-release-20261031/`의 candidate manifest, CI summary, 전후 상태, 공개 검사, `manufacturer-assets-live.json`, `authenticated-ui-proof.json`.
- 실제 Android 설치 PWA·현장망 절대 지연은 미검증이다. 메모리가 없는 최초 실행·새로고침 뒤에는 첫 서버 조회가 필요하다. 캐시 TTL은 요청 시 적용하며 상시 polling은 추가하지 않았다.

후속 변경은 릴리스 결과 문서뿐이며 제품 빌드·Hosting 배포를 반복하지 않는다.
