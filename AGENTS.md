<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 급식길 작업 원칙

- 시작할 때 `docs/HANDOFF.md`와 Git 상태를 확인한다. 사용자 변경·다른 worktree를 보존하고, 임의 reset/clean·파일 삭제를 하지 않는다.
- 요청 범위의 안전한 로컬 작업은 반복 승인 없이 수정·검토까지 마친다. 불필요한 리팩터링·의존성 추가·설정 변경은 하지 않는다.
- 비밀 키·환경 파일·PIN·실사용자 정보를 출력하거나 커밋하지 않는다. 운영 데이터를 시험용으로 생성·수정·삭제하지 않는다.
- Callable·App Check·권한·revision·request ID·감사 이력·사진 보관·서버 확인 후 완료 계약을 유지한다. Client 직접 쓰기로 우회하지 않는다.

# 운영 배포

- 운영 배포는 명시적 승인 범위만 수행한다. Hosting 배포에는 `--project onnuriway --only hosting:onnuriway`를 명시한다.
- 문서/CI만 바뀌면 앱을 재배포하지 않는다.
