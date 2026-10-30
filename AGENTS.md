<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 급식길 공통 작업 규칙

- 새 작업은 `docs/HANDOFF.md`를 먼저 읽고, 그 문서의 확인된 사실과 미확인 항목을 구분한다.
- 현재 작업 트리는 고객사·재고·Firebase Hosting 변경이 함께 남아 있는 dirty worktree다. 사용자 변경을 보존하고 `git reset --hard`, 광범위한 checkout/clean, 임의 파일 삭제를 하지 않는다.
- `.env.local`, `.env.production.local`, Firebase/Kakao 키, PIN 및 실사용자 개인정보를 출력·문서화·커밋하지 않는다. 공개 환경 변수의 이름과 역할만 문서에 남긴다.
- 프런트엔드는 정적 내보내기 후 Firebase Hosting에 배포된다. Firebase 명령은 항상 프로젝트 `onnuriway`와 배포 대상을 명시하고, 검증 목적으로 운영 데이터를 생성·수정·삭제하지 않는다.
- 민감한 거래처·재고·사진 데이터는 인증된 Callable 경계를 통과한다. 기존 Rules, App Check, revision, request ID, 감사 이력을 우회하는 Client 직접 쓰기를 추가하지 않는다.
- 기능 변경 뒤에는 변경 범위에 맞는 단위 테스트와 `typecheck`/`lint`를 우선 실행한다. 릴리스 전에는 `npm run build`, PWA·성능·Hosting 검증을 수행하고 결과를 `docs/HANDOFF.md`에 갱신한다.

## 검증 순서와 재실행 기준

1. 필요한 수정과 최종 코드 검토를 먼저 마무리하고, 변경 범위에 맞는 로컬 검증을 완료한다. 릴리스 작업은 관련 회귀 테스트와 위의 운영 빌드·PWA·성능·Hosting 검증까지 이 단계에서 확인한다.
2. 전체 CI가 필요한 작업은 로컬 검증을 통과한 최종 커밋을 확정한 뒤 `.github/workflows/ci.yml`의 독립 검사 job들을 병렬로 실행한다. 예상되는 수정이나 확인할 문제가 남아 있는 상태에서 전체 CI를 먼저 시작해 반복 실행하지 않는다. 최종 `verify`는 모든 필수 job의 성공을 확인하며 실패·취소·skip·결과 누락을 통과시키지 않는다.
3. 검증을 통과한 뒤에는 새로운 변경·실제 실패·해소되지 않은 영향 불확실성이 있을 때만 필요한 검증을 추가한다. CI 실패 시 로그와 필요한 재현으로 원인·영향 범위를 먼저 확인하고, 무조건 재실행하지 않는다. 동일 커밋에서 수정 없이 재시도할 근거가 있으면 GitHub Actions의 `Re-run failed jobs` 또는 해당 job 재실행으로 실패한 검사 job과 후속 최종 판정만 다시 실행한다. 이미 성공한 독립 job은 반복하지 않으며, 재실행 단위는 개별 테스트 케이스가 아닌 job 묶음이다.
4. 실패를 해결하기 위해 소스나 CI 구성을 수정했다면 관련 로컬 검증과 검토를 마친 새 커밋으로 필요한 전체 CI를 실행한다. 이전 커밋의 통과 결과를 새 커밋의 검증으로 대체하지 않는다. 문서만 변경되고 실행 결과에 영향이 없는 경우에는 내용·diff 확인으로 검증하고 불필요한 전체 CI를 반복하지 않는다.
5. 병렬화와 재실행 최적화에서도 기존 검사 명령·환경 변수·테스트 선택 조건·assertion·timeout·skip·보안 audit 기준·PWA 및 성능 예산을 유지한다. 대기 시간을 줄이기 위해 검사 기준을 완화하거나 필요한 검증을 생략하지 않는다. 각 job의 준비 단계와 테스트용 산출물 의존성을 명시하고, 같은 빌드 산출물을 검사하는 gate는 해당 빌드와 같은 job에서 순서대로 실행한다. 구성과 재실행 방법은 `docs/ci-parallel-20261021.md`를 따른다.
6. 승인된 운영 배포는 검증된 소스와 빌드로 진행하고, 배포 후 운영 확인과 로컬 저장소 동기화 확인은 유지한다. 검증 결과와 실패·재시도 이력은 릴리스 기록에 구분해 남긴다.

## 문서 안내

- 현재 상태·실행법·남은 작업: `docs/HANDOFF.md`
- 구현 아키텍처: `급식길 PWA 구현 명세서.md`
- Firestore/Storage 데이터 구조: `급식길 PWA 데이터베이스 상세 설계서.md`
- 캐시·PWA·성능 경계: `급식길 PWA 검색·캐시·성능 설계서.md`
- Firebase Hosting/도메인 상태: `docs/phase-45-hosting-migration-status.md`
- 재고 UX·실사 최신 결정: `docs/phase-46-inventory-field-experience.md`부터 `docs/phase-49-inventory-count-mode.md`
- 리팩토링 순서·보존 계약·검증 기준: `docs/superpowers/plans/2026-10-05-onnuriway-refactoring.md`
- 리팩토링 스킬의 실제 설치 범위·버전·프로젝트 적용 제한: `docs/refactoring/skills-review-2026-10-05.md`. 외부 스킬의 일반 조언으로 위 보안·동작·검증 계약을 변경하지 않는다.
