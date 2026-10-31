# 재고 제조사 선택 목록 지연 개선

2026-10-31. 기준 HEAD `f5f2352`. 로컬 구현·검증 기록이며 운영 배포 기록이 아니다.

## 원인과 변경

- 제조사 picker는 버튼 클릭 뒤에 코드를 내려받고, mount마다 `listInventoryManufacturers` 응답을 기다렸다. 기존 repository는 진행 중 요청만 합치며 완료된 목록은 보관하지 않았다. 기존 품목 수정에서는 제조사 연결 상세 조회까지 `Promise.all`로 함께 기다렸다.
- 품목 등록·수정창의 제조사 필드가 mount되면 picker 코드와 목록을 병렬로 준비한다. 로그인·다른 모드·단순 재고 목록 진입에서 제조사 데이터를 미리 읽지는 않는다. 오프라인·비로그인 상태에서는 이 준비 요청을 생략한다.
- repository는 `uid:sessionVersion:permissionsVersion` namespace, 실제 Firebase UID와 접근 generation을 확인하는 단일 세션 메모리를 사용한다. 기존 `RevalidationCoordinator`로 진행 중 요청을 합치고 성공 후 60초 동안 재조회를 생략한다. 빈 목록도 유효한 캐시로 취급한다.
- picker 첫 render부터 캐시를 표시한다. TTL이 지난 경우 기존 목록을 검색·선택할 수 있는 상태로 두고 최신 목록을 확인한다. TTL은 목록 요청 시 적용하며 상시 polling은 추가하지 않았다.
- 갱신 실패 시 기존 목록과 안내·재시도 버튼을 유지한다. 최초 조회가 실패하면 오류와 재시도를 표시한다. 기존 품목의 제조사 연결 조회는 목록 표시를 막지 않고 별도로 진행한다.
- 제조사 추가·이름 변경·비활성화는 서버에서 확인된 결과만 캐시에 반영한다. 정렬과 비활성 제외는 서버 정책을 따른다. 변경 전에 시작한 목록 응답이 뒤늦게 도착하면 현재 갱신에 합류하거나 다시 조회하여 이미 확인된 변경을 되돌리지 않는다. 관리 변경·revision 충돌 후 조회와 사용자 재시도는 강제 갱신이다.
- 로그아웃의 private cleanup과 재고 접근 오류에서 캐시를 폐기한다. 세션·권한·계정 전환은 다른 namespace/generation의 캐시와 진행 중 요청을 재사용하지 않는다. 이전 세션의 늦은 응답도 새 캐시를 채울 수 없다.

IndexedDB·localStorage·sessionStorage·Service Worker 업무 캐시는 추가하지 않았다. Callable·App Check·서버 권한 검사·revision·request ID·감사 이력·품목 저장 확인 계약과 Functions·Rules는 변경하지 않았다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| `npm run test:inventory -- --maxWorkers=6` | 38개 파일 / 521개 PASS. 신규 repository·picker·lazy 경계 회귀 29개 포함 |
| 인증 context·private snapshot cleanup·revalidation coordinator 관련 검사 | 3개 파일 / 27개 PASS |
| `npm run typecheck` 및 최종 E2E 수정 후 `npx tsc --noEmit` | PASS |
| 변경된 TypeScript/TSX 7개 파일 ESLint, `git diff --check` | PASS |
| 격리 `demo-inventory-e2e` Chromium 브라우저 | 제조사 캐시, 관리자 관리, 사진 포함 품목 등록·입출고·실사·사진 교체/삭제의 관련 시나리오 3개 최종 PASS |
| 같은 에뮬레이터 런처의 transaction/Rules 통합 검사 | 12개 PASS |
| Next 개발 manifest | 제조사 필드·picker의 별도 dynamic boundary 유지 확인 |

브라우저 캐시 검사는 선택 버튼을 누르기 전에 실제 목록 Callable이 완료되는지 확인했다. 반복 열기에서 목록 요청은 1회였고, 60초 만료 뒤 응답을 보류한 동안에도 검색·선택에 성공했다. 이후 503 응답을 주어 기존 목록 유지와 강제 재시도 복구까지 확인했다. 360px 화면의 overflow 검사와 아래 스크린샷을 확인했다.

- `output/playwright/inventory-results/inventory-flow-manufacture-c7d38-g-slow-and-failed-refreshes/manufacturer-cached-during-refresh.png`
- `output/playwright/inventory-results/inventory-flow-manufacture-c7d38-g-slow-and-failed-refreshes/manufacturer-cached-after-refresh-failure.png`

초기 브라우저 캐시 검사는 가상 시계를 coordinator 생성 뒤에 설치하여 TTL 만료를 재현하지 못했다. 앱 실행 전에 시계를 설치하도록 검사만 수정했고, 해당 시나리오를 단독 재실행하여 통과했다. 제품 코드는 기존 등록·관리 시나리오 통과 후 변경하지 않았다. 종료된 테스트 서버에 직접 연결하려던 중간 재실행은 연결 거부로 끝났으며 성공 증거에 포함하지 않았다. 최종 재실행은 안전 경계를 가진 기존 에뮬레이터 런처를 사용했다.

## 남은 범위

- 메모리가 없는 앱 최초 실행·새로고침 뒤 첫 목록은 네트워크 응답이 필요하다. 미리 읽기가 끝나기 전에 버튼을 누르면 최초 로딩이 표시될 수 있다.
- 실기기·설치 PWA·현장망에서의 절대 지연 시간과 실제 App Check 토큰 검증은 이번 로컬 결과에 포함하지 않는다.
- 이 문서는 로컬 개선 단계의 결과다. 이후 사용자가 커밋·Hosting 배포를 승인했다. 캐시 기능 변경이므로 릴리스 자동 CI 범위는 `full`이며, CI·운영 build·Hosting 결과는 별도 릴리스 기록과 HANDOFF에 남긴다.
