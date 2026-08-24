# ADR 0016: 로컬 관측성과 체감 성능 경계

- 상태: Accepted
- 날짜: 2026-08-24

## 배경

급식길은 설치형 PWA로서 저사양 현장 기기와 불안정한 네트워크에서도 앱 셸, 학교 검색, 이전에 본 학교 상세와 사진 Preview를 빠르게 보여야 한다. 그러나 단순한 알고리즘 벤치마크만으로는 인증, JavaScript 평가, React Commit, IndexedDB, Firestore 읽기와 이미지 변환 경로가 합쳐진 실제 체감 지연을 설명할 수 없다. 반대로 학교 ID, 직원 ID, 검색어를 외부 분석 서비스로 전송하면 현장 운영 데이터의 새로운 개인정보·보안 경계가 생긴다.

## 결정

- Next.js `instrumentation-client.ts`에서 Hydration 전에 가벼운 로컬 계측만 시작한다. 외부 분석 SDK와 전송 Endpoint는 추가하지 않는다.
- 계측 항목은 `appBootDuration`, `catalogLoadDuration`, `searchDuration`, `schoolDetailDuration`, `imagePreviewDuration`, Cache Hit/Miss, 기능 영역별 논리 Firestore Read 수, CLS와 Long Task 집계로 제한한다.
- Metric은 이름, 반올림한 Duration, `memory | indexeddb | firestore | network | image-cache` Source와 기록 시각만 가진다. 학교 ID, 직원 ID, UID, 검색어, URL, 문서 경로는 구조적으로 입력할 수 없다. 최근 120개만 메모리에 유지한다.
- 첫 Route는 Auth Application을 Client Dynamic Boundary로 분리한다. 인증 뒤 App Shell, 검색, 학교 상세, 사진, 영업 Workspace, 방문 이력, CSV와 관리자 Console을 사용 시점별 Dynamic Boundary로 나눈다. 모든 Loading Boundary는 기존 화면의 크기를 예약해 Layout Shift를 막는다.
- 학교 검색은 입력 이벤트에서 Memory Index 계산을 동기 완료하고 Query와 Result를 한 번에 반영한다. 입력 중 Firestore·NEIS·Kakao 요청을 만들지 않는다.
- 검색 결과 선택은 학교 문서를 다시 읽기 전에 Memory/IndexedDB 상세 Cache를 확인한다. 상세 Hook은 Memory Cache를 동기 `peek`하여 첫 Render부터 핵심 정보를 표시하고, 이후에 Firestore 최신화를 수행한다.
- 학교 목록 `onSnapshot`은 납품 학교 목록 화면이 실제로 보일 때만 유지한다. 설정, 상세, 영업과 관리자 화면에서는 해당 Listener를 해제한다. 세션 폐기를 감지하는 단일 `authz` Listener는 보안상 예외로 유지한다.
- 영업 상세의 월 배정은 전체 Assignment Collection을 읽고 Client에서 찾지 않는다. `salesCycles/{cycleId}/assignments/{schoolId}` 문서 한 건을 직접 읽는다.
- 사진은 첫 Preview를 우선하고 나머지는 Thumbnail, 확대 시에만 Original을 요청한다. Thumbnail/Preview Cache Source를 계측하고, Blob URL은 세션 정리 경계 안에서만 유지한다.
- Production Build Gate는 Manifest뿐 아니라 실제 초기 HTML의 JavaScript `script`/`preload`를 함께 합산하고, Raw 520KiB, gzip 160KiB, 단일 JavaScript Chunk gzip 90KiB와 필수 Dynamic Boundary 존재를 자동 검증한다. `nomodule` Polyfill은 현대 브라우저 전송량에서 제외한다.
- Browser Gate는 Production Mode Chromium을 4배 CPU 감속한 상태에서 검색 100ms, Cached Detail 200ms, Warm Relaunch 1초, CLS 0.1 미만을 검증한다.

## 결과

- 첫 HTML 이후 최소 앱 UI가 인증·Firestore·업무 기능 전체 Bundle 평가에 가로막히지 않는다.
- Cache Hit와 Firestore Read 변화를 기능 단위로 비교할 수 있지만 운영 데이터나 사용자를 추적하는 새 분석 저장소는 생기지 않는다.
- 상세 Cache가 있으면 온라인 상태에서도 네트워크 완료를 기다리지 않고 즉시 화면을 연다.
- Listener와 Assignment Read가 현재 화면·학교에 맞게 제한되어 배터리, CPU와 Firestore 비용이 함께 줄어든다.
- Dynamic Feature의 최초 진입에는 짧은 Loading Boundary가 나타날 수 있다. 설치형 PWA에서는 Hash Asset이 Precache되고, 모든 Boundary가 실제 콘텐츠 크기를 예약하므로 빈 화면이나 큰 Layout Shift는 만들지 않는다.
- 외부 RUM, 운영 알림과 실사용자 성능 보존은 개인정보·보존 기간·접근 권한 합의가 필요한 별도 운영 결정이다.
