# 변경 범위에 맞는 검증과 릴리스

2026-10-31 사용자가 작은 수정마다 전체 검사로 시간·토큰이 낭비되는 문제를 지적하고 릴리스 규칙 수정을 요청했다. 이 문서와 AGENTS.md가 이전의 항상 전체 검사를 요구하던 운영 방식을 대체한다.

## 기본 원칙

검증 강도는 변경 영향에 비례한다. 로컬에서는 변경 동작과 직접 관련된 검사부터 실행하고, 실제 실패·영향 불확실성·인증/데이터/보안/공유 기반 변경에만 확대한다. 전체 CI와 같은 회귀를 로컬에서 한 번 더 돌리지 않는다. 최종 코드를 확정하기 전에 전체 CI를 먼저 실행하지 않는다.

운영 Hosting 배포에는 운영 형식 build와 PWA·성능·Hosting gate, 배포 후 공개 HTTP·관련 화면 smoke 확인이 필요하다. 같은 소스·설정·파일 해시로 이미 통과한 빌드와 검사 결과는 재사용한다. 문서 후속 커밋 때문에 제품을 재빌드/재배포하지 않는다. 코드나 환경이 달라졌으면 재사용하지 않는다.

## 자동 CI 범위

| 프로필 | 변경 범위 | 실행 |
| --- | --- | --- |
| docs | docs 아래 Markdown 및 저장소 루트 Markdown만 | 의존성 설치 없이 plan 자체 회귀 + 최종 verify |
| presentation | 기존 허용 스타일/이미지, 제한된 테마 선언만 | lint·typecheck·unit·운영 build/PWA/성능 + 모바일/데스크톱 헤더·로그인·로딩 UI 회귀 |
| full | 기능 로직·인증·권한·저장·사진·캐시·서버·Rules·의존성·빌드/CI 설정, 미분류/불확실 변경 | 기존 독립 검사 12개와 최종 verify 유지 |

- presentation 허용 스타일은 auth-loading.css, brand-motion.css, app-shell.css다. 기존 public/brand·ui·icons의 PNG/WebP/JPEG/ICO 교체도 포함한다. 새로운 파일·삭제·이동은 full이다. SVG/JS는 포함하지 않는다.
- layout.tsx는 literal themeColor/colorScheme 선언, app-metadata.ts는 literal themeColor/backgroundColor와 주석, base.css는 color-scheme 선언만 제거했을 때 변경 전후 전체 파일이 같아야 한다. 공용 파일의 다른 코드·앱 식별자·권한 변경을 테마 변경으로 오분류하지 않는다. 관련 app-metadata.test.ts 수정은 허용한다.
- 비문서 파일 12개 초과 또는 문서를 포함한 diff 500줄 초과는 full이다. Markdown만 바뀐 큰 문서 정리는 docs다.
- 일반 기능 변경의 로컬 검사는 관련 기능만 우선한다. 자동 CI에서 기능별 축소는 아직 하지 않는다. 의존관계가 입증되지 않은 경로를 추정으로 면제하지 않고 full을 유지한다. 추후 실제 비용과 영향 범위를 확인한 기능만 별도 allowlist로 추가한다.
- presentation에도 빠른 전체 unit은 유지한다. 시간이 큰 인증·사진 에뮬레이터와 전체 브라우저는 생략한다. UI job은 기존 header-layout/loading-experience 전체 파일을 두 Chromium 프로젝트로 실행하며 assertion·timeout·retry를 변경하지 않는다. Next dev/Java/Firebase emulator를 시작하지 않는다.

## diff와 최종 판정

`scripts/ci-scope.mjs`가 push의 before→검사 HEAD, PR base→검사 merge HEAD 전체를 비교한다. 마지막 커밋만 보는 방식으로 앞선 기능 변경을 놓치지 않는다. checkout은 전체 history를 가져오고 rename 감지를 끄며 NUL로 경로를 분리해 이름에 공백이 있어도 양쪽 경로를 보존한다. base 부재·초기 push·비조상 관계·git 오류는 full이다. 수동 workflow_dispatch는 항상 full로 확대한다.

workflow-level paths-ignore로 실행 자체를 없애지 않는다. plan/verify를 항상 남겨 required check가 영원히 pending이 되는 일을 피한다. 최종 `verify-ci-results.mjs`는 성공한 plan의 프로필과 canonical job 목록을 다시 대조한다. 선택된 job은 success, 제외한 job은 skipped여야 한다. 필수 job skip·실패·취소·누락·알 수 없는 프로필·위조/불완전한 목록은 실패한다. 분류기와 최종 판정 코드를 바꾸면 full로 검증한다.

기존 job은 plan 이후 병렬로 실행하며 실패 작업만 재실행한다. 성공 job의 무조건 반복과 실패를 통과 처리하는 우회는 금지한다. workflow·환경·검사 기준이 바뀌었으면 새 커밋을 검증한다. PR 검사 후 main 검사 생략을 단순 SHA 추정으로 구현하지 않는다. 필요한 최종 main 판정을 유지하며 검증을 위해 불필요한 PR을 추가 생성하지 않는다.

## 로컬 작업과 보고 비용

1. diff와 영향 경계를 확인하고 필요한 검사 목록을 정한다.
2. 작은 UI 작업은 관련 단위·브라우저 검사와 필요한 lint/typecheck만 실행한다. 단순 문구 수정에 의미 없는 새 테스트를 만들지 않는다.
3. 실패하면 해당 원인을 조사하고 영향이 드러난 범위만 확대한다. 이후 동일 커밋의 통과 검사를 습관적으로 반복하지 않는다.
4. 릴리스는 source·환경·빌드 해시를 고정하고 필요한 CI와 Hosting 검증을 연결한다. 앱 코드가 그대로인 CI 규칙 수정만으로 Hosting을 다시 배포하지 않는다.
5. CI 대기 중에는 상태·실패 요약만 조회한다. 전체 로그 반복 출력, 동일 결과를 확인하는 중복 도구 호출, 변화 없는 반복 방송을 피한다.

## 검증 기록

분류기 fixture와 실제 임시 Git 저장소 회귀, 최종 판정 실패 차단 회귀, actionlint와 관련 lint/typecheck, 새 presentation 명령의 실제 실행을 검증한다. 이번 Android 테마 수정의 실제 diff를 재분류해 presentation 선택 여부를 확인한다. CI 자체 변경인 최초 적용은 full을 한 번 실행하고, 이후 문서 후속 커밋으로 docs 경로를 확인한다. 실행 결과와 시간은 HANDOFF에 기록하며, 측정하지 않은 미래 단축 시간을 보장하지 않는다.

참고: [GitHub workflow trigger](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [job 조건·needs·outputs 문법](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).
