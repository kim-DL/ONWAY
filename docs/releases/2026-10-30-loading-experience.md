# 2026-10-30 로딩·로그인 개선 Hosting 릴리스

사용자가 PR #6의 main 병합과 Firebase Hosting만 운영 배포하도록 명시적으로 승인했다. [PR #6](https://github.com/kim-DL/ONWAY/pull/6)을 병합했고 배포와 운영 확인을 완료했다.

## 소스와 검증

- 병합·배포 소스: `72b243b2fe98faf9d69396225c1fdd5d40b40d32`. 검증한 PR head `f4f4ce9`와 병합 커밋의 전체 파일 tree가 같으며, 기존 제품 소스 `25c1eff`와 실행 코드·의존성·빌드/CI 설정도 동일하다.
- 병합 커밋의 [Quality Gate 40928837270](https://github.com/kim-DL/ONWAY/actions/runs/40928837270) attempt 1: 독립 검사 12개와 최종 verify 모두 SUCCESS. 실패한 job 및 수동 job 재실행은 없다.
- unit 1,826 PASS/기존 15 SKIP, 일반 browser 334 PASS/2 flaky/기존 8 SKIP, Phase 17 browser 83 PASS/기존 18 SKIP, NEIS 3·Rules 50·재고사진 4·transaction 12·납품사진 16 PASS다.
- 내부 flaky 2개는 `welcome-greeting.spec.ts:217`의 mobile/desktop 모션 정지·설정 복원 검사다. 정지 직후와 350ms 뒤 transform 문자열 비교의 첫 실패 후 기존 자동 재시도로 통과했다. 앞선 릴리스에서도 관찰된 검사이며 정확한 최초 실패 원인은 미확정이다. 깨끗한 최초 성공에 합산하지 않았고 assertion·timeout·skip·재시도 정책을 바꾸지 않았다.
- 병합 커밋으로 운영 build·PWA·성능·Hosting gate PASS. 납품사진·재고 ON, Emulator OFF, 기존 비공개 설정을 유지했다. initial JS gzip 143,611B, customer 36,831B, sales 14,334B, inventory 22,961B로 기존 상한을 통과했다.
- 후보 113파일, precache 100개를 고정했고 소스 revision이 서비스 워커에 포함된 것을 확인했다. 배포 전후 후보 파일 digest와 비공개 env 파일 digest가 같다. 비공개 값은 기록하지 않는다.

## 운영 결과

- 실행: `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project onnuriway --only hosting:onnuriway --non-interactive`.
- live version **`0daafb880d5e16f4`**, release **`1793298248156000`**, **2026-10-30 03:24:08.156 KST** (`2026-10-29T18:24:08.156Z`), FINALIZED다.
- 직전 복구 version **`a5bffa3fda8b9f8b`**, release `1792656502986000`을 기록했다. 복구 배포는 실행하지 않았다.
- [운영 주소](https://onnuriway.com)·[Firebase 기본 주소](https://onnuriway.web.app)의 공개 Hosting 검사 각 **25 PASS**, www→apex **301**이다.
- 두 origin의 새 모바일 크기 Chromium에서 로그인 UI 표시, service worker activated, pageerror 0을 확인했다. 공개 worker와 후보 SHA-256 **`1acc10774d34d70c106bdcf24d4d08652e08eb3a65628454a55a4327cb56beb5`**가 일치한다.
- 전체 Functions 72개 metadata fingerprint·revision·updateTime과 MCP 전용 Hosting version `392f487ef50a6a9c` / release `1791529886712000`이 전후 동일하다. 승인한 Hosting만 배포했다. PR의 Functions manifest 의존성 변경은 소스에 포함되지만 운영 Functions 런타임은 갱신하지 않았다. Rules/Auth 배포와 운영 업무 데이터 쓰기도 없다.

## 기록과 확인 범위

제품 코드가 같은 릴리스 문서·HANDOFF·구현 기록만 후속 `[skip ci]` 커밋으로 main에 저장하고 로컬 main·현재 관리 worktree를 동기화한다. 다른 worktree·실험 branch·기존 stash를 보존한다. 동일 제품의 전체 CI나 배포를 반복하지 않는다.

ignored 증거: `output/loading-release-20261030/`. CI 결과, 운영 상태 snapshot, 빌드/gate·배포 로그, 후보 manifest, 전후 공개 브라우저 화면과 비교 결과를 보존했다. [구현·전후 비교](../loading-experience-20261029.md)와 [원본 성능 측정](../loading-experience-20261029-metrics.json)은 별도다.

이번 운영 검증은 공개 페이지와 새 자동 브라우저 세션의 확인이다. 실제 직원 PIN을 사용한 운영 업무·사진 저장 검증, 실제 iPhone/Android 설치 PWA의 OS 실행 화면·장시간 복귀 인수와 구분한다.
