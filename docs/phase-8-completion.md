# Phase 8 완료 기록

- 완료일: 2026-08-23
- 기준 문서: 구현 명세서 v1.1, 화면·UX 상세 명세서, 데이터베이스 상세 설계서, 검색·캐시·성능 설계서, 인증·권한·보안 설계서, 테스트·인수 기준서 v1.1, ADR 0008
- 검증 환경: `demo-onnuriway`, Firestore Standard Edition Emulator, Storage/Auth/Functions Emulator, Chromium

## Phase

Phase 8 — Photos

## 구현

### Photo Pipeline

- `preparePhotoUpload`으로 학교·3개 Slot·Expected Revision·파일 선언·Request ID를 검증하고 10분 Upload Session과 UUID Version 생성
- `finalizePhotoUpload`으로 Binary를 서버 경계에 전달하고 Temporary Storage Object를 거쳐 처리
- 서버에서 10MB, JPEG/PNG/WebP MIME, magic bytes, 선언 크기, 최대 40MP 재검증
- Sharp `rotate()`로 EXIF Orientation을 적용하고 Metadata를 계승하지 않는 WebP로 재인코딩
- 400×300 Thumbnail, 최대 1440px Preview, 최대 2560px Original 생성
- 기존 Object를 덮어쓰지 않는 `schools/{schoolId}/photos/{slotId}/{versionId}/{variant}.webp` 경로
- Metadata Revision·현재 Version·Audit를 Firestore Transaction으로 전환하고 충돌 시 해당 요청의 파생본 정리
- Prepare Request ID와 Finalize Session 멱등성, Payload 충돌 거부
- 직원별 UTC 시간당 Upload Prepare 30회 제한, Finalize 1GiB/최대 Instance 4개 제한
- 처리 완료/실패 뒤 Temporary Object 정리

### Gallery, Viewer & Editing

- 첫 Slot Preview를 크게, 2·3 Slot Thumbnail을 보조 카드로 배치한 3 Slot Gallery
- 고정 Slot마다 권장 의미, Caption, Photo Revision, 교체·삭제 Control 표시
- 촬영 또는 파일 선택, PC Drag & Drop, 10MB/MIME Client 사전검증, 개인정보 경고를 포함한 Upload Bottom Sheet
- Dark Glass Fullscreen Viewer, 현재 번호·Caption·좌우 이동·Swipe·Pinch·Double Tap·아래 Swipe·닫기 제공
- Viewer 최초 Preview, 실제 확대 시에만 Original 지연 요청
- 교체 시 새 Version Metadata를 받아 Cache Key 자동 변경
- Soft Delete 직후 7초 Undo Toast를 제공하고 기존 Storage Version으로 복구
- Viewer 역할은 편집 Control을 받지 않고 서버에서도 Upload/Delete/Restore 거부

### Photo Cache & Session

- 사용자·역할·`sessionVersion`·학교·Slot·Version·Variant를 포함하는 Cache Key
- Thumbnail·Preview만 IndexedDB에 최대 24개/36MB 저장하고 오래된 항목부터 제거
- Original은 Memory에서만 사용하며 Persistent Cache 금지
- 동일 Variant 동시 요청을 In-flight Promise로 공유
- Component 해제 시 Object URL 폐기
- 로그아웃·세션 무효화 시 사진 Memory·IndexedDB·Object URL 제거

## Security Impact

- Storage Rules는 모든 Client 직접 읽기·쓰기·삭제를 계속 거부한다.
- 사진 Callable은 App Check, Firebase Auth, 활성 `authz`, Session/Permission Version, Role Scope를 매 요청 재검증한다.
- 다운로드는 활성 Metadata의 현재 Version만 허용해 삭제 사진과 과거 Version 직접 열기를 거부한다.
- 업로드 선언을 신뢰하지 않고 서버에서 크기·MIME·magic bytes·Pixel 한도를 다시 확인한다.
- EXIF를 출력에 계승하지 않고 WebP로 재인코딩한다.
- 실제 학교 사진이나 실제 직원 PIN을 Fixture에 사용하지 않았다.

## Performance Impact

- 학교 상세 진입에서 Original은 요청하지 않는다.
- 큰 첫 카드만 Preview를 사용하고 보조 카드는 Thumbnail을 사용한다.
- 동일 렌더의 중복 Variant 요청은 하나의 Network 요청으로 합친다.
- Version 기반 Cache Key로 교체 후 오래된 Browser Cache가 현재 사진으로 재사용되지 않는다.
- Persistent Cache는 개수와 Byte Budget을 함께 제한하며 Original을 저장하지 않는다.

## 시각 점검 PNG

- `output/playwright/phase8-visuals/01-photo-gallery-desktop.png`
- `output/playwright/phase8-visuals/02-photo-viewer.png`
- `output/playwright/phase8-visuals/03-photo-upload-mobile.png`

세 파일은 Emulator Fixture를 실제 앱이 Callable로 내려받아 렌더링한 Chromium 캡처다. 구현과 분리된 목업이 아니다.

## 검증 결과

- `npm run typecheck` / `npm run lint`: 통과, 경고 0개
- `npm test`: Test File 15개 통과·1개 스킵, Test 56개 통과·3개 스킵
- `npm run test:photo`: Test File 2개, Test 8개 통과
- `npm run test:rules`: Firestore·Storage Rules Test 23개 통과
- `npm run test:photo:emulator`: Revision 4, Version 2개, 파생본 6개, Audit 4개, Temporary Object 0개로 통과
- `npm run test:e2e:phase8`: Chromium E2E·Axe·Touch Target 17개 통과
- `npm run seed:verify`: Auth User 5명, Firestore Document 58개 시드 및 검증
- `npm run functions:build` / `npm run build`: Functions TypeScript와 Next.js Production Build 통과
- `.next/static` 서버 비밀 이름 검색: 노출 0건
- `npm audit --audit-level=high`: High 0개, Critical 0개. Firebase 도구 체인의 전이 의존성 Moderate 10개는 강제 변경 없이 기록
- PNG: Gallery 1048×646, Viewer 1280×720, Mobile Upload 358×688

## Known Issues

- 실제 Firebase Project에 Function·Rules·Storage Object를 배포하지 않았다.
- 만료 Upload Session·Rate Limit 문서·고아 Version의 TTL/Cleanup Job은 실제 Project 배포 Phase에서 구성해야 한다.
- Soft Delete 파일의 보존기간과 관리자 Cleanup UI는 후속 운영 Phase 범위다.
- Callable Base64 방식은 현재 10MB MVP 한도에 맞춘 선택이며 대용량 Resumable Upload는 지원하지 않는다.

실제 Firebase Project, Cloud Functions 배포, Hosting, Secret Manager, Catalog Live Publish는 변경하지 않았다.
