# MCP 사진·직원 지정 납품처 등록 배포

2026-11-08 16:36 KST에 `employeeMcp` 1개를 배포했다. 소스는 `codex/mcp-delivery-batch`의 `62cbeeae16540cc169762f7ebe41bc15f76d3de0`이다. 준비·승인·저장을 분리하여 사진과 직원 이름으로 해당 직원의 내 납품처·오늘 납품처에 추가한다. 확인하지 않은 상호와 처리 실패는 남기며, 기존 목록·순서·사진과 직원별 줄임말을 보존한다.

## 결과와 사용

ChatGPT의 온누리종합식품 앱에서 사진을 첨부하고 다음과 같이 요청한다.

> 이 사진의 거래처를 김하늘 직원의 내 납품처와 오늘 납품처에 등록해줘.

이름을 생략하면 연결한 본인이 대상이다. 활성 직원의 정확하고 유일한 이름만 확정한다. 동명이인·부분 이름은 인식 전에 선택한다. 명확한 거래처는 자동 선택하며, 애매한 항목만 연결하거나 제외한다. 줄임말 기억을 선택하면 대상 직원의 기존 별칭 저장소에 추가한다. 승인 카드에서 직접 확인한 뒤 서버가 완료를 반환해야 등록된 것으로 표시한다.

입력은 최대20장·전체100행이다. 한 요청에서2장씩 이어 처리한다. 초과 파일은 실패로 표시하고 완료한 결과는 유지한다. 재시도·부분 승인·만료·후처리 실패에서도 완료한 추출은 재사용한다. 결과가 불명확한 유료 인식은 자동 반복하지 않는다.

`Model the Domain`에 따라 호출자와 목록 소유자를 분리했다. `Make Operations Idempotent`에 따라 목록·별칭·감사·완료 receipt를 같은 트랜잭션에 기록했다. `Laziness Protocol`에 따라 운영 MCP 기반과 기존 Sol/Luna·공급받는 자 검증·matcher를 재사용했다. `Prove It Works`에 따라 로컬 프로토콜, 실제 API와 운영 호스트 관측을 구분했다.

## 운영 반영 증거

- 새 revision은 `employeemcp-00032-vad`이며, Cloud Run 준비 완료와 트래픽100%를 확인했다.
- 업로드된 소스 아카이브의 source/assets/설정130개 파일은 후보 manifest와 모두 일치했다. 비밀 값 파일은 없고, 포함된 운영 dotenv는 검토한 비밀 값 없는 설정9개와 일치한다.
- 새 도구3개를 더해 MCP 전체22개다. 준비 도구1개는 모델과 카드, 계속·승인2개는 카드 전용이다. ChatGPT에서 도구 새로 고침 후 Write5·Read17을 관측했다.
- 기존 인증 연결의 거래처 검색이 성공했다. HTTPS·OAuth discovery·PKCE·401·Origin 거절·no-store 공개 검사도 통과했다.
- 변경된 함수는 `employeeMcp` 하나다. 다른81개 함수와 PWA·MCP Hosting release는 동일하다. PWA Hosting은 `27f3bd0902c9d2c1`이다. 이 배포는 PWA 업데이트 팝업을 발생시키는 Hosting 변경이 아니다.
- 기존 업무 문서823개와 별칭7개 해시가 배포 전후 모두 동일했다. 업무 문서는 상품92·lot89·입출고240·거래처223·사진159·개인 목록3·일별 목록17개다. 운영 업무 목록에 시험용 저장은 하지 않았다.

기존 PIN·OAuth family 계약을 유지하고 `geupsikgil:delivery.write` 추가 동의를 사용한다. 권한 추가 시 기존 scope와 합집합을 요청한다. 타 직원 배정 권한은 현재 단일 허용 호출자를 별도 서버 설정에 고정했다. 조회 허용 명단 확대가 자동으로 배정 권한을 늘리지 않는다. Secret Manager의 기존 OpenAI·Kakao 비밀을 MCP runtime에 연결했으며 키 값은 변경하지 않았다.

등록 사진은 RAM에서 정제·분석한다. 원본·EXIF·base64·download URL·원본 file ID를 Firebase와 감사 로그에 저장하지 않는다. private 계획은 업무 추출 필드와 hash를 보관한다. 정확한 HTTPS 파일 호스트, DNS 고정·사설 IP 차단·redirect 거절과20MB·40M픽셀 한도를 적용했다. 검토한 기능·권한 계약은 별도 worktree의 `docs/mcp-delivery-registration.md`에 있다.

