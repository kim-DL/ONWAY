# ADR 0014: 명시적 PWA Cache와 사용자 승인 Update 경계

- 상태: Accepted
- 날짜: 2026-08-24

## 배경

급식길은 네트워크가 불안정한 학교 현장에서 앱을 다시 열고, 학교를 검색하고, 이전에 확인한 현장정보와 사진 Thumbnail을 볼 수 있어야 한다. 반면 Firebase/Callable 응답과 영업 배정·방문 데이터까지 Service Worker가 포괄적으로 Cache하면 사용자·역할 전환 뒤 데이터가 노출될 수 있다. 새 Service Worker가 자동으로 `skipWaiting()`하고 화면을 다시 불러오면 방문 기록이나 현장정보 입력 Draft도 잃을 수 있다.

## 결정

- Next.js 16 Production Webpack Build에 `@serwist/next` 9를 연결하고 `src/app/sw.ts`를 `public/sw.js`로 빌드한다. 개발 서버에서는 Service Worker를 비활성화해 오래된 개발 Cache가 UI 검증을 방해하지 않게 한다.
- Precache는 `/` App Shell, Next.js Hash Asset, Manifest와 명시적 Icon만 포함한다. Runtime Cache Matcher는 같은 출처의 `/`, `/_next/static/*`, 명시적 PWA Asset, 향후 `/school-thumbnails/*` GET Image만 허용한다.
- Cache는 `app-shell-phase14`, `public-assets-phase14`, `school-thumbnails-phase14`로 구분한다. 활성화 시 급식길의 이전 Phase Runtime Cache만 제거하고 다른 Origin/제품 Cache는 건드리지 않는다.
- Firebase WebChannel, Firestore, Functions Callable, Storage 중계, `/api`, CSV, 인증과 영업 응답은 Runtime Cache Route가 없다. Service Worker의 Cache URL Allowlist와 별도로 학교 검색·상세·Thumbnail은 사용자·역할·`sessionVersion` Namespace가 있는 IndexedDB를 사용한다.
- 학교 상세 IndexedDB에는 공용 학교·현장·사진 Metadata만 남기고 `salesData`는 Memory에서만 유지한다. 월별 영업 Workspace도 Phase 14부터 Memory 전용이며 이전 IndexedDB Record는 다음 쓰기 또는 로그아웃 시 제거한다.
- Firebase Auth의 로컬 사용자와 최근 24시간 이내 서버에서 검증된 최소 Session Claim을 이용해 오프라인 부팅을 허용한다. 연결 복구 시 ID Token → `authz` 역할 → `sessionVersion`을 다시 확인하며 불일치 시 비공개 Client State 전체를 제거하고 재로그인을 요구한다.
- `navigator.onLine`은 실제 요청 차단 상태에서도 `true`일 수 있으므로 인증과 전역 연결 상태는 비캐시 `HEAD /api/connectivity` Probe를 사용한다. 이 응답은 Service Worker Precache/Runtime Cache 모두에서 제외하고, 끊긴 동안 낮은 빈도로 재확인해 연결 복구 뒤 Token → Authz 검증을 재개한다.
- `skipWaiting`은 `false`, `reloadOnOnline`은 `false`로 고정한다. 새 Worker가 Waiting이면 “새 버전이 준비되었습니다” 알림만 표시하고 사용자가 `업데이트`를 누를 때만 `SKIP_WAITING`을 전송한다. `controlling` 이후 새로고침도 이 명시적 승인 흐름에서만 실행한다.
- 오프라인 쓰기 Queue는 만들지 않는다. 방문 기록 저장 실패 시 현재 Component Draft와 오류를 유지하고 연결 후 사용자가 다시 저장한다.

## 결과

- 정상 사용 뒤 네트워크를 끊고 앱을 다시 열어도 동일 직원·역할·세션 범위의 App Shell, 로컬 학교 검색, 이전에 본 학교 상세와 Thumbnail을 사용할 수 있다.
- Service Worker Cache Storage에는 인증·Firebase·영업 API Response가 들어가지 않는다. 영업 데이터는 탭 종료 뒤 오프라인 복원을 보장하지 않는다.
- 새 배포가 있어도 입력 화면은 즉시 새로고침되지 않는다. 사용자가 업데이트 시점을 결정하므로 Draft 유실 위험을 통제할 수 있다.
- 24시간을 넘긴 Offline Session이나 저장된 Session이 없는 최초 기기는 네트워크 연결 후 다시 검증해야 한다. 이 제한은 장기 Offline 상태에서 폐기된 권한을 계속 사용하는 위험을 줄이기 위한 의도된 경계다.
