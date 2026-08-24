# Phase 16 완료 기록

- 완료일: 2026-08-24
- 기준 문서: 구현 명세서, 검색·캐시·성능 설계서, 화면·UX 상세 명세서, 테스트·인수 기준서, ADR 0016
- 검증 환경: `demo-onnuriway`, Auth/Firestore/Functions/Storage Emulator, Production Mode Chromium 4× CPU Throttling, Node.js 22.23.2, Next.js 16.3.2

## Phase

Phase 16 — Performance Hardening

## 구현

### 개인정보 없는 성능 관측

- Next.js `instrumentation-client.ts` 기반 Hydration 이전 Boot Mark
- 앱 부팅, Catalog, 검색, 상세, Image Preview Duration의 Source 포함 Metric
- Memory·IndexedDB·Image Cache Hit/Miss와 Auth/Shell/Search/Detail/Sales/History 논리 Firestore Read 집계
- CLS·Long Task 집계, 최근 120개 상한, 학교·직원·UID·검색어·URL·문서 경로 수집 금지
- Browser에서 로컬 Snapshot/Clear만 가능한 `window.__ONNURIWAY_PERFORMANCE__` 진단 경계

### 부팅과 Bundle

- Auth Application을 첫 Route에서 Client Dynamic Import하고 접근 가능한 즉시 Boot Fallback 제공
- 인증 뒤 App Shell, Search, School Detail, Photo Gallery, Sales Workspace, Sales History, Visit Sheet, CSV, Admin Console을 12개 Dynamic Boundary로 분리
- 사용하지 않는 Firebase Storage Client 초기화 제거; 사진은 기존 서버 Callable 경계 유지
- Loading UI가 실제 화면 높이를 예약해 Lazy Chunk 전환 중 빈 화면과 Layout Shift 방지

### 검색·상세 체감 경로

- 검색 입력 Event 안에서 Memory Index 계산 후 Query·Result를 Batch 반영
- Direct Match를 먼저 정렬하고 결과가 충분할 때 고비용 Fuzzy Pass 생략
- 5,000개 합성 Catalog p95 Gate와 500/5,000개 단위 성능 계약
- 검색 선택 시 Firestore 학교 Read보다 Memory/IndexedDB 상세 Cache 우선
- 상세 Memory Cache 동기 `peek`로 첫 Render에 Core Field Brief 표시, IndexedDB 뒤 Background Firestore Refresh
- 검색 Dialog는 최초 요청 뒤 App Session 동안 Mount를 유지해 Catalog와 Memory Index 재생성 방지

### 읽기·Listener·이미지

- 납품 학교 목록 Listener는 해당 화면이 실제 활성일 때만 구독하고 상세·설정·영업에서 해제
- 영업 학교 상세 Assignment를 월 전체 Collection Read에서 학교 ID Document 1건 Direct Read로 축소
- Photo Variant 결과에 Memory/IndexedDB/Network Source를 보존하고 Preview Cache 성능 계측
- 첫 Photo Preview Eager/High Priority, 보조 Thumbnail Lazy, Original은 확대할 때만 요청
- 대표 Preview가 준비된 뒤 보조 Thumbnail Callable을 시작해 최초 연결 시 3개 사진 요청이 경쟁하지 않도록 제한
- Native Private Blob Image에 명시적 Dimension·Async Decode를 적용하고 고정 Container로 CLS 방지

## 정량 결과

- 초기 JavaScript Raw: 1,291,788B → 465,639B, 64.0% 감소
- 초기 JavaScript gzip: 381,220B → 138,274B, 63.7% 감소
- 최대 JavaScript Chunk gzip: 66,841B / Gate 92,160B
- Dynamic Boundary: 12개
- 5,000개 Catalog Index 구성: 112.66ms
- 5,000개 Catalog 검색 p95: 1.24ms, 최대 4.86ms, 입력 중 Network Request 0
- Production Chromium 4× CPU: 검색 최대 1.0ms, Cached Detail 0.2ms, Warm Relaunch 803.6ms, CLS 0
- 첫 Image Preview Network 경로: 3,533.9ms, 재진입 Image Cache Preview: 5.2ms / Gate 200ms

## 검증 결과

- App·Functions TypeScript와 ESLint 경고 0개: 통과
- Phase 16 성능 단위/마이크로벤치: 통과
- Next.js 16 Webpack Production Build와 Phase 14 PWA Artifact Gate: 통과
- 초기 Bundle Raw/gzip, 최대 Chunk, 필수 Dynamic Boundary 자동 Gate: 통과
- Production Mode Chromium 4× CPU에서 Search 100ms, Cached Detail 200ms, Warm Relaunch 1초, CLS 0.1 기준: 통과
- 검색 입력 중 Firestore·Google APIs·NEIS·Kakao Network 0: 통과
- Memory/IndexedDB Detail과 Image Cache Hit, Firestore Read 집계, Metric PII 부재: 통과
- 전체 단위 테스트 96개 통과·3개 명시적 Skip, Firestore/Storage Rules 23개 통과
- 영업 방문 핵심 E2E 3개와 Phase 16 저사양 성능 E2E 1개 통과
- `npm audit --audit-level=high`: High/Critical 0건. Firebase CLI/Admin 개발 도구 전이 의존성 Moderate 10건은 강제 수정 시 Firebase CLI 하위 메이저로 변경되므로 적용하지 않음

## 운영 메모

- `.next/diagnostics/phase16-performance.json`은 Production Build의 실제 초기 HTML `script`/`preload`와 Client Manifest를 함께 검사한 Asset·Boundary 측정 결과다.
- `npm run test:performance`는 단위 계약과 5,000개 Catalog Microbenchmark를 실행한다.
- `npm run verify:performance:build`는 Production Build Artifact 예산을 검증한다.
- `npm run test:e2e:phase16`은 Emulator를 Seed하고 Production PWA를 Build한 뒤 Chromium 4× CPU Gate를 실행한다.
- 운영 RUM 전송은 구현하지 않았다. 도입하려면 개인정보 항목, 보존 기간, 접근 권한과 Alert 기준을 별도 승인해야 한다.

실제 외부 서비스, Firebase Project, 운영 데이터는 변경하지 않았다.