## 검증과 초기 실패

- Functions 전체 단위57파일892개 통과. 선택 실행용14파일120개는 생략된 상태다. 관련 단위·HTTP10파일186개 최종 clean 실행도 통과했다.
- demo Firebase 통합3파일40개 통과. 기존 조회12·재고 승인13·새 납품 등록15개다. 직원 지정, 승인 전 무저장, 직원별 별칭 격리, 원자적 재시도,20장 분할·100행 한도와 무과금 복구를 포함한다.
- 브라우저9파일64개 통과, 지원 환경에 따른1개 생략. 새 카드 Chromium·WebKit6개가 포함된다. 실제 카드의320/390px·짧은 가로 화면, 긴 한글, 동명 직원·진행·실패·부분 승인을7조건으로 관측했으며 외부 요청·JS 오류는0이다.
- 실제 명세서5장을 새 RAM 정제와 실제 Sol/Luna로1회씩 검증했다. 공급받는 자5/5, 기존 거래처 연결5/5, 공급자 노출0이다. 11/9 명세서와 시험 당일11/8의 차이는 별도 날짜 확인으로 유지했다.
- 실제 손글씨는12행·정확한 상호11개다. ‘승’을 ‘송’으로 읽은1개를 포함해, 현재 별칭7개를 읽기 전용으로 재사용한 결과 자동5·확인7·잘못된 자동 연결0이었다. 확인 전인 줄임말을 이미 학습한 것으로 보고하지 않는다.
- Functions build, 관련 lint와 staged diff 검사를 통과했다. 같은 모델의 독립 설계2개와 fresh 소스 검토를 수행했다. 최종 소스 검토의 열린 확정 결함은0이다. CI·PR·push는 실행하지 않았다.

중간 실패는 숨기지 않았다. Express4와5 설치 경로 차이, 이식 대상이 아닌 Callable 시험 import, 불완전한 합성 거래처와 suite 사이 데이터 잔존, SDK 인증 GET 순서 경쟁을 각각 원인에 맞게 고쳤다.20장 전체 시험은10회 독립 호출이므로 전체90초와 호출별50초를 구분했으며 서버 deadline은 늘리지 않았다. 오래된 사진 fixture의 날짜 고정 문자열이 적용되지 않은 문제와 Windows WebKit의 기본 Tab 범위 가정은 테스트만 수정했다. [WebKit의 링크 Tab 설정](https://developer.apple.com/documentation/webkit/wkpreferences/tabfocuseslinks)과 [Playwright 논의](https://github.com/microsoft/playwright/issues/2114)를 함께 확인했다. 최종 clean 결과와 앞선 실패 이력은 구분한다.

## 실제 호스트 확인 상태

ChatGPT 임시 대화에 실제 명세서를 업로드했고 새 도구를 호출하는 단계에서 추가 동의 화면까지 열었다. 현재 기존 직원 PIN 본인 인증을 기다린다. 실제 signed file URL 전달·서버 다운로드와 승인 카드 표시가 아직 검증되지 않았으며, 로컬 HTTP·실제 Responses 결과를 그 증거로 대신하지 않는다. 실제 업무 등록은 이 시험에서 수행하지 않는다.

## 작업 위치와 근거

기능 worktree는 `C:/Users/HOME/.codex/worktrees/mcp-delivery-batch/onnuriway`다. 현행 PWA branch에 운영 MCP가 포함되지 않아, 내려받은 운영 MCP18개 소스와 일치하는 `86ce193`에서 시작했다. 이 소스를 PWA 전체 배포 후보로 사용하면 안 된다. 이번 명령은 `firebase deploy --config firebase.mcp.json --project onnuriway --only functions:employeeMcp --non-interactive`였다.

주요 근거는 원본 workspace의 `output/mcp-delivery/release/`에 있는 candidate-source, runtime-after, source-verification, scope-verification, inventory-preservation, alias-preservation이다. 실제 API 결과와 독립 소스 검토·UI 하네스도 같은 `output/mcp-delivery/`에 있다. 기능 worktree의 `output/mcp-delivery-*-clean.log`에 최종 테스트를 보관했다. 원본·API 응답과 private 설정은 ignored 로컬 자료이며 커밋하지 않았다.
