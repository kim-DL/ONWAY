<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 급식길 작업 원칙

- 시작할 때 `docs/HANDOFF.md`와 Git 상태를 확인한다. 사용자 변경·다른 worktree를 보존하고, 임의 reset/clean·파일 삭제를 하지 않는다.
- 요청 범위의 안전한 로컬 작업은 반복 승인 없이 수정·검토·관련 검증까지 마친다. 불필요한 리팩터링·의존성 추가·설정 변경은 하지 않는다.
- 비밀 키·환경 파일·PIN·실사용자 정보를 출력하거나 커밋하지 않는다. 운영 데이터를 시험용으로 생성·수정·삭제하지 않는다.
- Callable·App Check·권한·revision·request ID·감사 이력·사진 보관·서버 확인 후 완료 계약을 유지한다. Client 직접 쓰기로 우회하지 않는다.

# 효율적인 검증과 릴리스

1. **수정 → 코드 검토 → 관련 로컬 검사 → 최종 커밋 → 필요한 CI** 순서로 진행한다. 작은 UI/문구 변경에 전체 회귀를 먼저 돌리지 않는다.
2. [검사 범위 규칙](docs/scoped-verification-20261031.md)을 따른다. 문서는 내용/diff, 표현 변경은 관련 단위·화면, 기능 변경은 관련 회귀부터 확인한다. 인증·데이터·보안·공유 기반·CI 변경이나 실패·영향 불확실성에만 확대한다.
3. CI는 `docs`/`presentation`/`full`을 자동 선택한다. 선택된 검사의 실패·취소·skip·누락은 통과가 아니다. 기준 코드가 미검증/실패 상태라면 축소 CI 성공만으로 배포하지 말고 누적 영향에 필요한 검사를 완료한다.
4. 같은 소스·환경·산출물의 통과 결과는 재사용한다. 수정 없는 재시도는 근거가 있을 때 실패 job만 실행한다. 로컬/CI의 전체 회귀 중복, 반복 빌드, 전체 로그 반복 조회를 피한다.
5. 운영 배포는 명시적 승인 범위만 수행한다. Hosting은 검증된 운영 build와 PWA·성능·Hosting gate를 사용하고 `--project onnuriway --only hosting:onnuriway`를 명시한다. 문서/CI만 바뀌면 앱을 재배포하지 않는다.
6. 배포 후 두 운영 주소와 관련 화면, Git 동기화를 확인한다. `docs/HANDOFF.md`에 변경·검증·미확인 항목을 짧게 남기고 상세 증거는 별도 기록한다. 실제 기기와 에뮬레이션 결과를 구분한다.
