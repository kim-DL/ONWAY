<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

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

## 문서 안내

- 현재 상태·실행법·남은 작업: `docs/HANDOFF.md`
- 구현 아키텍처: `급식길 PWA 구현 명세서.md`
- Firestore/Storage 데이터 구조: `급식길 PWA 데이터베이스 상세 설계서.md`
- 캐시·PWA·성능 경계: `급식길 PWA 검색·캐시·성능 설계서.md`
- Firebase Hosting/도메인 상태: `docs/phase-45-hosting-migration-status.md`
- 재고 UX·실사 최신 결정: `docs/phase-46-inventory-field-experience.md`부터 `docs/phase-49-inventory-count-mode.md`
