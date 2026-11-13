# 거래처 등록용 OpenAI API와 MCP 조사

최초 조사: 2026-11-08. 현황 갱신: 2026-11-14.

사진 입력은 Responses + Structured Outputs와 등록 상호·주소·직원별 줄임말 대조를 사용한다. 조사 이후 MCP 사진 등록 기능과 목록 UI 1.15.2가 운영 반영되어, ChatGPT에 첨부한 명세서·손글씨 사진에서 기존 거래처를 찾아 사용자 승인 후 대상 직원의 내 납품처·오늘 납품처에 추가할 수 있다. 공유 거래처 원장에 신규 업체를 만드는 기능과는 구분한다.

현재 연결 도구의 `preview_delivery_registration` 노출과 별도 MCP worktree의 입력·승인 계약을 확인했다. 운영 배포와 실제 등록 결과는 [MCP 사진 등록 배포 기록](releases/2026-11-08-mcp-delivery-registration.md), [목록 UI 배포·사용자 직접 등록 기록](releases/2026-11-08-mcp-delivery-ui.md)을 따른다. 이번 갱신에서 운영 재배포나 실제 업무 등록을 실행하지 않았다.

## 권장 방향

현장 연속 촬영은 기존 앱을 사용하고, 채팅에 모인 사진은 운영 반영된 MCP 등록 경로를 사용한다. 음성·텍스트 목록 입력은 후속 검토 대상이다. API를 추가하면 인식률이 자동으로 올라간다고 판단할 근거는 없다.

| 기능/API | 급식길에 적용할 용도 | 판단 |
|---|---|---|
| Responses의 이미지 입력 + Structured Outputs | 명세서 수취인·손글씨 목록을 정해진 필드로 추출 | 현재 주력 유지. 구조화는 출력 형식의 보장이며 상호 판독 사실의 보장은 아님 |
| Function calling / MCP 도구 | 첨부 사진의 기존 거래처를 찾아 직원 납품 목록에 추가 | 사진 등록 운영 반영 완료. 미리보기→사용자 카드 승인→서버 저장. 텍스트 목록 직접 등록은 현재 입력 계약에 없음 |
| Audio Transcriptions (`gpt-transcribe`) | “오늘 소은푸드, 푸드원, 자연푸드 추가” 같은 짧은 음성 입력 | 별도 기능으로 검토 가치 높음. 거래처 이름을 keyword 힌트로 제공하고 기존 matcher에 연결. 실제 직원 음성 시험은 아직 없음 |
| Decisions | 문서 종류 분류, 한정된 후보 선택·조건 확인 | 후보 재판단의 이전 시험은 추가 자동 연결 효과가 없었음. 이번 분류 시험도 즉시 도입을 권할 근거는 부족 |
| Embeddings | 비슷한 텍스트 후보 검색 | 후보 추천 보조 용도. 현재 수백 곳 규모의 짧은 고유 상호·줄임말은 등록 별칭/주소 대조가 우선. 유사도만으로 업체 ID를 확정하지 않음 |
| File Search | 업로드한 업무 문서 지식 검색 | 거래처 원본 DB와 별도의 업로드/갱신 관리가 필요해 현재 등록 업무에는 우선순위 낮음 |

Structured Outputs와 function calling은 Responses에서 사용할 수 있는 기능이다. 별도의 ‘거래처 등록 전용 OpenAI API’가 급식길 DB 저장을 대신하는 구조가 아니다. 최종 등록과 권한·중복 검사는 급식길 서버가 수행한다.

## Decisions 문서 분류의 실제 소규모 시험

2026-11-08 당시 Sol이 사진 종류와 내용을 읽고, 명세서이면 Luna로 전용 재판독하는 구성에서 시험했다. Decisions로 종류만 먼저 분류하면 명세서의 첫 전체 판독을 줄일 가능성이 있어 분류 성능만 시험했다. 이전의 거래처 후보 재판단과 다른 용도다. 아래 결과와 API·모델 표기는 당시 실험 기록이며 현재 가격이나 API 제공 상태를 새로 검증한 내용은 아니다.

