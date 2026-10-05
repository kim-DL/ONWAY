# 급식길 리팩토링 스킬 선정·설치 기록

조사일: **2026-10-05 KST**. `clouad`는 Claude/Anthropic으로 해석했다. 공식 GitHub 저장소의 현재 tree, 원문, 커밋 이력과 공개 설치 지표를 확인했다. “최신”은 조사 시점에 조회한 배포 snapshot을 뜻하며, 저장소 갱신일과 개별 스킬 갱신일을 구분한다.

## 선정 결과

**6개 스킬, 112개 파일을 현재 클라우드 사용자 환경 `/home/agent/.agents/skills/`에 설치했다.** 기존 설치를 덮어쓰지 않았으며 원문·참조 문서·제공되는 라이선스를 함께 복사했다. 설치 과정에서 외부 installer, plugin hook, 스킬의 보조 스크립트를 실행하지 않았다.

앱 소스와 ESLint 검사 대상에 외부 예제 코드를 섞지 않기 위해 사용자 스킬 경로를 사용했다. 사용자 PC의 Codex 설치나 다른 클라우드 환경까지 설치한 것은 아니다. 원본 URL·고정 commit·112개 파일의 SHA-256과 크기는 [skills-lock.json](skills-lock.json)에 기록했다. 모든 설치 파일의 해시와 `SKILL.md`의 이름/frontmatter를 대조했다.

현재 채팅의 executor 스킬 목록 API는 빈 목록을 반환했다. 따라서 **파일 설치는 검증됐지만 자동 목록 반영은 확인되지 않았다.** 현재 작업은 파일을 직접 읽어 적용한다. 다음 세션에서도 목록에 없으면 이 문서의 설치 경로에서 직접 읽으면 되며, 자동 활성화됐다고 가정하지 않는다.

| 설치 이름 | 원작자 / 배포 출처 | 채택 이유 | 적용 범위 |
| --- | --- | --- | --- |
| `writing-plans` | Jesse Vincent(obra) / OpenAI 공식 plugins 카탈로그 | 파일·책임·검증 단위가 구체적인 실행 계획 | 이번 계획 작성 |
| `systematic-debugging` | 위와 동일 | 실패 재현 → 원인 추적 → 최소 수정 | 기준선/회귀 실패가 생겼을 때 |
| `verification-before-completion` | 위와 동일 | 실제 검증 결과에 근거한 완료 판정 | 각 작업 종료와 통합 검증 |
| `vercel-react-best-practices` | Vercel 공식 | React effect·구독·요청·번들 경계 검토 | 클라이언트 성능과 상태 분리 |
| `vercel-composition-patterns` | Vercel 공식 | 큰 컴포넌트의 책임·상태 소유권 분리 | 관리자/재고/학교 화면 |
| `firebase-security-rules-auditor` | Firebase 공식 | 소유권·권한 상승·읽기/쓰기 경계 점검 | Rules 계약을 보존하는 보조 감사 |

