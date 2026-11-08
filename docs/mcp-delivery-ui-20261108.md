# MCP 납품처 등록 목록 화면 개선

아래는 2026-11-08 로컬 수정과 검증 단계의 기록이다. 후속 사용자 승인으로1.15.2를 배포하고 실제 ChatGPT에서 확인했다. 최종 상태는 [배포·실제 확인 기록](releases/2026-11-08-mcp-delivery-ui.md)을 따른다.

사용자 목표는 MCP 등록 카드에서 거래처 목록을 넓게 읽고 선택하는 것이다. 실제 구현은 `C:/Users/HOME/.codex/worktrees/mcp-delivery-batch/onnuriway`의 `codex/mcp-delivery-batch` worktree에 있다. 기준 HEAD는 `0f08e74`이며 변경은 커밋하지 않았다. 이 원본 workspace의 PWA를 배포하면 MCP 화면이 갱신되지 않는다.

## 작은 목록 칸을 제거했다

기존 화면은 `main`을 680px 안에 제한하고 그 안에서 헤더와 승인 영역을 먼저 배치했다. 목록만 남은 높이로 줄어들었다. 합성 거래처 15곳을 실제 HTML의 iframe에 넣어 재현했다. 390×800 검증 창의 작은 카드에서 목록318px 안에 확인 카드357px을 넣어 첫 카드 하단 조작이 가려졌다.

작은 inline 카드에서는 제목, 목록, 승인까지 문서 하나로 스크롤한다. 지원 호스트에는 **크게 보기**를 제공한다. Fullscreen에서 공간이 충분하면 목록이 남은 높이를 채우고 승인을 아래에 둔다. 헤더와 승인 영역의 실제 높이를 뺀 목록 공간이 부족하면 문서 스크롤로 돌아간다. 호스트가 확장을 거절하거나 지원하지 않아도 목록과 승인을 끝까지 사용할 수 있다.

확인할 거래처를 앞에 표시한다. 자동 연결된 이름과 주소는 접힌 요약을 열지 않아도 보인다. 후보의 상호와 주소를 분리했고 기억과 제외 옵션을 한 줄에 묶되 좁은 폭에서는 줄을 바꾼다. 기존 색상과 44px 조작 높이를 유지한다.

같은 1200×900 검증 창에서 큰 화면의 목록 높이는450.5px에서624.5px로 늘었다. 자동 연결15곳의 390×800 화면에서는 기존 닫힌30px 요약 대신524.5px 목록을 사용한다. 이 수치는 로컬 호스트 시뮬레이터의 레이아웃 관측값이다. 실제 ChatGPT의 고정 크기나 휴대전화 키보드 결과를 뜻하지 않는다.

## 화면 전환은 업무 상태를 바꾸지 않는다

기존 summary, `rowId`, 선택 map, 날짜 확인과 승인 attempt를 유지했다. 표준 MCP Apps 브리지와 OpenAI 호환 브리지는 같은 표시 상태를 사용한다. 모드 변경, 창 크기 변경과 safe area 변경은 새 거래처 분석으로 처리하지 않는다.

독립 검토에서 후속 등록 응답 뒤 환경 이벤트가 초기 globals 결과를 다시 표시하는 결함을 찾았다. 실제 Chromium과 WebKit에서 다음 결과를 재현했다.

```text
Expected: "등록을 완료했어요."
Received: "아직 저장하지 않았어요."
```

현재 화면 결과와 마지막으로 소비한 globals 결과의 key를 나눠 수정했다. 같은 초기 globals를 동반한 환경 이벤트가 최신 완료 결과를 덮지 않는다. 검색어, 연결 선택, 줄임말 기억, 확인 체크와 불확실한 승인 결과의 정확한 재시도를 보존한다.

새 카드 URI는 `delivery-registration-v2.html`이다. 기존 v1 URI도 같은 HTML과 매번 재인증하는 경계를 제공한다. 데이터 도구, 승인 payload, OAuth scope와 Firestore 쓰기는 바꾸지 않았다.

## 검증과 남은 확인