- 입력: 기존 명세서 5장과 손글씨 목록 1장, 총 6개 원본을 각 3회 사용. 서로 다른 18장으로 해석하지 않는다.
- API: `POST /v1/decisions`, `gpt-6-luna`, 사진 인라인 입력. 질문은 `invoice / customer_list / other` 중 종류 선택 하나다. 실제 상호·주소·등록 정답을 모델에 주지 않았다.
- 종류 선택은 18/18 정답이었다. 명세서 15회는 confidence=1, 손글씨 3회는 선택은 맞았으나 confidence=0.35였다. 후자의 선택 확률은 0.57이었다. 이 confidence는 실제 인식률 35%라는 뜻이 아니다.
- 분류 시간 중앙값 1.001초, 범위 0.713~2.452초. 동일 사진 반복의 캐시 효과가 포함된 로컬→실제 API→로컬 시간이다.
- 사전에 둔 실험용 confidence 0.95 기준은 15/18 통과했다. 이 기준은 운영 데이터로 보정한 기준이 아니다. 손글씨는 매번 후속 처리 또는 기존 방식으로 돌아가야 하는 결과다.
- 실제 입력 토큰 합계 80,820, 이 중 cached 51,360, 출력 토큰 0. 당시 조사에서 확인한 Decisions 입력 단가는 $0.10/100만 토큰이고 출력 토큰 요금은 없었지만, 이 시험에서 실제 청구서를 조회한 것은 아니다. 현재 견적으로 사용하지 않는다.
- 이 시험은 **문서 종류 분류만** 검증했다. 새 구성의 상호 OCR·자동 연결·전체 등록 시간이나 운영 성능이 개선됐다고 평가하지 않는다. 기타 문서/잘린 사진/다양한 필체도 미시험이다.
- 결론: 당장 운영에 추가하지 않는다. 명세서와 손글씨를 섞은 실제 사용 비율에서 전체 흐름을 같은 조건으로 비교해 이득이 확인될 때 검토한다. 손글씨 단일 호출 경로에 분류 단계를 붙이면 시간이 추가될 수 있다.

실행 코드·결과는 Git 제외 `output/customer-registration-research/`의 classifier.ts, classifier.json, summary.json. 기존 키와 프로젝트 설정만 사용했으며 키·권한·운영 배포 설정을 변경하지 않았다.

## 현재 MCP로 가능한 범위

`온누리종합식품 · 새 연결`에 `preview_delivery_registration`이 노출되어 있다. 입력은 명세서·손글씨 사진 파일이며 기본 대상은 연결한 본인이다. 직원 이름을 지정하면 별도 배정 권한을 검사하고, 완전하고 유일한 활성 이름만 자동 확정한다. 동명이인·부분 이름은 카드에서 선택한 뒤 인식한다.

| 작업 | 현재 지원 범위 |
|---|---|
| 사진에서 기존 거래처 연결 | 공급받는 자 상호·주소와 대상 직원의 줄임말로 대조. 명확한 항목은 자동 연결하고 애매한 항목은 카드에서 선택·제외 |
| 내 납품처·오늘 납품처 추가 | 카드에서 사용자 승인 후 두 목록에 함께 추가. 기존 목록·순서·사진을 보존 |
| 직원별 줄임말 기억 | 사용자가 선택한 줄임말을 대상 직원의 기존 별칭 저장소에 저장 |
| 신규 공유 거래처 생성 | 이 MCP 등록 경로에서 지원하지 않음. 연결되지 않은 이름을 임의 생성하지 않음 |
| 텍스트·음성 목록 직접 등록 | 현재 사진 입력 계약에 없음. 별도 구현·검증이 필요한 후속 후보 |

`continue_delivery_registration`과 `commit_delivery_registration`은 카드 전용이다. 모델은 승인 저장 도구를 호출하지 않으며, 본문에 승인 토큰을 노출하지 않는다. 연결된 항목은 저장 완료와 다르다. 서버가 저장 완료를 반환한 뒤에만 등록 완료로 표시한다.

`geupsikgil:delivery.write` 추가 동의와 직원 권한이 필요하다. 타 직원 배정 허용은 조회 허용 명단과 별도다. 저장 시 호출자·대상 직원·OAuth 권한·revision·요청 및 승인 정보를 다시 검사하고 목록·별칭·감사·완료 영수증을 같은 트랜잭션에 기록한다. 기존 Callable·App Check·권한 검사를 끄거나 클라이언트 직접 쓰기로 우회하지 않는다.

## 운영 중인 MCP 사진 등록 흐름