Superpowers는 **OpenAI 제작 스킬이 아니다.** OpenAI 공식 카탈로그가 배포하는 외부 제작물이며, MIT·version 6.3.0·author Jesse Vincent는 [공식 plugin manifest](https://github.com/openai/plugins/blob/5fd93af4cd0c623e020d0cc7e9ce178b4ac1f70f/plugins/superpowers/.codex-plugin/plugin.json)에서 확인했다.

## 공식 3사 우선 검토

| 제공자 | 실제 검토 대상 | 판단 |
| --- | --- | --- |
| OpenAI | [openai/skills](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431), [openai/plugins](https://github.com/openai/plugins/tree/5fd93af4cd0c623e020d0cc7e9ce178b4ac1f70f) | 범용 리팩토링 전용 자체 제작 SKILL은 이번 tree에서 미발견. 카탈로그에 수록된 Superpowers 3개 채택 |
| Claude / Anthropic | [code-simplifier](https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/code-simplifier/agents/code-simplifier.md), [code-modernization](https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/code-modernization/README.md), [webapp-testing](https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/webapp-testing/SKILL.md) | 앞의 두 개는 Claude Code agent/commands/hooks 플러그인으로 Codex native SKILL 형식이 아님. 동작 보존·업무규칙 추출·독립 검증 원칙을 참고. Python Playwright 스킬은 기존 Node 테스트와 중복돼 제외 |
| Grok / xAI | [공식 marketplace](https://github.com/xai-org/plugin-marketplace/blob/77a16ec85ded1c3b133f686bd2e1bea36090e124/.grok-plugin/marketplace.json), [grok-build](https://github.com/xai-org/grok-build/tree/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8), [공식 문서](https://docs.x.ai/build/features/skills-plugins-marketplaces) | marketplace 30개 항목, vendored SKILL 3개(외부 Neon), grok-build tree와 관련 문서에서 xAI 자체 제작 범용 리팩토링 SKILL 미발견. 외부 Superpowers 등록을 xAI 원작으로 오인하지 않음 |

Anthropic `code-modernization` README 마지막 변경은 **2026-09-26 KST**, `code-simplifier`는 **2026-01-09 KST**다. 최신 플러그인이라는 이유만으로 Claude 전용 명령·모델·대규모 agent workflow를 Codex에 이식하지 않았다. xAI 전체 비공개/미검색 자산에 스킬이 없다는 단정은 하지 않는다.

OpenAI의 `playwright`는 브라우저 CLI 조작용이고 기존 `@playwright/test` suite 대체물이 아니다. `security-best-practices`는 명시 보안 검토에 사용하는 조건부 스킬이며, `gh-fix-ci`는 실제 PR/CI 실패가 있을 때 추가할 후보라 이번 기본 설치에서 제외했다.

## 고정 버전과 공개 평판 근거

| 설치 묶음 | 고정 배포 commit | 개별 스킬 최신성 | 라이선스 |
| --- | --- | --- | --- |
| OpenAI 배포 Superpowers 3개 | `5fd93af4cd0c623e020d0cc7e9ce178b4ac1f70f` | 세 SKILL 마지막 변경 `33bd952...`, 2026-08-27 KST. 저장소 HEAD는 2026-09-29 KST | MIT, 전문 보존 |
| [Vercel React](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices) / [Composition](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/composition-patterns) | `063bee94c3f4df8453406c830b0a7df0f2860278` | 디렉터리 이력의 원본 UTC 날짜: React 2026-04-14, composition 2026-01-28 | SKILL/README의 MIT 선언. upstream에 독립 LICENSE 파일은 없음 |
| [Firebase auditor](https://github.com/firebase/agent-skills/tree/de359da26586e4fad59b7ebab7592aa137c49b8a/skills/firebase-security-rules-auditor) | `de359da26586e4fad59b7ebab7592aa137c49b8a` | 디렉터리 이력의 원본 UTC 날짜: 2026-09-17 | Apache-2.0, 전문 보존 |

공개 보급 지표도 함께 검토했다. 조회 시 skills.sh 표시 설치 수는 [React 770.6K](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices), [composition 373.8K](https://skills.sh/vercel-labs/agent-skills/vercel-composition-patterns), [Firebase auditor 127.6K](https://skills.sh/firebase/agent-skills/firebase-security-rules-auditor), [systematic-debugging 282.2K](https://skills.sh/obra/superpowers/systematic-debugging), [verification 230.1K](https://skills.sh/obra/superpowers/verification-before-completion)였다. Superpowers 수치는 upstream 페이지의 지표이며 설치한 OpenAI snapshot 자체의 지표는 아니다.

**설치 수·GitHub stars·보안 배지는 사용 후기나 프로젝트 품질 보증이 아니다.** 신뢰할 수 있는 독립 사용자 후기 원문은 확보하지 못했다. 따라서 공식 출처, 실제 내용, 유지보수 이력, Codex 호환성과 급식길 적합성을 우선했고 “후기가 좋다”고 단정하지 않았다. 다운로드한 전체 참조 예제의 실행 품질을 검증한 것도 아니다.

## 최신 Next.js 지침

[Vercel 공식 next-skills README](https://github.com/vercel-labs/next-skills/blob/c522619e45aa3492fd2bfc916b308b275eff7798/README.md)는 Next 16.3부터 `next-best-practices`가 별도 스킬이 아니며 `next/dist/docs/`와 생성된 AGENTS.md로 대체됐다고 명시한다. 급식길은 **Next 16.3.8**이므로 설치된 `node_modules/next/dist/docs/`를 우선 읽는다. 기존 연결된 Next.js 스킬의 일반 가이드가 이 버전 문서에 우선하지 않는다.

## 프로젝트 적용 제한

외부 스킬은 사용자 요구, 상위 Codex 지시, 급식길의 검증된 계약에 종속되는 참고 지침이다. 이번 사용자는 준비 작업을 전면 위임했으므로 단순 실행 방식 선택을 다시 묻지 않는다.

- `writing-plans`의 계획·검증 원칙을 적용한다. 외부 execution subskill의 자동 설치 연쇄, 별도 워크플로 선택 질문, 자동 commit/push는 도입하지 않는다. 기본 제공 Codex 병렬 agent로 분석·독립 검토하고 실제 변경은 계획의 의존 순서대로 진행한다.
- `systematic-debugging`의 env 출력 예시로 비밀값을 출력하지 않는다. `find-polluter.sh`는 테스트 실패를 무시할 수 있으므로 PASS 판정에 사용하지 않는다. 이번에는 실행하지 않았다.
- `verification-before-completion`은 새 증거 없이 성공을 주장하지 않는 원칙으로 사용한다. 코드나 위험이 달라지지 않았는데 같은 검사를 매 메시지마다 반복하지 않는다.
- Vercel 스킬을 근거로 SWR/새 상태관리, Server Actions/SSR, 서버 캐시, `useContext`/`forwardRef` 일괄 치환을 도입하지 않는다. static export, Firebase Callable, 기존 React 계약과 실제 측정이 기준이다.
- Firebase auditor 점수는 보안 증명이 아니다. Admin SDK는 Rules를 우회하므로 Callable/transaction 인가 테스트가 별도로 필요하다. Rules 생성·완화·배포 권한을 부여하는 스킬로 사용하지 않는다.
- `test-driven-development`는 기존 코드 삭제 재작성과 무조건 실패 테스트를 요구하는 부분이 있어 보류했다. 기존 행동을 고정하는 테스트 후 작은 리팩토링을 수행한다. 실제 버그는 재현 테스트와 수정 전후 증거를 남긴다.
- Firebase provisioning/Auth/Rules-authoring 전체 스킬은 기본 설치하지 않았다. 기존 앱의 읽기/쓰기 정책이나 배포 설정을 바꾸는 지침이 이번 준비 목적에 불필요하다.

## 설치 확인과 재설치

다음 코드는 네트워크 없이 현재 사용자 경로의 설치 파일을 확인한다.

```sh
python - <<'PY'
from pathlib import Path
import hashlib, json
lock = json.loads(Path('docs/refactoring/skills-lock.json').read_text())
for skill in lock['skills']:
    root = Path(skill['installedPath']).expanduser()
    for entry in skill['files']:
        data = (root / entry['path']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == entry['sha256']
    print(skill['name'], 'verified')
PY
```

환경을 교체하면 잠금 파일의 `sourceUrl`에서 **같은 commit의 파일만** 내려받아 SHA-256을 확인한 후 각 `installedPath`에 복사한다. `main`/`latest`로 바꾸지 않는다. 기존 경로가 있으면 먼저 비교하고 사용자 스킬을 덮어쓰지 않는다. 최신 스킬 갱신은 새 원문·호환성 검토 후 manifest를 함께 갱신한다.
