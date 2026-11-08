# MCP 사진·직원 지정 납품처 등록 배포

2026-11-08 17:10 KST에 최종 `employeeMcp` 1.15.1을 반영했다. 소스는 `codex/mcp-delivery-batch`의 `831b23a2a32a6b33b732dfdd79b0c2711408610e`이다. 최초 기능 후보 `62cbeea`를 배포한 뒤 실제 첨부에서 발견한 파일 호스트 차이를 수정했고, 17:16 KST까지 실제 ChatGPT 카드와 보존 검증을 마쳤다. 준비·승인·저장을 분리하여 사진과 직원 이름으로 해당 직원의 내 납품처·오늘 납품처에 추가한다. 확인하지 않은 상호와 처리 실패는 남기며, 기존 목록·순서·사진과 직원별 줄임말을 보존한다.

## 결과와 사용

ChatGPT의 온누리종합식품 앱에서 사진을 첨부하고 다음과 같이 요청한다.

> 이 사진의 거래처를 김하늘 직원의 내 납품처와 오늘 납품처에 등록해줘.

이름을 생략하면 연결한 본인이 대상이다. 활성 직원의 정확하고 유일한 이름만 확정한다. 동명이인·부분 이름은 인식 전에 선택한다. 명확한 거래처는 자동 선택하며, 애매한 항목만 연결하거나 제외한다. 줄임말 기억을 선택하면 대상 직원의 기존 별칭 저장소에 추가한다. 승인 카드에서 직접 확인한 뒤 서버가 완료를 반환해야 등록된 것으로 표시한다.

입력은 최대20장·전체100행이다. 한 요청에서2장씩 이어 처리한다. 초과 파일은 실패로 표시하고 완료한 결과는 유지한다. 재시도·부분 승인·만료·후처리 실패에서도 완료한 추출은 재사용한다. 결과가 불명확한 유료 인식은 자동 반복하지 않는다.

`Model the Domain`에 따라 호출자와 목록 소유자를 분리했다. `Make Operations Idempotent`에 따라 목록·별칭·감사·완료 receipt를 같은 트랜잭션에 기록했다. `Laziness Protocol`에 따라 운영 MCP 기반과 기존 Sol/Luna·공급받는 자 검증·matcher를 재사용했다. `Prove It Works`에 따라 로컬 프로토콜, 실제 API와 운영 호스트 관측을 구분했다.

## 운영 반영 증거

- 최종 revision은 `employeemcp-00035-buy`이며, Cloud Run 준비 완료와 트래픽100%를 확인했다.
- 업로드된 소스 아카이브의 source/assets/설정130개 파일은 최종 후보 manifest와 모두 일치했다. 비밀 값 파일은 없고, 포함된 dotenv는 검토한 업로드 설정이다. 마지막 호스트 설정은 런타임 환경만 갱신했으며 실제 환경9개가 최신 로컬 후보와 일치함을 별도로 확인했다. 원본 소스 아카이브 바이트는 동일하고 backend build 메타데이터는 갱신됐다.
- 새 도구3개를 더해 MCP 전체22개다. 준비 도구1개는 모델과 카드, 계속·승인2개는 카드 전용이다. ChatGPT에서 도구 새로 고침 후 Write5·Read17을 관측했다.
- 기존 인증 연결의 거래처 검색이 성공했다. HTTPS·OAuth discovery·PKCE·401·Origin 거절·no-store 공개 검사도 통과했다.
- 변경된 함수는 `employeeMcp` 하나다. 다른81개 함수와 PWA·MCP Hosting release는 동일하다. PWA Hosting은 `27f3bd0902c9d2c1`이다. 이 배포는 PWA 업데이트 팝업을 발생시키는 Hosting 변경이 아니다.
- 기존 업무 문서823개와 별칭7개 해시가 배포 전후 모두 동일했다. 업무 문서는 상품92·lot89·입출고240·거래처223·사진159·개인 목록3·일별 목록17개다. 운영 업무 목록에 시험용 저장은 하지 않았다.

기존 PIN·OAuth family 계약을 유지하고 `geupsikgil:delivery.write` 추가 동의를 사용한다. 권한 추가 시 기존 scope와 합집합을 요청한다. 타 직원 배정 권한은 현재 단일 허용 호출자를 별도 서버 설정에 고정했다. 조회 허용 명단 확대가 자동으로 배정 권한을 늘리지 않는다. Secret Manager의 기존 OpenAI·Kakao 비밀을 MCP runtime에 연결했으며 키 값은 변경하지 않았다.

등록 사진은 RAM에서 정제·분석한다. 원본·EXIF·base64·download URL·원본 file ID를 Firebase와 감사 로그에 저장하지 않는다. private 계획은 업무 추출 필드와 hash를 보관한다. 정확한 HTTPS 파일 호스트, DNS 고정·사설 IP 차단·redirect 거절과20MB·40M픽셀 한도를 적용했다. 검토한 기능·권한 계약은 별도 worktree의 `docs/mcp-delivery-registration.md`에 있다.

## 검증과 초기 실패

