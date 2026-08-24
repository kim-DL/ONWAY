# Phase 14 완료 기록

- 완료일: 2026-08-24
- 기준 문서: 구현 명세서, 검색·캐시·성능 설계서, 인증·권한·보안 설계서, 테스트·인수 기준서, ADR 0014
- 검증 환경: `demo-onnuriway`, Auth/Firestore/Functions/Storage Emulator, Chromium, Node.js 22.23.2, Next.js 16.3.2, Serwist 9.5.12

## Phase

Phase 14 — Installable, Offline-capable and Safely Updatable PWA

## 구현

### 설치와 App Shell

- Next.js App Router `manifest.ts`와 한국어 이름·설명·Theme/Background Color·`standalone`·`portrait-primary` 설정
- 192px, 512px, 512px Maskable, 180px Apple Touch PNG를 같은 급식길 Mark에서 재현 가능하게 생성
- Apple Web App, Format Detection, Manifest, Viewport Metadata 연결
- Serwist InjectManifest 기반 Production Service Worker와 `/`, Hash JS/CSS, Manifest, Icon Precache
- 설치 가능 시 설정 화면에 `앱 설치` Action, 설치 뒤 독립 실행 상태 표시

### 오프라인 부팅·검색·상세

- Firebase Auth Local Persistence와 최근 서버 검증 Session을 결합한 24시간 Offline Boot
- `navigator.onLine`을 신뢰하지 않고 Service Worker가 Cache하지 않는 `HEAD /api/connectivity`를 확인하는 실제 연결성 판별과 5초 복구 Retry
- Offline Boot 뒤 App Shell을 즉시 표시하고 연결 복구 시 Token → Role/Authz → Session Version 순서로 재검증
- 사용자·역할·Session Version별 IndexedDB Search Catalog를 이용한 Network 0 학교 검색
- 검색 결과 선택 시 Firestore가 끊겨 있으면 같은 Namespace의 이전 학교 상세 Cache로 Fallback
- 학교명·급별·행정구·주소, 급식실 위치, 검수 시간, 카트, 엘리베이터·계단, 차량 접근, 현장 메모와 Cached Thumbnail 표시
- 전역 “오프라인 · 저장된 정보를 표시하고 있습니다” 상태와 상세별 Stale 안내

### Cache 보안과 업데이트

- App Shell/Public Asset/School Thumbnail Allowlist 외 Runtime Cache 없음
- Firebase/Callable/Storage/CSV/영업 API Response Service Worker Cache 금지
- 학교 상세 Persistent Cache의 `salesData` Redaction, 영업 Workspace Memory-only 전환, 기존 Persistent Record 정리
- 사용자·역할·`sessionVersion` Namespace와 로그아웃/불일치 시 Search·Detail·Photo·Sales Cache 전체 제거 유지
- 자동 `skipWaiting`, 온라인 복구 자동 Reload 금지
- Waiting Worker 알림의 `나중에`/`업데이트` 선택과 승인된 경우에만 `SKIP_WAITING → controlling → reload`
- 방문 저장 Offline 실패 시 Queue를 만들지 않고 작성 내용과 재시도 안내 유지

## 검증 결과

- TypeScript App·Functions, ESLint: 통과, 경고 0개
- 전체 Vitest: Test File 27개 통과·1개 스킵, Test 89개 통과·3개 스킵
- Phase 14 Cache Allowlist/Metadata/실제 연결성 단위 계약 8건: 통과
- Next.js 16 Webpack Production Build와 Serwist `sw.js` 생성: 통과
- Build Artifact Gate: Service Worker Cache 이름, Manifest, `SKIP_WAITING`, PNG 크기/Signature, Firebase·영업 API 문자열 및 Connectivity 응답 Precache 비포함 확인
- Chromium PWA Gate: Manifest/Icon, Service Worker Control, 온라인 로그인·검색·상세·사진 3장 Warm-up 후 Network Off → Reload → 인증·오프라인 표시 → `온누리고` Search → Cached Detail `07:30~08:10`·사진 3장 확인
- Update Gate: Waiting Worker는 자동 활성화·Reload하지 않고 사용자 `업데이트` Action에서만 전환됨을 확인

## Known Issues

- 실제 Firebase Project, Hosting, 운영 Domain에는 배포하지 않았다. PWA 설치·Service Worker는 HTTPS 또는 localhost에서만 동작한다.
- 장기 오프라인 보안을 위해 마지막 서버 검증 후 24시간이 지나면 다시 온라인 검증이 필요하다.
- 영업 방문 쓰기 Queue와 Persistent Sales Offline Read는 MVP 범위가 아니다. Offline 저장 실패 Draft는 열린 화면에서 유지되며 연결 후 수동 재시도한다.
- `/school-thumbnails/*` Service Worker Route는 안전한 Same-origin Thumbnail Endpoint가 생길 때 사용한다. 현재 Thumbnail Binary는 Callable 응답 자체를 Cache하지 않고 사용자·역할·세션 Namespace IndexedDB에 저장한다.

실제 외부 서비스, Firebase Project, 운영 데이터는 변경하지 않았다.