- 실제 위젯 HTML의 격리 브라우저 시험18개를 Chromium과 WebKit에서 통과했다. 신뢰된 승인, XSS 텍스트 처리, 확정 오류 후 편집, 불확실한 결과의 동일 재시도, 처리 중 무폴링을 포함한다.
- 15곳과 최대100행, 긴 이름, 확장과 복귀, 모드 거절, 높이 축소, 하단 안전 영역, 호스트 자동 높이 추종의 안정화와 오래된 globals 회귀를 검증했다.
- 실제 SDK HTTP 시험14개를 통과했다. v2와 v1을 읽고 인증 폐기 후 두 URI가 모두 거절되는 시험을 포함한다.
- Functions build, 변경4파일 ESLint, 브라우저 시험 파일 strict TypeScript 검사와 `git diff --check`를 통과했다.
- 로컬 화면 시나리오18개에서 페이지 오류0개와 외부 네트워크 요청0개를 관측했다. 생산 데이터·자격 증명·환경·Hosting은 변경하지 않았다.

최초 자동 높이 추종 시험은 WebKit의 정당한 초기 재배치 전에 알림 수를 비교해1→2를 실패로 판정했다. 글꼴 준비와 두 프레임의 재배치가 끝난 뒤 안정 구간을 비교하도록 시험을 수정했다. 애플리케이션에 지연이나 재시도는 추가하지 않았다. 최종 브라우저18개가 통과한 결과와 이 시험 수정 이력을 구분한다.

별도로 기존 HTTP 시험 전체에 strict TypeScript 옵션을 확장했을 때 SDK 응답 `content`의 기존 타입 진단이 나왔다. 기준 HEAD의 원본 시험도 같은 진단을 냈다. 이번 Functions build와 브라우저 시험 파일의 strict 검사는 통과했다. 기존 HTTP 시험 전체의 타입 문제는 이 화면 변경에 포함하지 않았다.

운영 배포와 실제 ChatGPT에서 새 UI의 확장, 휴대전화 실물 키보드 동작은 아직 검증하지 않았다. 이번 요청은 로컬 UI 개선 범위다. 후속 승인으로 배포할 때는 이 worktree의 `employeeMcp`만 후보를 동결해 검증하며 PWA Hosting을 함께 배포하지 않는다.

## 근거 파일

- [수정 전 작은 카드](../output/playwright/mcp-delivery-ui/before-mobile.png).
- [수정 후 큰 화면](../output/playwright/mcp-delivery-ui/current-mixed-fullscreen-1200x900.png).
- [수정 후 자동 연결 목록](../output/playwright/mcp-delivery-ui/current-matched-fullscreen-390x800.png).
- [레이아웃 원시 관측](../output/playwright/mcp-delivery-ui/observations.json).
- [재실행 가능한 로컬 호스트](../output/playwright/mcp-delivery-ui/preview.mts)와 [관측 스크립트](../output/playwright/mcp-delivery-ui/observe.js).
- [A안](../output/playwright/mcp-delivery-ui/design-a.md), [B안](../output/playwright/mcp-delivery-ui/design-b.md), [설계 판정](../output/playwright/mcp-delivery-ui/design-judge.md)과 [최종 검토](../output/playwright/mcp-delivery-ui/review.md).
- MCP worktree의 `output/mcp-ui-stale-before.log`, `output/mcp-ui-browser-final.log`, `output/mcp-ui-http.log`.

표시 상태와 승인 상태를 구분한 선택은 Model the Domain을 따랐다. 목록 공간을 우선한 선택은 Experience First, 고정 상한과 중첩 스크롤을 제거한 선택은 Fix Root Causes를 따랐다. 실제 HTML과 브라우저 회귀를 실행한 것은 Prove It Works를 따랐다. 두 설계와 최종 검토자는 모두 부모와 같은 모델을 상속했다.

[OpenAI 화면 확장 문서](https://developers.openai.com/apps-sdk/reference#request-another-presentation-mode)와 기존 `photo-view.ts`의 표준·호환 브리지 선례를 확인했다. [큰 화면 설계 지침](https://developers.openai.com/apps-sdk/build/chatgpt-ui#fullscreen)에 따라 호스트의 사용 가능 크기를 존중한다.