1. ChatGPT에 명세서·손글씨 사진을 첨부하고 “이 사진의 거래처를 내 납품처와 오늘 납품처에 등록해줘”라고 요청한다. 권한이 있는 호출자는 대상 직원 이름도 지정할 수 있다.
2. `preview_delivery_registration`에 사진 파일과 대상 직원을 전달한다. 서버가 사진을 RAM에서 정제하고 기존 Sol/Luna 인식과 공급받는 자 검증·matcher로 미리보기를 만든다. ChatGPT가 읽은 구조화 필드만 받는 방식으로 구현된 것은 아니다.
3. 카드는 한 호출에 최대 2장씩 남은 사진을 이어 처리한다. 전체 최대 20장·100행이며 초과 파일과 실패는 결과에 남기고 앞선 결과를 보존한다. 완료한 추출은 재사용하며 결과가 불명확한 유료 인식을 자동 반복하지 않는다.
4. 사용자가 애매한 거래처·줄임말 기억 여부를 선택한다. 명세서 날짜가 오늘과 다르면 오늘 납품 여부를 별도로 확인한다. 확인하지 않은 항목은 부분 승인 후에도 남긴다.
5. 사용자가 카드에서 승인하면 서버가 최신 상태를 검증해 내 납품처·오늘 납품처에 추가한다. 저장 응답이 불명확하면 같은 승인의 완료 결과를 재확인한다.

등록 원본·EXIF·base64·다운로드 URL·원본 file ID는 Firebase와 감사 로그에 저장하지 않는다. 업무 추출 필드와 hash는 비공개 계획에 보관한다. ChatGPT 첨부 사진의 보관은 Firebase 미저장과 별개의 사항이다. 기존 앱과 MCP는 대상 직원의 같은 별칭 저장소를 사용한다.

## 배포와 실제 확인 범위

- 2026-11-08 17:10 KST: 사진·직원 지정 납품처 등록 1.15.1 배포. 실제 MCP 사진 2장 전달과 13행 중 자동 연결 6·확인 7, 실제 ChatGPT 승인 카드 표시를 확인했다. 이 단계에서는 운영 등록을 실행하지 않았다.
- 2026-11-08 18:55 KST: 목록 UI 1.15.2 배포. 도구 새로 고침 후 실제 ChatGPT에서 목록·크게/작게 보기를 확인했고, 사용자가 직접 13곳 등록을 승인했다고 확인했다. 변경된 개인 납품 목록 2개는 사용자 업무 결과로 보존했다.
- 소스는 별도 `codex/mcp-delivery-batch` worktree에 있다. PWA 작업 브랜치에 MCP 소스가 없다는 이유로 운영 미구현으로 판단하거나 PWA 소스로 MCP를 덮어 배포하지 않는다. 마지막 MCP 배포 기록의 revision은 `employeemcp-00036-wag`이며, 11월 9일 PWA 후속 배포에서도 MCP 유지가 기록되어 있다.
- 실제 휴대전화의 카드 키보드·현장 촬영은 별도 확인 대상이다. 11월 14일 갱신은 소스·연결 도구·기록 대조이며 새 운영 런타임 점검이나 등록 시험은 아니다.

후속 PWA 변경은 [사진별 등록 집계](photo-registration-counts-20261109.md), [경로 추천 저장 확인](route-save-confirmation-20261109.md)을 따른다. 해당 화면 변경을 MCP 카드에도 반영했다고 해석하지 않는다.

## 최초 조사에서 참고한 공식 문서

아래 링크는 2026-11-08 API 조사에 사용한 자료다. 새 API 도입 시 제공 상태·모델·가격을 다시 확인한다.

- [이미지 분석과 엔드포인트 구분](https://developers.openai.com/api/docs/guides/images-vision)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [MCP 도구·인증·승인](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- [Decisions의 고정 선택·조건·점수 및 가격](https://developers.openai.com/api/docs/guides/decisions)
- [파일 음성 인식과 이름/언어 힌트](https://developers.openai.com/api/docs/guides/speech-to-text)
- [GPT Transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe)
- [Embeddings](https://developers.openai.com/api/docs/guides/embeddings)
- [File Search](https://developers.openai.com/api/docs/guides/tools-file-search)

로컬 확인: 현재 PWA의 `functions/src/delivery-planning/planning-providers.ts`, `planning-service.ts`, 거래처 Callable·권한 코드와 기존 Decisions 비교 기록. MCP는 별도 worktree `C:/Users/HOME/.codex/worktrees/mcp-delivery-batch/onnuriway`의 `functions/src/mcp/server.ts`, `delivery-write.ts`, `docs/mcp-delivery-registration.md`를 대조했다. 최신 작업 기준은 [인수인계](HANDOFF.md)이며, MCP 배포 근거는 위 두 릴리스 기록과 [후속 PWA 배포의 MCP 유지 기록](releases/2026-11-08-route-replanning.md)을 따른다.