- 최초 기능 후보의 Functions 전체 단위57파일892개 통과. 선택 실행용14파일120개는 생략된 상태다. 관련 단위·HTTP10파일186개 clean 실행과 후속1.15.1 진단 경계·HTTP3파일42개, build/lint도 통과했다.
- demo Firebase 통합3파일40개 통과. 기존 조회12·재고 승인13·새 납품 등록15개다. 직원 지정, 승인 전 무저장, 직원별 별칭 격리, 원자적 재시도,20장 분할·100행 한도와 무과금 복구를 포함한다.
- 브라우저9파일64개 통과, 지원 환경에 따른1개 생략. 새 카드 Chromium·WebKit6개가 포함된다. 실제 카드의320/390px·짧은 가로 화면, 긴 한글, 동명 직원·진행·실패·부분 승인을7조건으로 관측했으며 외부 요청·JS 오류는0이다.
- 실제 명세서5장을 새 RAM 정제와 실제 Sol/Luna로1회씩 검증했다. 공급받는 자5/5, 기존 거래처 연결5/5, 공급자 노출0이다. 11/9 명세서와 시험 당일11/8의 차이는 별도 날짜 확인으로 유지했다.
- 실제 손글씨는12행·정확한 상호11개다. ‘승’을 ‘송’으로 읽은1개를 포함해, 현재 별칭7개를 읽기 전용으로 재사용한 결과 자동5·확인7·잘못된 자동 연결0이었다. 확인 전인 줄임말을 이미 학습한 것으로 보고하지 않는다.
- Functions build, 관련 lint와 staged diff 검사를 통과했다. 같은 모델의 독립 설계2개와 fresh 소스 검토를 수행했다. 최종 소스 검토의 열린 확정 결함은0이다. CI·PR·push는 실행하지 않았다.

중간 실패는 숨기지 않았다. Express4와5 설치 경로 차이, 이식 대상이 아닌 Callable 시험 import, 불완전한 합성 거래처와 suite 사이 데이터 잔존, SDK 인증 GET 순서 경쟁을 각각 원인에 맞게 고쳤다.20장 전체 시험은10회 독립 호출이므로 전체90초와 호출별50초를 구분했으며 서버 deadline은 늘리지 않았다. 오래된 사진 fixture의 날짜 고정 문자열이 적용되지 않은 문제와 Windows WebKit의 기본 Tab 범위 가정은 테스트만 수정했다. [WebKit의 링크 Tab 설정](https://developer.apple.com/documentation/webkit/wkpreferences/tabfocuseslinks)과 [Playwright 논의](https://github.com/microsoft/playwright/issues/2114)를 함께 확인했다. 최종 clean 결과와 앞선 실패 이력은 구분한다.

## 실제 호스트 확인

사용자가 기존 직원 PIN으로 추가 동의를 마쳤다. 실제 호스트 시험에서 단일 기본 주소 외에 지역별 파일 주소를 사용함을 확인했다. 첫 시도는 파일 URL 정책에서 차단됐으며 인식 결과가 없었다. 비밀 값 없는 실패 단계·hostname 진단을 추가해 원인을 확인한 뒤, 실제 관측한 `sdmntprkoreacentral.oaiusercontent.com`과 `oaisdmntprkoreacentral.blob.core.windows.net`만 기존 `files.oaiusercontent.com`에 추가했다. 임의 wildcard·redirect·TLS/IP 검사 완화는 없다. OpenAI의 [파일 네트워크 안내](https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps)도 함께 확인했다.

Codex의 실제 MCP 파일 인자로 명세서·손글씨2장을 전송했다. 두 파일 모두 완료됐고, 서버에 도착한 바이트의 SHA-256이 입력 원본과 일치했다. invoice/customer_list 구분,13행 중 자동6·확인7, 공급자 노출0·실제 등록0을 확인했다. 저장된 계획에는 원본 file ID·download URL·image base64가 없다.

실제 ChatGPT 임시 대화에서도 새 명세서를 업로드하여 공급받는 자 찬솔유통1곳을 기존 거래처로 연결하고 승인 카드를 표시했다. 화면에서1/1장 완료·1곳 연결·0곳 등록, 날짜·대상 확인 전 비활성 승인 버튼을 직접 관측했다. 업무 등록 승인은 누르지 않았다. 실물 휴대폰 촬영·현장 이동은 이 MCP 작업의 검증 범위에 포함하지 않는다.

## 작업 위치와 근거

기능 worktree는 `C:/Users/HOME/.codex/worktrees/mcp-delivery-batch/onnuriway`다. 현행 PWA branch에 운영 MCP가 포함되지 않아, 내려받은 운영 MCP18개 소스와 일치하는 `86ce193`에서 시작했다. 이 소스를 PWA 전체 배포 후보로 사용하면 안 된다. 코드 배포는 `firebase deploy --config firebase.mcp.json --project onnuriway --only functions:employeeMcp --non-interactive`로 제한했다. 마지막 정확한 호스트1개 추가는 Cloud Functions v2 PATCH의 `serviceConfig.environmentVariables` mask로 해당 함수의 환경만 변경했다. 변경된 환경 key가 `MCP_FILE_DOWNLOAD_HOSTS` 하나이며 나머지 환경과 비밀 참조가 동일함을 확인했고 로컬 dotenv에도 동기화했다.

주요 근거는 원본 workspace의 `output/mcp-delivery/release/`에 있는 candidate-source, runtime-after, source-verification, scope-verification, inventory-preservation, alias-preservation이다. 실제 API 결과와 독립 소스 검토·UI 하네스도 같은 `output/mcp-delivery/`에 있다. 기능 worktree의 `output/mcp-delivery-*-clean.log`에 최종 테스트를 보관했다. 원본·API 응답과 private 설정은 ignored 로컬 자료이며 커밋하지 않았다.
