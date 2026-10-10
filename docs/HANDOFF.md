# 급식길 개발 인수인계

기준일: 2026-10-10
대상: 이전 대화 없이 이어서 작업할 새 Codex 스레드

## 1. 먼저 알아야 할 상태

### 2026-10-10 MCP 1.13.0 — 브라우저 연결 안내와 프로토콜 분리

- 사용자가 모바일에서 승인한 ZIP의 실제 ONWAY 로고·Noto CJK 기반 한글 제목/본문 WOFF2·독립 HTML을 확인하고 Functions 자산에 포함했다. 로고는 기존 회사 PNG와 바이트가 같고 글꼴 메타데이터/한글 범위·실제 Chromium/WebKit 렌더링을 확인했다. OFL/부분집합 라이선스를 포함한다. 시안 표기를 운영 안내로 바꾸고 자산 경로/favicon/CSP nonce만 반영했다. 외부 CDN·분석기·새 로그인 폼은 없다.
- `/mcp`의 정확한 GET 문서 탐색(Fetch Metadata navigate/document + 명시적 HTML Accept)만 안내한다. 인증/MCP 헤더·JSON/SSE Accept·쿼리·HEAD/POST·Fetch Metadata 없는 요청은 기존 경로다. 기존 401 challenge·인증된 GET405·OAuth discovery·POST SDK 계약을 유지하며 HTTPS/Origin/본문/rate guard 뒤에 배치했다. 기존 no-store/보안 헤더를 유지하고 랜딩만 nonce script/self font를 허용한다. 네 개의 정적 파일만 명시적으로 제공하며 임의 경로 파일 접근은 없다. 자세한 경계는 `docs/mcp-browser-landing.md`.
- app/Functions typecheck·lint PASS, unit **1,867 PASS /94 조건부 SKIP**, demo Firebase/Hosting/공식 SDK **25 PASS**, Chromium/WebKit **53 PASS /1 CDP 전용 SKIP**. 320/390/844/1440px, 로고/글꼴, 넘침·터치 영역·복사 및 거절 fallback·키보드·reduced-motion을 검사했다. 초기 테스트의 local Origin 설정 및 CSP 차단에 대한 잘못된 기대를 수정했고 운영 Origin/CSP를 완화하지 않았다. WebKit은 기존 로컬 라이브러리 경로와 preflight skip으로 실제 실행했다. 실물 모바일 검증은 아니다.
- Functions/Next build·PWA·성능 예산 PASS. 운영 frontend 설정이 없는 검증 out은 Hosting gate에서 예상대로 차단됐고 배포하지 않는다. 기존 브랜치/PR4를 유지하며 main 병합·PWA/다른 Functions 변경·업무 데이터 쓰기·권한 확대는 없다.

- **functions:employeeMcp만** 배포해 ACTIVE **employeemcp-00028-fuv**, updateTime `2026-10-10T05:48:21.310428630Z` 확인. 기존71 Functions/PWA Hosting/MCP Hosting `392f487ef50a6a9c`, runtime SA·allowlist1·PIN secret2·max3/concurrency4 동일. 운영 HTTPS/discovery/PKCE/401 JSON/SSE GET/POST/Origin/no-store probe PASS. 운영 페이지의 Chromium/WebKit 390/1440px·글꼴2개·원본 로고·복사2개·콘솔 오류0을 확인했다. Chromium은 실제 clipboard 값을 비교했고 WebKit은 실제 클릭 성공 안내를 확인했다. Windows Chrome에서도 두 버튼 모두 실제 복사값이 일치했다.
- 실제 Windows ChatGPT 새 대화에서 기존 앱의 `get_inventory_overview(exampleLimit=0)` 읽기 호출 **1회/성공/서버1,074ms**와 결과의 성공·조회시각을 확인했다. 기존 연결 앱 도구 직접 호출도 별도1회/성공/서버911ms였고 두 표본 모두 MCP1.13.0이다. 서버 시간은 ChatGPT 추론/전송/렌더 총시간이 아니다. 재인증·새 OAuth 동의·업무 쓰기는 없으며 검증 탭만 닫아 원래 Chrome1탭을 보존했다. 신규 자격증명·권한 추가 없음. 원본 라이선스 파일의 마지막 빈 줄은 그대로 보존했다.

### 2026-10-09 MCP 1.12.0 — 약칭·초성 검색 분리와 안전한 확정

- 일반 이름을 초성으로 변환해 부분검색하던 OR 조건 때문에 관계없는 이름이 후보로 섞이는 원인을 확인했다. 공통 이름 매처에서 일반 이름과 입력 전체가 초성인 검색을 분리했다. 전체 범위를 처음부터 확인한 경우 유일한 전체 등록명을 우선하며, 다른 등록명/명시적 별칭과 충돌 없는 의미 있는 접두어·별칭 정확 일치도 확정한다. 동명·초성·중간 문자열·짧거나 흔한 단어·부분/후속 검색은 임의 확정하지 않는다.
- 거래처 원본에는 별칭 필드가 없음을 최소 필드 조회로 확인했다. 별도 학교 카탈로그의 별칭을 거래처에 혼합하지 않았다. optional aliases 읽기 호환만 추가해 명시적 저장 별칭 충돌을 확인하고 기존 수정 시 보존하며 PWA strict 응답에는 노출하지 않는다. 운영 별칭 생성/추측/이관·업무 데이터 변경은 없다. 별칭의 런타임 스키마는 서버 서비스 안에 두어 기존 frontend 계약/번들을 유지한다. 검색 projection에 선택적 별칭1필드를 추가했으나 쿼리/문서 읽기 수는 늘리지 않는다.
- 상세·검색·갤러리·납품 요약·직원/거래처 기록 필터에 같은 확정 규칙을 적용했다. 응답 match/customerMatch에 matchType/matchedField/matchedValue/searchMode와 일치 강도·제한 근거를 반환한다. eligibleForAutoSelection 자체는 유일성 보장이 아니며 resolution이 최종 판정이다. 확인한 customerId 재사용 지침으로 후속 검색을 생략하고 canonical 원본/권한을 매번 다시 읽는다. 선택된 원본 이름/별칭의 동시 변경은 남은 후보와 다시 비교하고 모호해지면 aborted로 중단한다. 여러 페이지의 검색 자체는 전역 시점 스냅샷이 아니다.
- 상세 카드 v2에서 미확정 후보의 이름·지역·상태·일치 근거를 textContent로 표시한다. 내부 ID·추가 업무 조회·외부 통신은 없다. v1 리소스도 같은 인가 경계에서 유지한다. 도구 추가 없이18개(모델17/UI 실행1), 기존 OAuth·직원 인증·사진168시간/삭제·재고 승인 경계를 보존한다.
- 최종 app/Functions typecheck·lint PASS, unit **1,846 PASS /88 조건부 SKIP**, demo Firebase+공식 SDK **25 PASS**, Chromium/WebKit **47 PASS /1 CDP 전용 SKIP**. demo는 합성 약칭3종·초성/이름/별칭 충돌·확인 ID의 최신 원본과 기존 사진/재고/인가 경계를 함께 검사했다. WebKit은 로컬 라이브러리를 LD_LIBRARY_PATH로 제공하고 시스템 ldconfig 목록만 확인하는 사전 검사를 우회했으며 실제 WebKit 검사는 모두 실행했다. 초기 PWA 용량 초과는 서버 전용 별칭 스키마로 분리해 해결했고 기존 거래처 JS 36,853B/36KiB 예산을 통과했다. 이전1.11.1 커밋3326e52의 GitHub Quality Gate는 success 확인했다.
- Functions/Next build·PWA·기존 JS/CSS 예산·MCP 합성 benchmark3개 PASS. 합성490거래처에서 약칭3종 각각 도구1회/카탈로그491문서(lookahead 포함)/상세서비스1회이며 확인 ID는 카탈로그0이다. 운영 frontend 설정이 없는 검증 out은 Hosting gate에서 정상 차단했고 미배포다. 이 벤치마크는 운영 지연/토큰/청구량 측정이 아니다.
- **functions:employeeMcp만** 배포해 ACTIVE **employeemcp-00027-yes**, updateTime `2026-10-09T13:21:12.138427916Z` 확인. 기존71 Functions/PWA Hosting/MCP Hosting `392f487ef50a6a9c`, runtime SA·allowlist1·PIN secret2·max3/concurrency4 동일. HTTPS/OAuth discovery/PKCE/401/Origin/no-store probe PASS. Rules/IAM/Storage/업무 데이터 변경 없음.
- 실제 연결된 ChatGPT 앱에서 도구 갱신 후 약칭2종·공백이 있는 전체명 각각을 새 대화로 조회했다. 모든 카드의 등록명 hash가 현재 원본과 일치했고 약칭 카드에 ‘등록명 · 앞부분 일치’가 표시됐다. 첫 약칭 도구1회/1,069ms, 두 번째 약칭 최초 대화는 정상 상세 응답2회(1,106/939ms), 같은 입력의 새 대화 재검증은1회/948ms, 공백 전체명1회/1,438ms다. 모두 returnedCount1, 관측234문서/Firestore12회/Auth2/Storage0이며 응답2,670~2,671B다. 중복 대화의 첫 응답부터 상세는 정상이었으며 두 번째 호출이 이름 확정에 필요하지 않았다. ChatGPT/호스트의 반복 호출 원인은 특정하지 못했고 항상 한 호출을 보장한다고 주장하지 않는다. SDK의 세 입력은 각각 한 호출로 resolved를 검증했다.
- 같은 거래처의 최신 연락처 후속 요청은 ID 재사용으로 카탈로그0, 도구1회/844ms/관측14문서/Firestore11회/Auth2/Storage0/2,080B이며 현재 이름이 일치하는 새 카드가 표시됐다. 원본 등록명과 updateTime은 전후 동일했다. 서버 시간은 ChatGPT 추론/전송/렌더 총시간 또는 SLO가 아니다. 기존 PIN/OAuth 연결을 그대로 사용했고 검증 탭만 닫아 원래 Chrome1탭을 보존했다. 실제 업체명/ID·주소·연락처·PIN/token·비공개 산출물은 Git에 저장하지 않는다. 기존 ONWAY 작업 브랜치와 초안 PR #4에 저장하며 main은 병합하지 않는다.

### 2026-10-09 MCP 1.11.1 — 정확한 등록명의 잘못된 다중 후보 처리 수정

- 원인: 기존 이름 검색은 일반 이름에서도 같은 초성의 업체를 후보에 포함한다. MCP 상세/갤러리/요약/기록 필터가 후보 수만 확인해 정확한 전체 등록명1개도 모호하다고 반환했다. 운영 최소 필드 조회에서 활성220거래처 중 해당 입력의 정확 일치1·문자 부분 일치1·초성 후보3을 확인했다. 업체명/ID·주소 원문은 검증 로그/Git에 저장하지 않았다.
- 공용 `selectCustomerCandidate`는 처음부터 완료한 검색에서 정규화된 전체 등록명이 하나면 우선 선택한다. 정규화된 동명 중복이면 자동 선택하지 않고, 정확 일치가 없으면 기존 유일 후보만 선택한다. 불완전 검색·후속 페이지는 정확 일치가 보여도 선택하지 않는다. 기존 목록 검색의 부분명·초성/업종 호칭/법인 표기 후보와 검색 예산은 유지한다. 같은 규칙을 상세·갤러리·납품 요약·기록 필터에 적용하고 확정 결과의 후보 목록을 비웠다. 불완전 요약 결과를 모호함보다 먼저 분류하며 사용자에게 내부 ID를 요구하던 모호함 안내도 개선했다. 추가 쿼리/인덱스/캐시/업무 쓰기는 없다.
- app/Functions typecheck·lint PASS, 전체 unit **1,830 PASS /86 조건부 SKIP**, demo Firebase+공식 SDK **25 PASS**. 단위 검사는 초성/부분명 충돌·전체명 우선·정규화·동명·명시적 폐업 포함·1251번째 중복/검색 예산·후속 페이지·여러 도구 일관성을 검사한다. demo에는 같은 초성/부분명의 다른 업체를 실제 생성해 상세·갤러리·요약·기록 필터가 정확한 원본만 선택함을 검사했다. Functions/Next build·PWA·성능 예산·합성 benchmark3개 PASS. 운영 frontend 설정이 없는 out은 Hosting gate에서 차단됐으며 미배포다. 카드/사진 UI 자체는 변경하지 않았다.
- **functions:employeeMcp만** 배포해 ACTIVE **employeemcp-00026-ric**, updateTime `2026-10-09T12:29:15.801880517Z` 확인. 직전 기준선의 기존71 Functions/PWA Hosting/MCP Hosting `392f487ef50a6a9c`·runtime SA·allowlist1·PIN secret2·max3/concurrency4 동일. HTTPS/OAuth discovery/PKCE/401/Origin/no-store probe PASS. Rules/IAM/Storage/업무 데이터 변경 없음.
- 실제 새 ChatGPT 대화에서 사용자가 문제를 제기한 **정확한 등록명**으로 자연어 상세 조회를 수행했다. **get_customer_details1회/성공/결과1/서버1,080ms/관측234문서/Firestore12회/Auth2/Storage0/응답2,517B/서버 재시도0**다. 다중 후보 카드 없이 상세 카드1개가 표시됐고 현재 등록명·납품주소의 비식별 hash가 원본과 일치하며 실제 가시성도 확인했다. 원본 updateTime hash는 전후 동일이다. 서버 시간은 ChatGPT 추론/네트워크 총시간이나 SLO가 아니다. 기존 OAuth로 인증 갱신 없이 검증했고 사용한 Chrome 탭만 닫아 원래1탭으로 복귀했다. 기존 ONWAY 작업 브랜치/초안 PR #4에 보관하고 main은 병합하지 않는다.

### 2026-10-09 MCP 1.11.0 — 거래처 상세 조회·원문 카드 배포 완료

- `get_customer_details`를 추가해 모델 공개17개/UI 전용1개, 총18도구다. 이름(query) → 기존 검색 → 현재 상세정보를 한 호출로 지원하며 확인된 ID의 후속 요청은 카탈로그를 생략한다. `CustomerService.read`의 canonical 직원·권한 transaction을 그대로 재사용한다. 등록명/지역/상태/revision/등록·수정시각/전경사진 참조 여부와 주소·연락처·납품 안내·변경 안내를 반환한다. 사진 바이트·납품/재고/실사 기록은 자동 조회하지 않으며 PWA Callable 계약을 바꾸지 않았다. 상세 사용법은 `docs/mcp-customer-details.md`.
- `sections`는 addresses/contacts/delivery/notes, 기본은 모두다. 미조회 null과 미등록 값/빈 배열을 구분하고 납품주소 우선·공식주소 fallback·대표 연락처 우선·현재 정보 수정시각의 의미를 명시한다. 출입 비밀번호는 기본 제외하고 명시적 요청의 `includeAccessPassword:true`+delivery일 때만 기존 업무 권한으로 반환한다. 직원 로그인 PIN·내부 연락처 ID·등록/수정 직원 ID는 반환하지 않는다. 실제 운영 검증에서는 출입 비밀번호 값을 요청/직접 읽지 않았다.
- 기본 활성 거래처, 명시적 `includeClosed:true`는 이름/ID 모두 폐업 포함하며 경고한다. 처음부터 전체 검색·유일한 후보를 모두 확인해야 자동 선택한다. 중복/없음/불완전/후속 구간은 후보·상태·커서를 반환하며 삭제/폐업된 원본을 이전 후보로 대신하지 않는다. 공백/구두점 검색의 전체 일치 문제를 차단했다. 기존7필드 검색 projection·5페이지/5초·최대100후보와 실행/응답 한도를 유지한다. 새 DB/인덱스/별칭/backfill/인가 캐시/업무 쓰기는 없다.
- 원문 UI는 `ui://geupsikgil/customer-details-v1.html`이다. 같은 structuredContent를 textContent로 표시하며 업무 API 추가0·외부 통신0·비공개 metadata 복제0이다. 표준 MCP App/ChatGPT toolOutput, 작은 host/safe area/회전·내부 스크롤, 서울 조회/수정시각 구분, 미조회 숨김·미등록/폐업 표시, 취소/오류/미확정의 이전값 삭제와 인증된 리소스 읽기를 적용했다. 모델의 후속 텍스트가 전체 주소를 보존하지 않은 두 표본을 확인했다. 1.10.1 원문 지침만으로 해결되지 않아 1.11.0에서 카드로 원문 표시를 보장했다. 모델의 모든 텍스트를 보장하는 것은 아니다.
- app/Functions typecheck·lint PASS, 전체 unit **1,824 PASS /86 조건부 SKIP**, demo Firebase/Auth/Storage/Functions/Hosting+공식 SDK **25 PASS**, Chromium/WebKit **45 PASS /1 CDP 전용 SKIP**. 초기 카드의6개 검사도 통과했고 초기화 후 높이 알림을 보완한 최종 카드6개를 재검증했다. 상세 의미·권한 취소·출입정보 제외/명시 요청·후보/부분/폐업·현재 원본·markup 문자열 안전·기존 사진/재고 승인을 검사한다. ID 서비스 조회 권한2+거래처1문서/Storage0/업무 쓰기0·원본 updateTime 동일을 확인했다. 초기 Zod refinement/pick 오류는 shape 재사용으로 수정했다. CPU가 많은 검증을 병행했을 때 기존 통합30초 한도 실패가 있어 제한 변경 없이 단독 실행해25개 통과했다. 무거운 검증은 순차 실행한다.
- 공식 SDK 합성490거래처 benchmark를 CI에 추가했다. 검색+상세2회→직접 상세1회이며 카탈로그 관측491문서는 같다. 확인된 ID는 카탈로그0/상세 서비스1회다. 동일 ID JSON8,308B→compact4,456B, 연락처만1,955B다. 선택 항목은 전송량만 줄이며 원본 문서 읽기를 줄이지 않는다. 실제 지연/토큰 비용/청구량 측정이 아니다. Next build/PWA/JS·CSS 예산·기존2개+새 benchmark PASS. 운영 frontend 설정이 없는 검증 out은 Hosting gate에서 정상 차단했고 미배포다. 직전1.9 커밋 `b3c218b` GitHub Quality Gate success 확인.
- **functions:employeeMcp만** 최종 배포해 ACTIVE **employeemcp-00025-qav**, updateTime `2026-10-09T11:59:54.820899810Z` 확인. 기존71 Functions/PWA Hosting/MCP Hosting `392f487ef50a6a9c`, runtime SA·allowlist1·PIN secret2·max3/concurrency4 유지. HTTPS/discovery/PKCE/401/Origin/no-store probe PASS. 업무 문서/Rules/IAM/Storage/인덱스는 변경하지 않았다. 기존 새 앱 ID/로고/직원 PIN OAuth·쓰기 동의를 유지하며 추가 로그인 없이 도구 갱신을 확인했다.
- 실제 ChatGPT의 최종1.11 카드: 기존 거래처 ID 후속 요청은 `get_customer_details` **1회/1,012ms/관측14문서/Firestore11회/Auth2/Storage0/2,376B** 성공했다. 새 대화의 이름 요청은 첫 결과0 **1,215ms/231문서/1,695B** 뒤 모델이 다시 조회해 결과1 **984ms/234문서/Firestore12회/Auth2/Storage0/2,517B** 성공했다. 이름 입력 내용은 계측하지 않아 첫 무일치 원인을 추정하지 않는다. 양쪽 최종 카드의 현재 등록명·납품주소를 salted hash로 원본과 대조했고 정확히 일치·실제 가시성을 확인했다(551×477). 연락처 미등록 안내도 확인했다. 업무 조회 이외 UI 추가 calls0·사진/재고 호출0·서버 읽기 재시도0이며 원본 updateTime hash 전후 동일이다. 첫1.10 이름 표본은1회/1,201ms였다. **서버의 한 호출 지원과 모델의 항상 한 번 호출은 다르다.** handler 시간은 ChatGPT 추론/네트워크/호스트 총시간이나 SLO가 아니다. 운영 연락처가 없는 표본이며 실제 연락처 값/출입정보 경계는 합성 demo/SDK 검증과 구분한다.
- 도구 갱신의 기존 UI 전용 commit 경고는 남지만 실제1.11 응답·카드로 반영을 확인했다. commit을 모델에 공개하거나 앱을 재등록하지 않는다. 원래 Chrome 탭/작성 내용을 보존하고 검증 탭 하나만 사용한 뒤 닫아 원래1탭으로 복귀했다. 업무 주소/연락처·로그인 PIN/token은 Git에 넣지 않으며 원문 대조 증거는 비식별 hash만 별도 scratch에 보관한다. 실물 Android/iPhone은 별도 원격 환경이 없어 미검증이다. 기존 공개 ONWAY 작업 브랜치/초안 PR #4에 저장하고 main은 병합하지 않는다.

### 2026-10-09 MCP 1.9.0 — 거래처 이름으로 납품사진 한 번 조회

- 실제 요청명에 업종 호칭이 덧붙어 짧은 등록명을 찾지 못하는 경우와 검색/요약 → 갤러리 메타데이터 → 이미지의 여러 단계가 문제였다. 운영 업무 요청 로그는 성공이었으며 인증/Storage 장애로 판단하지 않는다. `get_delivery_gallery`에 `query` 또는 확인된 `customerId`를 받도록 기존 도구를 확장했다. 이름 해석·목록·첫 인증 thumbnail을 같은 응답에 포함하며 최초 UI 추가 호출0이다. 날짜가 없는 요청은 최근168시간으로 조회하고 이전 대화 날짜를 임의 적용하지 않도록 도구 설명/서버 지침을 수정했다. 도구 수는16개 모델 공개/1개 UI 전용 그대로다.
- 기존 `CustomerService.search`의 부분명/초성 검색을 유지하면서 명시적 법인 표기와 한 번 덧붙인 업종 접미 표현만 처리한다. 접미 제거 후 두 글자 이상인 전체 등록명이 일치해야 하며 다른 이름/오타를 추정하지 않는다. 전체 검색 완료·처음부터 검색·후보1개 조건을 모두 만족할 때만 자동 선택한다. 중복/없는/불완전/후속 페이지 결과는 후보와 정확한 커서를 반환한다. 이름 검색은 기존 bounded scan의5페이지/5초 경계를 유지하고 이름·검색 필드·상태·지역7필드만 projection으로 읽는다. 문서 읽기 건수 자체를 인덱스로 줄인 것은 아니며 새 DB/별칭/인덱스/backfill/권한 캐시는 없다.
- 기존 `DeliveryPhotoService.getWithMetadata`와 사진 UI의 최초 이미지 경로를 재사용한다. 조회한 거래처·직원과 실제 이미지 메타데이터의 일치를 검사한다. UI v9는 업체 등록명·등록시각·기록자, 모바일 독립 툴바·전환·확대·핀치·드래그를 유지한다. 사진 전환/큰 보기는 해당 이미지의 직원 인가·삭제·만료를 다시 확인하며 페이지 추가는 이미지 선다운로드 없이 같은 필터/커서를 유지한다. 표준 image와 widget metadata 두 경로의 이미지 전송은 호환을 위해 보존한다. 168시간 보관과 사진 등록시각/실제 납품완료시각 구분은 그대로다.
- app/Functions typecheck·lint PASS, 전체 unit **1,804 PASS /79 조건부 SKIP**, demo Auth/Firestore/Storage/Functions/Hosting+공식 MCP SDK **24 PASS**, Chromium/WebKit **39 PASS /1 CDP 전용 SKIP**. 접미/법인/초성/유사명 거절·최소 필드 읽기·후보/부분 검색·최초 image·커서·권한 취소·사진 삭제/만료·직원 최신 갤러리·재고 사진/승인을 검사했다. 통합 검사에서 기존 직원 최신 갤러리의 nested schema 회귀를 찾아 배포 전에 수정했다. 이전 PR CI의 브라우저5초 시간 초과와 승인 메시지 도착 전 assertion은 브라우저만30초 제한 및 실제 메시지 대기로 보완했다. 재시도/검사 생략/승인 권한 완화는 없다.
- Next build·PWA·기존 JS/CSS 예산·두 MCP 합성 benchmark PASS. 운영 frontend 설정이 없는 검증 out은 Hosting gate가 정상 차단했으며 미배포다. **functions:employeeMcp만** 배포해 ACTIVE **employeemcp-00022-jod**, updateTime `2026-10-09T10:32:57.735768716Z` 확인. 기존71 Functions/PWA Hosting/MCP Hosting `392f487ef50a6a9c`, runtime SA·allowlist1·PIN secret2·max3/concurrency4를 유지했다. HTTPS/OAuth discovery/401/Origin/no-store probe PASS. 업무 문서/Rules/IAM/Storage/인덱스를 변경하지 않았다.
- 실제 연결된 새 ChatGPT 앱에서 도구 갱신 후 별도 검증 대화의 **거래처 이름만으로 납품사진 요청**은 `get_delivery_gallery` **1회**로 등록명을 해석하고 유효 사진 **2장**과 첫 thumbnail을 한 카드에 표시했다. 서버1,569ms/관측246문서/Firestore19회/Storage1회/이미지29,208B/응답80,445B/returnedCount2다. 다음 사진은 `get_delivery_photo`1회1,226ms(28,006B), 큰 보기는1회1,348ms(445,794B)로 성공했다. 실제 이미지 load·1/2→2/2·evidence load·100→125→100% 맞춤·닫기 후 thumbnail 복귀를 UIA와 로그로 확인했다. 배율/맞춤/닫기 추가 호출0이며 원본 거래처1문서와 사진2문서의 필드/updateTime이 전후 동일했다. 이 시간은 서버 handler 시간이며 ChatGPT 추론/호스트/네트워크 총시간이나 항상1회/SLO 보장이 아니다.
- 도구 갱신 화면에는 기존 `commit_inventory_change` 비공개 도구 경고가 남지만 실제 새 대화에서1.9 계약을 사용하고 갤러리를 렌더링했다. 경고 제거를 위해 UI 전용 commit을 모델에 공개하거나 인증을 다시 만들지 않았다. 이전 삭제 앱에 연결된 Codex 커넥터의 upstream 인증 실패와 현재 새 ChatGPT 앱의 연결은 구분한다. 기존 앱 ID/로고/PIN OAuth를 유지했다. 실물 Android/iPhone 원격 환경이 없어 모바일 엔진 검증과 Windows ChatGPT 실제 검증을 구분한다.
- 검증용 Chrome 탭만 닫고 기존 사용자 탭과 작성 중 내용을 보존했다. 실제 업체/직원 식별자·원본 사진·token·PIN·비공개 검증 산출물은 Git 저장 범위에서 제외한다. 기존 공개 ONWAY의 `codex/mcp-1.8.0` 브랜치와 초안 PR #4에 변경을 보관하며 main은 병합하지 않는다. 이전1.8 소스 보관 커밋은 `813b19d`이며 아래 기록은 이전 단계다.

### 2026-10-09 MCP 소스 Git 저장 사전 점검

- 기존 `https://github.com/kim-DL/ONWAY`에서 MCP와 기존 서비스 계층을 함께 관리한다. 확인 당시 원격 main과 로컬 기준은 `04272ec`로 동일했고 작업 브랜치 `codex/mcp-1.8.0`을 생성했다. 이번 저장 범위는 MCP1.8.0까지의 누적 구현·기존 서비스 재사용 변경·회귀 검사·문서·회사 로고다. 별도 업무 백엔드/저장소 복제나 main 직접 변경 없이 초안 PR 검토 경계를 사용한다.
- 저장소가 공개 상태임을 확인했다. 실제 직원 식별자·PIN·token·배포 env·업무 원본/실제 사진·비공개 검증 산출물은 저장 대상에 없다. 변경 후보의 패턴 검사와 Gitleaks8.30.1 검사를 실행했고 탐지는 기존 main에도 있는 CI 합성 키1건뿐이었다. 새 비밀정보는 발견하지 않았다. `.gitignore`에 서비스 계정/ADC·개인 키·인증서 제외 규칙을 추가했다. 공개 설정과 기존 Git 이력은 변경하지 않는다.
- 저장 전 `git diff --check` PASS, 의존성 audit high/critical0(기존 moderate7) 확인. 직전 기능 검증의 unit1,791 PASS/78 조건부 SKIP, demo 통합24 PASS, Chromium/WebKit38 PASS/1 CDP SKIP와 build/typecheck/lint 결과는 아래1.8.0 기록을 따른다. GitHub workflow는 main push/PR 품질 검사만 수행하며 Firebase 자동 배포는 없다. Git 저장 과정에서 Firebase/업무 데이터를 변경하지 않는다.

### 2026-10-09 MCP 1.8.0 — 재고 상품 사진 조회·확대

- `get_inventory_photo`를 추가해 모델 공개16개/UI 실행1개, 총17도구다. 상품 이름(query) 또는 확인된 ID로 현재 연결된 상품 대표 사진을 가져온다. 유일한 이름이면 기존 검색과 첫 thumbnail을 같은 응답으로 반환하며 사진만 요청할 때 묶음·실사 로그·기록자를 읽지 않는다. ID 경로는 카탈로그 검색도 생략한다. 중복·불완전·후속 페이지 결과는 임의 선택하지 않고 최소 후보를 반환한다. 기존 재고 응답의 `hasPhoto`로 사진 참조 유무를 미리 확인한다. 상세 사용법/경계는 `docs/mcp-inventory-photos.md`.
- 기존 `InventoryPhotoService.getWithMetadata`를 재사용했다. canonical 직원/상품/attached 단계 검사를 Storage 읽기 전후 수행하고 마지막 메타데이터를 반환한다. 기존 PWA `get()`의 strict 응답은 보존한다. 기존 WebP thumbnail/preview를 그대로 읽으며 사진 복제·읽기 시 재가공·공개 URL·새 DB/인덱스·권한/재고 캐시가 없다. 현재81개 활성 상품의 이름 검색은 기존 bounded scan이다. 상품 attached 사진에는 납품사진168시간 제한을 적용하지 않으며 기존 미연결24시간/retired30일 정리와 교체·제거 즉시 차단을 유지한다. 사진은 촬영일/현재 묶음 상태의 증거로 해석하지 않는다.
- 공유 사진 UI v8은 상품명·제조사·규격, 클릭 preview,50~400%·맞춤·핀치·드래그·닫기와 기존 모바일 독립 툴바를 재사용한다. 기존 납품사진 갤러리·직원/등록시각/7일 정책은 유지한다. 첫 thumbnail은 도구 응답에 포함하며 별도 UI 조회가 없다. 확대만 UI가 알려진 productId/photoId로 요청한다. 표준 image content와 widget `_meta` 양쪽 호환 때문에 이미지 데이터가 두 경로에 포함된다는 비용 경계를 문서화했다.
- 기존 runtime의 get-only custom role을 기본 bucket의 `companies/onnuri/inventoryPhotos/` 객체 경로에만 조건부로 추가했다. bucket이 fine-grained이므로 UBLA 전환 없이 프로젝트 IAM binding 하나를 추가했다. 조건은 object 타입+전체 bucket/prefix 일치이며 권한은 `storage.objects.get` 하나다. 기존 project binding·bucket IAM/access 설정/lifecycle을 대조해 보존했다. list/create/update/delete나 다른 사진 경로 권한은 추가하지 않았다. 별도 PIN/계정/쓰기 동의 없이 기존 조회 OAuth를 사용한다.
- typecheck/lint PASS, 전체 unit **1,791 PASS /78 조건부 SKIP**, demo Firebase/Auth/Storage/Functions/Hosting+공식 SDK **24 PASS**, Chromium/WebKit **38 PASS /1 CDP 전용 SKIP**. 유일/중복/없는/미등록·비활성 ID·7일 이전 attached·교체·삭제·인가 취소·Storage 오류·최신 메타데이터·PWA 호환·최초 UI 추가호출0·320px/회전·확대/닫기를 검사했다. Next build/PWA/성능 예산/기존 두 benchmark/diff PASS. 검증 out의 production frontend 설정이 없어 Hosting gate는 정상 차단, 산출물 미배포. 부가 계측에서 빈 candidates 때문에 상품1개를0개로 세던 수치를 바로잡고 HTTP11검사/typecheck/lint를 재확인했다.
- 실제 ChatGPT의 오래된 도구 목록에서 첫 요청이 기존 재고 검색을 수행하고 인터넷 참고 이미지로 답한 것을 확인했다. 이후 **설정 → 플러그인 → 온누리종합식품 → 하단 개발자 → 도구 새로 고침**을 실행했다. UIA에서는 버튼이 offscreen일 수 있어 SetFocus/부모 scroll 후 키보드 활성화로 확인한다. 기존 오류 문구만으로 새 갱신 실패를 판단하지 말고 서버 initialize/tools/list/resources/read와 새 대화의 실제 호출을 대조해야 한다. 일반 플러그인 ZIP 업로드/계정 다시 연결은 이 절차가 아니다. 앱 ID·로고·기존 OAuth 연결은 유지했다.
- 갱신 후 실제 등록 사진 load·상품명/제조사/규격 원본 salted hash 일치·preview load·100→125→100%/맞춤/닫기·버튼 좌표 hit test를 확인했다. 이름 요청에서 ChatGPT가 동일 도구를2회 호출한 표본은 각각1,291/931ms, 관측100문서·Storage1회·이미지16,992B/응답47,206B였다. 확대는1회1,151ms/관측19문서/이미지219,234B/응답586,514B다. 서버 재시도는 없었다. 구현상 최초 UI 추가호출0과 모델의 중복 선택을 구분하며 항상1회라고 보장하지 않는다. 이 시간은 ChatGPT 추론·호스트·네트워크 총시간이 아닌 서버 handler 시간이다. 실물 Android/iPhone은 연결된 기기가 없어 Chromium/WebKit 엔진 검증과 구분한다.
- 최종 배포는 `functions:employeeMcp`만 ACTIVE **employeemcp-00021-rux**, updateTime `2026-10-09T09:43:55.343616648Z`(최초00020-fev 뒤 반환 건수 계측만 보정). 기존71 Functions/PWA/MCP Hosting `392f487ef50a6a9c`와 runtime SA/허용 직원1/secret2/max3/concurrency4를 보존했다. HTTPS/discovery/401/Origin/no-store probe 및 bucket IAM/access/lifecycle 불변 재확인 PASS.
- 최종 revision에서 **“방금 확인한 같은 상품의 등록 사진을 다시 보여줘”** 후속 요청은 `get_inventory_photo` **1회**, 서버1,427ms/관측19문서/Storage1회/16,992B/응답47,206B/returnedCount1/재시도0으로 성공하고 새 카드 이미지 load를 확인했다. 이름 검색의100문서 중 활성 카탈로그81문서 읽기를 생략한 경로다. 확대/축소/맞춤/닫기 동안 추가 도구 호출0을 운영 로그와 대조했다. 단일 표본이며 ID 경로가 항상 더 짧은 지연을 보장하는 것은 아니다. 업무 쓰기는 실행하지 않았고 전체91개 상품 updateTime hash가 최종 조회 전후 동일했다.
- 작업 중 Chrome 탭을 하나만 재사용해 추가 정리할 중복 탭0개, 최종 사진 결과 탭1개를 남겼다. Windows Temp의 작업 소유 `mcp18-*`19개와 작업 중 내보낸 plugin ZIP(생성 시각/원본 hash 대조)을 제거해 잔여0개다. 사용자 Downloads/기존 파일은 보존했고 소스 commit/push는 하지 않았다. UI 갱신을 조사하며 ZIP을 읽었지만 새 플러그인 업로드·재등록·OAuth 재동의는 하지 않았다.

### 2026-10-09 MCP 1.7.1 — 새 앱 로고 및 PIN 중복 제출 복구

- 새 앱의 실제 프로필 로고를 플러그인 상세와 앱 설정 양쪽에서 확인했다. 등록용 PNG는 `assets/brand/onnuri-mcp-app-icon-256.png`(256×256/7,460B)이며 이전1254PNG는 등록 화면의10KB 제한으로 거절됐다. 검증 후 사용자가 **기존 앱 삭제하고 새 앱으로 정리**를 명시적으로 승인하여 기존 플러그인 `plugin_asdk_app_6ac64897daf08191b54d648e3f2b5844` 및 연결을 삭제하고 새 앱 `plugin_asdk_app_6ac89d0414b48191a58cfc030014151e` 이름을 **온누리종합식품**으로 변경했다. 실제 플러그인 목록의 회사 항목1개·새 이름·아이콘을 확인했다. 아래1.7.0의 기존 앱 보존/새 이름은 교체 전 기록이다.
- 사용자가 새 앱 추가 PIN 동의 후 `invalid_request`를 보고했다. 운영 `/authorize`에서 `2026-10-09T08:06:14Z` 거의 동시400/303을 확인했다. 한 요청은 성공했지만 중복 요청이 일회용 flow 검사에서 거절되어 오류 화면이 남는 상황에 대응했다. PIN 폼을 nonce CSP 스크립트로 최초 제출 즉시 잠그고, 숨김 consent 필드로 disabled 버튼 때문에 동의 값이 유실되지 않게 했다. 뒤로가기 복원 시 PIN을 비우고 재연결을 안내한다. 만료/재사용·PIN 실패·권한·rate limit·서버 오류는 브라우저에서 복구 안내, JSON 요청은 기존 OAuth 오류 계약을 유지한다. 서버 CSRF/PKCE/one-use/PIN 제한은 완화하지 않았다.
- typecheck/lint 및 OAuth/HTTP23검사 PASS. Chromium/WebKit PIN4검사 PASS(중복 클릭/Enter/requestSubmit→POST1회·복귀, 만료 안내·PIN 비노출·JSON 계약). 기존 사진/승인 포함 브라우저 전체 **32 PASS /1 CDP 전용 SKIP**. 초기 브라우저 테스트의 외부 callback 가로채기/문자 인코딩 문제를 로컬 합성 callback으로 바로잡았으며 실제 인증 흐름과 검증 조건은 유지한다. WebKit은 기존 로컬 공유 라이브러리 경로를 사용했다.
- `functions:employeeMcp`만1.7.1 배포 완료: ACTIVE **employeemcp-00019-pip**, updateTime `2026-10-09T08:15:32.017901142Z`. 기존71 Functions/PWA Hosting/MCP Hosting `392f487ef50a6a9c`와 runtime 설정 유지, health1.7.1 및 HTTPS/discovery/401/Origin/no-store probe PASS.
- 새 앱 최종 PIN 동의는 `08:18:28Z` authorize303→token200으로 정상 완료됐다. 실제 ChatGPT 승인 카드에서 writeReady=true/readOnly=false, 상품·창고·변경 전후 원본 hash 일치, 확인 체크 활성/저장 버튼 확인 전 비활성, 미저장 안내, 승인 secret 비노출을 확인했다. 최종 성공 표본: 검색1회1,168ms/상세1회941ms/동의 후 미리보기1회946ms(1,271B); 동의 전 미리보기1회572ms는 의도한 scope challenge였다. ChatGPT 추론/대기/사용자 PIN 시간은 서버 수치에 포함하지 않는다. 운영 commit은 실행하지 않았고 활성 재고81문서 updateTime 전부 유지했다. 실제7종 저장/경합/만료/재시도 검증은 demo 에뮬레이터에서만 수행했다. 사용 완료 중복 작업 탭2개와 인증 오류 탭을 닫고 현재 탭을 재사용했다.
- 마무리 탭 점검에서 추가 중복 작업 탭0개를 확인했다. Windows Temp의 이 작업 소유 `mcp17-*` 임시 파일70개를 제거하여 잔여0개, 사용자 Downloads/기존 탭은 보존했다. 소스 commit/push는 하지 않았다.

### 2026-10-09 MCP 1.7.0 — 재고 원본 이력·창고별 현황·승인 저장

- 기존 앱의 추가 PIN 동의가 실제로 완료됐다. 신규 write scope family/access 발급을 식별자·토큰 없이 확인했고, 실제 ChatGPT의 새 출고 미리보기에서 카드 내부 `canWrite` 안내/추가 동의 불필요/확인 체크 활성/저장 버튼 확인 전 비활성/상품·창고·전후 수량 원본 hash 일치를 확인했다. 이 검증은 원래 앱의 새 연결에서 수행했으며 운영 commit은 실행하지 않았다. 검색1회1,394ms→묶음 상세1회934ms→미리보기1회1,172ms, 승인 secret 비노출, 운영 활성 상품81문서 updateTime 전부 유지. 아래 동의 대기 기록은 이 검증 이전 단계다.
- 앱 로고 문제를 실제 등록 제약까지 확인해 해결했다. MCP initialize icons/플러그인 ZIP 로고만으로 기존 MCP 앱 사진은 바뀌지 않았다. 새 등록은 PNG 최대10KB/권장256×256이며 기존1254PNG(1,093,147B)는 거절됐다. `assets/brand/onnuri-mcp-app-icon-256.png`는256×256/7,460B, SHA-256 `3cf2a4b1b41892cbfc41ba3a1df0a474d287eae7cf89afbcebe7f09948d3e504`다. 기존 앱은 보존하고 동일 MCP URL/OAuth로 `온누리종합식품 · 새 연결`을 등록했다(공개 앱 ID `plugin_asdk_app_6ac89d0414b48191a58cfc030014151e`). 플러그인 상세와 앱 설정 양쪽에서 실제 로고 표시를 직접 확인했다. 새 앱의 실제 재고 검색1,028ms/상세889ms 성공, 쓰기 미리보기는537ms에 추가 scope 동의로 안내했다. 새 PIN 동의 화면의 조회·재고 변경 버튼까지 열어 사용자 직접 인증을 기다리는 중이며, 새 연결의 write 미리보기 완료는 아직 주장하지 않는다. 사용 완료 중복 Chrome 탭2개를 닫고 이후 같은 작업 탭을 재사용했다.

- 후속 실제 재연결에서 ChatGPT가 `commit_inventory_change`를 "위젯을 렌더링할 수 없는 비공개 도구"로 거절하는 호환성 문제를 발견했다. app-only 경계는 유지하면서 같은 승인 resource의 `openai/outputTemplate`을 추가했고 공식 SDK HTTP 검사에 회귀 검증을 추가했다. 도구 갱신 후 재연결 동의 화면 → 실제 PIN 페이지의 **조회·재고 변경 연결 허용**까지 직접 확인했다. 사용자가 PIN을 직접 입력 중이며 PIN 값은 읽지 않는다.
- 사용자의 앱 프로필 사진 미적용 지적에 기존 로고를 `mcp-public/onnuri-icon-v1.png`로 복사하고 MCP initialize serverInfo의 title/icons, PIN 페이지 로고/favicon을 추가했다. public PNG 200/image/png/기존 asset SHA-256 동일 확인. ChatGPT 화면 최종 아이콘 적용은 재연결 후 별도 확인해야 한다. 기존 플러그인 ZIP listing/composer 로고와 서버 icons는 별도 메타데이터다.
- 위 호환성·브랜딩 후 typecheck/lint/인증23검사, Chromium/WebKit28 PASS/1 CDP SKIP. `functions:employeeMcp,hosting:onnuriway-mcp`만 배포 완료: ACTIVE revision **employeemcp-00018-juv**, updateTime `2026-10-09T07:11:14.868774086Z`, MCP Hosting **392f487ef50a6a9c**, release `2026-10-09T07:11:26.712Z`. 기존71 Functions와 PWA release, runtime SA/인증 설정 유지 재확인, HTTPS/discovery/401/Origin/no-store probe PASS. 아래00017/MCP Hosting 불변은 이 추가 요청 이전 검증 기록이다.
- 사용자 목표가 조회 전용에서 읽기/쓰기까지 확장됐으며, 추가 질의에 **재고 업무부터 진행**으로 확정했다. 수량일치/실사조정/입고/출고/수량설정/창고이동/묶음·유통기한 수정7종을 지원한다. 상품 등록/삭제·거래처 변경·관리자 설정은 이번 쓰기 범위 밖이다. 상세 운영/사용법은 `docs/mcp-inventory-write.md`.
- 기존 InventoryService.stockCommand에 서버 내부 preview/control을 추가했다. 미리보기는 같은 transaction 검증·계산을 실행하되 쓰기를 버리고, 실행은 기존 재고/실사 원본 이벤트/감사 로그/영구 request receipt에 저장한다. 업무 로직 복제·두 번째 backend·원본 backfill은 없다. 기존 Callable/PWA 함수들은 재배포하지 않는다.
- `search_inventory_records`는 직원 이름/ID·창고·상품·서울 날짜(최대93일)·종류로 원본 events를 직접 검색한다. 기본 count_match, all은 전체 재고 변동. 현재 직원/상품 이름을 중복 제거·최소 필드 일괄 조회, 누락 기록자 null. 상세 lines는 선택, 건수만 필요하면 includeRecords=false로 행·상품명 조회 생략. summary는 해당 페이지의 수행 건수로 직원 담당 완료율이 아니고 distinctProducts를 페이지별 합산하면 안 된다. transfer 장소 필터는 출발 창고다. 현재 실사 상태는 기존 overview counts.stocktakeByLocation에 같은 순회로 추가하여 버튼 이력과 구분한다.
- `preview_inventory_change`는 5분 승인 카드와 UI 전용 capability를 발급한다. token은 `_meta`에만, 서버에는 해시만 저장. `commit_inventory_change`는 app-only이며 모델 대신 자동 저장 경로가 없다. 실제 승인 버튼/확인 체크, 전후 수량·단위·창고·유통기한·사유를 표시하고 카드 정보는 textContent로 렌더링한다. 다른 MCP 호스트도 UI metadata/model 가시성 및 사용자 승인 절차를 준수해야 한다는 신뢰 경계가 있다.
- OAuth read scope는 보존, 새 `geupsikgil:inventory.write`는 기존 PIN으로 별도 동의. viewer 발급 거부, refresh scope 자동 승격 금지. 승인 transaction에 token/family 생존·취소·scope/직원 canonical 권한/미리보기 expiry/상품·설정 updateTime 검사를 포함한다. 수량 변화 없는 다른 실사 기록·상품명 수정도 stale 처리. 같은 family refresh 허용, 다른 연결/사용자/변조는 거부. 기존 영구 receipt로 동시/중복 승인 한 번만 적용. 승인 결과 불명은 자동 재시도하지 않고 같은 plan으로 재확인. private preview만24시간 TTL, 영구 재고 receipt는 TTL 없음.
- 활성 상품 조회 field mask에서 최대200묶음 내부 inspectionByLot을 제외했다(PWA 목록 유지). 기존 최신 count_match/기록자·시간·유통기한 의미와 fresh 인증을 유지하며 권한/재고 캐시는 추가하지 않았다. 합성100이력 건수 모드: 도구1회/이력쿼리1회/원본100/직원1은 같고 상품명100→0문서, 응답44,476→1,690B. 합성490상품의 묶음검색/기존 응답 예산 유지, overview의 창고 상태 추가로4,287B. 전송 바이트이며 토큰/청구액/운영 지연 개선율이 아니다. 새 benchmark를 CI에 추가했다.
- Firestore events COLLECTION_GROUP 인덱스8개를 추가만 생성하여 모두 READY, 기존12개 보존. kind+선택 직원/상품/장소+createdAt DESC/name DESC. 운영 Query Explain8조합이 각각 기대 인덱스를 사용, 표본1~2문서/인덱스항목1~2/약5.19~17.75ms, readOperations1~2. 원본 이벤트·제품·직원은 변경하지 않았다. 인덱스 저장/후속 이벤트 인덱싱 비용은 추가된다.
- typecheck/lint, 전체 unit **1,782 PASS /67 조건부 SKIP**, 후속 핵심106 PASS, 최종 demo Auth/Firestore/Storage/Functions/Hosting+공식 SDK **23 PASS**, Chromium/WebKit UI **28 PASS /1 CDP 전용 SKIP**. 새 테스트는7종 실제 저장, 미리보기 business 무변경, receipt/감사, 중복·동시 승인, 만료·다른 연결·viewer·scope·family취소·변경충돌, 이력 필터/커서/legacy 기록자/요약을 검증한다. 초기 테스트의 구13개 도구 수·별도 suite 합성상품 간섭·기본5초 integration timeout·Vitest/Playwright matcher 혼용을 바로잡았다. demo에만 생성한 suite 소유 상품 roots는 종료 시 제거, integration timeout30초로 설정. 운영 데이터 삭제가 아니다.
- 안전 설정 Next build/PWA/성능 budget/diff PASS. frontend 운영 설정 없는 검증 out의 Hosting gate는 정상 차단, 산출물 미배포. **functions:employeeMcp만** 배포, 최종 ACTIVE/revision `employeemcp-00017-zaj`, updateTime `2026-10-09T06:52:06.457768475Z`(최초1.7 배포는00016-lef, 추가 동의 옵션 반영 후00017-zaj). 기존71 Functions updateTime·PWA release·MCP Hosting version `b6e6aac27dba693f` 유지. runtime SA/IAM·PIN2개·allowlist1명·maxInstances3/concurrency4 유지. SA 이름 readonly지만 기존부터 OAuth/PIN 상태에 datastore.user를 사용했으며 권한을 확장하지 않았다. HTTPS/discovery/PKCE/401/Origin/no-store 공개 probe PASS.
- 실제 사용자 Windows Chrome 도구 갱신→새 대화에서10/3~9 수량일치 최신3건 요청. **search_inventory_records1회**, 실제2건/complete=true/성공/재시도0, handler896ms/query111ms/auth662ms/Auth2회/관측16문서/응답2,830B. 같은 제품 행의 상품명·기록자·초 단위 서울 시각·창고를 운영 원본 salted hash와 대조해2행 모두 일치(냉장창고/냉동창고 표기는 canonical 냉장/냉동 번호로 정규화), 내부 직원/이벤트 ID 비노출. 작은 warm 표본이며 ChatGPT 추론/호스트 지연은 제외한다. 같은 실제 ChatGPT에서 출고 미리보기 요청은 검색1회1,029ms→묶음 상세1회832ms→미리보기1회945ms였다. 카드의 상품·창고·전후 수량 원본 hash 대조 일치, 승인 버튼은 확인 전 비활성/아직 저장하지 않았다는 안내/기존 read 연결의 추가 동의 안내/승인 secret 비노출을 확인했다. 승인 체크·저장은 실행하지 않았다. 운영 활성 상품81개 전체 updateTime hash가 검증 전후 동일했다. 최초 미리보기 검증은 검색어가2개 후보를 반환해 명시적으로 첫 재고 상품을 선택하도록 요청했으며 후보를 임의로 고른 결과로 검증하지 않았다.
- 추가 동의가 실제 저장보다 먼저 이루어지도록 preview 입력에 `requireWriteAccess`를 추가했다. 실제 업무 변경 요청은true로 쓰기 scope를 먼저 확인, 단순 미리보기는 기본false. 부족한 scope는 `insufficient_scope`·scopes·resource_metadata가 포함된 표준 OAuth challenge로 안내하며 이 단계에서 업무 쓰기·승인 실행은 없다. 기존 read 연결의 저장 권한 활성화에는 사용자가 HTTPS 인증 화면에서 PIN을 직접 입력하는 별도 동의가 필요하다. 최종 revision에서도 실제 ChatGPT가 requireWriteAccess=true로 요청했고 WRITE_CONSENT_REQUIRED(370ms) 및 OAuth discovery 재조회까지 관측했다. 사용자에게 PIN을 채팅에 보내지 말고 직접 추가 인증하도록 요청했다. 현재 사용자 PIN 추가 동의/운영 연결의 write scope 활성화는 아직 확인되지 않았으므로 완료로 주장하지 않는다. 운영 commit은 검증 목적으로 실행하지 않았으며 실제 저장 검증은 demo23검사로 한정한다. 서버 구현/배포, 실제 read/preview 원본 대조는 완료다.

### 2026-10-09 MCP 1.6.2 — 수량일치 기록자·요청 효율·오류 호환성 배포·실제 ChatGPT 검증 완료

- 수량일치 이벤트는 이름 스냅샷 없이 `actorEmployeeId`만 저장한다. 기존 MCP가 이 ID도 projection에서 제외해 기록자를 답할 수 없었다. 최신 count_match 원본에 `actorEmployeeId`를 포함하고, 반환 제품의 중복 직원 ID를 제거해 `employees.displayName`만 getAll 1회로 읽는다. 모든 재고 검색/상세/일괄/부족/알림/현황 예시에 `lastStocktake.actorName/actorNameSource`를 함께 반환한다. 이름은 현재 명부 기준이며 과거 당시 이름으로 주장하지 않는다. 비활성 직원도 남은 이름을 읽고, 삭제/누락/비정상 이름은 null/unavailable로 표시하되 원본 로그 시각은 유지한다. 명부 읽기 실패는 도구 오류이며 현재 로그인 사용자나 수정자로 추측하지 않는다.
- 새로운 DB·인덱스·쓰기·backfill·재고/인증 캐시를 추가하지 않았다. 기존 제품별 최신 버튼1건 인덱스 조회/동시8개와 데이터 최신성을 유지한다. 합성100제품의 동일 기록자는 명부1문서/1RPC, 기록자 없는 응답은 명부0회다. 기록자마다 추가 문서 읽기 과금은 발생한다.
- 기존 운영 검색 표본은1,626ms 중 인증 누적1,284ms였다. HTTP gateway의 동일 요청 인증 성공을 첫 도구 실행 전에 딱 한 번 사용해 정상 업무 호출의 OAuth/Auth 확인3→2회/인증 문서12→8개로 줄였다. 응답 직전·재시도 전에는 신선한 인증을 수행하고 다음 요청·다른 전송 방식·추가 호출에 재사용하지 않는다. 요청 중 토큰 family 취소, 직원/세션/권한 변경 시 데이터 반환 금지 검증을 유지한다.
- 실제 공식 SDK가 tools/list 후 오류 structuredContent도 성공 outputSchema로 검사하는 문제가 검증 중 드러났다. 오류는 `isError:true`와 text JSON으로 안전한 error code/retryable 등을 반환하고 UI용 `_meta.error`를 함께 제공한다. 오류 structuredContent는 생략한다. 사진 UI v7은 새 meta/text 오류 및 기존 structured 오류를 모두 해석하여 인증 취소 시 사진 제거·만료 안내를 유지한다. 성공 응답과 갤러리 배치/확대·축소 레이아웃은 그대로다.
- typecheck/lint, 전체 unit **1,778 PASS /50 조건부 SKIP**, 최종 demo Auth/Firestore/Storage/Functions/Hosting **10 PASS**, Chromium 사진/UI20검사+WebKit4검사 PASS(기존 CDP 전용1개 제외). WebKit 첫 실행은 호스트 libGLES 탐지 실패였고 기존 로컬 라이브러리 경로와 검사 우회 환경을 지정한 실제 WebKit 실행에서4개 PASS다. 기능 검사 우회는 하지 않았다. 초기 인증 횟수 테스트는 SDK tools/list 요청을 포함했고 이를 분리하면서 실제 오류 schema 문제를 발견·수정한 뒤 전체 재검사를 통과했다.
- Functions build, 안전 설정 Next build/PWA/JS·CSS 예산/diff PASS. 운영 프런트엔드 설정 없는 `out`의 Hosting artifact gate는 정상 차단되었으며 이 산출물은 배포하지 않는다. `functions:employeeMcp`만 배포했고 ACTIVE/revision `employeemcp-00015-may`, updateTime `2026-10-09T05:18:00.527759476Z`다. 기존71 Functions updateTime·PWA release/version·MCP Hosting `b6e6aac27dba693f` 동일, 전용 runtime SA·PIN secret2개·allowlist1명·maxInstances3/concurrency4 유지, HTTPS/discovery/401/Origin/no-store probe PASS.
- 사용자 Windows Chrome에서 도구 새로 고침 → 새 대화 → 두 상품의 수량/마지막 수량일치 시각/기록자/수정시각 자연어 요청을 직접 수행했다. `search_inventory_products` **1회**,2제품/complete=true/성공·서버 재시도0. 표의 같은 제품 행에서 제품명·수량/단위·초 단위 서울 버튼시각·현재 직원 이름·수정시각을 별도 운영 원본 읽기의 salted hash와 대조해 모두 일치했다. 버튼 없는 다른 제품은 기록 없음, 내부 ID 비노출도 확인했다. 원문 이름/상품 정보/직원 ID/PIN/token이나 업무 화면 캡처는 저장하지 않았다.
- 운영 handler **1,108ms**, authorization738ms/FirebaseAuth688ms(2회)/query247ms, 관측94문서/13 Firestore작업/응답3,413B. 이전 동일 검색 표본은1,626ms/인증1,284ms/Auth3회/97문서/15 Firestore작업/2,996B였다. 원본 기록자 이름1문서를 더 읽지만 중복 인증4문서를 없애 관측3문서 순감소다. 이름·출처·해석 추가로 응답417B 증가. 모두 warm 단일 표본이며 항상 같은 개선율·SLO·총청구액 절감이나 ChatGPT 추론/호스트 지연 포함으로 주장하지 않는다. metadata/protocol 탐색의400과 업무 도구 성공은 별도다.
- 합성490상품 벤치마크는 묶음검색3→1호출/카탈로그15→5페이지 유지, 같은1.6.2 응답의 text JSON5,336→compact2,856B, 전체490행286,329→요약4,011B였다. 동일 직원100제품 기록자 조회1문서/1RPC도 확인했다. 운영 업무 데이터·DB 인덱스/Rules·기존 버튼 쓰기·PWA는 변경하지 않았다. 원격 검증 임시 스크립트와 대조 파일을 제거했고 소스 commit/push는 하지 않았다.

### 2026-10-09 ChatGPT 온누리종합식품 플러그인 아이콘 적용 완료

- 사용자 제공 회사 로고(기존 `assets/brand/onnuri-food-logo-original.png`와 같은 파랑·초록 물결)를 바탕으로 흰 배경 정사각형 PNG를 제작했다. 보관 파일: `assets/brand/onnuri-chatgpt-plugin-icon-v1.png` (1254×1254, SHA-256 `2c6a57c01ba44101f5bdbbd879900c8654c132bf61dad2109ccabe097d94fb29`). 원본 로고/PWA 아이콘은 유지한다.
- 실제 Windows Chrome의 ChatGPT 플러그인 상세 → 추가 작업 → 플러그인 ZIP 다운로드로 기존 패키지를 받았다. `.codex-plugin/plugin.json`의 패키지 버전만 1.0.0→1.0.1로 올리고 `interface.logo/composerIcon/logoDark/composerIconDark`를 `./assets/onnuri-icon.png`로 지정했다. 기존 `.app.json`은 바이트 내용 동일 여부를 확인한 뒤 **같은 플러그인의 새 버전 업로드**로 반영했다. 연결을 삭제하거나 새 플러그인을 만들지 않았다.
- 업로드 성공 안내 확인 후 기존 플러그인 설정 페이지를 다시 열고 새로고침했다. 실제 화면에서 파랑·초록 로고 표시, 기존 연결 계정·OAuth·MCP URL 유지 확인. 업로드 직후 상세 페이지는 이전 아이콘 캐시가 보였으나 새로고침 후 설정에는 새 로고가 표시됐다. MCP 서버는 1.6.1 유지, Firebase/업무 데이터/인증/도구 코드는 변경·배포하지 않았다. 이번 검증은 패키지 무결성·규격·실제 ChatGPT 표시 확인이며 기능 코드 테스트를 반복하지 않았다.

### 2026-10-09 MCP 1.6.1 — 제품별 수량일치 버튼 로그로 실사 시각 정정·배포·실제 ChatGPT 검증 완료

- 사용자 정정: 장소별 실사 완료 요약이 아니라 **제품별 ‘수량 일치 확인’ 버튼을 눌러 저장된 로그**를 그대로 조회해야 한다. 실제 UI는 `InventoryCountForm` → `recordInventoryCount(matchOnly:true)` → 상품 하위 append-only `events`의 `kind=count_match`를 기록한다. 선택 제품/장소의 현재 묶음을 확인하는 동작이며 다른 장소나 다른 제품의 완료 여부가 조회 조건이 아니다. 1.6.0이 사용한 `lastCountByLocation`은 실사일 입출고로도 갱신될 수 있어 이 요구와 달랐다.
- `lastStocktakeAt`을 **제품의 최신 count_match.createdAt**으로 수정했다. `lastStocktake`에는 원본 `eventId/productId/kind/createdAt/locationId/cycleId/stockRevision`을 그대로 제공한다. `receive/issue/adjust/count_adjust/lot_update`나 상품 수정·장소별 완료 시각으로 대신하지 않는다. 버튼 로그가 없으면null, 로그 조회 실패는 도구 오류다. 기록자 ID·메모·묶음 원문은 반환하지 않으며 일반 화면에는 내부 ID를 표시하지 않도록 안내한다. 기존 `stocktakeByLocation`과 overview 실사 상태는 PWA 완료 요약이라는 차이를 명시했다. 수량과 버튼 로그는 별도 읽기여서 동일 시점 transaction을 보장하지 않는다.
- 기존 `InventoryService.lastQuantityMatches`에 제품별 kind=count_match + createdAt DESC/documentId DESC + limit1 + 필요한 필드만 조회를 추가했다. 검색/알림/상세/일괄 조회는 **반환 제품만**, overview는 중복 제거한 예시만 조회한다. 최대100개/동시8개, 예시0이면 로그 조회0. 전체 제품별 이력 스캔이나 모델의 상품별 도구 반복 호출 없이 원본 로그를 가져온다. 반환 제품별 쿼리1회 비용은 추가되며 빈 결과도 Firestore 최소 과금이 있다. 관측 snapshot0을 비용0으로 표시하지 않는다. 새 DB/저장 필드/backfill/캐시/업무 쓰기를 추가하지 않았다.
- `firestore.indexes.json`에 `events` COLLECTION 범위 `kind ASC, createdAt DESC, __name__ DESC` 인덱스1개 추가. 운영 REST로 **추가만** 생성했고 READY, Query Explain 계획 일치, 기존11개 인덱스 보존 확인. 제품별 하위 collection에만 쿼리하며 collection group 전체 조회는 하지 않는다. 기존 버튼/재고 쓰기·PWA 완료 규칙·PIN/OAuth·도구13개·사진 UI v6·168시간 보관 정책은 유지한다.
- 전체 unit **1,772 PASS /50 조건부 SKIP**, demo Auth/Firestore/Storage/Functions/Hosting + 공식 MCP SDK **10 PASS**. 새 검사는 버튼 없는 실사일 입고, 0수량 버튼, 버튼 뒤 요약을 덮어쓰는 입고, 다른 장소 미확인,150개 후속 일반 이력/수량조정, 동일 시각 ID 정렬, 잘못 연결된 제품 로그, 중복·잘못된 ID, 동시 읽기 상한, 정확한 요청 재시도, 원문 ID/메모 비노출, 조회 중 권한 취소를 검사한다. 초기 전체 unit의 기존 mock2개는 새 로그 경로를 mock하지 않아 실패했으며 fixture를 보완한 전체 재실행이 통과했다. 운영 업무 자료는 변경하지 않았다.
- typecheck·lint·Functions build·최종 조회14검사·안전 설정 Next build·PWA·기존 JS/CSS 예산·diff check PASS. 운영 frontend 설정 없는 검증용 out은 Hosting artifact gate가 정상 차단했으며 배포하지 않는다. 합성490상품(버튼 이벤트 없음) 벤치마크에서 묶음 검색3→1호출/카탈로그15→5페이지/로그 쿼리3→2, JSON 중복4,732→compact2,554B. 전체490행284,819→요약3,709B/로그 쿼리490→6. 실제 버튼 이벤트가 있으면 원본 필드와 읽기만큼 늘며 청구비용/운영 지연 절감률을 의미하지 않는다.
- Chromium·WebKit 사진/갤러리 회귀 **24 PASS /1 CDP 전용 SKIP**. **functions:employeeMcp만** 배포했고 최종 ACTIVE/revision `employeemcp-00014-hab`, updateTime `2026-10-09T04:18:48.728731972Z`를 확인했다. 최종 도구 설명에서도 예시의 최신 로그 추가 읽기를 명시했다. 기존71 Functions updateTime·PWA release/version·MCP Hosting version `b6e6aac27dba693f` 동일, 전용 runtime SA·PIN secret2개·allowlist1명·maxInstances3/concurrency4 유지, HTTPS/OAuth discovery/401/Origin/no-store probe PASS다. 기존 업무 문서·Rules·IAM·다른 인덱스는 변경하지 않았다.
- 운영 원본 로그의 별도 읽기/Query Explain analyze는 버튼 기록이 있는 표본1개에서 문서1/인덱스 항목1/6.910ms, 없는 표본1개에서 문서0/인덱스 항목0/2.624ms였다. 두 조회 모두 readOperations1이며 빈 조회의 최소 과금도 확인했다. Firestore 쿼리 시간으로 MCP 전체 응답/ChatGPT 체감 시간과 구분한다. 원문은 저장하지 않고 이름·수량·원본 이벤트 ID·시각의 salted hash만 대조에 사용했다.
- 사용자 Windows Chrome에서 **도구 새로 고침 → 새 대화 → 두 검색어의 재고/마지막 수량일치 버튼 로그/상품 수정시각 요청**을 직접 수행했다. `search_inventory_products` **1회**,2제품/complete=true/성공·재시도0, handler **1,626ms**/관측97문서/응답2,996B다. 표의 같은 제품 행/열에서 이름·수량/단위·원본 버튼 로그의 서울 시각·수정시각이 모두 일치했고, 버튼 로그가 없는 제품은 ‘버튼 확인 기록 없음’으로 표시됨을 확인했다. 운영 표본의 버튼 시각과 장소별 요약 시각은 우연히 같았으며, 서로 다를 때의 정정 동작은 demo/단위 검사에서 확인했다. 작은 운영 표본이며 항상1회/성능 보장/비용 절감률을 주장하지 않는다.
- 임시 Windows 제어 스크립트·비식별 대조 파일을 제거했다. 업무 원문/사진/PIN/token·실사용자 스크린샷은 저장하지 않았고 운영 업무 자료는 수정하지 않았다. 소스 commit/push는 하지 않았다. 아래1.6.0은 당시 구현·측정 기록이며 실사 시각의 현재 의미는 위1.6.1이 우선한다.

### 2026-10-09 MCP 1.6.0 재고 실사 시각·묶음 검색·현황 요약 — 배포·실제 ChatGPT 검증 완료

- 사용자 요청: 재고의 `lastStocktakeAt`을 추가하고 ChatGPT의 조회 속도·비용을 개선. 기존 상품 `lastCountByLocation`의 완료 기록을 재사용한다. `lastStocktakeAt`은 가장 최근 **장소 전체 확인** 시각이고 `stocktakeByLocation`에 장소별 `checkedAt`/`stockChangedSinceCount`를 함께 반환한다. 상품 전체 동시 실사나 부분 묶음 확인 시각이 아니다. 완료 기록이 없으면null이며 `updatedAt`으로 대체하지 않는다. `updatedAt`은 정보/수량/동일 수량 확인에도 갱신되는 상품 문서 수정 시각으로 정확한 마지막 수량 변경일이 아니다. `stocktakeBasis`가 해석을 명시하며 직원 ID·내부 `inspectionByLot`은 노출하지 않는다. 새 필드 저장·backfill·날짜별 추가 읽기는 없다.
- 공용 순수 `inventory-inspection-status.ts`로 기존 PWA의 장소/실사대상/주기 상태 판정을 이동해 PWA와 서버가 공유한다. 기존 PWA 목록은 유지하고 MCP만 `listActive`의 `status=active` 쿼리를 사용한다. 운영 Query Explain에서 기존 `(status ASC, __name__ ASC)` 인덱스를 확인했으며 새 인덱스·DB·캐시·업무 쓰기 경로는 없다.
- 도구13개, MCP1.6.0. `search_inventory_products`는 기존 `query` 또는 최대10개 `queries`를 받아 카탈로그를 한 번만 순회하고 중복을 제거한다. 검색 결과의 수량/시각으로 답하도록 안내하며 반복 상세를 피한다. `get_inventory_product(includeLots:false)`는 기존 인가된 `readProducts`로 요약만 읽고 `lots:null/lotsIncluded:false`를 반환한다. 기본 true는 보존한다. 새 `get_inventory_overview`는 활성 상품 요약과 설정1문서로 품목 수/품절·부족/유통기한/현재 실사 상태를 집계한다. 최대500개/5페이지/페이지 경계5초, 소수 예시는 ID 순서이며 전체·심각도 순위가 아니다. `countScope=returned_scan_segment`, page/cursor를 명시해 후속 구간을 전체로 오인하지 않게 한다. 단위가 다른 수량은 합산하지 않는다.
- 재고 응답은 기본 compact: 전체 `structuredContent`를 한 번만 보내고 text는 짧은 요약이다. text 전용 호환을 위한 `responseFormat:json`도 지원한다. 사진 UI v6와 사진/거래처 응답·PIN/OAuth·전후 인가·권한 취소·보관기간·삭제 처리는 그대로다. 인증/재고 캐시를 추가하지 않았다.
- 전체 unit **1,769 PASS /49 조건부 SKIP**, 별도 Chromium·WebKit **24 PASS /1 CDP 전용 SKIP**, 실제 demo Auth/Firestore/Storage/Functions/Hosting + 공식 MCP SDK **9 PASS**. 통합 검사는 수량 같은 실사확인 → 다음날 정보수정/입고 → 과거 확인일과 새 수정일 구분/변동true, 요약 읽기3/쓰기0을 검증한다. 묶음 검색의 겹침·페이지 중간 커서·부분/후속 결과·시간/500개 예산·실사 대상/0재고 기본장소·구주기·신규·인가 취소·기본/JSON 응답을 검사했다. app/Functions typecheck·lint·Functions build·안전 설정 Next build·PWA·기존 JS/CSS 예산·diff check PASS. 운영 frontend 설정 없는 out은 Hosting artifact gate가 정상 차단했으며 배포하지 않는다.
- `scripts/benchmark-mcp-inventory.mjs`를 CI에 추가해 합성490상품의 공식 SDK 결과를 계측한다. 검색어3개 각각→묶음은 호출3→1/페이지15→5/상품 snapshot1,482→494개. 같은 묶음 결과 text JSON 중복→compact는4,498→2,439B(45.8% 감소). 전체490행→현황은274,164→3,447B(98.7% 감소); 상품 읽기는494로 같고 현황은 설정1개를 더 읽는다. 별도 서비스 검사에서200묶음 상세203→요약3문서(서비스 인가 포함/외곽 MCP 인가 제외), 비활성110+활성1 카탈로그에서MCP1읽기/PWA101읽기 동작 보존. 합성 수치이며 운영 속도·청구액 절감률로 해석하지 않는다.
- **functions:employeeMcp만** 배포, ACTIVE / revision `employeemcp-00012-tah`, updateTime `2026-10-09T02:37:39.570045981Z`. 배포 직전 기준선 대비 기존71 Functions updateTime·PWA release/version·MCP Hosting version `b6e6aac27dba693f` 동일이다. 전용 runtime SA·PIN secret2개·allowlist1명·maxInstances3/concurrency4 유지, HTTPS/OAuth discovery/401/Origin/no-store probe PASS. 운영 업무 문서·Rules·IAM·인덱스는 변경하지 않았다.
- 사용자 Windows Chrome에서 **도구 새로 고침 → 새 대화 → 전체 현황과 두 검색어의 재고/실사/수정시각 요청**을 직접 수행했다. 첫 요청은 현황1회+검색2회(최초2건/추가25건), 상세/묶음 조회0회로 완료됐다. 모델의 추가 검색이 있어 이 요청을2회 호출이라고 보고하지 않는다. 운영 문서를 읽기 전용으로 별도 조회해 salted hash만 보관하고 두 상품의 이름·합계/단위·서울 확인일/수정일을 화면 표의 같은 상품 행/열과 대조해 일치를 확인했다. 한 상품은 저장된 실사 완료 기록 없음, 다른 상품은 확인일과 수정일이 같은 기존 기록이었다. 서로 다른 두 날짜 사례는 demo 통합에서 검증했으며 운영 자료를 인위적으로 수정하지 않았다. 현황 응답과 화면 표시도 확인했고, 전체 집계 알고리즘의 경계값 정확도는 합성/통합 검증 결과와 구분한다.
- 별도의 새 대화에서 **두 검색어를 한 번에 묶어서 재고/실사일 비교**하도록 요청한 결과 **search_inventory_products 1회**,2상품/complete=true/**1,303ms**/관측 문서96/응답2,654B로 답변 표시까지 확인했다. 수량·단위·기록 없음·서울 확인일/수정일을 다시 비식별 대조했다. 두 대화 업무 도구 총4회는 모두 성공/서버 재시도0이다. 현황1회는2,492ms/98문서/2,541B, 검색3회는1,269~1,486ms/각96문서/2,654~18,931B다. handler 시간은 ChatGPT 추론·네트워크·플랫폼 시작을 제외하고 관측 snapshot 수는 청구액이 아니다. 작은 표본으로 항상1회/SLO/속도 개선율을 보장하지 않는다.
- 실제 업무 스크린샷·상품 이름/ID·PIN/token 원문은 검증 파일/문서에 남기지 않았다. 사용자 PC의 임시 제어 스크립트·비식별 대조 파일을 제거했다. 소스 commit/push는 하지 않았다. 사용법과 합성 측정값은 [운영 가이드](mcp-server.md)·[성능 문서](mcp-performance.md)를 따른다. 아래는 이전 단계 기록이다.

### 2026-10-09 MCP 1.5.0 모바일 사진 툴바 — 배포·실제 ChatGPT 검증 완료

- 원인: 기존 dialog의 `100dvh`는 iframe 높이만 반영하고 표준 host context/ChatGPT의 안전 영역·높이 제한을 사용하지 않았다. 전체화면에서도 숨은 썸네일 카드 높이를 intrinsic height로 보고해 호스트 배치에 간섭했다. 합성390×844 화면/host maxHeight800/bottom inset134에서 기존 축소 버튼 하단780px가 사용 가능 하단666px를 **114px** 넘는 현상을 수정 전 소스로 재현했다. 일반 브라우저의 viewport만으로 네이티브 ChatGPT UI 가림을 추론할 수는 없다.
- UI 리소스 **v6**, MCP **1.5.0**. `photo-view.ts`는 높이가 제한된 grid의 정보/사진/툴바 행을 분리하고 사진만 스크롤되게 한다. 표준 `containerDimensions`/`safeAreaInsets`, 호환 `maxHeight`/`safeArea.insets`, dvh·VisualViewport/offset을 반영하며 inset은 CSS env와 최대값으로 결합한다. host context·회전·viewport 변경에 대응하고 열린 뷰어의 inline 높이 보고를 중단한다. 임의 하단 여백이나 두 번째 UI 서버는 없다.
- 상단 업체명·서울 등록시각·기록자를 유지하며 중복 제목·성공 안내는 접근성 문구로 남겨 공간을 줄였다. 긴 정보는 상단 안에서 스크롤한다. 닫기44px, 툴바 버튼48px, 좁은 화면2줄/가로1줄을 사용한다. 화면 맞춤100%와50~400%/버튼25% 단위, 로컬 두 손가락 핀치·확대 후 이동·맞춤 상태의 스와이프·사진 전환·닫기/ESC/배경·키보드 포커스를 유지한다. 이전 코드에는 pinch 구현이 없어 이번에 추가했다. 실제 Chromium 터치 입력에서 핀치 후 다음 버튼 click이 생략되는 현상을 찾아 단일 손가락 탭을 중복 없이 처리했다. 페이지 조회 실패는 성공 문구 숨김 상태에서도 보이도록 회귀를 보완했다.
- 전체 unit **1,760 PASS /48 조건부 SKIP**, 별도 브라우저 **24 PASS /1 SKIP**(Chromium·WebKit3파일), 실제 demo Auth/Firestore/Storage/Functions/Hosting + 공식 MCP SDK **8 PASS**. 브라우저는 표준/호환 bridge, 하단 호스트 overlay,320px 폭·짧은 가로 화면·긴 이름·회전·VisualViewport, 버튼 실제 좌표 hit test/터치, 최대400%·맞춤·이동·닫기·갤러리, 외부 HTTP0 및 배율/화면 변경 추가 tools/call0·intrinsic height 보고0을 검사한다. 단일 SKIP은 WebKit에서 지원하지 않는 CDP pinch/safe-area 주입 검사이며 같은 검사는 Chromium에서 실제 수행했다. WebKit은 실제 엔진으로 실행했고, 로컬 비-root 환경의 누락 공유 라이브러리만 공식 Debian 패키지로 별도 임시 경로에 풀어 사용했다. CI는 두 엔진을 `--with-deps`로 설치한다.
- app/Functions typecheck·lint·Functions build·안전 설정 Next build·PWA·기존 JS/CSS 성능 예산·diff check PASS. 운영 frontend 설정이 없는 검증용 out은 Hosting artifact gate가 정상 차단했으며 배포하지 않는다. 전체 unit/타입/Next build를 순차 실행해 이전 CPU·`.next/types` 충돌을 피했다. 기존 인증·12도구·직원별 검색/인덱스·168시간 보관·등록시각/납품완료시각 구분·삭제/권한 취소 처리는 변경하지 않았다.
- **functions:employeeMcp만** 배포해 ACTIVE / revision `employeemcp-00011-mij`, updateTime `2026-10-09T01:50:02.260782711Z` 확인. 배포 직전 새 기준선과 비교해 기존71 Functions updateTime·PWA release/version 동일, MCP Hosting version `b6e6aac27dba693f` 동일이다. 기존 전용 runtime SA·PIN secret2개·allowlist1명·maxInstances3/concurrency4를 재확인했고 HTTPS/OAuth discovery/401/Origin/no-store probe PASS다. DB·Rules·IAM·업무 데이터는 수정하지 않았다.
- 사용자 Windows Chrome에서 **도구 새로 고침 → 새 대화 → 자연어 요청**을 직접 수행했다. `search_delivery_records`로 최근1건을 찾고 `get_delivery_gallery`로 해당 업체의 최근7일 **3장** 갤러리가 표시됐다. 회사/등록시각/기록자·썸네일 load, evidence load,100→125→100%·맞춤, 확대 갤러리 **1/3→2/3→3/3**, 닫기 후3/3 썸네일 복귀를 확인했다. 창을 실제 최소 폭인 **703×620**으로 줄여 축소/확대/맞춤/닫기의 화면 내 좌표와 Windows UIA FromPoint hit test 모두 PASS, 확대 버튼의 실제 마우스 클릭 후125%도 확인했다. PC 창을 원래 크기/상태로 복원하고 임시 제어 스크립트·창 상태 파일을 삭제했다. 실제 업무 사진 스크린샷/이름/ID/PIN/token은 파일이나 문서에 남기지 않았다.
- 운영 업무 도구 **7회 모두 성공·서버 재시도0**: 기록 검색1회/1,473ms, 갤러리1회/1,284ms, 이미지5회/1,550~1,734ms(첫 썸네일·evidence3장·닫기 후 썸네일). 배율/뷰포트 조절 추가 호출0과 일치한다. 서버 handler 시간이며 ChatGPT 추론·네트워크·플랫폼 시작은 제외한다. 작은 표본으로 SLO/개선율을 주장하지 않는다. Cloud Logging 조회 한 번이500을 반환했으나 이후 읽기 재시도로7개 업무 요청 결과를 확인했고 MCP 도구 자체 오류는 없었다.
- 사용자가 **별도 모바일 원격 환경 없음**을 확인했다. Android Chrome/iPhone Safari에 대응하는 엔진·기기 프로필과 합성 호스트 검증이며 실물 Android/iOS ChatGPT 앱 통과로 주장하지 않는다. 물리 기기에서 호스트가 안전 영역을 정확히 전달하는지는 이번 환경으로 확인할 수 없다. 위 실제703×620 검사는 Windows ChatGPT 웹이며 휴대전화 검사의 대체라고 주장하지 않는다. 소스 commit/push는 하지 않았다. 아래는 이전 단계 기록이다.

### 2026-10-08 MCP 1.4.0 직원별 직접 검색·최신 갤러리 — 배포·실제 ChatGPT 검증 완료

- 기존 `deliveryPhotos.createdByEmployeeId`/`createdAt`를 재사용해 전체 거래처 순회 없이 직원별 최신 등록 기록을 조회한다. `EmployeeDirectory`는 기존 `employees.displayName` 인덱스의 이름 접두어(직함 생략 가능)로 최대20후보+1lookahead를 찾으며 동명/불완전/없는 이름을 자동 선택하지 않는다. 퇴사/중지된 대상 직원의 보관 사진도 찾을 수 있으나 호출자는 기존 활성 직원/PIN OAuth·allowlist·canonical 권한 검사를 모두 통과해야 한다. 새 업무 DB/계정/별칭·문서 backfill은 없다.
- 도구는12개다. **`get_latest_employee_delivery_gallery`**는 직원 이름 → 최신 유효 사진 → 해당 직원·거래처·서울 등록일의 기존 갤러리를 구성하고 첫 thumbnail까지 같은 응답에 담는다. **`search_delivery_records`**는 직원 이름/ID·서울 날짜·거래처 이름/ID를 AND 조건으로 조회하며 메타데이터만 반환한다. 거래처명은 중복 제거 후 최대100개를 같은 transaction에서 배치 조회한다. 직원만 지정하면 거래처 catalog scan은0이며 명시적 거래처 **이름** 해석은 기존 활성 거래처 검색을 재사용해 그 단계의 scan은 남는다.
- 공용 `DeliveryPhotoService.searchPage`는 status active + 선택 직원/거래처 + createdAt 범위 + createdAt DESC/documentId DESC를 사용한다. 기존 PWA/고객별 listPage 계약은 유지한다. 서울 자정/최근168시간/현재 상한을 함께 적용하고 조회 후 권한·만료를 검사한다. 삭제·만료·7일 초과·미래 시각은 제외하며 만료 행으로 한도에 닿으면 정확한 다음 커서와 불완전 상태를 반환한다. 최신 기록 조합 도중 삭제/변경되면 오래된 거래처/다른 사진을 결합하지 않는다.
- `registeredAt`은 기존 사진 등록 작업 시작 시각인 createdAt이다. 실제 납품완료 시각은 현 DB에 없으므로 `deliveryCompletedAt:null`, `timeBasis:photo_registered_at`과 명시적 안내를 반환한다. 사진 부재를 미납품으로 판정하지 않는다. UI v5는 같은 차이를 표시하며 기존 업체명·기록자·시간, 확대/축소·스와이프·더 보기·모달을 유지한다. 최초 썸네일의 직원/업체/사진을 검증하고 직원 조건을 페이지/이미지 이동에 유지한다. 이름 미해결/기록 없음은 안내 UI로 끝낸다.
- `firestore.indexes.json`에 active + (전체/직원/거래처/직원과거래처) + createdAt DESC + __name__ DESC의 복합 인덱스4개를 추가했다. 운영에는 REST로 **추가만** 수행해 모두 READY, 기존7개 이름/필드 보존을 확인했다. 네 조회 조건의 production Query Explain 계획이 각각 해당 인덱스를 사용한다. 기존 field override·Rules·IAM·7일 보관/8일 bucket lifecycle은 유지한다.
- 전체 unit **1,760 PASS /37 조건부 SKIP**, 별도 Chromium **14 PASS**, 실제 demo Auth/Firestore/Storage/Functions/Hosting + 공식 MCP SDK 통합 **8 PASS**. 직원 이름/동명/21후보·동시각 정렬·서울 경계·다른 직원/업체·삭제/expired active/7일 초과/미래·커서/부분결과·권한 취소·12도구 schema·갤러리 첫 표시 추가 tools/call0을 검증했다. 최초 unit과 Next build 병렬 실행에서 기존 import/이미지 검사2개가5초 timeout이었으며 빌드 종료 후 단독 전체 실행은 통과했다. 검사 기준은 완화하지 않았다.
- app/Functions typecheck·lint·Functions build·안전 설정 Next build·PWA·기존 JS/CSS 예산·diff check PASS. 운영 frontend 설정 없는 검증용 out은 Hosting artifact gate가 정상 차단했고 배포하지 않았다. **functions:employeeMcp만** 배포해 ACTIVE/revision `employeemcp-00010-xuv`, updateTime `2026-10-08T08:31:46.061328992Z` 확인. 기존71 Functions updateTime·PWA release/version·MCP Hosting version `b6e6aac27dba693f` 동일, HTTPS/OAuth/401/Origin/no-store probe PASS.
- 사용자 Chrome에서 앱 도구를 갱신한 뒤 **새 대화의 직원 이름 요청 → 최신 갤러리 tools/call1회/추가 이미지·거래처 검색 도구0회**로 이미지 load 완료. 운영 별도 읽기와 최신 거래처·서울 등록시각/기록자를 비식별 대조했고 일치했다. handler **1.489초**, 관측 문서40/thumbnail1회/응답50,106B. 기존 대화에서 같은 갤러리2회 호출된 별도 관측도 남겨 항상1회라는 보장은 하지 않는다. 갤러리3개 관측은 모두 성공/재시도0,1.489~1.987초다.
- 실제 직원·날짜·거래처 기록 검색은 이름 조건 미해결 후 확인된 ID 재조회로 총2회, 최종1건/complete=true/**1.390초**/관측 문서31/Storage0이었다(첫 응답1.436초/문서238). 운영 최신 쿼리 Explain analyze는 문서2/인덱스항목3/23.346ms, 직원·거래처·날짜 쿼리는 문서1/인덱스항목1/5.681ms. Firestore/handler 시간과 ChatGPT 추론·네트워크·플랫폼 시작은 구분하며 소량 표본으로 개선율/SLO를 주장하지 않는다. 실제 UI evidence·100→125→100%·닫기도 확인했다. 사진1장 사례였고 다중사진·페이지/모바일은 합성 검증이다.
- 운영 업무 자료를 쓰지 않았고 PIN/token·사진·이름/ID 원문이나 업무 스크린샷을 검증 파일/문서에 남기지 않았다. 사용자 PC의 임시 검증 스크립트는 삭제했다. 소스 commit/push는 하지 않았다. 사용법·경계는 [MCP 운영 문서](mcp-server.md)와 [성능 문서](mcp-performance.md)를 따른다. 아래는 이전 단계 기록이다.

### 2026-10-08 MCP 1.3.0 업체별 사진 갤러리·배율 — 배포·실제 ChatGPT 검증 완료

- 사용자 요청에 따라 `get_delivery_gallery`를 추가해 도구를10개로 확장했다. 거래처 확인 후 같은 업체/서울 날짜의 사진을 한 UI에서 표시하며 이전/다음·모바일 가로 스와이프·현재 위치/장수·사진 더 보기를 제공한다. 기본50장/최대100장의 메타데이터만 반환하고 선택한 썸네일·사용자가 연 evidence만 기존 도구로 조회한다. 업체/날짜의 사진 요청은 갤러리를 한 번 호출하도록 설명·서버 지침을 갱신했다.
- 카드·확대 화면에 기존 거래처의 현재 등록 이름을 표시한다. `CustomerService.read(..., includeClosed=true)`로 폐업 업체의 기존 사진 이름도 조회하고 기본 active-only 계약은 보존한다. 업체명이 없으면 명시적 안내를 표시한다. 등록 시각/당시 기록자와 PWA 다운로드 strict 응답은 유지한다. 업체명 조회는 기존 인가2문서+거래처1문서의 추가 관측 읽기를 사용하며 업무 쓰기/새 DB/사진 복제는 없다.
- UI 리소스v4는 **50~400%, 25% 단위 −/＋**, 맞춤100%, 확대 사진 드래그/스크롤, 모달 내 사진 이동, 닫기/ESC/배경 복귀를 지원한다. 모바일 세로 사진도 정보·버튼을 화면 안에 유지한다. 빠른 이동은 이미지 요청1개씩·최종 선택만 처리하고 페이지 echo/늦은 이미지 응답을 무시한다. 만료된 한 장은 다른 사진 이동을 유지하고 인가 취소는 전체 UI 상태를 제거한다. PIN/token/URL/내부 ID·외부 HTTP 요청·브라우저 영구 저장은 없다.
- 전체 unit **1,751 PASS / 32 조건부 SKIP**, 별도 Chromium **11 PASS**, 실제 demo Firebase 통합 **6 PASS**. 조건부 MCP17개는 별도 runner에서 실행했다. Firebase 테스트는 두 장을 페이지1/2로 이어 읽고 업체명·메타데이터만 반환하는 갤러리 계약을 검사했다. 브라우저는 실제 touch swipe, 400%/50% 한계·배율 변경 시 추가 호출0·팬·맞춤, portrait390px 레이아웃, 동시 요청 합치기·페이지 중복/비전진·만료/권한 취소를 확인했다. 합성 이미지의 실제 모바일 렌더링도 점검했다.
- app/Functions typecheck·lint·Functions build, 안전 설정 Next build·PWA·기존 JS/CSS 예산·diff check PASS. production frontend 환경이 없는 검증용 out은 Hosting artifact gate가 정상 차단했으며 배포 대상이 아니다. MCP 함수만 배포했고 실제 ChatGPT 갤러리 확인까지 완료했다.
- Cloud Functions API에서 **functions:employeeMcp만** ACTIVE / revision `employeemcp-00009-rov`, updateTime `2026-10-08T04:38:18.015162614Z` 확인. 기존71 Functions updateTime·PWA Hosting release/version·MCP Hosting version 동일 확인. HTTPS/OAuth discovery/401/Origin/no-store 공개 probe PASS. 기존 PIN/allowlist/권한·Rules·업무 데이터는 유지한다.
- 사용자 Chrome에서 도구 새로 고침 후 자연어 업체/날짜 요청으로 새 갤러리 호출·업체명·등록 정보·이미지 load 완료를 확인했다. 요청 일자의 기존 사진은1장, 최근7일은2장이었으며 후자로 한 갤러리의 **1/2→2/2**, 확대 화면의 **2/2→1/2**, **100%→125%→100%**, 닫기 버튼/ESC 복귀를 확인했다. 같은 날짜 다중 사진·스와이프·400% 팬·모바일 portrait는 합성 브라우저 검증이며 실물 휴대전화 검사와 구분한다. Windows UIA의 마지막 사진 버튼 Invoke는 버튼이 disabled로 바뀌며 예외를 보고했으나 이어서2/2·이미지 load·정상 disabled 상태를 직접 확인했다.
- 운영 계측15건(갤러리2·이미지10·거래처 검색3)은 모두 성공, 재시도0. 갤러리 서버 handler1.177~1.227초, 평균 응답1,677.5B/Storage 이미지 읽기0. 이미지 p50 1.522초/p95 1.614초이며 소량 표본, ChatGPT 추론·인터넷·플랫폼 시작 시간은 제외한다. 업무 사진/이름/ID 원문·운영 스크린샷을 파일에 남기지 않았고 사용자 PC의 임시 제어 스크립트는 삭제했다. 소스 commit/push는 하지 않았다. 아래는 이전 단계 기록이다.

### 2026-10-08 MCP 1.2.1 사진 카드·확대 뷰어 — 배포·실제 ChatGPT 검증 완료

- 사용자 요청에 따라 `get_delivery_photo` 카드 하단에 서울 기준 등록 일시와 등록 당시 기록자 이름을 표시한다. 같은 `photoId`의 `evidence`를 사용자 클릭 시 호스트 OAuth 연결로 다시 조회하며 닫기·ESC·배경 클릭, 모바일 전체 너비, 호스트 전체화면/복귀, 포커스 유지, 실패 재시도·늦은 응답 폐기를 구현했다. UI에 URL·내부 ID를 표시하지 않는다. UI 리소스는 `delivery-photo-v3.html`, 도구 수는9개 그대로다.
- `DeliveryPhotoService.getWithMetadata()`로 기존 다운로드 전후 권한/만료/generation 검사의 동일 기록에서 표시 정보를 함께 반환한다. 추가 직원/Firestore 조회·새 업무 데이터·이미지 복제·직함 추정은 없다. PWA `get()`의 strict 응답은 기존 그대로다. 모델용 구조화 응답은 유지하고 새 시각/이름은 widget-only `_meta`에 둔다.
- 전체 unit **1,748 PASS / 28 조건부 SKIP**, Chromium **7 PASS**, 실제 Firebase 통합 **6 PASS**. 조건부 MCP13개는 별도 runner에서 실행했다. 브라우저에서 표준/ChatGPT 호환 bridge, 동일 사진 evidence 호출, KST 날짜 경계, 세 가지 닫기, 모바일390px, 키보드, 잘못된 message source/다른 사진 거부, 이름 HTML 비실행, 종료/만료 시 이미지 제거, 외부 HTTP 요청0을 확인했다. 합성 사진의 실제 모바일 렌더링도 점검했다.
- app/Functions typecheck·lint·Functions build, 안전 설정 Next build·PWA·JS/CSS 예산 PASS. 최초 병렬 Next build/typecheck가 `.next/types` 재생성과 충돌해 typecheck가 실패했으나 build 완료 후 순차 재실행은 통과했다. 초기 브라우저 검사에서 Tab 포커스가 iframe 밖으로 나가는 문제를 찾아 명시적으로 순환하도록 수정했다. 검증 기준을 완화하지 않았다.
- 마지막 UI 보완은 모바일 전체 너비 패널의 빈 여백도 닫기 영역에 포함한 것이다. 캐시를 구분하기 위해 리소스를v3로 갱신했다. 보완 후 Chromium7·HTTP7·Firebase 통합6·typecheck·lint·Functions build 재검증 PASS. PWA production Hosting artifact gate는 운영 frontend 설정 없는 검증용 export를 정상 차단했으며 이 out은 배포하지 않았다.
- **functions:employeeMcp만** 운영 업데이트 완료. 최종 revision `employeemcp-00008-pog`, updateTime `2026-10-07T16:05:41.791684408Z`, ACTIVE. 기존71 Functions updateTime 및 기존 PWA release/version 동일을 재확인했다. MCP Hosting version `b6e6aac27dba693f` 유지. HTTPS/OAuth discovery/401/Origin/no-store 공개 probe PASS. 기존 인증/권한·Rules·업무 자료는 변경하지 않았다.
- 사용자 Chrome의 실제 ChatGPT에서 도구 새로 고침 → 새 카드의 날짜/시간·기록자 → 클릭 evidence 확대·이미지 load 완료 → 닫기 버튼/ESC/사진 주변 빈 패널 여백 클릭 복귀를 확인했다. 모바일은390px Chromium으로 검증했으며 실물 휴대전화 검증과 구분한다. 사진/기록자/거래처 원문이나 스크린샷을 저장소에 남기지 않았고 원격 검증용 임시 제어 파일은 삭제했다. 소스 commit/push는 하지 않았다. 아래는 이전 단계의 기록이다.

### 2026-10-07 MCP 1.1.0 고도화 — 배포 및 실제 ChatGPT 검증 완료

- 조회 도구를6→9개로 확장했다. `get_inventory_products`는 최대20개 상품을 한 transaction에서 조회하고, `list_inventory_alerts`는 부족 재고와 유통기한 임박/경과 후보를 같은 검색에서 반환한다. `get_customer_delivery_summary`는 거래처 검색/ID 확인과 납품사진 기록을 조합한다. 동명·불완전 검색은 자동 선택하지 않는다. 기존 서비스에 공용 조회 메서드를 추가했으며 새 업무 DB/파생 문서/업무 쓰기는 없다.
- 기존 이름·초성 검색을 유지하면서 서버가 최대5페이지/기본50·최대100결과를 조회한다. 페이지 경계5초 예산, 전체 도구20초 제한, 정확한 재개 커서와 `page.complete/startedFromBeginning/returnedCount/stoppedBecause`를 제공한다. 모든 도구에 output schema 및 반환값 검증을 추가했다. 순차 목록의 동시 변경 한계를 문서에 명시했다.
- 인가를 요청/조회 전후에 계속 검사하며 같은 검증 단계의 중복 직원 문서 읽기만 제거했다(인증1회5→4문서). Firebase Auth와 Firestore 검증은 병렬화한다. 일시적인 읽기 실패만250ms 뒤1회 재시도하며 재시도 전 권한을 확인한다. 인증/권한/없음/일시 장애/시간 초과 등을 안전한 코드로 구분하고 늦은 결과를 반환하지 않는다.
- `mcp_request` 구조화 계측: 버전·도구·단계별 시간·관측 읽기·메타데이터 쓰기 시도·응답 크기·완료/오류/재시도. 이름/ID/검색어/PIN/token/사진/원본 오류를 로그에 넣지 않는다. 동시 요청 계측 상태를 분리한다. 집계 도구 `scripts/report-mcp-metrics.mjs`와 [성능 운영 가이드](mcp-performance.md)를 추가했다.
- 전체 unit **1,748 PASS / 23 조건부 SKIP**, app/Functions typecheck·lint·Functions build PASS. 조건부 MCP는 별도 runner에서 Chromium2 PASS·실제 Firebase Auth/Firestore/Storage/Functions/Hosting 통합6 PASS. 기존 검색/캐시 성능18 PASS, 안전 설정 Next build·PWA·기존 JS/CSS budget PASS. 전체 unit의 최초 worker6 실행에서 기존 함수 모듈 import 검사1건이5초 timeout이었으며 단독 실행과 worker3 전체 실행은 통과했다. timeout/검증 기준은 완화하지 않았다. 이 검증용 PWA out은 운영에 배포하지 않았다.
- **functions:employeeMcp만** 운영 업데이트 완료. revision `employeemcp-00005-qiq`, updateTime `2026-10-07T14:58:25.465630266Z`, ACTIVE. MCP Hosting version `b6e6aac27dba693f`와 기존71 Functions updateTime/기존 PWA release/version 동일 확인. HTTPS/OAuth discovery/401/Origin/no-store 공개 probe PASS. IAM/Rules/보관 정책/업무 자료는 변경하지 않았다.
- 사용자 Chrome에서 도구 새로 고침 후 실제 재고 알림→상품 일괄 조회, 거래처 납품 요약→사진 UI 표시를 확인했다. 사진 load 완료와 화면에 보이는 이미지 요소도 확인했다. 운영 계측 표본6건(새 도구3종+사진)은 모두 성공, 서버 handler 시간 **1.213~1.757초**, 서버 재시도0이었다. ChatGPT 추론·네트워크·플랫폼 시작 시간을 제외한 작은 표본이며 성능 개선율/SLO로 주장하지 않는다. 관측상 현재는 인가 시간이 큰 비중이므로 향후 최적화도 취소 즉시 반영 계약을 유지해야 한다.
- 소스는 아직 commit/push하지 않았다. MCP URL과 지정 직원1명 allowlist, 기존 PIN/OAuth/read-only 경계는 유지한다. 기존6개 도구도 유지하므로 기존 조회 요청은 계속 지원한다. 아래1.0.0 기록은 이전 단계다.

### 2026-10-07 사내 MCP 실제 ChatGPT 연결·조회·사진 표시 완료

- 사용자 PC의 ChatGPT **온누리종합식품** 플러그인에서 기존 직원 PIN → OAuth 연결된 계정을 확인했다. 실제 부족 재고 조회와 기존 납품 기록·비공개 WebP 조회가 성공했다. PIN·token을 수집하거나 문서화하지 않았다. 운영 업무 자료 생성/수정/삭제는 하지 않았다.
- MCP image content가 모델에 도착해도 사용자 화면에는 보이지 않는 현상을 확인해 같은 함수에 MCP Apps 사진 UI를 추가했다. `ui://geupsikgil/delivery-photo-v1.html`, 표준 `ui.resourceUri`/ChatGPT outputTemplate, widget-only `_meta.deliveryPhoto`의 data URI로 표시한다. 공개 사진 URL·외부 요청·별도 백엔드는 없다. ChatGPT 설정의 **앱 관리 → 도구 새로 고침** 후 새 대화에서 이미지 load 완료·실제 접근성 이미지(736×600)·화면을 확인했다. 실제 이미지/직원/거래처 데이터는 문서화하지 않는다. 확인용 임시 캡처를 삭제했다.
- MCP/PIN unit23 PASS, Hosting/Functions 실제 emulator6 PASS, Chromium2 PASS. 브라우저는 PIN 승인과 사진 UI 표준 bridge·잘못된 source 거부·이미지 로드/오류·외부 요청0을 검증한다. 실제 UI 확인 후 ChatGPT 중첩 `toolResponseMetadata.mcp_tool_result` 호환 경로도 추가하고 Chromium2·typecheck·lint·Functions build·diff check PASS를 확인했다. 초기 전체 unit/Rules/PWA/성능 결과는 아래 기록을 따른다.
- 최종 **functions:employeeMcp만** 배포 완료. revision `employeemcp-00004-lag`, updateTime `2026-10-07T14:15:05.554642728Z`, ACTIVE. MCP Hosting은 version `b6e6aac27dba693f` 유지. 배포 후 기존71 Functions updateTime 및 기존 PWA Hosting release/version 동일을 재확인했다. 실제 사진 표시 검증은 revision00003에서 완료했고, 최종00004는 호환 bridge 추가 및 Chromium 재검증이다.
- MCP URL `https://onnuriway-mcp.web.app/mcp`, 조회 도구6개, 기존 지정 직원1명만 허용. 사진은 기존168시간 보관 범위, 부족 재고는 기본 합계0 기준이다. 운영/연결/검증/쓰기 확장은 [MCP 운영 문서](mcp-server.md). 소스는 아직 commit/push하지 않았다. 아래 연결/검증 대기 항목은 과거 단계의 기록이다.

### 2026-10-07 실제 ChatGPT OAuth 호환성 수정

- 사용자 PC의 실제 ChatGPT 플러그인 UI에서 첫 연결을 진행했다. ChatGPT가 `/authorize`에 보내는 `ui_locales=ko-KR`를 strict OAuth schema가 거부하는 `invalid_request`를 발견했다. RFC 6749에 맞춰 authorize/token의 알 수 없는 확장 파라미터는 제거하고, 기존 client/redirect/resource/scope/PKCE 필드 검증은 그대로 유지했다. PIN consent schema는 strict를 유지한다.
- 실제 요청 형태 회귀 unit 추가 및 Chromium/Hosting Emulator 요청에 locale을 포함했다. MCP/PIN unit23 PASS(조건부7 별도실행), Chromium1 PASS, 실제 Firebase 통합6 PASS, app/Functions typecheck·lint·Functions build PASS. 총30개 MCP/PIN 검사를 각 runner에서 실행했다.
- `--project onnuriway --config firebase.mcp.json --only functions:employeeMcp` 업데이트 완료. revision `employeemcp-00002-huf`, updateTime `2026-10-07T13:24:57.840122729Z`. 운영 locale 포함 DCR→PIN 폼, 공개 OAuth/HTTPS probe PASS. 기존71 Functions updateTime 및 기존 PWA Hosting version/release 동일을 다시 확인했다. MCP Hosting도 기존 version 유지.
- 실제 계정의 ChatGPT 연결된 계정 표시를 확인했다. 현재 PC UI에서 이름 정리·도구 및 실제 조회 검증을 진행 중이다. PIN을 수집하거나 출력하지 않는다. 실제 UI 진입 경로는 **플러그인 → 추가 → 맞춤형 MCP 서버 만들기**로 문서에 반영했다.

### 2026-10-07 사내 Remote MCP 운영 배포 완료 / 실제 ChatGPT 연결 결과 대기

- 사용자가 지정한 기존 직원 1명을 active·비관리자·authz/session 일치·Auth enabled로 확인하고 비공개 allowlist에 반영했다. 직원 ID/PIN/token은 문서화하지 않는다. TTL `mcpPrivate.expiresAtTTL` ACTIVE 확인.
- `--project onnuriway --config firebase.mcp.json`에서 **functions:employeeMcp → hosting:onnuriway-mcp**만 배포했다. 함수 ACTIVE / revision `employeemcp-00001-cod`, Hosting version `b6e6aac27dba693f`, release `1791378106859000`, release time **2026-10-07T13:01:46.859Z**. MCP 주소는 `https://onnuriway-mcp.web.app/mcp`, 인증 OAuth다.
- 운영 HTTPS/discovery/issuer/PKCE/401 challenge/Origin 차단/no-store PASS. 운영 DCR 및 Firestore authorization flow 생성, 한국어 PIN 승인 폼, Secure/HttpOnly/SameSite=Lax cookie PASS. 실제 PIN 제출이나 업무 데이터 조회는 하지 않았고 검증용 인증 메타데이터만 생성했다. 실제 ChatGPT 연결·도구 6개·재고 조회·사진 표시 결과는 사용자 확인 대기다.
- 배포 전후 기존 Functions **71개 updateTime 동일**, 기존 PWA Hosting release/version 동일을 재조회 검증했다. 새 함수 runtime SA·PIN secrets 2개·allowlist 1명·최대 instance3/concurrency4도 확인했다. 기존 Rules·업무 데이터 변경 없음. 새 제품 소스 변경 없이 비공개 설정 후 배포했고 배포 predeploy Functions build 및 diff check PASS. 앞선 전체·MCP·Emulator·Chromium·Rules 검증은 아래 기록을 따른다.
- 아직 commit/push하지 않았다. 개인 설정은 ignored `functions/.env.onnuriway`이며 Git에 포함하면 안 된다. 현재 PWA `out`은 운영 배포에 사용하지 않는다. 상세 운영/연결/제약은 [MCP 문서](mcp-server.md). 아래 인증/직원 선택/배포 대기 항목은 이전 시점 기록이다.

### 2026-10-07 MCP 배포 인증 및 전용 인프라 준비

- 사용자의 Firebase 배포 인증 요청에 따라 공식 CLI 원격 브라우저 로그인을 완료했다. 계정 정보·일회용 코드·토큰은 문서화하지 않는다. `onnuriway` 기존 Functions 71개·Hosting을 조회하고 Functions/Hosting 배포, 전용 SA/custom role 생성, 프로젝트·두 PIN secret IAM 설정 권한을 확인했다.
- 전용 Hosting `onnuriway-mcp`, `mcp-readonly-runtime` SA, `mcpDeliveryPhotoRead` custom role(storage.objects.get만)을 생성했다. 새 SA에 프로젝트 datastore.user/firebaseauth.viewer, 두 PIN secret 각각 secretAccessor, 기존 납품사진 bucket에 get-only role만 추가했다. 변경 전후 IAM을 비교해 기존 binding 보존과 새 SA 역할을 검증했고 bucket lifecycle/access 설정도 동일하다. 기존 앱 배포·Rules·업무 데이터는 변경하지 않았다.
- 납품사진 customerId ASC/createdAt DESC 인덱스 READY. `mcpPrivate.expiresAtTTL` TTL 활성화를 요청했으며 마지막 재조회는 CREATING이다. 기존 사진 runtime 설정과 새 MCP origin은 ignored `functions/.env.onnuriway`에 준비했다. PIN secret 값은 읽지 않았다.
- **남은 필수 설정:** 활성 비관리자 직원 10명 중 MCP 허용 직원 선택. 사용자에게 직원 식별 코드만 질문했으며 PIN을 요청하지 않았다. allowlist가 결정되기 전 전원을 허용하거나 MCP 함수를 배포하지 않는다. 함수/전용 Hosting 콘텐츠 배포, 공개 probe, 사용자의 실제 ChatGPT 연결은 아직 남아 있다. 아래 인증 없음/운영 변경 없음 표기는 이전 구현 단계의 기록이다.

### 2026-10-07 사내 Remote MCP — 구현·로컬 검증 / 배포 인증 대기

- 사용자 요청: 기존 직원 PIN으로 ChatGPT에서 실제 급식길 조회. 조사 후 사용자가 **직원 PIN 계정**을 선택했다. 기존 Google 관리자 PIN 금지 경계는 유지한다. 기준 HEAD `04272ec`, 시작 worktree clean이며 이 변경은 아직 commit/push/배포하지 않았다.
- 기존 Functions 내부 `employeeMcp`와 별도 Hosting `onnuriway-mcp` 설정을 추가했다. 기존 PIN verifier·Customer/Inventory/DeliveryPhotoService·권한 검사를 재사용하고 stateless Streamable HTTP, OAuth code+PKCE, 15분 access/회전 refresh(최대30일), 허용 직원, 공유 rate limit, session/permission/account 재검증을 적용했다. 도구는 거래처 검색·상품 검색·상품 재고·부족 후보·납품사진 기록·이미지의 6개이며 쓰기는 없다. 인증 메타데이터만 기존 로그인 기록 및 새 private namespace에 기록한다.
- `firebase.mcp.json`과 `scripts/deploy-mcp.mjs`는 **functions:employeeMcp / hosting:onnuriway-mcp**만 대상으로 한다. 기존 PWA·다른 Function·Rules 배포/업무 데이터 쓰기는 수행하지 않았다. 전용 runtime SA, PIN secret 접근, 납품사진 bucket get-only 권한, mcpPrivate TTL, 허용 직원 ID 설정은 인증된 배포 환경에서 준비해야 한다. 새 SA와 기존 납품사진 SA를 분리하고 IAM을 임의로 넓히지 않는다.
- Node22 typecheck/lint/Functions build PASS. 최종 전체 unit 1,730 PASS/22 조건부 SKIP(기존15·MCP7, MCP7은 전용 runner에서 실행), MCP 실제 Auth/Firestore/Storage/Functions/Hosting 통합 6 PASS·Chromium 승인 UI 1 PASS·최종 MCP/PIN unit22 PASS, Rules 51 PASS, Next safe build/PWA/성능·bundle gate PASS. frontend 재사용 검색 함수 이동도 기존 JS/CSS 상한을 유지한다. audit high/critical0·moderate7이며 호환 보안 패치를 함께 적용했다.
- 운영 frontend 설정이 없는 검증용 `out`은 production Hosting gate에서 정상적으로 거부되었다. **이 out을 운영 PWA에 배포하면 안 된다.** MCP는 별도 `mcp-public`만 사용한다. 운영 변경은 전혀 없다.
- 현재 클라우드에 GCP identity와 Firebase CLI 로그인 계정이 없어 배포하지 못했다. 예정 공개 MCP discovery는404이며 실제 ChatGPT 연결 완료로 주장하지 않는다. 인증된 환경 준비 방식에 관한 사용자 답변 대기 중이다. PIN·키를 채팅으로 받지 않는다. 배포 후 공개 probe와 사용자의 최초 PIN 연결/실제 조회 확인이 남아 있다.
- 상세 조사·보관/부족 기준 제약·인증·배포/ChatGPT 연결·검증/미확인·쓰기 확장: [MCP 운영 문서](mcp-server.md). 납품 기록은 최근168시간 사진 증빙이며 장기 납품 장부가 아니다. 상품별 안전재고 기준도 없으므로 기본 부족 후보는 합계0으로 명시한다.

### 2026-10-05 리팩토링 — main 저장 및 운영 Hosting 배포 완료

- 제품 source `c8fbea7aad7206e6897669ae9ddbabc11eda320f`를 main에 push하고 기존 배포 PC의 clean main도 같은 커밋으로 fast-forward했다. 아래의 미커밋·미배포 표기는 구현 완료 당시 기록이다. [Quality Gate 37293442115](https://github.com/kim-DL/ONWAY/actions/runs/37293442115)는 **2026-10-05 19:19:25 KST 전체 SUCCESS**다. audit·lint·typecheck·unit·검색/캐시 성능·Functions build·정적 build·PWA·기존 JS/CSS budget·일반 browser·Deferred sales·Phase 17·Inventory photo regression을 통과했다.
- 배포 PC의 기존 비공개 운영 설정과 Node 22.23.2/npm 10.9.8로 다시 빌드했다. 사진·재고 flag ON, Emulator OFF, PWA revision은 위 source다. build·PWA·성능·Hosting artifact gate PASS이며 export/shipped 102개, precache 89개, initial assets 9개다. 운영 gzip은 initial JS 139,925B, 영업 workspace 14,323B, inventory JS 25,537B/CSS 6,649B, customer JS 36,830B로 기존 한도를 유지했다. 클라우드 안전 설정 `out`은 배포하지 않았다.
- `--project onnuriway --only hosting:onnuriway --non-interactive`로 Hosting만 한 번 배포했다. Live version `663003d922fb2290`, release `1791195640851000`, release time **2026-10-05 19:20:40.851 KST** (`2026-10-05T10:20:40.851Z`), 직전 rollback version `e5ca163b724d3239`다. 서버 리팩토링은 Git에 포함되지만 Functions는 이번 Hosting 요청에 따라 배포하지 않았다. Rules·Auth·운영 업무 데이터도 변경하지 않았다.
- `https://onnuriway.com`과 `https://onnuriway.web.app`에서 canonical 공개 HTTP 검사 각각 25개 PASS. 공개 worker는 후보 SHA-256 `20aa159d3a9aeca9f142ab0ade71a6cca170d03a9587d1545463421c40294c44`와 일치하며 www HTTPS는 301로 apex에 이동한다. 비공개 env 파일의 전후 digest는 동일하고 작업 트리는 clean이었다. 배포 후보 102파일 manifest·전후 release metadata·검증 로그는 배포 PC의 ignored `output/refactor-hosting-20261005/`에 보존했다.
- 이번 운영 검증은 공개 GET/HEAD 검사다. 실제 계정 로그인·App Check·Kakao 지도·현장 기기의 설치 PWA 업데이트/오프라인/세션 유지는 이번 배포에서 직접 검증하지 않았으며 자동 회귀 결과와 구분한다. 기록은 docs-only 후속 커밋으로 main과 PC에 동기화하며 제품 소스가 같으므로 중복 배포하지 않는다.

### 2026-10-05 동작 보존 리팩토링 — 적용·자동 검증 완료 / 미커밋·미배포

- 사용자의 예상 효과 보고 후 구현 지시에 따라 관리자 페이지·폼, 학교 현장정보 patch/editor, 서버 재고 codec·lot 계산·실사 projection, 네 Callable 모듈의 동일 private 응답 헤더를 분리했다. UI 영업 방문 입력의 동일 shape/refinement를 공유하고 담당학교 필터를 재사용했다. 관리자 진입점은 2,790→180행, 전역 CSS는 같은 순서의 12개 파일과 14행 진입점으로 분리했다. 전체 변경·보존 계약은 [실행 결과](refactoring/result-2026-10-05.md)를 참고한다.
- **범위 조정:** 재고 catalog/calendar hook 분리와 영업 모델 파일 분리는 압축 예산을 초과해 보류했다. 재고 workspace 제품 코드는 HEAD와 완전히 동일하며 관찰형 lifecycle 검증을 24→30개로 보강했다. 영업은 기존 `useMemo` 안의 중복 필터 제거만 유지한다. 추가된 파일이 많거나 작은 파일이 됐다는 이유만으로 성능 개선을 주장하지 않는다.
- **현재 후보 PASS:** lint, 앱·Functions typecheck, Functions build, unit **1,716 PASS / 15 기존 SKIP**, 성능 unit 18 PASS, CI 안전 설정 static build·PWA·모든 기존 JS/CSS budget. 검색 5,000개 index 70.31ms, p95 1.83ms, 입력 중 요청 0회다. 일반 browser 286 PASS / 4 기존 SKIP, demo acceptance 12 gates PASS(Rules 50 PASS, NEIS 3 PASS, 업무 browser 76 PASS / 재고 전용 18 SKIP), 별도 재고 static browser 18 PASS와 transaction integration 12 PASS다.
- 일반 unit의 Emulator 15 SKIP과 acceptance의 재고 18 SKIP은 전용 runner에서 모두 실제 실행·통과했다. 일반 browser의 개인 PC JPEG 부재 4개만 미실행이다. 원본 동일 HEAD도 독립 worktree에서 동일 종합 검증을 통과했으며, 최초 생성 HTML 누락과 motion 간헐 사례까지 [기준선](refactoring/baseline-2026-10-05.md)에 기록했다. assertion·timeout·skip·예산은 완화하지 않았다.
- 최종 안전 설정 gzip: initial JS **139,889B**, 영업 workspace assets **14,323B**, inventory JS **25,537B**, inventory CSS **6,649B**, customer JS **36,829B**. CSS 15개 산출물은 원본과 byte 내용이 같다. [번들 결과](refactoring/bundle-result-2026-10-05.json)에 모든 경계와 한도를 보존했다. byte 여유가 여전히 작으므로 다음 변경도 실측해야 한다.
- source base는 `28af4c5764860fb1305d5d8e6ea69e921db65ca5`이고 변경본 648파일 manifest SHA-256은 `e4927f1b6c458e9542b1cf6961b05e6878052657f5d2ef62bc2a048d04ccff68`다. 제품·테스트·스크립트·설정을 포함하고 문서는 제외한다. 현재 작업 트리에 저장했으며 commit/push/배포는 수행하지 않았다. 현재 `out`은 마지막 demo acceptance 설정의 검증용 결과이므로 운영에 배포하면 안 된다.
- **릴리스 전 남음:** 실제 운영 설정으로 다시 build 후 PWA·성능·Hosting gate를 수행해야 한다. 이번 `verify:hosting:build`와 실기기/운영 smoke는 미실행이다. 의존성·lockfile·Rules·DB schema는 그대로다. audit moderate 8/high 0/critical 0 중 신규 `ip-address` 개발 의존 항목은 기존 기한부 예외에 자동 편입하지 않고 별도 보안 작업으로 남겼다. [실행 계획](superpowers/plans/2026-10-05-onnuriway-refactoring.md)의 완료·보류 표기와 인가/receipt/계약 소유권 문서를 먼저 읽고 후속 작업을 진행한다.

### 2026-10-05 리팩토링 사전 준비 — 스킬 설치·읽기 감사·계획 완료

- 아래는 위 실행 기록 이전의 사전 준비 당시 상태다. 기준 HEAD는 `28af4c5764860fb1305d5d8e6ea69e921db65ca5`이며 시작 작업 트리는 clean이었다. 당시 산출물은 준비 문서와 스킬 설치 정보였으며 이후 실제 적용 결과는 위 항목을 따른다.
- OpenAI·Anthropic·xAI 공식 출처를 우선 조사한 뒤 Superpowers 3개(OpenAI 카탈로그 배포, 원작자 obra), Vercel React 2개, Firebase Rules auditor를 현재 클라우드의 `/home/agent/.agents/skills/`에 설치했다. 6개/112개 파일의 고정 commit·SHA-256을 검증했다. 자동 스킬 목록 반영은 미확인이며 파일을 직접 읽어 적용한다. [선정·설치 기록](refactoring/skills-review-2026-10-05.md)과 [잠금 정보](refactoring/skills-lock.json)를 참고한다.
- 공식 Node 22.23.2/npm 10.9.8과 기존 lockfile로 의존성을 준비했다. lint·app/Functions typecheck·Functions build, unit 1,708 PASS/15 SKIP, 성능 18 PASS, CI 안전 설정의 Next16.3.8 production-mode build·PWA·JS/CSS gate PASS. audit는 moderate 8/high 0/critical 0이다. 과거 예외 7개와의 차이는 Firebase CLI 개발 의존성 `ip-address@10.5.0`으로 확인했다. 정적 조사에서 production 실행 경로는 미발견이나 기존 예외에 자동 포함하지 않고 조치/수용 결정은 별도로 남긴다.
- bundle 여유가 재고 CSS gzip 7B, 영업 workspace gzip 12B, 거래처 JS gzip 35B, 재고 JS gzip 63B로 작다. 구조 이동마다 기존 상한을 유지한 전후 측정이 필요하다. 이 산출물은 운영 Firebase 설정의 release candidate가 아니며 Hosting gate·Emulator/Rules·브라우저·실기기 검증은 이번에 실행하지 않았다. [현재 기준선](refactoring/baseline-2026-10-05.md)에 측정과 제한을 구분했다.
- 다음 작업은 [리팩토링 실행 계획](superpowers/plans/2026-10-05-onnuriway-refactoring.md)의 R0/R1 잔여 계약·demo 여정 고정 후 관리자 읽기 화면(R2)과 동일 응답 헤더(R3)부터 작게 진행한다. 인증·사진 lease·receipt 정책을 무리하게 공통화하지 않는다. 프런트/백엔드 독립 감사와 단계별 검증·되돌리기 조건을 계획에 연결했다.

### 2026-10-05 모바일 재고 디자인 — Git 저장 및 운영 Hosting 반영 완료

- 사용자의 Git 저장·Hosting 배포 요청에 따라 최종 제품 source `99afbc13d794731308da36472368a643692c28a4`를 main에 push하고 배포했다. 아래 개발 미리보기의 “운영 미반영”은 당시 기록이며 이 항목이 최신 상태다. 보관 장소는 마지막 선택인 플로팅형 + 화이트, 제조사/규격은 분홍색 공통 버튼과 중앙 정렬, 선택 항목은 노랑/검정, 신규 기본 단위는 봉이다. 기존 품목 단위와 이력 보호를 유지한다.
- 정확한 source의 [Quality Gate 37265827098](https://github.com/kim-DL/ONWAY/actions/runs/37265827098)는 **2026-10-05 14:21:08 KST 전체 SUCCESS**다. audit·lint·typecheck·unit·검색/캐시 성능·Functions/production build·PWA·기존 JS/CSS budget·Safe configuration browser·Deferred sales·Phase 17·Inventory 상품사진 회귀까지 통과했다. 검사·성능 budget·의존성 값을 변경하지 않았다.
- 로컬 재고/Functions 단위 511 PASS, PWA 단위 17 PASS, 전체 lint 및 app/Functions typecheck PASS. Next 16.3.8 production build와 PWA·성능·Hosting artifact gate PASS. Export 102개/precache 89개/initial assets 9개이며 inventory CSS 28,777B raw/6,649B gzip으로 기존 gate를 통과했다. 배포 직전 source/main 일치, clean worktree와 후보 파일 digest를 확인했다.
- `--project onnuriway --only hosting:onnuriway --non-interactive`로 Hosting만 한 번 배포했다. Live version `e5ca163b724d3239`, release `1791177902201000`, release time **2026-10-05 14:25:02.201 KST** (`2026-10-05T05:25:02.201Z`), rollback version `57fef6f82bf25e8d`다. Functions·Rules·backend Auth·운영 업무 데이터는 변경하지 않았고 비공개 env 파일의 전후 digest도 동일하다.
- apex와 기본 Hosting origin의 canonical 공개 HTTP 검사 각 25개 PASS. 두 origin의 공개 worker/배포 자산이 후보와 일치하며 worker SHA-256은 `9c964818a08fed6cfb04aa8ff94d7433acdd62b168c505ebc7a717b94b0fd7c8`다. www는 HTTPS 301로 apex에 이동한다.
- Codex 운영 브라우저의 별도 창에서 앱의 업데이트 버튼을 적용한 뒤 기존 인증 복원, 후보에 포함된 로드 자산 11개, controlled reload 뒤 로그인 유지와 console warning/error 0개를 확인했다. 390px에서 보관 장소 48px/화이트 선택, 등록 버튼 50px/16px/700/중앙 정렬/공통 분홍색, 신규 봉의 노랑/검정 선택, 가로 넘침 없음 PASS. 빈 등록 화면은 저장하지 않고 닫았고 기존 사용자 창은 수정하지 않았다. 320px 레이아웃·규격/제조사 picker의 선택색 검증은 앞선 demo 개발 브라우저 결과와 구분한다.
- 이번 디자인의 실제 기기·설치 PWA 체감 확인은 사용자가 배포본으로 진행한다. 앞선 사진·PWA·실사 기능에 대한 사용자 PASS를 이번 새 디자인의 실기기 PASS로 사용하지 않는다. 기록은 docs-only 후속 커밋으로 main에 저장·로컬 동기화하며 제품 내용이 같으므로 문서 커밋을 중복 배포하지 않는다. 비공개 값을 제외한 release metadata·후보·검증 결과와 빈 등록 화면 캡처는 ignored `output/design-hosting-20261005/`에 있다.

### 2026-10-05 주석 기반 디자인 작업 — 개발 미리보기

- 운영 설정을 연결했던 localhost PIN 화면은 App Check의 정식 앱 주소 안내로 막혔다. 디자인 작업용 화면을 `http://127.0.0.1:3000`의 Next dev + `demo-onnuriway` Auth/Firestore/Functions/Storage Emulator로 전환했다. 기존 `.env.local`/운영 설정을 수정하지 않고 프로세스 환경으로 demo 설정을 지정한다. 운영 PIN 대신 저장소의 샘플 계정으로 로그인 및 새로고침 후 인증 복원을 확인했다. 운영 데이터/보안 설정/Hosting은 변경하지 않았다.
- 실행 중인 개발 서버와 Emulator는 이번 세션용이다. 재시작 시 Functions build → `node scripts/firebase-emulators.mjs start` → demo 전용 `scripts/seed-emulator.ts` → ignored `output/design-preview/start-preview.ps1` 순서로 준비한다. Seed는 demo 데이터를 초기화하므로 작업 중인 Emulator에 임의로 다시 실행하지 않는다. PIN/키는 문서나 로그에 출력하지 않는다.
- 최신 사용자 주석에 따라 제조사/규격 버튼을 #FF467A 배경, #351529 글자, 16px/700 중앙 정렬과 얕은 입체 그림자로 통일했다. 제조사 미선택 문구는 “제조사 선택하기”다. 원산지·단위·유통기한 및 규격 picker의 선택 radio, 제조사 목록/최근 사용의 선택 항목은 #FFD444 배경/검정 글자로 표시한다. 규격 미선택 문구는 “규격 선택하기”, 선택 후에는 기존 “규격 · 값”으로 표시한다. 단위는 봉→낱개→팩→병→직접입력 순서이며 신규 등록 기본값도 봉이다. 기존 품목 수정 시 저장된 단위와 이력 보호는 유지한다.
- 관련 form/manufacturer picker 테스트 40 PASS 뒤 배포 전 inventory/Functions 단위 511 PASS, PWA 단위 17 PASS, 전체 lint 및 app/Functions typecheck PASS. 실제 Codex 개발 브라우저에서 지정한 두 배경색/글자색, 신규 봉 기본 선택, 규격 목록 열기와 1000g 선택 반영을 확인했다. 기존 registration/E2E의 신규 단위·버튼 문구 기대값을 갱신하고 단위 변경 후 focus 검증은 낱개→봉의 명시적 전환으로 유지했다. 사용자 요청으로 Git 저장과 Hosting 배포를 준비하며 아직 운영 반영 전이다.
- 보관 장소 디자인은 공식 Mantine/Radix·Material·shadcn/ui를 참고한 모바일 비교 후보를 제시한 뒤, 사용자의 마지막 선택인 **플로팅형 + 화이트**를 적용했다. 기존 재고 팔레트와 가까운 슬레이트 트레이 #E8EEF5, 선택 배경 #FFFFFF/글자 #273549/1px 테두리 #788A9D이며 선택 버튼에만 얕은 그림자를 둔다. 선택 글자 대비 12.41:1, 비선택 글자 대비 4.88:1. 터치 높이는 48px이고 눌림은 1px 이동/0.98배 축소 및 내부 그림자로 표현한다. 기존 aria-pressed/focus-visible/reduced-motion 처리는 유지한다. 실제 Codex 개발 브라우저의 320px/390px에서 다섯 버튼의 48px 높이, 글자 잘림·가로 넘침 없음을 확인했다. 앞선 맑은 블루 시안은 마지막 화이트 선택으로 대체했다.
- 첫 candidate `ff886e0`는 inventory CSS raw, `1c8a91b`는 gzip budget 초과로 배포하지 않았다. 후속 수정은 제조사/규격 공통 버튼 클래스, 동일한 버튼 대상/특이도의 짧은 선택자와 중복 제거로 스타일을 정리하고 CSS module 이름을 `inventory-form.module.css`로 간결하게 했다. 겹친 그림자·hover 장식은 줄이되 선택/눌림/키보드 효과를 보존한다. 기능·권한·budget·의존성은 변경하지 않았다. inventory/Functions 단위 511 PASS, 전체 lint 및 app/Functions typecheck PASS. 최종 production candidate의 inventory CSS는 28,777B raw/6,649B gzip으로 기존 28.5KiB/6.5KiB gate PASS다. 최종 source build/CI/배포 결과는 별도 기록한다.

### 2026-10-05 인증 저장소 일치 수정 운영 Hosting 반영 완료

- 사용자 요청 범위를 새 창 로그인 유지 수정으로 한정했다. 최신 main/source `37cf2e9c972c3acd0f124c5c713d53a1803fe269`와 live `b5b031dbcf146a3b`를 대조해 미반영을 확인했다. 해당 source의 [Quality Gate 37179011488](https://github.com/kim-DL/ONWAY/actions/runs/37179011488)는 전체 SUCCESS다. 아래 10월 4일의 “미배포/실기기 미확인”은 당시 기록이며 이 항목이 최신 상태다.
- 로컬 설치 Next 16.3.3과 lockfile 16.3.8의 불일치를 발견해 첫 후보를 사용하지 않고 기존 lockfile로 npm ci를 완료했다. Next 16.3.8, 사진/재고 기능 ON, emulator OFF 및 기존 비공개 설정으로 production build와 PWA·성능·Hosting gate PASS. Export/shipped 102개, precache 89개, initial assets 9개다. 제품 코드나 의존성 파일은 추가 변경하지 않았다.
- 사용자가 명시적으로 승인한 Hosting만 한 번 배포했다(프로젝트 onnuriway, 대상 hosting:onnuriway). Live version `57fef6f82bf25e8d`, release `1791152317653000`, release time **2026-10-05 07:18:37.653 KST**, rollback version `b5b031dbcf146a3b`. Functions·Rules·backend Auth·운영 업무 데이터는 변경하지 않았다.
- apex와 기본 Hosting origin의 canonical 공개 HTTP 검사 각 25개 PASS. 두 origin의 worker SHA-256은 후보 `b2d41262dc2136dbf78f79de59be726e194dbecd498032c5b4b9457a60fb603f`와 일치한다. www는 HTTPS 301로 apex에 이동한다. 기존 비공개 env 파일의 전후 digest는 동일하다.
- 실제 운영 apex의 기존 인증 browser session에서 앱의 업데이트 버튼으로 새 버전을 적용하고 로드된 layout/page/webpack 자산이 후보와 일치함을 확인했다. A 창의 빈 거래처 등록 화면에 합성 문자열만 입력한 뒤 B 창을 열어 양쪽 인증 유지와 A 편집 내용 보존을 확인했다. B에도 별도 임시 입력을 넣어 동시 편집 유지 PASS, B 새로고침 뒤 A 입력 유지/B 로그인 복원 PASS, 반대로 A 새로고침 뒤 B 입력 유지/A 로그인 복원 PASS. 저장은 제출하지 않았으며 기존 거래처 수정이나 동시 저장 충돌 검사는 운영에서 실행하지 않았다. 실제 동시 저장 회귀의 근거는 source의 전체 CI다.
- 마지막 B 임시 입력의 취소 확인창에서 브라우저 도구가 응답하지 않아 사용자에게 해당 확인창 닫기를 요청했다. 따라서 최종 창 정리·console/SW 최종 재검사는 완료로 주장하지 않는다. 핵심 인증/새 창/양방향 새로고침 검증은 이 확인창 전에 통과했다. 업무 화면/개인정보/인증정보는 증거에 저장하지 않는다.
- 사용자는 실제 iPhone 상품사진 촬영·미리보기·저장, 설치 PWA 및 현장 실사 흐름을 직접 확인했고 모두 PASS라고 보고했다. 이는 사용자 실기기 확인 결과이며 이번 desktop 자동 검증과 구분한다. 해당 기능을 이번 범위에서 수정하거나 다시 검증하지 않았다.
- 배포·빌드·후보 manifest·공개 HTTP·비식별 browser 판정은 ignored `output/auth-hosting-20261005/`에 보관한다. 이 배포 기록은 docs-only 후속 커밋으로 main에 저장·동기화하며 제품 source는 37cf2e9와 같아 문서 커밋을 중복 배포하지 않는다.

### 2026-10-04 새 창 로그인 저장소 이동으로 편집 화면이 닫히는 문제 — 로컬 수정 검증

- `e3264ef`의 [Quality Gate `37176011731`](https://github.com/kim-DL/ONWAY/actions/runs/37176011731)는 두 시도 모두 Phase 17의 `phase7-school-detail.spec.ts` 동시 수정 검사에서 실패했다. 두 번째 창의 저장 후 첫 번째 편집 dialog가 없었으며 각 시도는 업무 여정 75 PASS/18 conditional SKIP였다. 앞서 수정한 영업 버튼 접근성 검사는 통과했다. 상품사진 마지막 검사는 선행 실패 때문에 실행되지 않았다.
- 설치된 Firebase SDK의 `getAuth`는 IndexedDB를 우선하지만 현재 AuthProvider는 browserLocalPersistence를 명시한다. 새 창에서 초기화 중 기존 localStorage 사용자 정보를 IndexedDB로 옮겼다 다시 돌리는 과정이 다른 창에 일시적인 사용자 없음 이벤트를 만들 수 있다. demo 환경에서 그 SDK 저장소 이동을 500ms 지연시키자 기존 창의 PIN 화면 노출·편집 dialog 소실과 같은 실패를 5회 중 4회 재현했다. 단순 CPU4 반복에서는 5회 PASS였으므로 timing 조건을 구분한다.
- Client는 `initializeAuth`의 저장소 순서를 Local → IndexedDB → Session으로 지정해 기존 AuthProvider와 처음부터 일치시킨다. 기존 IndexedDB/Session 사용자의 복원·이동 경로와 Google popup resolver를 유지하고, 이미 초기화된 인스턴스는 재사용하며 다른 초기화 오류는 숨기지 않는다. AuthProvider의 토큰/권한 검증·App Check·Rules·backend Auth 설정은 바꾸지 않았다.
- 수정 후 같은 production-mode demo 환경/저장소 이동 지연/CPU4 동시 수정 여정 5회 연속 PASS. 인증·PWA 관련 단위 55 PASS, 전체 lint 및 app/Functions typecheck PASS. 최종 source의 원격 Quality Gate 결과를 별도로 확인한다. 일시적인 probe·CPU 설정·저장소 지연·반복 launcher·진단용 timeout 변경은 최종 diff에서 모두 제거했다. 원래 Phase 7 여정과 모든 assertion/timeout/접근성 규칙/budget을 유지한다.
- 이 수정은 아직 운영 Hosting에 배포하지 않았다. 현재 live는 아래의 `b5b031dbcf146a3b`이며 재확인한 PIN/worker/reload 결과를 이번 로그인 저장소 수정의 운영 증거로 사용하지 않는다. 사용자는 이번 상품사진의 실제 iPhone 촬영 → 미리보기 → 저장을 아직 확인하지 않았다고 답했다. 설치 iPhone PWA 업데이트도 사람 확인이 남는다.

### 2026-10-04 공유 인수문서 재개 점검 및 영업 버튼 접근성 검사 안정화

- 공유 `ONWAY-HANDOFF-2026-10-04.md`는 상품사진 Hosting 배포 전의 기록이다. 최신 Git와 Hosting API를 읽기 전용으로 재확인했다. main은 `f217828`까지 동기화돼 있었고 live version `b5b031dbcf146a3b`와 release `1791083477808000`은 아래 배포 기록과 같았다. 두 origin의 canonical HTTP 검사 각 25개가 다시 PASS했다. 상품사진 수정을 중복 배포하지 않았다.
- Codex in-app browser에서 apex의 기존 인증 세션 복원과 controlled reload 후 인증 업무 화면 복원을 확인했다. 기본 origin에서는 PIN 입력 화면 및 reload 후 화면 유지를 확인했다. 두 origin 모두 `/sw.js`가 activated/controller 상태였고 관찰한 console warning/error는 각각 0개였다. PIN 로그인을 새로 제출하거나 운영 업무 데이터를 쓰지 않았다. 이 desktop browser 결과는 실제 iPhone/native HEIC/설치 PWA 업데이트의 증거가 아니다. 비공개 화면·계정·출입정보는 검증 산출물에 저장하지 않는다.
- 문서 기록 커밋 `f217828`의 [Quality Gate 첫 시도 `37173462612`](https://github.com/kim-DL/ONWAY/actions/runs/37173462612)는 Phase 17의 `phase9-sales-cycle.spec.ts` 학교 일괄 담당 지정 접근성 검사에서 실패했다. 선택 직후 enabled 버튼이 disabled opacity 0.55에서 1로 전환되는 170ms 중에 axe가 측정해 흰 글자/합성 배경 `#82aaeb` 대비 2.35를 보고했다. 배포 source `1029938`과 제품 코드는 같았다. 로컬 진단에서도 enabled=true 직후 opacity 0.679065와 running animation을 확인했고 종료 후 opacity는 1이었다.
- 해당 E2E는 담당 지정 버튼이 enabled인지 단언하고 실제 실행 중/대기 중 CSS transition이 0이 된 뒤 기존 axe 및 터치 크기 검사를 수행하도록 최소 수정했다. 접근성 규칙·assertion·timeout·CSS·제품 코드·budget은 변경하지 않았다. 일시적인 진단 출력·반복 launcher 변경은 최종 diff에서 제거했다. 기존 CSS가 만드는 전환 중간 상태와 검사 시점의 경합을 해결하며 버튼의 최종 색 대비 검사는 그대로 유지한다.
- production-mode demo Emulator 집중 여정 5회 연속 PASS, 집중 lint와 app/Functions typecheck PASS. 기존 main의 같은 HEAD 원격 재실행과 이번 기록/테스트 변경을 포함한 [main Quality Gate](https://github.com/kim-DL/ONWAY/actions/workflows/ci.yml?query=branch%3Amain)를 별도로 확인한다. 최종 판정은 해당 HEAD의 실제 CI 결과다. 로컬 첫 시도는 함수 발견의 10초 초기화 제한으로 로그인 전에 막혔으며 도구의 `FUNCTIONS_DISCOVERY_TIMEOUT=60`만 세션 환경에 설정해 재실행했다. 이 환경 조정과 5회 반복/기존 demo build 재사용 설정은 저장소에 포함하지 않았다.
- 새 테스트 검증은 별도 managed worktree의 demo 프로젝트와 demo export에서 실행해 기본 PC의 운영 export·기존 비공개 env를 보존했다. 로그는 ignored `output/git-hosting-sync-20261004/contrast-*.log`, `resume-*.json`에 있다. 실제 iPhone 촬영·native decoder·설치 PWA 및 Android 실기기 회귀는 사람 확인이 남는다.

### 2026-10-04 Codex·Work Git 정리, 로컬 동기화 및 상품사진 Hosting 배포 완료

- Codex의 납품사진/PR #2 배포 기록과 Work의 PR #2 회귀·audit 및 PR #3 상품사진 작업을 대조했다. PR #3는 main에 병합됐고, 배포 source `10299384ce31a5c14f6984482696841a54637774`의 [Quality Gate `37145617080`](https://github.com/kim-DL/ONWAY/actions/runs/37145617080)는 모든 단계가 성공했다. 클라우드에서 남았던 Hosting 인증 차단을 기존 로컬 Firebase 인증으로 해소했다.
- 기본 PC 저장소 `C:\Users\HOME\Desktop\onnuriway`에서 `git pull --ff-only origin main`을 완료했다. 작업 시작 시 main은 5커밋 뒤였으나 pull 후 원격과 일치했다. 이 배포 기록 이후의 제품 코드 차이는 없으며, 최종 main은 기록 커밋까지 push/pull해 동기화한다.
- 6개 등록 worktree를 모두 점검했다. 미커밋 OPT-3B/3C 실험을 각각 `f75763c`(`codex/opt3b-inventory-photo-experiment`), `2aaebb2`(`codex/opt3c-initial-icon-experiment`)로 checkpoint하고 GitHub에 push했다. 이전 거래처 속성 제거 stash `042e243`도 `codex/archive-customer-attributes-20261004`로 원격 보존했다. 원본 stash는 유지한다. 이 세 보관본은 미채택 작업이며 main/운영에는 반영하지 않았다. OPT-3A·baseline과 이전 PR #2 worktree의 파일·ignored 산출물도 보존했다.
- main에 포함된 것을 확인한 완료 브랜치 field-speed, iphone-delivery-photo, mobile-action-reach, phase7-school-editor-sync의 로컬 4개/원격 4개와 PR #3의 원격 브랜치를 삭제했다. 각 커밋은 main 이력에 남는다. 사용 중인 worktree 브랜치와 미채택 보관 브랜치는 유지한다. 점검한 worktree는 모두 clean이며, 원격 참조에서 도달할 수 없는 로컬 브랜치 커밋은 0개다. 비공개 env·개인정보·빌드/검증 로그는 Git 저장 대상에서 제외한다.
- source `1029938`에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`, `NEXT_PUBLIC_ENABLE_INVENTORY=true`, emulator OFF와 기존 비공개 설정으로 운영 빌드했다. 로컬 사진 집중 unit 56/56, app/Functions typecheck, lint, build 및 기존 PWA·성능·Hosting gate PASS. Export/shipped 102개, precache 89개, initial assets 9개이며 거래처 JS gzip 36,830B, 재고 JS gzip 25,537B다. 전체 회귀의 근거는 위 검증된 source의 원격 Quality Gate이며 문서 기록 변경에 대해 전체 회귀를 다시 통과했다고 주장하지 않는다.
- 기존 Work 채팅의 명시적 배포 승인을 확인하고 `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project onnuriway --only hosting:onnuriway --non-interactive`를 완료했다. Live version `b5b031dbcf146a3b`, release `1791083477808000`, release time **2026-10-04 12:11:17.808 KST**이며 rollback version은 `f56636dafdacfe14`다. Functions, Rules, Auth와 운영 업무 데이터는 변경하지 않았다.
- `https://onnuriway.com`과 `https://onnuriway.web.app`의 canonical Hosting verifier가 각각 25개 공개 HTTP 검사를 통과했다. 두 origin의 worker는 후보 SHA-256 `d90cdbdcfe34049979011c30467e4bcf4f452dc0fa93f741fb650b05fa080426`와 일치한다. apex/www는 Hosting API에서 HOST/OWNERSHIP/CERT ACTIVE, issue 0이며 www HTTPS는 301로 apex에 이동한다. 후보 manifest·전후 release metadata·로그는 ignored `output/git-hosting-sync-20261004/`에 있다. 기존 비공개 env 파일은 수정하지 않았다.
- 최신 상품사진 수정의 실제 iPhone 촬영·native decoder·설치 PWA 업데이트/세션 유지는 사람 확인이 남는다. 공개 HTTP 검사나 Chromium/Emulator 회귀를 실기기 검증으로 표현하지 않는다.

### 2026-10-04 상품사진 iPhone HEIC 전처리 — 구현·main 병합 완료, 당시 Hosting 인증 대기 기록

아래 인증 대기는 위 로컬 PC 배포로 해소됐다. 다음 항목들은 구현과 배포 전 검증의 역사적 기록이다.

- 최신 `origin/main` `b2e435f`에서 별도 `codex/iphone-inventory-photo` worktree/branch를 만들었다. 기존 clean PR #2 checkout의 브랜치와 파일은 보존했다.
- 재고 `InventoryPhotoPicker`가 사용하는 공통 `customer-photo-preparation`은 HEIC MIME/빈 MIME의 HEIC 파일명과 실제 HEIC/HEIF `ftyp` 헤더를 모두 사전 거부했다. 실패는 preview 및 `uploadInventoryPhoto` 이전이다. 상품등록의 실제 iPhone 실패 화면은 전달되지 않았으므로 코드상 차단과 실기기 관찰을 구분한다.
- HEIC/HEIF를 파일명 대신 실제 바이트로 식별해 독립된 File로 복사한 뒤 기존 브라우저 decoder/optimizer로 넘긴다. Safari 17의 native HEIC 지원은 [WebKit 공식 문서](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)에 근거한다. 작은 HEIC도 반드시 변환하며 Safari가 WebP 요청에 PNG를 반환하면 실제 PNG 형식으로 전송한다. 10MB를 넘는 PNG는 동일 2560px/품질 0.82에서 JPEG로 재인코딩한다. 최종 MIME와 0 < bytes <= 10MB를 준비 단계에서 확인해 늦은 저장 실패를 막는다. 서버는 기존 JPEG/PNG/WebP 계약과 final WebP를 유지한다. native decoder가 지원하지 않는 기기는 준비 오류로 끝나고 HEIC를 서버로 보내지 않는다.
- 재고의 직접 촬영 전용 UI, Android JPEG의 불필요한 재인코딩 생략, provider bytes 복사 전 input 유지, 30MB 원본/10MB 전송 제한, request ID, revision, 인증/App Check, Rules와 감사 계약을 유지한다. 공통 전처리를 쓰는 거래처 사진도 영향을 받으므로 관련 테스트를 함께 검증한다. 납품사진 전용 전처리는 변경하지 않았다.
- 로컬 Node 22 clean `npm ci --engine-strict=true`, lint, app/Functions typecheck, 전체 unit 1,706 PASS/15 conditional SKIP, 사진 전처리/10MB 경계 9 PASS 및 거래처 presentation browser 56/56 PASS. 기존 HEIC 사전 거부 browser 기대를 실제 canvas 변환 검증으로 갱신했다. audit High/Critical 0, Moderate 8. production 설정 build와 변경 없는 PWA/성능/Hosting build gate PASS. 기존 성능 검사 본문은 Node `--import tsx`로 실행해 5,000건 검색 p95 1.20ms/50ms PASS(기본 tsx CLI는 이 환경의 Unix socket 제한으로 시작하지 못했다).
- 새 browser 회귀는 HEIC decoder만 Chromium에서 모델링하고 실제 canvas encoder, PIN 인증, Callable, Storage/Firestore Emulator를 사용해 HEIC→WebP, Safari식 PNG 반환과 oversized PNG→JPEG를 검증한다. 기존 JPEG 등록·입출고·교체·제거 여정도 함께 선택한다. CI에 `Inventory photo regression` 단계를 추가했고 guarded inventory launcher의 기본 전체 실행은 유지했다. 로컬 인증 E2E는 Functions Emulator의 Unix socket `EPERM` 때문에 실행 환경에서 차단되어 [PR #3](https://github.com/kim-DL/ONWAY/pull/3) 최신 Quality Gate 결과를 최종 판정으로 사용한다. 실제 iPhone의 카메라·설치 PWA 검증은 별도 사람 확인이 필요하다.
- 이번 작업의 Git 반영과 Hosting 배포는 사용자가 승인했다. 최신 운영 앱의 공개 client 설정을 재사용해 배포 후보를 준비하며, 키는 출력/커밋하지 않는다. Firebase 배포 인증은 현재 클라우드에 없고 연결된 Desktop Commander PC는 offline이다. 운영 업무 데이터와 Functions/Rules/Auth는 변경하지 않는다. 배포 완료를 기록하기 전에는 이 수정이 production에 반영됐다고 주장하지 않는다.
- PR #3 `f562102` Quality Gate `37142014254`의 첫 시도는 `verify` → `Phase 17 emulator and production journey` → `delivery-photo-field.spec.ts:848`의 새로고침 후 완료 수 assertion(5초)에서 실패했다. 동일 테스트의 독립 실행 및 기존 납품사진 전체 11개는 로컬에서 PASS했고 서버도 저장된 당일 override/완료 1곳을 반환했다. 확정 원인을 얻지 못해 납품사진 운영 코드를 추측 수정하지 않았으며 동일 HEAD를 원격 재실행했다. 로컬 Functions Emulator는 설치된 도구의 내부 통신만 loopback TCP로 바꿔 실행했고, 이 환경 보정은 저장소/배포 코드에 포함하지 않는다.
- 로컬 신규 재고 회귀에서 HEIC 3개 경로와 실제 Emulator 통합 12개는 PASS했다. 기존 JPEG 전체 여정은 BottomSheet의 260ms `sheet-rise` 도중 좌표를 재서 고정 action의 y가 0.31px 달라지는 실패를 재현했다. `verifyDetailActions`가 실제 sheet 애니메이션 종료를 기본 timeout 안에 확인한 뒤 측정하게 수정했다. 기존 좌표 오차 0.05px, 터치 크기, assertion 및 timeout은 유지한다. 최종 최신 HEAD의 전체 CI 통과 전에 병합하지 않는다.
- 최종 `5c2ab76f7f6b3ebe2745fe67deb41ac468b7dd8f`의 [Quality Gate #43](https://github.com/kim-DL/ONWAY/actions/runs/37144343949)는 설치·audit·lint·typecheck·unit·Functions/production build·PWA·JS/CSS budget·기존 browser·Deferred sales tools·Phase 17·Inventory photo regression까지 모두 PASS했다. HEIC 3개, 기존 JPEG 전체 여정 1개 및 재고 Emulator 통합 12개는 로컬에서도 PASS했다. 이전 HEAD의 원격 재실행은 Phase 17을 통과한 뒤 동일 좌표 문제(0.27px)에서 실패했으며 최종 HEAD의 애니메이션 측정 동기화로 해결됐다. 납품사진 운영 코드는 변경하지 않았다.
- 해결된 리뷰 스레드 2개, 최신 Vercel Preview 성공 및 mergeability `clean`을 확인하고 [PR #3](https://github.com/kim-DL/ONWAY/pull/3)을 main `9505bf752aa73d7620b8d0af9931a3880bce34dd`에 병합했다. 이 merge의 Git tree는 검증된 PR HEAD와 동일하다. 이 인수인계 기록을 포함한 최신 main의 [Quality Gate](https://github.com/kim-DL/ONWAY/actions/workflows/ci.yml?query=branch%3Amain)를 종료까지 확인한다.
- production 후보의 변경 없는 build/PWA/성능/Hosting gate는 PASS했고 export/shipped 100개, 거래처 JS gzip 36,830B, 재고 JS gzip 25,537B다. Hosting 배포 명령은 Firebase CLI 인증 오류로 운영 반영 전에 중단됐다. 두 공개 origin의 worker는 기존 배포 SHA-256 `6811509ea8d9211989f6337626275a3be556b0dfb9b8d654b790d81a76bfd6b9`와 일치한다. 기존 Firebase 로그인 PC의 Desktop Commander 연결은 여전히 offline이며, 이 작업에 대한 Hosting 배포 승인은 유지된다. 인증 연결 후 최신 main의 production 후보를 검증하고 `--project onnuriway --only hosting:onnuriway`로 배포한 뒤 두 origin을 검증해야 한다. 실제 iPhone 촬영·설치 PWA는 아직 사람 확인하지 않았다.

### 2026-10-03 PR #2 main 반영 및 production Hosting 배포 완료

- PR #2의 최종 source `321431b`는 GitHub Actions `Quality Gate / verify` 전체를 통과했다(`37123859583`). PR을 `main`에 병합한 `4487dbfbacb1f4e1270e516e82d37b5a6560715d`는 검증된 PR HEAD와 파일 내용이 동일하며, 이 source로 운영 빌드했다.
- `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`, `NEXT_PUBLIC_ENABLE_INVENTORY=true`와 기존 비공개 운영 설정을 사용한 Next.js 16.3.8 build, PWA·성능·Hosting artifact gate PASS. Export/shipped 102개, precache 89개, initial assets 9개다. 기존 용량 기준은 유지했다.
- 사용자의 명시적 Hosting 배포 요청에 따라 `npx firebase deploy --project onnuriway --only hosting:onnuriway --non-interactive`를 완료했다. Live version `f56636dafdacfe14`, release `1791037353240000`, release time `2026-10-03 23:22:33.240 KST`이며 rollback version은 `fd6dc3961b8aac38`다.
- `https://onnuriway.com`과 `https://onnuriway.web.app`의 canonical Hosting verifier가 각각 25개 공개 HTTP 검사를 통과했다. 두 origin의 worker가 후보와 SHA-256 `6811509ea8d9211989f6337626275a3be556b0dfb9b8d654b790d81a76bfd6b9`로 일치하며, Hosting API의 새 live version을 확인했다. 로그·후보 manifest·전후 release metadata는 ignored `output/pr2-hosting-release/`에 있다.
- 이번 배포 대상은 Hosting이다. Functions, Rules, Auth, 운영 업무 데이터는 변경하지 않았다. 설치 PWA의 실제 사용자 업데이트·인증 세션·운영 업무 조작을 자동 검증으로 PASS 처리하지 않는다. 운영 빌드에 임시 복사한 비공개 env 파일은 검증 후 제거하고 원본 설정은 보존한다.

### 2026-10-03 PR #2 lockfile 및 braces 의존성 복구

- 작업 전 원본 `main`의 clean 상태와 최신 원격 기준 `131e574`를 확인하고 fetch했다. 별도 clean managed worktree에서 PR 브랜치 `codex/phase7-school-editor-sync`의 `1d8644b`를 추적해 수정했다.
- GitHub Actions `verify`는 `npm ci`에서 실패했다. PR의 `package-lock.json`에는 JSON 대신 잘린 도구 출력이 들어 있었다. 정상 `origin/main` lockfile을 기준으로 기존 버전을 유지하고, 독립 임시 디렉터리에서 npm 10.9.8로 PR의 Next.js·보안 패치·로컬 braces 의존성을 반영한 lockfile v3를 재생성했다.
- `braces`를 root devDependency로 명시했다. 보안 테스트는 자신의 require와 실제 `micromatch` 소비 경로 모두 `vendor/braces/index.js`로 해석되는지 검증하며, 기존 정상 확장과 깊이 100/101 경계를 유지한다. 로컬 패키지에 복사되어 있던 upstream 개발용 mocha·gulp 등의 의존성과 실행 스크립트를 제거했다.
- 공유된 간접 의존성에도 패치가 적용되도록 override를 직접 부모 기준으로 지정했다: `@firebase/firestore`→gRPC 1.13.6, `google-gax`→gRPC 1.14.5, `get-uri`→basic-ftp 6.2.1. 기존 Firebase·Firebase CLI 등의 버전은 보존했다.
- Node 22.23.2 / npm 10.9.8의 `npm ci --engine-strict=true`, lint, app/Functions typecheck, 전체 unit 1,693 PASS/15 conditional SKIP, braces 집중 테스트 3/3 PASS. root/micromatch require의 실제 파일 경로가 동일한 패치 소스임을 확인했다. audit는 High/Critical 0, Moderate 8이며 기존 high gate 기준을 유지한다. 전체 원격 CI의 최종 판정은 PR #2 최신 HEAD의 `Quality Gate / verify` 결과를 따른다. 운영 배포와 운영 데이터 변경은 이번 작업에 포함하지 않는다.

### 2026-09-30 현장 체감 속도 개선 1차 — production Functions·Hosting 배포 완료, 이번 변경의 실기기 확인 대기

- 사용자는 앞선 9/29 iPhone 납품사진 수정의 실제 기기 요청 항목이 모두 해결되어 PASS라고 보고했다. 이번 자동 이동·등록·버튼 개선의 실제 iPhone/PWA 체감은 별도 확인 대상이다.
- 실사 저장을 서버가 확정하면 현재 검색·필터·장소 순서의 다음 미확인 대상을 같은 상세 창에서 자동으로 연다. 같은 품목의 남은 장소는 확정 상세를 재사용하고, 다른 품목은 최신 상세가 준비될 때까지 쓰기를 막는다. 목록 추가 로딩 중 전체 완료를 주장하지 않는다. 등록은 새 품목 저장에만 opt-in 확정 상세를 반환하여 후속 detail GET 한 번을 없앤다. 거래처의 내 납품처 편집·오늘 순서 편집은 저장/취소를 중앙에 놓고 누름·포커스·비활성 상태와 깊이 있는 버튼 스타일을 적용한다.
- Chrome DevTools MCP 412×915·CPU4·Slow4G 합성 1,000품목 실험: 사진 없는 등록 click→상세 사용 가능 p50 1,448.4ms(N3)→972.8ms(N10), 약32.8% 감소·추가GET0/10. 실사 저장확정 p50 753.4→813.9ms로 저장 자체의 가속 근거는 없지만 수동 닫기/다음선택 2→0회이며 다음 최신 상세 p50 1,411.9ms다. 실제 현장 시간이나 INP의 보장값이 아니다. 대용량 사진 업로드와 입출고·유통기한·거래처 서버 지연 전반은 이번 변경의 해결 범위 밖이다.
- 최종 canonical acceptance10/10·내부 Emulator12/12 PASS(`output/field-speed/acceptance-final-5.log`, `output/acceptance/phase17-report.json`). Unit1,690 PASS/15 conditional SKIP, 일반 browser290 PASS, Rules50 PASS. 별도 재고 browser15/15·transaction12/12 PASS(`inventory-e2e-final-3.log`), 거래처 browser11/11 및 두 편집 창 320/360/390/412×글자100/200 레이아웃16개 캡처 PASS다. 저장 실패·요청ID 재시도·revision·늦은 조회·연속 이동·Back·최신 날짜 기준 콜백 경계를 검증했다. 보안 audit는 같은 major patch 후 High0/Moderate8이며 직접 dependencies와 기존 budget/verifier 기준을 변경하지 않았다.
- 제품 source commit `16bc3fd48eb4ae492fd2f4da3d5b727347a7cdaa`를 브랜치와 `main`에 push했다. 운영 설정 build 후 `--project onnuriway --only functions:saveInventoryProduct`를 먼저 배포하고 `--only hosting`을 배포했다. 해당 함수는 ACTIVE, revision `saveinventoryproduct-00009-pon`다. Hosting live version `fd6dc3961b8aac38`, release `1790772595154000`, release time `2026-09-30T12:49:55.154Z`이며 직전 version `2e95ad3ebb435246`가 rollback 지점이다. 두 origin의 canonical Hosting byte/worker 검증과 비로그인 PIN·활성 worker·controlled reload smoke는 PASS다. 운영 업무 데이터 쓰기·삭제, 다른 Functions·Rules·Auth·비밀 값 변경은 하지 않았다.
- 자세한 계약·검증·측정 한계는 [현장 체감 속도 개선 1차](field-speed-phase-one.md)를 따른다. 현장 확인은 이번 배포본으로 연속 수량 일치 확인, 등록 직후 다음 조작, 두 편집 창 버튼, 설치 PWA 업데이트 후 로그인 유지를 평가한다.

### 2026-09-29 iPhone 납품사진 업로드 수정 — production Hosting 배포 완료, iPhone 실기기 확인 대기

- 최신 `origin/main` `8573f94`에서 별도 `codex/iphone-delivery-photo` worktree/branch를 만들었다. 원본 `main`은 깨끗했고 기존 다른 worktree는 수정하지 않았다. 제품 commit `0329302570173a7953f7d8e57cf0b5b592a2616c`를 브랜치와 `main`에 push했다.
- 코드상 확인된 업로드 전 차단점은 세 가지다. 납품사진 전처리는 iPhone의 HEIC/HEIF 선택을 MIME·파일명·헤더에서 거부했다. Safari가 `canvas.toBlob("image/webp")` 요청에 PNG를 반환하면 WebP 전용 검사에서 실패했다. 파일 선택 뒤 창 focus가 `change`보다 먼저 돌아오면 750ms 타이머가 선택 상태를 폐기했다. 이 경로들은 `createDeliveryPhoto` 호출 전에 끝나므로 Storage·Firestore에 기록이 생기지 않는다. 사용자 iPhone의 OS 버전과 오류 문구는 확인할 수 없었으므로 실제 기기에서 어느 차단점이 발동했는지는 구분하지 못했다.
- 납품사진 전용 계층에서 실제 바이트로 HEIC/HEIF를 식별해 브라우저 디코더로 열고, 새 캔버스 WebP를 우선 사용하되 WebP 인코딩이 불가능하면 새 JPEG로 전송하도록 수정했다. 서버의 기존 JPEG/WebP 입력 계약과 최종 evidence/thumbnail WebP, 인증 Callable·request ID·감사·Storage 경계는 그대로다. 선택기 focus 기반 취소를 없애고 늦은 `change`를 수용하면서 중복 선택 차단을 유지했다. 고정 날짜의 납품사진 테스트와 Emulator gate는 두 번째 만료 확인 시계를 fixture 기준으로 명시했다. 감사 gate에서 발견된 개발 도구 경로의 High 취약점은 `fast-uri`만 3.1.6→3.1.8로 갱신했다.
- 납품사진 집중 unit/계약 121/121, 인증 demo Emulator 납품사진 browser 11/11, 서비스 gate PASS. Safari식 PNG 반환과 focus 후 850ms 지연된 카메라·앨범 선택은 Chromium 자동화에서 JPEG 전송→Callable→서버 WebP 저장→기록 1→2장 표시까지 검증했다. 전체 release acceptance 10/10, 내부 Emulator 12/12 PASS (`output/acceptance/phase17-report.json`, 2026-09-29 14:38 KST): unit 1,663 PASS/14 SKIP, 공통 browser 290 PASS, Rules 50 PASS, 사용자 여정 76 PASS/13 SKIP. 최종 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` build와 PWA·성능·Hosting gate PASS; 101개 export/shipped, precache 88개, 납품사진 JS gzip 10,201/10,240B다.
- `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했다. 두 production origin의 Hosting verifier PASS, 후보와 두 origin의 `/sw.js` SHA-256 일치(`ea1f6e0ba0a93603703ce8d85cf2b81f06238d95093918b7e1c894d46dfa2e17`). Functions, Rules, Auth, Storage 설정과 production 업무 데이터는 변경하지 않았다.
- iPhone 실기기의 실제 카메라 촬영·앨범 선택·PWA 세션 검증은 수행할 수 없었다. 위 HEIC 경로의 자동화는 구성한 파일 헤더와 mock 디코더를 사용했고 실제 iPhone 사진/디코더 시험이 아니다. 상품등록 사진은 별도 `customer-photo-preparation`/`photo-upload-optimizer` 계층을 사용하며 이번 변경으로 영향받지 않는다. 그 계층의 기존 HEIC 거부는 별도 과제로 남는다.

### 2026-09-27 재고 즉각성 최적화 — 로컬 구현·반복 측정·회귀 검증 완료, 운영 미배포

- 기준 source는 `082a6c0`다. 변경 전 source/export와 최종 측정 버전 `final-v3-source`/`final-v3-built`는 ignored `output/playwright/inventory-benchmark/`에 보존했다. 이번 변경은 로컬 작업 트리에 있으며 commit·push·운영 배포는 하지 않았다. 사용자 운영 데이터와 자격 증명도 변경하지 않았다.
- 목록 사진·사진 유무 표시 제거, snapshot 기반 상세 즉시 표시와 최신 확인 전 수정 차단, 접근 상실·늦은 응답 정리, 검색 파생 계산 재사용, idle 코드 준비와 등록 폼 첫 paint 분리, 비동기 Base64 변환, 재고에서 소비하지 않는 original encode 생략을 적용했다. 기존 thumbnail/preview 바이트·품질과 학교 original 경로, Auth/App Check·revision·request ID·감사·재시도 계약은 유지했다.
- 동일 CPU 4배·RTT 120ms·모바일 회선 조건에서 변경 전/후 각각 100개·1,000개 상품 20회씩 측정했다. 1,000개 p75는 중간 검색 123→19ms, 상세 첫 표시 2,028→160ms, 최신 상세 2,036→285ms, 첫 등록 입력 준비 797→346ms다. 첫 목록 행은 1,521→1,512ms로 사실상 유지됐다. 목록 사진 POST 18→0, 사진 수신 749,682→0B; 전체 목록 수신량은 100개 86.3%·1,000개 46.6% 감소했다.
- lab INP 추정 p75는 1,000개 224→176ms지만 100개는 152→192ms로 악화됐다. 두 조건 모두 200ms 이하며 실제 field INP는 아니다. 제한 회선의 상세 사진 약 7.1초·사진 포함 저장 확정 약 19.1초가 남는다. 저장 첫 paint의 일관된 개선으로 주장하지 않는다.
- page size 40은 초기 검색 completeness 실패로 폐기하고 기본 100건을 유지했다. 60초 TTL·검색/필터/스크롤 복원과 warm context/list 0요청을 유지했으며 실제 61초 뒤 재조회도 확인했다. idle import·준비된 컴포넌트 사용·폼 mount gate는 일반 및 설치/제어 SW 비교의 결합 효과를 근거로 채택했다. Save-Data에서 speculative code import를 생략하고 선행 데이터/사진 요청은 없다.
- 최종 canonical acceptance 10/10 및 내부 Emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-27 13:14:09 KST): unit 1,661 PASS/14 조건부 SKIP, 공통 browser 290 PASS, Rules 50 PASS, full user journey 75 PASS/재고 별도 실행 대상 13 SKIP. 재고 static browser 13/13와 Functions integration 11/11는 별도 최종 실행에서도 PASS했다. 320·360·390·412px 및 실제 브라우저 200% 확대의 경계·캡처를 확인했다. 48px DOMRect의 미세한 부동소수점 오차만 검사에서 허용했으며 실제 layout subpixel 미달은 계속 실패한다.
- 마지막 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` build와 기존 PWA·성능·Hosting build gate PASS. Export/shipped 101개·precache 88개·initial assets 9개, 재고 JS gzip 25,590/25,600B다. 기존 verifier·ceiling은 변경하지 않았다. 남은 JS 여유가 10B이므로 후속 변경에도 같은 gate가 필요하다. 전체 측정 이후의 작은 중복/용량 정리는 보고서에 구분했고 최종 제품 SHA-256 manifest로 마지막 build 이후 소스 불변을 확인했다.
- 전체 수치·방법·실패한 후보·안전성 근거·한계는 `docs/inventory-responsiveness.md`. 최종 로그는 `output/inventory-performance/acceptance-final-2.log`, `inventory-e2e-final-4.log`, `release-*.log`다. 실제 Galaxy 카메라·설치 PWA·OS 키보드·Cloud Functions cold start는 미측정이다. 운영 배포는 별도 명시적 승인 후 별도 작업으로만 진행한다.

### 2026-09-26 검토본 거래처 이전 준비 — 운영 데이터 등록 대기

- 사용자 검토 파일 `온누리_거래처_통합검토_20260926(자동 복구됨).xlsx`는 228행 중 확정 209, 제외 15, 보류 2, 미검토 2다. 사용자는 같은 이름·주소인데 출입번호와 메모가 다른 C-035·C-200을 보류하고, C-084·107·157·161의 `확인 필요` 출입번호는 빼고 `미확인`으로 거래처를 등록하라고 결정했다.
- 검토본의 확정 행 207개를 기존 `customerDraftSchema`로 검증한 비공개 JSON 등록 자료를 대화 작업 공간의 ignored `outputs/01a0da91/온누리_거래처_급식길_등록자료_20260926.json`에 만들었다. 원본 메모에는 번호가 재기록된 경우가 있어 JSON의 납품 안내에는 최종 위치 안내·함께 표기된 상호·검토 메모만 넣었다. 미확인 74개 행의 출입번호는 비어 있다. 개인정보가 담긴 JSON 자체는 이 저장소에 복사하거나 커밋하지 않았다.
- 관리자 전용 일괄 등록 UI를 commit `8a342ae`로 추가하고 production Hosting site `onnuriway`에 배포했다. 각 행은 기존 인증·App Check가 적용된 `listCustomers`/`saveCustomer` Callable을 거치며, 등록 전 최신 목록 대조, 충돌 보류, 요청 ID, 저장 후 재조회가 있다. 앱/Functions typecheck, focused lint·unit 3/3, PWA·성능·Hosting build gate, `git diff --check`가 통과했다. backend/Rules/Auth는 변경하지 않았다.
- 운영 관리자 화면의 현재 거래처는 16곳이다. 사전 이름·주소 대조는 신규 196, 기존과 일치 7(C-005·064·082·087·165·180·198), 추가 대조 4(C-048·095·146·157)다. 이는 실제 등록 전의 사전 결과다. Chrome 확장 프로그램이 로컬 JSON 자동 파일 선택을 차단했고 사용자는 현재 직접 선택하기 어렵다고 답했다. **운영 거래처는 아직 한 건도 등록하지 않았다.**
- 재개할 때 관리자 화면 `거래처 관리 → 일괄 등록`에서 위 JSON을 직접 선택하고, 화면의 최신 대조 결과를 확인한 뒤 신규 건만 등록한다. 완료 전후 서버 목록을 확인하고, 4개 충돌 건은 별도 검토한다. C-035·C-200은 사용자 결정대로 계속 보류한다.

### 확인된 사실

- 저장소: `C:\Users\HOME\Desktop\onnuriway`
- Git branch: `codex/mobile-action-reach`
- Phase 3D 운영 배포 당시 제품 코드 commit은 `b4831ff4d24b8956e327ea806f1ca6bba1651d9c` (`Add delivery photo deletion`)다. 현재 production frontend는 아래 최신 HEAD에서 생성했으며 재고 목록 리뉴얼과 거래처·납품사진 버튼 리뉴얼을 모두 포함한다.
- 초기 HANDOFF 정리 시점에 기록된 대규모 dirty worktree는 이후 P0~P2, 재고 제조사 M1~M3, inventory mobile controls checkpoint로 정리되었다. 이 문서의 각 시점별 기록은 역사적 검증 결과로 유지한다.
- 2026-09-21 HANDOFF 마감은 documentation-only로 진행하며 제품 코드·dependency·테스트·설정을 변경하지 않는다.
- 운영 Frontend는 Next.js static export → Firebase Hosting site `onnuriway`다. 운영 주소는 `https://onnuriway.com`, 기본 주소는 `https://onnuriway.web.app`이다.
- Backend는 Firebase Auth, App Check, Firestore Standard/Native(서울), Storage, Cloud Functions 2nd gen(Node 22, `asia-northeast3`)이다.
- 거래처, 학교납품, 영업/홍보, 재고에 더해 납품사진 field workspace가 production feature flag로 활성화돼 있다.
- 현재 Firebase Hosting live release는 `1790370192765000`, version은 `b781fb1f1aa7b0c2`, 배포 시각은 `2026-09-26 06:03:12.765 KST`다. 실제 Service Worker 경로는 `/sw.js`이고 SHA-256은 `652df0a18bbd3ca09a53f4530f5e9179eef354adb5cc2e1a3112be91f5704306`이다. 직전 rollback 지점은 release `1790342901611000`, version `909242c5e854c0e3`이다.
- 납품사진 Phase 3D 운영 기능과 Galaxy S20+ 실사용 확인은 완료됐다. 실기기에서 과거 기록 진입점을 찾기 어려웠다는 후속 피드백을 반영한 기록 접근 UX는 production Hosting에 배포됐다. 새 UX의 Galaxy 실기기 smoke는 아직 남아 있다. 아래 과거 FEATURE FREEZE 기록은 당시 결정이며 이 후속 범위를 제한하지 않는다.
- 2026-09-21 release `1789983232326000`, version `2c48893eab60f919`와 worker `2129650a8800dedc5239af91185d3310ba735fe0fd9d8dffb3d3910e84f48594`는 당시 inventory/manufacturer production 기록이며 현재 live baseline이 아니다.

### 2026-09-26 최신 HEAD Hosting 승격 — 재고·거래처·납품사진 UI, Galaxy smoke 대기

- 사용자가 Galaxy S20+의 이전 재고 리뉴얼 결과를 PASS로 보고한 뒤, 운영 `onnuriway.com`의 인증된 거래처 홈·상세와 납품사진 목록·기록 날짜를 읽기 전용으로 관찰했다. 운영 사진 촬영·편집·저장은 실행하지 않았다. 검증된 제품 source commit은 `0c04dd47022025f5426d3f2db7c79006a1af0e60`이며, 버튼 관찰·디자인 결정과 전후 캡처는 `docs/customer-button-design-renewal.md`에 기록했다.
- 기존 화면 배경을 유지하며 거래처 검색·상세 길찾기와 납품사진 카메라·선택 날짜를 남색 주 행동으로, 보조 버튼은 흰색 면·청색 테두리·하단 그림자로 통일했다. 카메라 아이콘과 중앙 정렬을 수정하고 사진 기록 날짜의 둥근 pill을 각진 탭으로 교체했다. 거래처 홈의 `마지막 확인` 표시만 제거했다. 기능·backend·Rules·feature flag·운영 데이터 계약은 변경하지 않았다.
- 전후 브라우저 캡처는 ignored `output/playwright/button-renewal/before/`와 `after/`에 있다. Galaxy S20+에서 새 배포본의 재고 행 밀도·조사 상태·사진 유무·고정 `새 품목` 간섭, 거래처 버튼 색·강조 단계와 검색/전체보기/등록, 납품사진 카메라 중심·정보/더보기·날짜 탭 스와이프·viewer/Back을 확인해야 한다. 설치 PWA의 기존 session 유지, 한 손 터치, 200% 확대, 하단 탐색 간섭·가로 overflow와 실제 현장 속도/혼동 여부도 사람 확인으로 남는다.
- 거래처 static browser 28/28, 인증 demo Emulator 거래처 16/16·납품사진 10/10 PASS. Canonical acceptance 10/10 gate와 내부 Emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-26 00:37:45 KST): unit 1,584 PASS/14 SKIP, 공통 browser 290 PASS, Rules 50 PASS, full user journey 75 PASS/12 SKIP, 검색 5,000건 p95 1.24ms. 최종 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` build와 PWA·성능·Hosting gate가 다시 PASS했고 export/shipped 100개·precache 87개·initial assets 9개다. Customer CSS raw 48,132/49,152B·JS gzip 36,798/36,864B, Delivery-photo CSS raw 6,121/6,144B·JS gzip 10,222/10,240B, History dates CSS raw 1,013/1,024B다. 기존 ceiling·verifier는 변경하지 않았다.
- **운영 승격:** clean HEAD `9109d58bf0a1e7b372030691e83e1e68bfc95b62`는 재고 제품 commit `4b778e6c895adba083816569fa349321a6e2a2ee`와 버튼 제품 commit `0c04dd47022025f5426d3f2db7c79006a1af0e60`을 계보에 포함한다. 버튼 제품 commit 뒤 HEAD까지 제품 diff는 없다. `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 명시한 production build에서 기존 PWA·성능·Hosting gate를 재통과했고 navigation bundle의 납품사진 기본값은 `true`다. 후보 `out` 100개 파일 집합 SHA-256은 `3e777093dc9678390ca41329ca304ab28b9b3f1b0c8ae2a231929e6357e6f363`이다. `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했다. Functions, Firestore, Storage, Rules, Auth, Vercel, 기타 Firebase/GCP 설정과 production 데이터는 변경하지 않았다.
- **운영 검증:** Hosting API에서 위 live/rollback release·version을 확인했다. 두 운영 origin의 canonical Hosting verifier가 PASS했고 각각 후보의 `_next/static` 전체와 주요 설치 자원 등 90개를 SHA-256으로 대조해 불일치 0건이다. `/sw.js`와 precache 87개가 후보와 일치하고 재고 상태·거래처/납품사진 새 버튼 bundle이 배포본에 포함된다. 새 비로그인 Chromium에서 두 origin 모두 PIN, root scope 활성 worker, `registration.update()`와 controlled reload 뒤 PIN 복귀, 앱 page error 0건을 확인했다. 콘솔은 각 origin에서 reCAPTCHA storage access 거부와 App Check attestation 403을 남긴다. 직전 release에서도 기록된 headless 환경 현상이며 이번 제품 diff의 회귀 증거는 확인되지 않았다. 인증된 production 내부 조작과 설치 PWA의 기존 session 유지·실기기 체감은 Codex PASS 처리하지 않는다.

### 2026-09-25 재고 목록 모바일 UI/UX 리뉴얼 — production Hosting 승격, Galaxy PASS 보고

- 재고 카드를 기존 `field-list` 구분선 행으로 치환하고 사진이 없는 품목의 빈 thumbnail 자리를 없앴다. 사진이 있을 때만 기존 인증 미리보기를 40×44px로 표시한다. 조사 상태는 지정 조사일에 개인 조사모드 OFF여도 왼쪽에 표시하고 일반 날짜·모드 OFF에서는 숨긴다. 빈 원·체크·순환 화살표의 형태와 기존 `미확인`·`이번 주 확인`·`변동 후 미확인` 텍스트를 함께 사용하며 indicator 자체에는 동작이 없다. 상세 버튼은 행 전체에 유지하고 넓은 화면의 2열도 유지한다. 계산·저장·conflict·audit·PWA·backend 계약은 변경하지 않았다.
- 전후 실제 인증 demo Emulator 캡처는 ignored `output/playwright/ui-renewal/inventory/before/`와 `after/`에 있다. 360×800 지정 조사일의 보이는 품목은 기존 약 3개에서 5개로 늘었고, 320px에서도 최소 4개가 보인다. 320·360·390·412px, 768·1280px, 긴 한국어 품명·큰 수량, 200% 유효 확대를 확인했다. 가로 overflow가 없고 1280px은 2열이다. 320px의 다섯 번째 행은 고정 `새 품목` action 아래에 일부 가려지지만 네 번째 행까지 보이며 마지막 행까지 스크롤할 하단 여백은 유지된다.
- 최종 production 설정 build의 실제 bundle은 재고 CSS raw 29,062/29,184B·gzip 6,624/6,656B, 재고 JS gzip 25,031/25,600B다. 변경 전 29,095B·6,614B·25,029B에서 재측정했다. Customer CSS raw 49,055/49,152B·JS gzip 36,863/36,864B, Delivery-photo CSS raw 6,051/6,144B·JS gzip 10,238/10,240B는 전후 동일하다. 기존 ceiling·verifier·test 기준은 변경하지 않았다.
- 재고 unit/model 405/405, 재고 static browser 12/12, 재고 demo Emulator 통합 11/11, app/Functions typecheck, lint, `git diff --check` PASS. Canonical acceptance 10/10 gate 및 내부 Emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-25 22:17:57 KST): 전체 unit 1,584 PASS/14 SKIP, 공통 browser 290 PASS, Rules 50 PASS, full user journey 87 PASS/472,686ms, 검색 5,000건 p95 1.23ms다. 마지막 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` production 설정 build와 PWA·성능·Hosting gate가 다시 PASS했고 export/shipped 100개·precache 87개·initial assets 9개다.
- **당시 운영 승격:** clean source `4b778e6c895adba083816569fa349321a6e2a2ee`에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 명시해 정적 build와 변경 없는 PWA·성능·Hosting gate를 재통과했다. 생성 navigation chunk의 납품사진 기본값은 `true`다. 당시 후보 `out` 100개 파일 집합 SHA-256은 `04e781f0c71e36f19fe070403c3ac10eba5872600fb1724bd0ca08d151a49423`이다. `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했고 당시 live release/version은 `1790342901611000` / `909242c5e854c0e3`, rollback은 `1790330480187000` / `9e8223c7cd55fe7e`이었다. 직전과 Hosting 설정의 의미도 동일하다. Functions, Firestore, Storage, Rules, Auth, Vercel, 기타 Firebase/GCP 설정과 production 데이터는 변경하지 않았다.
- **운영 검증:** `https://onnuriway.com`과 `https://onnuriway.web.app`의 canonical Hosting verifier가 각각 PASS했다. 각 origin에서 후보의 전체 `_next/static`과 주요 설치 자원·SW 등 90개를 SHA-256으로 대조해 불일치 0건이며, `/sw.js`와 precache 87개도 후보와 일치한다. 새 재고 상태 chunk가 배포본에 포함된다. 비로그인 Chromium에서 양쪽 PIN 화면, root scope의 활성 worker, `registration.update()`와 controlled reload 뒤 PIN 복귀를 확인했고 앱 page error는 0건이다. 새 headless 세션의 Google reCAPTCHA Enterprise는 storage access 거부 및 App Check attestation 403을 console에 남겼다. 관련 App Check chunk 3개는 직전 live version과 byte 단위로 동일하므로 이번 재고 bundle 회귀의 증거는 없지만, 인증된 production 내부 UI와 설치 PWA의 실제 업데이트·세션 유지는 PASS 처리하지 않는다.
- **Galaxy S20+ 사람 확인:** 2026-09-26 사용자가 재고 리뉴얼 결과를 PASS로 보고했다. 세부 항목별 기록은 전달되지 않았으므로 아래 개발자 검증과 구분한다. 거래처를 reference list로 확정할지와 후속 화면 순서는 아직 결정하지 않았다.

### 2026-09-25 거래처·납품사진 현장 UX — production Hosting 승격, Galaxy smoke 대기

- 거래처 목록은 연락처가 없는 행에서도 `길안내`를 독립된 48px action으로 배치해 320·360·390·412px과 200% 글자 확대에서 한 줄로 유지한다. 거래처 상세에는 `납품사진 기록` 요약과 기존 history 진입을 추가했다. 납품사진 목록은 별도 `기록` 버튼과 장식 세로선을 없애고 정보 영역→기존 history, 카메라→촬영, `⋯`→기존 BottomSheet의 앨범/거래처 상세로 정리했다. 날짜 pill은 변경하지 않았다.
- 상세 요약은 기존 인증된 `listDeliveryPhotos({ scope: "customer", customerId, limit: 30 })` 결과만 사용한다. 서버가 적용하는 최근 168시간·active/만료 필터의 projection이며, 30장 한도에 닿으면 `30장 이상`으로 표시한다. History를 열 때 같은 결과를 전달해 중복 조회를 피하고 삭제 후에는 기존 history 경로로 갱신한다. 전체 기간 count, 요약용 Storage 조회, 거래처 목록 N+1 요청은 없다. Schema, Rules, backend 권한·retention, 운영 데이터는 변경하지 않았다.
- 실제 browser 캡처는 ignored `output/playwright/ui-renewal/customer-photo-field/`에 있다. 두 화면의 320·360·390·412px 각각 100%/200%와 거래처 상세/history를 저장했다. 길안내 한 줄·가로 overflow 없음·48px 터치 크기, 정보/카메라/더보기 중심점의 독립 hit target, 상세에서 customer scope 요청 1회와 history 재사용을 검증했다. 설치 Galaxy S20+의 현장 체감은 아직 사람 확인이 필요하다.
- Focused unit 55 PASS, 납품사진 인증 demo Emulator 10/10 PASS. Canonical acceptance는 10/10 gate 및 내부 Emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-25 18:52:44 KST): 전체 unit 1,583 PASS/14 SKIP, safe-config browser 290 PASS, Rules 50 PASS, full user journey 87 PASS/466,022ms, 검색 5,000건 p95 1.24ms다. 최종 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` production candidate build에서 PWA·기존 성능·Hosting verifier PASS, export/shipped 100개·precache 87개·initial assets 9개다. Customer CSS raw 49,055/49,152B·JS gzip 36,863/36,864B, 납품사진 CSS raw 6,051/6,144B·JS gzip 10,238/10,240B, 초기 JS gzip 139,797B다. Ceiling/verifier/테스트 기준은 변경하지 않았다.
- **운영 승격:** clean source `ccaa4d13a9b918093f728d6560d59479d6a5239f`에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 build 프로세스에 명시하고 위 gate를 재통과했다. `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했다. 새 live release/version은 위와 같고 직전 release/version이 rollback 지점이다. Functions, Firestore, Storage, Rules, Auth, 기타 Firebase/GCP 설정과 production 데이터는 변경하지 않았다.
- **운영 검증:** `https://onnuriway.com`과 `https://onnuriway.web.app`의 canonical Hosting verifier가 각각 PASS했다. 두 origin의 `/sw.js`가 후보 SHA-256과 일치하고 각각 precache 87개가 후보 파일과 byte 단위로 일치했다(불일치 0). 새 거래처 상세 사진 기록·납품사진 앨범/거래처 상세 chunk는 precache에 포함된다. 비로그인 브라우저에서 양쪽 PIN 화면, PWA `업데이트` 적용 뒤 PIN 복귀, console error 0건을 확인했다. 인증된 production session이 없어 내부 거래처·납품사진 조작과 기존 로그인 유지·실기기 체감은 PASS 처리하지 않는다.
- **남은 Galaxy S20+ 사람 확인:** 설치 PWA 업데이트 후 기존 로그인/session 유지; 연락처 없는 거래처의 한 줄 길안내; 긴 거래처명·주소·출입비번과 200% 확대; row 상세/전화/길안내 touch 분리; 납품사진 정보 영역→기록, 카메라 촬영, `⋯`→앨범/거래처 상세, history→viewer→Back; 한 손 사용 시 오작동, 하단 navigation·keyboard 간섭과 가로 overflow를 확인한다. 원하는 거래처와 action을 더 빠르고 덜 헷갈리게 찾는지 평가한 뒤 reference list 채택과 다음 화면 순서를 결정한다.

### 2026-09-25 거래처 목록 UI/UX 리뉴얼 1차 — production Hosting 승격, Galaxy smoke 대기

- 거래처 홈의 장식 제목을 압축하고 최근 목록·검색 결과·전체보기를 공통 구분선 행으로 정리했다. 이름·상태·주소·출입비번·납품위치·연락처 순서, 상세 진입 화살표와 별도 전화·길안내 action, 48px 조작 영역을 적용했다. 인증·Callable·데이터 계약과 PWA 동작은 변경하지 않았다. 설계·비교와 Galaxy 확인 항목은 `docs/customer-list-ui-renewal.md`를 따른다.
- 변경 전 390px 및 변경 후 320·360·390·412·768·1280px, 200% 확대 캡처는 ignored `output/playwright/ui-renewal/`에 있다. 실제 demo Emulator의 PIN 로그인, 거래처 빈/최근 목록, 검색·상세·Back·하단 탐색 캡처도 `after/emulator-*.png`에 모았다. fixture는 긴 한국어 이름·출입비번, 행·action 크기와 가로 넘침을 측정한다.
- 거래처 unit 21 files/271 PASS, 거래처 demo Emulator 16/16 PASS. canonical acceptance 10/10 gate 및 내부 emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-25 15:09:50 KST). 전체 unit 1,583 PASS/14 SKIP, safe-config browser 282 PASS, Rules 50 PASS, full user journey 86 PASS/462,982ms, 검색 5,000건 p95 1.24ms다. production candidate build에서 기존 verifier를 수정하지 않고 customer CSS raw 49,101/49,152B, gzip 9,830/9,984B, JS gzip 36,804/36,864B, 초기 JS gzip 139,768B를 확인했다. PWA 및 Hosting build verifier는 PASS, export/shipped 98개·precache 85개·initial assets 9개다.
- **운영 승격:** clean source `4a8f170360bb7d8e4679899c0f07d0853bcae26c`에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 build 프로세스에 지정했다. production build 및 변경 없는 PWA·성능·Hosting gate PASS, export/shipped 98개·precache 85개·initial assets 9개다. 후보 `out` 파일 집합 SHA-256은 `67fb3442ee2863ab93459e8383675b94834326f8370aa9f388f4393f69e02209`이고 `/sw.js` SHA-256은 위와 같다. 생성된 navigation bundle의 납품사진 기본값은 활성(`true`)이다. `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했다. Functions, Firestore, Storage, Rules, Auth, Vercel, production 데이터는 변경하지 않았다.
- **운영 검증:** Hosting API에서 새 live release/version과 직전 rollback 지점을 확인했다. `https://onnuriway.com`과 `https://onnuriway.web.app`의 canonical Hosting verifier가 각각 PASS했고 두 origin 각각 85개 precache 파일이 후보와 byte 단위로 일치한다(불일치 0). 두 origin의 worker hash·manifest·connectivity·초기 asset·cache/scope header·비공개/없는 경로 404를 확인했다. 새 거래처 행 및 납품사진 navigation chunk가 precache에 포함되며 후보와 일치한다. 비로그인 브라우저에서 두 origin 모두 PIN 화면, PWA `업데이트` 적용 뒤 PIN 복귀, console error 0건을 확인했다. Codex는 인증된 production session이 없어 거래처 내부 UI나 기존 로그인 유지·실기기 체감을 PASS 처리하지 않는다.
- **남은 Galaxy S20+ 사람 확인:** 설치 PWA 업데이트 뒤 기존 로그인/session 유지; 거래처 첫 화면의 정보 밀도와 최근 5개; 긴 거래처명·주소·출입비번 줄바꿈; 전체 row 상세 진입; 별도 전화·길안내와 세 touch target의 오작동 여부; 한 손 엄지 사용성; 검색→키보드→결과→상세→Back; 전체보기; 200% 글자 확대; 하단 navigation과 콘텐츠/키보드 간섭; 가로 overflow; 스크롤 정보 scanning을 확인한다. 핵심 판단은 원하는 거래처와 action을 이전보다 빠르고 덜 헷갈리게 찾을 수 있는지다. 이 결과를 사람이 확인한 뒤 reference list 채택 여부와 다음 화면 순서를 결정한다.

### 2026-09-25 OPT-4 release regression — 로컬 PASS, 미배포

- 검증 코드 commit `570a46caaeee2b36963695ba997eac8621c227a0`에서 acceptance의 demo 환경을 고정하고 납품사진 flag를 해당 demo build에만 활성화했다. 원인은 acceptance launcher가 build-time `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS`를 설정하지 않아 납품사진 메뉴가 빠진 것이었다. production 기본값과 제품 코드는 변경하지 않았다.
- 추가 harness 오류 두 건도 수정했다. safe-config 브라우저 runner는 HTTP 200 뒤 실제 클라이언트 설정 화면이 준비될 때까지 기다리고, PIN 로그아웃 테스트는 Firestore auditLogs의 모든 page에서 이번 로그아웃 기록을 확인한다. 단언 완화, 테스트 skip/retry, 성능 예산 증가는 없다.
- 수정 후 canonical acceptance 10/10 gate와 내부 emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-25 09:34:36 KST). OPT-4는 clean commit에서 처음부터 다시 실행해 app/Functions typecheck, lint, unit 1,581 PASS/14 SKIP, 검색 성능 5,000건 p95 1.11ms/50ms, Rules 50/50, 납품사진 backend emulator, production build, PWA/성능/Hosting verifier, safe-config browser 262/262, 재고 static browser 12/12·emulator 11/11, 납품사진 frontend 8/8, 마지막 canonical acceptance 10/10·내부 emulator 12/12를 모두 PASS했다. 마지막 acceptance의 full user journey gate는 469,990ms였다.
- production build의 초기 JS gzip은 139,733B, customer 36,821B, inventory 25,029B, 납품사진 10,230/3,559/2,918/1,662B로 기존 ceiling 안이다. Hosting export/shipped 96개, precache 83개, 초기 asset 9개다. 재고 격리 E2E 전후 기존 production `out` 96개 파일 집합 SHA-256은 `539e34efc16def7a83e8ab2801e82771b5b09f1d9584b42755b5812aca40564d`로 동일했고 `static-app-*` 잔여는 0이다. 마지막 acceptance의 demo build 뒤 production `out`을 다시 생성해 성능/PWA/Hosting verifier를 재통과했다.
- Emulator gate는 순차 실행했고 각 종료 후 공유 포트와 관련 프로세스가 0임을 확인했다. production deploy와 운영 Firebase/GCP mutation은 하지 않았다. audit에는 high 이상 0건, moderate 7건이 남아 있다. 로컬 구조 검증은 통과했지만 설치 PWA의 실제 업데이트·offline 복구, 운영 Kakao 경로와 현장망, 운영 환경의 새 candidate 배포 후 브라우저 확인은 이번 미배포 검증 범위 밖이다.

### 2026-09-25 검증된 RC의 Firebase Hosting 승격 — 완료

- 검증된 HEAD `21bf5bd7358490eb12ed246c3e80a4cfeef1caa6`의 clean tree에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 빌드 프로세스에만 지정해 정적 `out`을 생성했다. flag는 ignored production env 파일에 정의돼 있지 않아 명시적 지정이 필요했고, 이전 운영 Hosting build도 같은 방식이었다. 생성된 navigation bundle의 납품사진 기본값은 활성(`true`)이다. 제품 코드, flag 기본값, dependency, budget, Firebase 설정 파일은 변경하지 않았다.
- production build·성능·PWA·Hosting verifier PASS. 정적 export/shipped 96개, precache 83개, 초기 asset 9개다. 배포 후보 `out`의 파일 집합 SHA-256은 `12dcbb7e4c1a035f86c1ed93d237e02a6233c3c68db8f8ea789d714251f3151e`이고 `/sw.js` SHA-256은 `095e171afb361969b91684702f94ef99c08aaa94208683d1eca16c377dcc9845`다.
- 저장소의 canonical 명령 `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했다. 새 live release `1790297267844000`, version `a85d184f5184fcec`, time `2026-09-25 09:47:47.844 KST`를 Hosting API로 확인했다. 직전 release `1790217833155000` / version `79b66cdeae0b2036`가 rollback 지점이며 그 이전 version은 `e603258b088093f0`이다. Functions, Rules, Auth, Firestore, Storage, IAM, Scheduler, Vercel은 변경하지 않았다.
- `https://onnuriway.web.app`과 `https://onnuriway.com`에서 canonical Hosting verifier가 각각 PASS했다. 두 origin의 worker hash, manifest, connectivity, 초기 asset, cache/scope header, 비공개·존재하지 않는 경로의 404를 확인했고, 두 origin 각각 83개 precache 자원을 후보 파일과 byte 단위로 대조해 불일치 0건이었다.
- 운영 브라우저에서 기본 URL의 비로그인 PIN 화면을 확인했다. 기존 관리자 세션이 있는 custom domain에서는 새 버전 알림의 `업데이트` 적용 뒤 로그인 유지, 운영 개요·거래처 관리·재고 관리의 읽기 전용 진입과 console error 0건을 확인했다. 운영 데이터 저장·수정·삭제나 사진 업로드는 수행하지 않았다.
- Galaxy S20+ 자체를 Codex 환경에서 조작하지 못했다. 사람이 설치 PWA에서 업데이트 적용 뒤 로그인 유지, 직원 계정의 거래처 `납품사진` 메뉴·오늘 경로/기록·viewer/Back, 재고 진입을 최소 확인해야 한다. 이는 이번 desktop browser 및 byte-level 검증으로 대체하지 않는다. 운영 Kakao 지도 타일/길찾기와 현장망 체감도 이번 배포 smoke에서 미확인이다.

### 2026-09-25 납품사진 과거 기록 접근 UX — production Hosting 배포, Galaxy smoke 대기

- **원인:** Phase 3C history/viewer와 `listDeliveryPhotos` customer scope는 존재했지만, 오늘 사진이 있는 거래처의 접힌 `기록완료` 영역에서 버튼처럼 보이지 않는 왼쪽 정보 블록을 눌러야만 열렸다. 오늘 사진이 없는 납품처 및 검색 결과에는 history 진입 자체가 연결되지 않았다. 서버 list는 `deliveryDateKey`, `createdAt`, `expiresAt`, `fromDateKey`를 제공하고 168시간·만료·active 범위와 30장 제한을 이미 적용한다.
- **변경:** 오늘 남은 납품처, 기록완료 납품처, 검색 결과 각각에 명시적 `기록` 버튼을 제공한다. 기록완료 정보 블록의 기존 진입과 history thumbnail/evidence viewer, 삭제·Back 경로는 유지한다. 기존 customer list 결과만 사용해 `전체`(기본), `오늘`, `어제`, 최근 날짜 가로 선택지를 제공하며 전체 기록은 날짜별로 묶는다. 빈 날짜 안내와 `사진은 최근 7일간 보관됩니다.` 문구를 표시한다. 서버의 rolling 168시간은 서울 달력 날짜로 최대 8개 날짜에 걸치므로, 칩은 서버 `fromDateKey`부터 오늘까지 8개로 구성하고 서버가 반환하지 않은 기록은 표시하지 않는다.
- **범위:** 검증된 commit `0d3d5913ebf332282a8735656369b9a579ad4cd5`를 production Hosting site `onnuriway`에 배포했다. Functions, Firestore/Storage/Auth 데이터·정책, production feature flag 기본값과 기존 performance ceiling은 변경하지 않았다. 날짜 UI는 history를 열 때만 로드하는 별도 chunk이며 자체 CSS/JS 계측 한도를 추가했다. Galaxy 실기기의 새 진입 UX는 아직 확인하지 않았다.
- **검증:** 납품사진 관련 unit/contract 19 files·119 PASS(서버의 167h 포함/169h 제외와 만료 evidence 거부 포함), demo Emulator Chromium 9/9 PASS(남은 납품처·검색의 진입, 전체/오늘/어제/빈 날짜, 과거 날짜 thumbnail·viewer·Back, 기존 삭제/업로드 회귀). Canonical acceptance 10/10 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-25 10:46:19 KST), unit 1,583 PASS/14 SKIP, Rules 50/50, safe-config browser 262/262, full user journey 469,807ms다. 최종 production 설정 static build와 PWA/성능/Hosting verifier PASS, export/shipped 98개·precache 85개·initial assets 9개. Initial JS 139,766B gzip, 납품사진 workspace 10,236/10,240B, history 2,683/3,584B, viewer 2,918/3,072B, 날짜 chunk 2,091/2,304B 및 CSS 1,003/1,024B(raw)다. Lint/typecheck와 `git diff --check`도 PASS했다.
- **운영 승격:** clean source commit `0d3d5913ebf332282a8735656369b9a579ad4cd5`에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 빌드 프로세스에만 주입해 `npm run build` 및 PWA/성능/Hosting gate를 통과했다. navigation bundle의 납품사진 flag는 활성이고, `기록`·날짜 선택·보관 안내가 생성된 lazy chunk에 포함된다. 후보 `out` 98개 파일 집합 SHA-256은 `336555eff6e0669f5f74514d5a04143a71bae5a899a382d3652f6bde4e6e47e1`이다. `npx firebase deploy --project onnuriway --only hosting`으로 Hosting만 배포했으며 live release `1790311854498000` / version `8e847575f9771450` (`2026-09-25 13:50:54.498 KST`), rollback release `1790297267844000` / version `a85d184f5184fcec`을 Hosting API에서 확인했다.
- **운영 검증:** `https://onnuriway.com`과 `https://onnuriway.web.app`의 canonical Hosting verifier가 각각 PASS했고, 두 origin 각각 85개 precache 파일을 후보와 byte 단위로 비교해 불일치 0건이다. `/sw.js` SHA-256은 양쪽 모두 후보의 `9cfc045822a77c4f6da6e3717b176f8540818c0bc646eef2ae95e7a6c4b99492`와 일치한다. 두 origin의 비로그인 PIN 초기 화면, PWA 업데이트 적용 뒤 정상 복귀, console error 0건을 확인했다. 이 브라우저에는 인증 세션이 없어 거래처·재고·납품사진의 운영 데이터 화면과 기존 session 유지는 직접 확인하지 못했다. 운영 데이터 write는 수행하지 않았다.
- **남은 Galaxy S20+ 확인:** 설치 PWA 업데이트 후 로그인/session 유지, 오늘 사진 유무가 다른 거래처와 검색 결과의 `기록` 진입, `전체`/`오늘`/`어제`/과거 날짜·빈 날짜·보관 안내, 사진 viewer와 Back, 거래처·재고 read-only 진입을 사람이 확인한다. 이 항목은 Codex의 정적 파일 및 비로그인 브라우저 검증으로 PASS 처리하지 않는다.

### 미확인 또는 다시 확인할 사실

- 8명 동시 사용 환경의 실제 read 비용과 현장망 T2/T3는 아직 계측하지 않았다. 이는 이번 inventory mobile UI release의 배포·사용성 확인과는 별도의 운영 계측 항목이다.
- 납품사진 network 장애/retry는 구현·Emulator 검증 범위는 있으나 production fault injection 결과가 명확히 기록돼 있지 않다. Web Share와 GPS nearby suggestion은 freeze 범위 밖의 후속 후보이며 실제 업무 필요성이 확인될 때 별도 Phase로 판단한다.

### 2026-09-23 납품사진 Phase 2A/2B production backend — 완료 당시 기록

- Project `onnuriway` (`347044588399`)의 `asia-northeast3`에 납품사진 Functions 9개만 targeted deploy했다: `getDeliveryPhotoRoute`, `saveDeliveryPhotoRoute`, `getDeliveryPhotoDay`, `saveDeliveryPhotoDay`, `createDeliveryPhoto`, `listDeliveryPhotos`, `getDeliveryPhoto`, `deleteDeliveryPhoto`, `expireDeliveryPhotos`. 모두 ACTIVE, Gen2, Node.js 22이며 전용 runtime SA `delivery-photo-runtime@onnuriway.iam.gserviceaccount.com`을 사용한다. `createDeliveryPhoto`는 1GiB/concurrency 1/maxInstances 4/timeout 120초, `expireDeliveryPhotos`는 maxInstances 1/timeout 120초다. 배포 전후 비교에서 기존 production Functions 62개의 이름·상태·runtime·service account·updateTime은 불변이다.
- Scheduler job `firebase-schedule-expireDeliveryPhotos-asia-northeast3`는 ENABLED, `every 60 minutes`, `Asia/Seoul`이다. OIDC identity는 위 전용 SA이고, 정확한 scheduled Cloud Run service에 이 SA의 service-specific `roles/run.invoker`가 확인됐다. 실제 scheduled invocation은 Batch C에서 수동 실행하지 않았으며 당시 `lastAttemptTime`은 없었다.
- 전용 Standard bucket `prod-delivery-photos-an3-68e5c4d72a90`은 같은 project/region에 있으며 UBLA ON, Public Access Prevention enforced, Soft Delete OFF, Versioning OFF, Autoclass OFF, retention/default hold 없음, bucket 전체에 적용되는 Lifecycle Delete age 8일이다. Batch C 후 object count는 0이다. 기존 업무 bucket `onnuriway.firebasestorage.app`은 변경하지 않았다.
- 전용 SA의 project role은 `roles/datastore.user`뿐이다. 전용 bucket의 custom role `projects/onnuriway/roles/deliveryPhotoObjectRuntime`은 `storage.objects.create/get/delete`만 포함한다. 전용 bucket create/get/delete는 GRANTED, list/update는 DENIED이며, 기존 업무 bucket의 create/get/delete/list/update는 모두 DENIED로 검증했다. M2 legacy ACL baseline 대조에서도 새 SA의 기존 bucket 접근 경로는 확인되지 않았다.
- `deliveryPhotos` COLLECTION composite index 2개는 `deliveryDateKey ASC, createdAt DESC` (`CICAgJjmiJEK`) 및 `customerId ASC, createdAt DESC` (`CICAgNi47oMK`)로 모두 READY다. 기존 index 5개는 불변이고 `deliveryPhotos`·`deliveryPhotoDays` TTL은 없다. Git에서 제외된 `functions/.env.onnuriway`에 production deploy용 `DELIVERY_PHOTO_BUCKET`·`DELIVERY_PHOTO_SERVICE_ACCOUNT`가 설정돼 있다.
- Batch C에서 9개 runtime/options, 기존 62개 불변, Scheduler·Cloud Run invoker를 확인했다. 무인증 `getDeliveryPhotoRoute` Callable smoke는 HTTP 401, `application/json`, `error.status=UNAUTHENTICATED`였다. 인증된 운영 납품사진 Callable 호출, 사진/문서 write, Hosting/frontend deploy는 하지 않았다. 버킷 객체는 0개이며 Firestore 업무 collection의 document count는 직접 조회하지 않았다. rollback은 필요하지 않았다.
- **당시 경계:** backend infrastructure는 production에 있지만 delivery-photo feature flag는 OFF이고 UI는 production에 노출되지 않았다. 아래 2026-09-24 Phase 3 기록이 이 과거 경계를 대체한다.

### 2026-09-24 납품사진 Phase 3A/3B/3C — production 완료

- **Phase 3A field workspace:** 오늘 남은 납품처와 기록완료 projection, 기본 route, today override, 내 납품처 편집, 오늘 거래처 추가/제외, 순서 편집, 거래처 검색, 최근 거래처 20 활용을 구현했다. route/day/photo metadata repository를 연결하고 화면 상태는 Memory-only로 유지하며 revision conflict를 처리한다. 별도 completion boolean은 저장하지 않고 server-confirmed photo metadata count에서 기록완료를 투영한다.
- **Phase 3B capture/upload:** camera capture와 album selection, max long edge 2560, fresh WebP re-encode, orientation normalize, crop/upscale 금지, EXIF/GPS 제거를 적용했다. upload coordinator와 job은 Memory-only이고 customer당 active job 1개, preparation concurrency 1, Callable relay 최대 2개로 제한한다. duplicate tap을 막고 같은 사진 retry는 동일 request ID/payload를 유지한다. `createDeliveryPhoto`가 반환한 server-confirmed metadata 이후에만 기록완료로 이동하며 persistent/offline upload queue와 Client direct Storage write는 없다.
- **Phase 3C history/viewer:** 기록완료 customer history를 `listDeliveryPhotos` customer scope로 읽고 최근 기록 N장, metadata-first, viewport thumbnail lazy load, 선택 evidence lazy load, 등록자/등록 시각을 제공한다. viewer는 previous/next, Arrow keys, Escape, Android Back, dependency 없는 pointer swipe를 지원한다. Blob/Object URL은 Memory-only이며 viewer close/logout/session 변경 시 정리하고 persistent photo cache는 두지 않는다.
- **Galaxy 실기기:** Galaxy S20+ production에서 camera upload, album upload, 기록완료 이동, 기록완료 customer의 추가 사진, 여러 장 순차 촬영/저장, history, thumbnail, evidence viewer, previous/next, Back 뒤 history 유지가 모두 PASS했다.
- **Card UX (당시):** 기존 `Customer.accessPassword`를 추가 조회 없이 in-memory catalog에서 재사용하고 `accessPasswordState === "registered"`일 때만 `행정동 · 출입비번 1234#` 형태로 표시한다. 당시에는 기록완료의 독립 `사진 보기` 버튼을 제거하고 왼쪽 customer 정보 block 전체를 History를 여는 native button으로 만들었다. 이후 명시적인 `기록` 버튼은 위 2026-09-25 로컬 후보를 따른다. camera와 album은 각각 capture/album picker를 여는 독립 sibling control이며 당시 Galaxy 최종 UX 확인이 PASS했다.
- **Backend 불변:** Phase 2B의 delivery-photo Functions 9개 ACTIVE, dedicated runtime SA/bucket/custom Storage IAM, composite indexes 2개 READY, hourly expiration Scheduler, bucket lifecycle Delete age 8일과 기존 business bucket 격리를 유지한다. Phase 3 frontend와 Hosting release 때문에 Functions, Firestore, Storage, IAM, Scheduler resource를 변경하지 않았다.
- **Production frontend:** `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` candidate를 Hosting site `onnuriway`에만 배포했다. live release `1790211742342000`, version `e603258b088093f0`, time `2026-09-24 10:02:22.342 KST`, `/sw.js` SHA-256 `20520cc6aaa7d8b1ca5ee67522e41b9dc4f691429e8b940b7c154ecb52d5291d`다. 두 production origin verifier와 candidate/live worker 및 precache asset 대조가 PASS했다.
- **Bundle ceiling:** Workspace JS는 10,239B gzip / 10,240B로 headroom이 1B뿐이다. Workspace CSS는 6,066B raw / 1,584B gzip, History JS는 3,459B gzip, Viewer JS는 2,811B gzip, Initial JS는 141,040B gzip이다. 앞으로 delivery-photo workspace에 코드를 직접 늘리지 말고 가능한 기능을 event-loaded/lazy chunk로 분리하며 budget 완화보다 split을 우선한다.
- **최종 검증:** app/Functions typecheck, backend contract/Functions 54 tests, frontend 12 files/50 tests, Demo Emulator Chromium 6/6, lint, production build, PWA/performance/Hosting gate, `git diff --check`, 320/360/200% overflow 0, 접근성, production Galaxy 실기기가 PASS했다.
- **당시 후속 범위:** Phase 3A/3B/3C 완료 시점에는 delete UI, Web Share, GPS nearby suggestion을 완료로 기록하지 않았다. delete UI의 이후 완료 상태는 아래 Phase 3D 기록을 따른다. network 장애/retry도 production fault injection 완료로 과장하지 않는다.

### 2026-09-24 납품사진 Phase 3D Delete — production·Galaxy 완료

- **삭제 계약·권한:** 기존 `deleteDeliveryPhoto` Callable의 `requestId`/`photoId` 입력과 `photoId`/`deletedAt` 응답을 재사용했다. 일반 직원은 본인 UID·직원 ID로 등록한 서울 기준 당일 사진만, verified admin은 retention 만료 전 사진을 삭제할 수 있다. Frontend의 action 노출 조건은 UX용이며 최종 권한 판단은 backend다. Functions 제품 코드는 변경하지 않았다.
- **확인·재시도:** 삭제 확인 UI에서 취소, Escape, Android Back은 write 0이다. 첫 delete intent에서 만든 requestId를 동일 photoId의 retry에 재사용하고 rapid double tap은 하나의 logical request로 제한한다. Server-confirmed success 후에만 local metadata를 제거하며 authoritative not-found/already deleted는 reconcile한다. Permission/transport failure에서는 local remove를 하지 않는다.
- **기록완료 projection·privacy:** 사진 수는 삭제 성공에 따라 `3 → 2 → 1 → 0`으로 감소한다. 0장이 되면 오늘 customer photo summary와 기록완료에서 제거되고 오늘 남은 납품처로 즉시 복귀한다. 별도 completion boolean은 저장하지 않는다. 삭제한 사진의 thumbnail/evidence Object URL을 즉시 revoke하고 늦게 도착한 응답은 UI에 반영하지 않는다. Persistent photo cache는 추가하지 않았다.
- **검증·bundle:** delete focused 10/10, delivery-photo frontend 62/62, demo Emulator Chromium 8/8, app/Functions typecheck, lint, production static build, PWA/performance/Hosting gate 및 `git diff --check`가 PASS했다. Workspace JS `10,230/10,240B` gzip(잔여 10B), History `3,559/3,584B`(25B), Viewer `2,918/3,072B`(154B), Delete `1,662/1,792B`(130B), History/viewer CSS `5,548B` raw/`1,418B` gzip, Initial JS `141,056B` gzip이다. 기존 budget 완화 없이 delete는 Viewer 내부 nested dynamic boundary로 유지했다.
- **Production Hosting:** 제품 코드 commit `b4831ff4d24b8956e327ea806f1ca6bba1651d9c`를 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`로 build해 Firebase project/site `onnuriway`/`onnuriway`의 Hosting에만 배포했다. Release `1790217833155000`, version `79b66cdeae0b2036`, time `2026-09-24 11:43:53.155 KST`, `/sw.js` SHA-256 `ebd4c57444b5437ba3f2fe4947a7b54d694ad02e7d56a22718f93fa5694d1a51`다. 두 production origin verifier와 candidate/live worker 및 83개 precache asset hash 대조가 PASS했다. Rollback target은 직전 version `e603258b088093f0`다. Functions/Firestore/Storage/IAM/Scheduler 변경은 0이다.
- **Galaxy S20+ 사용자 실기기 확인:** 사용자가 production에서 본인 당일 사진 delete action, 확인 UI, 취소, 실제 삭제, 사진 수 감소, 마지막 사진 삭제 뒤 기록완료에서 오늘 남은 납품처로 복귀, history/viewer reconciliation, Back/Escape를 모두 PASS로 확인했다. 기존 camera/album/history/viewer 회귀도 없었다. 이는 사용자의 실기기 확인 결과이며 Codex의 production authenticated photo read/write/delete 결과가 아니다.

### 납품사진 FEATURE FREEZE와 다음 작업

1. Core 범위인 route/day, camera, album, upload/retry model, 기록완료 projection, history, thumbnail, evidence viewer, delete, 출입비번 표시를 현재 상태에서 **FEATURE FREEZE**한다.
2. Web Share와 GPS nearby suggestion은 freeze 범위 밖이다. 실제 업무 필요성이 확인되면 별도 Phase로 진행한다.
3. 다음 새 Codex 스레드의 첫 단계는 repository cleanup/optimization을 위한 **OPT-0 READ-ONLY AUDIT**다. 파일과 테스트를 `KEEP`, `CONSOLIDATE`, `DELETE CANDIDATE`, `GENERATED / SAFE TO CLEAN`으로 분류하고 근거와 영향을 기록한다. OPT-0에서는 삭제·수정하지 않는다.
4. 감사 결과를 검토한 후 실제 cleanup 범위를 결정한다. security, Rules, Auth, revision, requestId, upload replay, Emulator, PWA, performance, Hosting regression tests는 중요한 안전망이며 단순히 테스트 파일이라는 이유로 삭제하지 않는다.

## 2. 확정 요구사항과 현재 코드 대조

| 영역 | 확정 요구 | 현재 코드 상태 | 판정 |
| --- | --- | --- | --- |
| 호스팅 | Firebase Hosting과 `onnuriway.com` 사용 | `output: "export"`, `firebase.json` public=`out`, site=`onnuriway`; apex와 www 전환 기록 존재 | 구현·운영 기록 있음 |
| 모드 선택 | 회사명/로고 옆에서 네 모드를 인지 가능하게 선택, 모션과 터치 영역 유지 | 4개면 compact trigger + picker, 적으면 segmented control; 권한 없는 모드는 제외 | 구현됨 |
| 거래처 | 전 직원 조회·등록·수정, 주소/좌표·전화·출입정보·전경사진·전체보기 | Callable 기반 목록/저장/검색/역지오코딩/사진, 지역 directory, 최근 5개 ID 기록 | 구현됨 |
| 학교납품 | compact 카드와 리뉴얼된 field brief, 학교급 아이콘, 사진 확대 | 학교 검색/상세 cache, delivery field brief와 photo viewer 모듈 존재 | 구현됨 |
| 영업/홍보 | 방문 기록, 전화, 현장 사진, route planner, 배송 불필요 정보 제외 | 월별 assignment/profile/visit/history 및 route planner가 분리돼 있음 | 구현됨 |
| 재고 기본 | 냉장·냉동1·냉동2·샘플, 최대 수백 품목, D-100, 제품 사진 1개 | 독립 inventory contract/service/workspace와 네 장소, urgentDays 기본 100 | 구현됨 |
| 재고 입력 | 사진은 등록/수정 모두 촬영 전용, 초기 수량을 한 화면에서 저장 | camera capture 입력과 제품+초기 lot 저장 흐름 존재 | 구현됨; 실기기 미확인 |
| 재고 조사 | 직원별 ON/OFF, 지정일 미완료 강조, 조작한 유통기한만 확인 | sessionStorage preference, per-lot inspection, match-only 확인과 충돌 검증 | 구현됨 |
| 재고 상세 | 2행 고정 action, 더보기에 이력·비활성·삭제, 사진 확대 힌트 | 상세 footer와 more dialog, `showExpandHint`, lot 카드 `수정` 텍스트 존재 | 로컬·운영 실제 Chromium 확인됨 |
| 납품사진 | 오늘 route/day, camera/album upload, 기록완료 projection, customer history/viewer/delete | Memory-only workspace/upload, private Callable relay, thumbnail/evidence lazy load, delete reconciliation, Galaxy Phase 3D production 검증; 기록 진입·날짜 필터는 Hosting 배포·정적 검증 완료 | Phase 3A/3B/3C/3D 운영 완료, 후속 UX Galaxy smoke 대기 |
| 오프라인 | 조회 cache만 제한 허용, 민감 쓰기 queue 금지 | 검색/학교만 namespace IndexedDB, 거래처·재고는 Memory, 쓰기 queue 없음 | 구현됨 |
| 보안 | Client 직접 쓰기 금지, App Check/권한/revision/request ID/audit 유지 | Callable service와 Rules 경계, private no-store 응답 | 구현됨 |

## 3. 현재 아키텍처와 데이터 흐름

### Frontend

- Next.js 16.3.3 App Router, React 19.2.8, TypeScript strict, CSS Modules/전역 token을 사용한다.
- `src/features/app-shell/app-shell.tsx`가 인증된 session의 role scope와 feature flag로 모드를 구성한다. 거래처·영업·재고 Workspace는 동적 import로 분리된다.
- 공유 계약은 `src/domain/*`가 `functions/src/*/*-contract.ts`를 다시 export하는 방식이 많다. Client와 Functions의 Zod 응답 계약을 동시에 변경해야 한다.
- Firebase Web SDK의 Firestore는 `memoryLocalCache()`다. 영속성이 필요한 제한된 데이터는 별도 idb 모듈이 담당한다.

### 쓰기 경계

```text
UI form
  → client repository + Zod input parse
  → Firebase authenticated Callable + App Check
  → authorization/session/role 재검증
  → service transaction(revision + request ID)
  → Firestore/Storage + audit/event/receipt
  → Zod response parse
  → 현재 화면 Memory만 갱신
```

- 거래처: `companies/onnuri/customers/{customerId}`. 목록은 250개 이하 page schema와 cursor로 조회하며 5,000개에서 방어적으로 중단한다. 전경 사진은 Callable과 비공개 WebP variant를 사용한다.
- 재고: `companies/onnuri/inventoryProducts/{productId}` 아래 `lots`, `events`; 별도 `inventorySettings/current`, `inventoryCountCycles`, `inventoryRequests`. 목록은 100개 page, 상세에서 활성 lot와 이력을 읽는다.
- 재고 수량 작업은 metadata revision과 stock revision을 구분한다. `lotSummary`는 `includeSummary: true`인 새 Client에만 포함하도록 호환 배포가 적용됐다.
- 학교·영업 흐름은 기존 `schools`, `schoolFieldProfiles`, 월별 sales cycle/assignment/profile/visit 구조를 유지한다.

## 4. 현재 캐싱과 PWA 경계

| 데이터 | Memory | IndexedDB/local storage | Service Worker |
| --- | --- | --- | --- |
| 학교 검색 Catalog/최근 학교 | Memory index | IndexedDB, session/role/version namespace | 업무 응답 cache 안 함 |
| 학교 상세 공용정보 | 즉시 표시 | IndexedDB | 업무 응답 cache 안 함 |
| 학교 영업정보 | 활성 탭 | 저장하지 않음 | cache 안 함 |
| 학교 thumbnail/preview | Blob Memory | IndexedDB 24개/36MiB | 명시적 thumbnail route만 허용 |
| 학교 original | Memory | 저장하지 않음 | cache 안 함 |
| 거래처 목록/사진 | Memory | 최근 거래처 ID 저장 용량 20개, 기존 홈 표시는 최대 5개인 namespaced localStorage | cache 안 함 |
| 재고 목록/상세/사진/draft | Memory | 실사 모드 preference만 날짜·session 기준 sessionStorage | cache 안 함 |

- Serwist runtime cache version은 코드상 `phase35`다. App Shell navigation은 NetworkFirst(3초), public asset과 학교 thumbnail은 CacheFirst다.
- Firebase, Callable, Storage relay, `/api`, CSV, 거래처·재고·영업 응답은 runtime cache에 넣지 않는다.
- 로그아웃/세션 무효화는 `onnuriway:private:` storage, Blob URL, 검색·학교 상세·학교 사진 IndexedDB와 영업 Memory를 정리한다.
- 업데이트는 자동 `skipWaiting`하지 않고 사용자의 `업데이트` 선택 뒤 적용한다.

## 5. 마지막 확인 결과

### Phase 49에 문서화된 전체 검증 — 확인됨

- 단위 테스트 1,364개 통과, 일반 실행에서 통합환경 전용 13개 제외.
- 정적 운영 유사 UI E2E 10/10 통과.
- 실제 Firestore Emulator 통합 10/10 통과.
- ESLint, 앱/Functions TypeScript, 정적 운영 build, PWA/성능/Hosting gate 통과.
- 360/768/1280px와 1,000개 품목 목록 확인.
- 2026-09-13 09:28 KST Firebase Hosting 반영 후 두 공개 origin에서 GET/HEAD 25개씩 통과. 당시 worker SHA-256은 `1dfd4de1253236f806553930dab9432816eeb32c7443d3aff232b7777ec73d9f`.

### Phase 49 이후 마지막 작업 — 확인 범위 제한

- 임박 상품 필터를 검색창 아래 중앙 checkbox로 이동하고 검색창을 확장했다.
- 실사 토글 문구를 `재고조사` + 아래 `on/off`로 바꿨다.
- 상품 상세 사진 오른쪽 아래 확대 돋보기 힌트를 추가했다.
- 유통기한별 수량 카드의 `정보 수정`을 `수정`으로 바꿨다.
- 마지막 명령 `npm run build && npx firebase deploy --project onnuriway --only hosting`은 성공했다.
- 이 작은 변경 뒤 전체 단위/E2E/Emulator suite와 원격 worker hash 검사는 재실행하지 않았다.

### 초기 HANDOFF 문서 정리 당시 실행하지 않은 것

- 앱/Functions 코드 수정 없음.
- 테스트, typecheck, lint, build, bundle/PWA/Hosting verifier 실행 없음.
- 배포 및 운영 데이터 접근 없음.

### 2026-09-20 P0 회귀 확인 — 로컬

- 실제 Chromium에서 수정 전 360×800 화면을 캡처해 필터 세 개는 한 행의 3열이지만 `재고조사 off`가 가로로 표시되는 것을 재현했다. 원인은 `.countToggleLabel { display: inline-grid; }` 뒤의 `.countToggle > span:last-child { display: inline-flex; }`가 같은 요소의 display를 덮는 cascade였다.
- `src/features/inventory/inventory.module.css`에서 뒤쪽 범용 selector의 `display: inline-flex` 선언만 제거했다. 다른 간격·정렬·토글 동작은 바꾸지 않았다.
- 수정 후 production static export를 쓰는 격리 Chromium에서 `재고조사` 아래 `on/off`, 검색창 아래 3열, 44px 이상 터치 높이, 360px 가로 범위, 1,000개 목록을 computed style과 geometry로 확인했다. flex item인 label의 computed display는 CSS blockification에 따라 `grid`이며 상태 text의 top이 label top보다 아래다.
- 격리된 현재 소스 build는 기존 production `out`/worker를 바꾸지 않았고 98개 파일을 내보냈다. 이 로컬 build의 worker SHA-256은 `00cea3474b853a27b5ddff1091c5137e3333aa40e01ed82518dbdd57ee82cf54`이며 운영 worker와 다르므로 아직 배포되지 않은 build임이 명확하다.
- 제품 상세의 확대 힌트는 사진 버튼 우하단의 23×23 absolute element로 확인했다. 상세 하단은 스크롤 body와 분리된 footer에서 1행 `출고/입고/조정/정보 수정`, 2행 `수량 일치 확인/더보기`가 스크롤 전후 같은 위치를 유지했다.
- 최종 검증: 재고 UI 단위 40/40, 정적 production UI E2E 10/10, Firestore emulator 통합 10/10, 앱/Functions typecheck 통과. 변경 TypeScript 파일 ESLint는 오류 없이 통과했고 CSS 파일은 현재 ESLint 설정상 대상이 아니라 ignore 경고 1건만 발생했다.
- E2E의 이전 2열 geometry, `switch`로 남은 임박 checkbox role, 오래된 `유통기한 정보 수정` 접근성 이름도 현재 렌더링/코드에 맞춰 P0 테스트 기대만 갱신했다.

### 2026-09-20 P0 회귀 확인 — 운영 배포/PWA

- 새 배포는 실행하지 않았다. `https://onnuriway.com`과 `https://onnuriway.web.app`에서 공개 GET/HEAD 25개씩 통과했고, 두 origin의 worker SHA-256은 `35a673947f19f04005c71bcbb67400db6375e07a517055d078643de8bd3e9fcb`로 일치했다. worker는 `no-store`, root scope를 유지한다.
- Firebase Hosting live release는 `1789262169443000`, version `1274c8c40b063e3f`, release time `2026-09-13T01:16:09.443Z`로 조회됐다. 이는 이번 로컬 CSS 수정 전 배포다.
- 기존 Chrome 세션에서 실제 `새 버전이 준비되었습니다` 알림을 확인하고 `업데이트`를 적용했다. 로그인은 유지됐고 재고 화면이 다시 열렸으며, 운영 데이터 저장·실사 완료·상태 변경·사진 업로드는 하지 않았다.
- 운영 360×800 화면에서도 검색창 아래 필터 3열은 확인됐지만 `재고조사 off`는 가로였다. 반면 제품 사진 확대 힌트는 `display: grid`, `position: absolute`로 사진 우하단에 있었고, 상세 body는 `overflow-y: auto`, 2행 footer는 body 아래 별도 영역으로 viewport 하단을 유지했다.
- 확인 후 상세를 닫고 임시 viewport override를 원래대로 복원했다. 브라우저 warning/error log는 0건이었다. 이번 브라우저 확인은 기존 로그인 세션의 읽기만 사용했으며 운영 레코드를 생성·수정·삭제하지 않았다.

### 2026-09-20 P0 배포 준비 검증 — 미배포/차단

- 배포 후보는 `codex/mobile-action-reach`의 `fb173f13d5f1e271b6a34674253d88a4d903bc31`와 dirty worktree 전체로 만든 `out` 98개 파일 및 현재 `firebase.json` Hosting 설정이다. 대상은 Firebase project/site `onnuriway`/`onnuriway`, 산출물은 `out`이다. Functions·Rules·운영 데이터는 이 Hosting 후보에 포함되지 않는다.
- worktree에는 런타임 프런트 파일 100개와 Hosting/build 설정 3개의 미커밋 변경이 있으므로 소스 기준으로 “CSS 한 줄만 배포”되는 후보가 아니다. 다만 직전 운영 `out`과 이번 후보를 내용 비교한 결과, 공개 CSS의 실질 차이는 inventory 후행 rule의 `display:inline-flex` 제거와 그에 따라 생성된 `.inline-grid{display:inline-grid}` rule 추가였다. HTML/RSC, build manifest, webpack runtime, worker의 경로·hash 변경은 새 build ID, CSS hash, PWA revision 참조 갱신이다.
- 후보 식별값: `out` manifest SHA-256 `d17332b727c4ab008305069159e8e7719cb7ef24e66a3e20ee8b48f5a080eeee`, worker SHA-256 `4d0e468fd65b0f3d9b7cf434b045934e4b8f25b29816afd1c1df69093cf2d710`. 직전 운영 worker `35a673947f19f04005c71bcbb67400db6375e07a517055d078643de8bd3e9fcb`와 다르다.
- 새 실행: `npm run build` 통과, PWA build gate 통과, Hosting build gate 통과(98 exported/shipped, 69 precached, 초기 asset 9개). 최종 inventory CSS에는 `.countToggleLabel`의 `display:inline-grid`가 있고 후행 `span:last-child`에는 `align-items`/`gap`만 남았다. worker는 `skipWaiting: false`와 `SKIP_WAITING`, 새 CSS precache를 유지해 기존 사용자 승인형 업데이트 절차와 일치한다.
- 재사용: 직전 P0와 대상 소스/테스트가 바뀌지 않아 재고 UI 단위 40/40, 정적 production UI E2E 10/10, Firestore emulator 10/10, 앱/Functions typecheck와 변경 TypeScript ESLint 통과 결과를 재사용했다. 운영 두 origin/기존 worker/live release 및 실제 업데이트 알림 확인도 현 운영 기준 결과로만 재사용했으며 후보 배포 완료 근거로 사용하지 않는다.
- 차단: `npm run verify:performance:build`가 inventory CSS raw 29,349B로 28.5KiB(29,184B) 예산을 165B 초과해 실패했다. 예산을 완화하거나 코드를 추가 수정하지 않았다. 또한 실행 Node `22.12.0`은 `package.json`의 `>=22.13 <23` 요구보다 낮다. 호환 Node에서 동일 후보를 다시 만들고 성능 gate 실패 원인을 최소 범위로 해소하기 전에는 배포 승인 요청이 불가하다.
- 미확인: 후보는 배포하지 않았으므로 두 운영 origin의 후보 worker/hash 일치, 실제 설치 PWA의 후보 업데이트 알림·적용, 운영 360×800의 세로 `on/off`는 확인하지 않았다.
- 배포 후 확인 절차: 두 origin에 `verify-firebase-hosting-build.mjs --url`을 실행하고 worker hash/no-store/root scope를 대조한 뒤, 기존 로그인 세션에서 업데이트 알림을 사용자 동작으로 적용하고 로그인 유지·재고 3열·세로 `on/off`만 읽기 전용으로 확인한다. 이상 시 Firebase Hosting Release history에서 직전 version `1274c8c40b063e3f`로 rollback하고 두 origin verifier 및 worker `35a673947f19f04005c71bcbb67400db6375e07a517055d078643de8bd3e9fcb` 복원을 확인한다.

### 2026-09-20 P0 차단 해소 시도 — 미배포/Node 차단 유지

- inventory CSS에서는 선언 집합이 같던 `.photoOpen > span`과 `.photoExpandHint`를 한 규칙으로만 합쳤다. 선택자별 specificity와 모든 값은 유지되며 확대 힌트의 UI·동작·접근성은 바뀌지 않는다. 생성 inventory CSS는 29,349B에서 29,175B로 174B 감소해 28.5KiB 예산보다 9B 작아졌고 performance gate가 통과했다. budget/verifier는 변경하지 않았다.
- 현재 설치 확인 결과 nvm에는 Node `22.12.0`, `20.10.0`만 있고 Codex 번들 Node는 `24.19.0`이었다. `package.json`의 `>=22.13 <23`을 만족하는 기존 런타임이 없어 설치·다운로드·영구 환경 변경은 하지 않았다.
- Node `22.12.0`에서 한 잠정 검증은 inventory 단위 313/313, production static inventory E2E 10/10, runner의 demo emulator 통합 10/10, `npm run build`, PWA/performance/Hosting build gate 모두 통과했다. 이 결과는 엔진 요구를 만족하는 실행을 대체하지 않는다.
- 잠정 후보는 `out` 98개, manifest SHA-256 `25b5214dd9c22426fe27ac28b580c172dc5c38a9bcd4de4c68b5882d5c4a27f8`, worker SHA-256 `ee34c666cae3d0c45c84e5a74f0736ad24eed57a7c71afa88d8a0ede9974aa70`이다. 실제 배포와 운영 확인은 실행하지 않았다.
- 남은 차단은 호환 Node 부재 하나다. 기존 변경을 건드리지 않고 Node `22.13` 이상 `23` 미만 런타임을 제공한 뒤 같은 여섯 검증을 재실행해 모두 통과해야 `배포 승인 요청 가능`으로 전환한다.

### 2026-09-20 P0 호환 Node 최종 재검증 — 배포 승인 요청 가능/미배포

- 기존 nvm으로 LTS Node `22.23.2`를 설치·선택했다. npm은 `10.9.8`, 실제 Node binary는 `C:\nvm4w\nodejs\node.exe`이며 `package.json`의 `>=22.13 <23`을 만족한다. package/lockfile/engine은 변경하지 않았다.
- 호환 Node에서 inventory 단위 313/313, production static inventory E2E 10/10, demo Firestore Emulator 통합 10/10, `npm run build`, PWA/performance/Hosting build gate가 모두 통과했다.
- 최종 inventory CSS는 29,175B로 예산 이내다. `out`은 98개 파일, manifest SHA-256은 `852f72c1e5cb139791179a7c083cb5e9507a133fcb3152346fc92b5e9dac80ea`, worker SHA-256은 `df389ad66ac037b57cf4515f764a3a371bfb40fdd19ef8871d2856e9d7410d07`이다. Node 변경에 따른 PWA revision/hash 갱신 외 예상 밖 소스·기능 차이는 확인되지 않았다.
- P0 상태: **배포 승인 요청 가능 — 아직 미배포**. Firebase deploy와 운영 데이터 접근·변경은 실행하지 않았다.

### 2026-09-20 P0 운영 배포 및 검증 — 완료

- 승인된 `out` 98개 파일을 Node `22.23.2` 환경에서 Firebase project/site `onnuriway`/`onnuriway`의 Hosting에만 배포했다. Functions, Firestore/Storage Rules, Extensions와 운영 데이터는 변경하지 않았다.
- 새 live release는 `1789837912426000`, version은 `f1517baef9f1657f`, release time은 `2026-09-19T17:11:52.426Z`다.
- `https://onnuriway.web.app`과 `https://onnuriway.com`에서 기존 Hosting verifier가 각각 공개 GET/HEAD 25개 검사를 통과했다. 두 origin은 worker `df389ad66ac037b57cf4515f764a3a371bfb40fdd19ef8871d2856e9d7410d07`로 후보와 일치했고 `no-store`, root scope를 유지했다.
- 기존 로그인 Chrome 세션에서 `새 버전이 준비되었습니다` 알림을 확인하고 사용자 동작으로 업데이트를 적용했다. 로그인은 유지됐고 재고 화면이 정상 복귀했다.
- 운영 360×800에서 검색 아래 필터 세 개가 같은 행의 3열이고 `재고조사` 아래 `off`가 세로로 표시됨을 computed geometry/style로 확인했다. 상품 사진 확대 힌트는 우하단 23×23 absolute grid였고, 상세 body는 `overflow-y: auto`, 별도 footer는 하단에서 4개+2개의 두 행 버튼을 유지했다.
- 브라우저 console warning/error는 0건이었다. 상세를 닫고 임시 viewport override를 복원했으며 운영 레코드를 생성·수정·삭제하지 않았다.
- P0 상태: **완료 — 운영 배포 및 검증 완료**.

### 2026-09-20 P1 dirty worktree checkpoint 검증 — checkpoint 차단

- Node `22.23.2`/npm `10.9.8`, branch `codex/mobile-action-reach`, HEAD `fb173f13d5f1e271b6a34674253d88a4d903bc31`에서 확인했다. checkpoint 후보는 tracked 65개와 untracked 211개, 합계 276개 파일이며 tracked diff는 2,821 insertions/1,811 deletions다.
- 변경은 거래처 Callable·Rules·도메인·UI·관리자·지도/사진, 학교납품 현장정보·사진·검색, 영업/홍보 배정·경로·방문·내보내기, 재고 Callable·도메인·UI·감사, 공통 모드/모션/사진 UI, PWA/캐시, Firebase Hosting·Rules·Indexes, 테스트·검증 스크립트와 Phase 32~49 문서로 묶인다. `functions/src/index.ts`, app shell, Rules/Indexes와 테스트가 새 untracked 모듈을 직접 참조하므로 일부 그룹만 떼어 checkpoint하면 현재 운영 상태를 재현할 수 없다. typecheck/build/전체 검증에서 소스 누락 신호는 없었다.
- 현재 확정 UX와 어긋난 E2E 기대값만 최소 수정했다. 모바일 compact mode picker, 4모드/기능 플래그 차이, `납품 현장정보` 접근 이름, 영업 coral 색, 보이는 mode control의 touch target/motion 상태를 현재 구현에 맞췄다. 앱 기능 코드는 변경하지 않았다. `.env.example`의 재고 플래그 설명은 배포 완료 후에도 안전한 기본값 `false`를 유지한다는 뜻으로 바로잡았다.
- PASS: typecheck(app/Functions), lint, unit 1,364/1,364(13 skip), performance unit/gate 18/18, `git diff --check`, production build, PWA build gate(worker 41,238B), performance build gate(initial gzip 140,763B), Hosting build gate(98 exported/shipped, 69 precached), inventory static production E2E 10/10과 Firestore Emulator integration 10/10. 전체 `test:acceptance:emulator`도 12개 gate가 모두 통과했고 production user journey는 65 pass/10 skip이다.
- FAIL: `npm run test:acceptance`의 첫 dependency audit가 19건(critical 1, high 2, moderate 16)으로 중단된다. 직접 의존 Next `16.3.2`에 critical Windows-hosted server/Image Optimization advisory가 있고 `js-yaml`, `sharp`는 high다. 현재 앱은 Firebase static export라 Next 서버 경로 노출은 제한되지만 audit gate 실패 자체는 해소되지 않았다. 의존성 업그레이드 금지에 따라 `npm audit fix`는 실행하지 않았다. Emulator는 `firebase-functions` 구버전 경고도 출력했다.
- checkpoint에는 위 8개 기능/인프라 그룹의 소스·설정·Rules/Indexes·테스트·문서와 P1 E2E 기대값 수정을 함께 포함해야 한다. `output/`의 Playwright/acceptance/security/runtime 자료와 `customer-security-analysis.md`, `phase32-kakao-sdk-mobile.png`, `.next`, `out`, Functions 빌드, 로그·cache·로컬 env는 제외한다. 최종 확인 시점 `output/`은 10,805개/약 2.75GB였고 두 가시 파일도 `.gitignore`에 명시했다.
- P1 최종 상태: **checkpoint 차단**. dependency audit 차단을 별도 승인된 의존성 작업으로 해소하고 동일 audit·typecheck·lint·unit·Emulator acceptance·inventory integration·build 3종 gate를 다시 통과하기 전에는 checkpoint 승인이나 P2 시작이 안전하지 않다. commit, push, deploy, 운영 데이터 접근·변경은 실행하지 않았다.

### 2026-09-20 P1 dependency audit 최소 보안 패치 — checkpoint 차단

- Node `22.23.2`/npm `10.9.8`에서 root cause와 설치 경로를 확인한 뒤 직접 의존성만 최소 변경했다. `next`는 `16.3.2`에서 advisory 최소 수정판 `16.3.3`으로 정확히 고정했고, `sharp`는 `0.35.3 → 0.35.4`, `firebase-admin`은 `14.3.0 → 14.4.0`, 개발용 `firebase-tools`는 `15.28.1 → 15.30.2`로 올렸다. Functions manifest도 공유하는 `firebase-admin`/`sharp` 범위만 맞췄으며 `firebase-functions 7.3.2`, React/React DOM과 앱 코드는 변경하지 않았다.
- lockfile에서는 상위 의존성 갱신에 따라 15개 추가·8개 제거·17개 변경이 발생했고 최종 diff는 465 insertions/336 deletions다. `firebase-admin 14.4.0`이 `@google-cloud/storage 8.2.0`/Firestore 9 계열을 선택했고, 취약한 동일-major transitive는 `js-yaml 4.3.2`, `hono 4.13.8`, `morgan 1.12.1`, `qs 6.16.0`으로 해소됐다. direct dependency 추가나 `overrides`는 사용하지 않았다.
- audit는 변경 전 critical 1/high 2/moderate 16, 합계 19건에서 변경 후 moderate 7건으로 줄었다. Next·sharp·js-yaml 및 기존 firebase-admin storage 계열의 critical/high는 해소됐고 `npm run audit`의 high 이상 acceptance 임계치는 통과하지만, 일반 `npm audit`/`npm audit --json`은 여전히 실패한다.
- 남은 개발 경로는 `firebase-tools 15.30.2 → @google-cloud/pubsub 5.3.1 → @opentelemetry/core 1.30.1`, `csv-parse 5.6.0`, `stream-json 1.9.1`, `gaxios 6.7.1 → uuid 9.0.1`이다. production audit에도 `firebase-admin 14.4.0 → @google-cloud/storage 8.2.0 → gaxios 6.7.1 → uuid 9.0.1`의 moderate 2건이 남는다. 현재 최신 상위 direct 버전으로는 해소되지 않으며 각각 Pub/Sub 6/OpenTelemetry 2, csv-parse 7, stream-json 3, gaxios 7+/uuid 11+ 등 transitive major 변경 또는 호환성 미확인 override가 필요하다. npm의 자동 제안인 `firebase-tools 10.1.1` 강제 downgrade도 breaking 변경이므로 적용하지 않았다.
- 일반 audit가 통과하지 않아 지시된 stop condition에 따라 dependency 변경 후 전체 typecheck/lint/unit/acceptance/Emulator/E2E/build gate 재실행은 시작하지 않았다. `git diff --check`는 통과했고 예상 밖 앱/테스트 코드 변경은 없다. commit, push, deploy, 운영 데이터 접근·변경은 실행하지 않았다.
- P1 최종 상태: **checkpoint 차단**. upstream에서 안전한 상위 dependency 패치를 제공하거나 별도 승인 아래 transitive major/override 호환성을 검증하기 전에는 checkpoint 승인 요청이 불가하다.

### 2026-09-20 P1 moderate dependency graph 확정 — dependency 정책 결정 필요

- 일반 audit의 moderate 7개 노드 중 production 포함은 `gaxios`와 `uuid` 2개다. 경로는 `firebase-admin 14.4.0 → @google-cloud/storage 8.2.0 → gaxios 6.7.1 → uuid 9.0.1`이며, 같은 root `gaxios 6.7.1/uuid 9.0.1`은 개발용 `firebase-tools 15.30.2`에서도 공유된다. `npm audit --omit=dev`는 이 2건으로 실패한다.
- dev-only 5개는 `firebase-tools 15.30.2`를 root로 하는 집계 노드 `firebase-tools`, `@google-cloud/pubsub 5.3.1 → @opentelemetry/core 1.30.1`, `csv-parse 5.6.0`, `stream-json 1.9.1`이다. 안전 범위는 각각 Pub/Sub `6.0.1+`/OpenTelemetry Core `2.8.0+`, csv-parse `7.0.2+`, stream-json `3.5.0+`이지만 firebase-tools의 선언 범위는 Pub/Sub `^5.2.0`, csv-parse `^5.0.4`, stream-json `^1.7.3`이어서 모두 transitive major 변경이다. 설치된 firebase-tools `15.30.2`가 현재 최신이고 같은 major 내 상위 direct 업데이트도 없다.
- gaxios advisory 집계 범위는 `6.4.0–6.7.1`, uuid 영향 범위는 `<11.1.1`이다. gaxios v6의 마지막 릴리스가 `6.7.1`이고 firebase-tools는 `^6.7.0`, 최신 Storage `8.2.0`은 `^6.0.2`를 선언한다. 안전한 gaxios 7은 uuid 의존성을 제거했지만 두 부모 범위 밖의 major이며, uuid `11.1.1+` 강제 적용도 gaxios의 `^9.0.1` 범위 밖이다. 최신 firebase-admin은 `14.4.0`, 최신 Storage는 `8.2.0`이라 A/B 해법이 없고, gaxios 7 또는 uuid 11 override는 검증되지 않은 D 단계라 적용하지 않았다.
- 이번 조사에서는 dependency, lockfile, security override와 audit 정책을 변경하지 않았다. 기존 `@serwist/next → browserslist 4.28.9` override만 그대로다. 최종 결과는 일반 `npm audit` moderate 7건, `npm audit --omit=dev` moderate 2건으로 동일하다.
- 기존 high 이상 audit 정책은 변경 없이 통과하므로 전체 P1 회귀 검증을 실행했다. PASS: 앱/Functions typecheck, lint, unit 1,364/1,364(13 skip), Emulator acceptance 12/12 gate와 production journey 65 pass/10 skip, inventory production E2E 10/10, inventory Emulator integration 10/10, production build, PWA gate(worker 41,238B), performance gate(initial gzip 140,763B), Hosting gate(98 exported/shipped, 69 precached), `git diff --check`.
- FAIL: `npm run test:acceptance`의 정적 브라우저 단계는 224 pass/38 fail로 종료됐다. 34건은 `admin-navigation` fixture가 `운영 개요` heading을 만들지 못하는 공통 초기화 실패이며 1개를 단독 worker로 재실행해도 재현됐다. 나머지는 auth shell 색 대비 2건과 welcome particle geometry 2건이다. React/React DOM, esbuild, Playwright, axe-core에는 이번 dependency patch의 lockfile 변경이 없어 명백한 dependency 호환 회귀로 볼 근거가 없으며 앱 코드·테스트·기대값을 수정하지 않았다. inventory demo build 직후 Hosting gate가 demo project 값으로 한 차례 실패했지만 정상 production rebuild 후 세 build gate가 모두 통과해 생성 산출물 문제로 분리됐다.
- P1 최종 상태: **checkpoint 차단 — dependency 정책 결정 필요**. upstream의 호환 패치가 나오거나 transitive major/override를 별도 승인하고 Firebase Admin/Storage 및 CLI 호환성까지 검증해야 하며, 정적 브라우저 38건의 기존 구현/fixture 실패도 별도 최소 범위로 확인하기 전에는 checkpoint 승인 요청이 불가하다.

### 2026-09-20 P1 static acceptance 38건 해소 — dependency 정책 결정만 남음

- `admin-navigation` 34건은 제품 route/auth 회귀가 아니라 esbuild 공통 fixture가 브라우저용 `process.env`를 초기화하지 않아 import 시 `process is not defined`로 mount가 중단된 테스트 환경 문제(C)였다. `tests/e2e/admin-navigation.spec.ts`의 공통 define만 보완했고 그룹 34/34가 통과했다.
- auth shell 2건은 10.08px 브랜드 보조문구가 `#768b84`/`#fbfcf8`에서 3.51:1로 4.5:1 기준에 미달한 제품 스타일 회귀(A)였다. `src/app/globals.css`에서 기존 `--ink-soft`를 직접 사용해 4.71:1로 복구했다. particle 2건은 390×844, no-preference motion의 고정 animation fraction에서 orbit가 제목과 약 5.6px 겹친 제품 geometry 회귀(A)였고, `src/features/app-shell/welcome-greeting.module.css`의 중심만 6px 위로 옮겼다. threshold·허용 범위·retry는 바꾸지 않았으며 두 그룹은 각각 2/2 통과했다.
- 전체 재실행에서 드러난 200% 확대 mobile admin dock/320px settings overflow는 `src/features/admin/admin-navigation.module.css`의 고정 높이를 최소 높이로, `src/features/admin/admin-workspace.module.css`의 grid child를 `min-width: 0`으로 고쳤다. safe-config boundary의 동적 chunk 완료 경쟁은 `tests/e2e/app-shell.spec.ts`에서 `networkidle` 상태를 기다리게 했다. 변경 파일은 위 6개 코드/fixture 파일과 이 문서이며 앱 기능·dependency/package/lockfile/audit 정책은 변경하지 않았다.
- 최종 정적 browser suite는 262/262 통과했다. 전체 P1 회귀도 앱/Functions typecheck, lint, unit 1,364 pass(13 skip), `test:acceptance`, Emulator acceptance 12/12 및 production journey 65 pass/10 skip, inventory production E2E 10/10, inventory Emulator integration 10/10, production build, PWA gate(worker 41,238B), performance gate(initial gzip 140,764B), Hosting gate(98 exported/shipped, 69 precached), `git diff --check`가 모두 통과했다.
- P1 상태: **static acceptance 해결 — dependency 정책 결정만 남음**. 일반 audit moderate 7건과 production audit moderate 2건은 그대로이며 commit, push, deploy, 운영 데이터 접근·변경은 실행하지 않았다.

### 2026-09-20 P1 dependency security exception — checkpoint 승인 요청 가능

- audit 7개 node는 고유 Moderate advisory 4개(`uuid` CVE-2026-41907, OpenTelemetry Core CVE-2026-54285, `csv-parse` CVE-2026-85063, `stream-json` CVE-2026-71429)와 부모 aggregate 3개다. production 2개 node는 `firebase-admin → @google-cloud/storage → gaxios 6.7.1 → uuid 9.0.1`의 동일 uuid advisory이고 나머지 5개 node는 `firebase-tools` 개발 경로다. 상세 경로·버전·패치 범위는 `docs/phase-17-completion.md`에 기록했다.
- 설치 소스에서 gaxios는 `uuid.v4()`를 buffer/offset 없이 호출하며 advisory 대상 v3/v5/v6을 사용하지 않았다. 급식길의 인증된 Storage save/download/delete 경로도 UUID API나 buffer/offset을 제어하지 못해 production 취약 동작은 reachable하지 않다. dev 항목은 Pub/Sub emulator, Auth/Database import, CLI의 Next dependency 분석에만 있고 production runtime/bundle이나 untrusted production request에는 포함되지 않는다.
- `firebase-admin 14.4.0`, `firebase-tools 15.30.2`, `@google-cloud/storage 8.2.0`은 2026-09-20 현재 최신 stable이고 안전한 동일-major 경로가 없다. 범위 밖 major override는 특히 stream-json subpath 호환성을 깨뜨릴 수 있어 적용하지 않았다. dependency/package/lockfile/audit gate와 제품 코드는 변경하지 않았고 직전 전체 P1 PASS를 유지한다.
- Moderate 7건을 숨기지 않고 **2026-10-20까지 known accepted transitive risk**로 일시 수용한다. 새 Firebase stable, Storage의 gaxios 7+ 이동, severity High/Critical 상향, Storage/HTTP 구조 변경 시 즉시 재검토하며 High/Critical은 계속 checkpoint 차단이다.
- P1 상태: **checkpoint 승인 요청 가능 — moderate 7건 문서화된 일시적 예외, 아직 미커밋**. commit, push, deploy, 운영 데이터 접근·변경은 실행하지 않았다.

## 6. 실행·검증 명령

```powershell
# 개발
npm install
npm run dev

# 기본 정적 검증
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run verify:pwa:build
npm run verify:performance:build
npm run verify:hosting:build

# 재고 집중 검증
npm run test:inventory
npm run test:e2e:inventory

# 전체 기존 수용 검증(시간과 Emulator 필요)
npm run test:acceptance
npm run test:acceptance:emulator

# 빌드된 Firebase Hosting 정적 export 로컬 실행
npm start -- --port 3000
```

배포가 명시적으로 요청된 경우에만 실행한다.

```powershell
npx firebase deploy --project onnuriway --only hosting
node scripts/verify-firebase-hosting-build.mjs --url https://onnuriway.web.app
node scripts/verify-firebase-hosting-build.mjs --url https://onnuriway.com
```

Functions는 전체 무차별 배포를 피하고 변경된 Callable 목록과 배포 순서를 Phase 문서에서 확인한다. Phase 49 이후 schema를 롤백해야 할 때는 `.cache/deploy/inventory-compat-phase49-20260913-0910` 호환 패키지를 기준으로 하며, 엄격한 구 parser로 바로 되돌리지 않는다.

## 7. 주의점

- `.env.local`, `.env.production.local`은 무시되는 실제 설정이다. 값 또는 Firebase/Kakao 키를 문서/로그/commit에 넣지 않는다.
- `.firebaserc` 기본 project는 `demo-onnuriway`이고 staging/production alias만 `onnuriway`다. 운영 명령은 반드시 `--project onnuriway`를 명시한다.
- 운영 데이터로 기능 검증을 하지 않는다. 제품/수량/실사/사진/거래처를 테스트 목적으로 저장·수정·삭제하지 않는다.
- 현재 worktree에는 서로 연관된 대규모 미커밋 변경이 있다. 새 스레드는 자동 포맷/대량 정리 전에 diff를 확인하고 unrelated 변경을 되돌리지 않는다.
- `AGENTS.md`의 Next.js 생성 블록을 유지하고, Next API/구조를 바꿀 때는 설치된 `node_modules/next/dist/docs/`의 관련 문서를 먼저 읽는다.
- 실제 Galaxy S20+ 카메라, 설치 PWA 키보드/뒤로가기, 사진 촬영 저장 체감은 자동 브라우저 검증으로 대체할 수 없다.

## 8. 다음 작업 우선순위

### P0 — 최신 UI의 짧은 회귀 확인

1. 로컬 360×800 실제 Chromium에서 재고 필터 3열, `재고조사` 아래 `on/off`, 확대 힌트와 상세 고정 버튼을 확인했다.
2. `.countToggle > span:last-child`의 `display: inline-flex` 덮어쓰기를 실제 재현했고 해당 선언만 제거했다. 격리 production E2E와 computed style 검증이 통과했다.
3. 최신 Hosting의 두 origin, worker hash, live release, 로그인 유지와 PWA 업데이트를 읽기 전용으로 확인했다.
4. inventory CSS 성능 차단과 Node 환경 차단을 해소하고 승인된 후보를 Hosting에 배포했다. 두 origin, worker/PWA 업데이트, 360×800 재고 UI와 console을 확인했으며 현재 상태는 **완료 — 운영 배포 및 검증 완료**다.

### P1 — 현재 dirty worktree 전체 검증과 checkpoint

1. `typecheck`, `lint`, 단위, 재고 E2E/Emulator, build와 세 verifier를 현 소스에서 다시 실행한다.
2. 실패가 없으면 변경을 기능 단위로 검토하고 사용자의 commit 지시를 받아 checkpoint를 만든다. 현재 HEAD만으로는 운영 코드가 재현되지 않는다.

### P2 — 성능과 캐싱

1. 재고의 explicit refresh/reconnect가 모든 100개 page를 다시 읽는 비용과 500개 실사용 규모의 체감 시간을 계측한다. 증거 없이 persistent cache나 realtime listener를 추가하지 않는다.
2. 거래처의 가시 상태 60초 재검증이 8명 사용 환경에서 필요한지 read 수와 stale 허용 시간을 계측한다. 민감 거래처 문서를 durable cache로 옮기지 않는다.
3. Service Worker cache version `phase35` 명명과 현재 Phase 49+ 릴리스의 관계를 정리하되, cache key 변경은 업데이트/오프라인 회귀 검증과 함께 수행한다.
4. 기존 bundle budget(초기·거래처·재고 lazy chunk)과 1,000개 목록 progressive rendering을 최신 코드에서 다시 측정한다.

### 2026-09-20 P2-A 체감속도 연구 — 완료/구현 전

- 격리 production static export + Chromium 360×800 + demo Firebase Emulator에서 100/500/1,000개 재고를 계측했다. 목록 Callable은 1/5/10회, 논리 문서 read는 query cursor sentinel을 포함해 약 100/504/1,009개다.
- warm normal first usable 목록은 500개 약 1.34초, 1,000개 약 1.84초였다. 1,000개 각 page에 300ms를 더하면 약 4.84초였고, 같은 세션 모드 재진입도 context+10 page를 다시 읽어 약 4.35초였다. 첫 100개 run은 callable cold start가 섞여 절대시간 비교에서 제외했다.
- 재고 검색/장소/필터는 1,000개에서도 약 27ms·추가 요청 0회였다. 상세→목록 복귀도 목록 재조회 0회다. 실제 병목은 모든 page 완료 전 목록을 숨기는 구조와 모드 재진입 시 Memory/UI 상태를 버리는 구조다.
- 거래처는 background 성공 중 기존 목록을 유지하지만 250개 전체 page를 60초 timer 및 focus/online/visibility에서 재검증한다. refresh 실패와 retry는 기존 목록을 숨긴다. 8명 실제 활성시간·focus 빈도·현재 거래처 수는 미확인이다.
- `phase35` cache 이름은 namespace일 뿐 현재 Phase와 맞출 필요가 없다. navigation/public asset/학교 thumbnail 정책과 사용자 승인형 worker update를 유지하며 업무 데이터 cache는 추가하지 않는다.
- P2-B 권장 순서: (1) session Memory revalidation coordinator와 in-flight/event dedupe·freshness UI, (2) 인증 namespace별 목록/필터/scroll snapshot 복원, (3) 재고 첫 100개 page progressive publish. durable cache, realtime listener, offline write queue는 범위 밖이다.
- 임시 계측 코드는 제거했다. 제품 최적화, dependency, deploy, commit/push, 운영 데이터 접근·변경은 하지 않았다. 실제 Galaxy S20+ 설치 PWA/현장 네트워크는 미확인이다.

### 2026-09-20 P2-B revalidation coordinator/freshness — 완료/미배포

- 범위는 inventory/customer의 session Memory revalidation만이다. `uid:sessionVersion:permissionsVersion`별 coordinator가 in-flight 요청을 합치고 last-success 60초 TTL로 focus/visibility/online 연속 이벤트를 coalescing한다. logout·권한/session 변경과 인증 실패에서는 coordinator와 민감 화면 상태를 폐기한다. IndexedDB, persistent Firestore cache, Service Worker 업무 cache, realtime listener, offline write queue는 추가하지 않았다.
- background 갱신은 기존 목록을 유지하며 `최신 정보 확인 중 · 마지막 확인 HH:MM`, 성공 후 `마지막 확인 HH:MM`, 일시 실패 후 `갱신 실패 · 기존 정보 표시 · 마지막 확인 HH:MM`을 작은 status text로 표시한다. 인증/권한 실패는 기존대로 목록과 편집 상태를 비운다. 거래처의 기존 offline clear 정책과 재고의 in-memory draft 유지 정책도 바꾸지 않았다.
- 대표 순차 이벤트 기준 revalidation batch 수는 customer가 최초 성공 뒤 TTL 안 visibility+focus+online에서 기존 총 4회(최초 1+추가 3) → 총 1회, TTL 이후 같은 연속 이벤트에서 총 4회 → 총 2회(최초 1+갱신 1)다. inventory는 TTL 안 기존 총 2회(online이 1회 추가) → 총 1회, TTL 이후 기존 총 3회(visibility+online) → 총 2회다. 동시에 들어온 이벤트/in-flight는 한 promise만 사용한다. 한 inventory batch는 context 1회와 전체 100개 page 요청을 포함하므로 1,000개에서는 억제한 batch당 Callable 11회(context 1+list 10)를 피한다.
- write의 authoritative 성공/실패 처리는 변경하지 않았다. 거래처 저장 뒤 `retry`, 재고 설정 저장 뒤 `refresh`는 force revalidation으로 TTL을 우회한다. 재고 수량/lot/상품 write는 기존 mutation 응답과 `InventoryListReconciler`를 계속 사용하며 불필요한 전체 목록 read를 새로 만들지 않는다.
- PASS: coordinator/customer/inventory 집중 34/34, customer 전체 265/265, inventory unit/Functions 315/315, performance 18/18, PWA 17/17, typecheck(app/Functions), lint, `git diff --check`, production static build, PWA/Hosting build gate, inventory production UI E2E 10/10 + demo Emulator integration 10/10, customer mobile Chromium E2E 24/24. 성능 build gate도 통과했다(initial gzip 140,763B, customer lazy 36,705B/36KiB, inventory lazy 25,028B/25KiB). P2-B의 lazy-only 증가만 customer +0.5KiB/inventory +1KiB 예산으로 기록했고 초기·CSS·다른 feature 예산은 바꾸지 않았다.
- 남은 위험: 실제 8명 사용 환경의 focus 빈도/read 감소량과 Galaxy S20+ 설치 PWA 체감은 아직 미측정이다. 60초 TTL 안에는 다른 사용자의 최신 write가 늦게 보일 수 있지만 강제 refresh/write 후 최신화는 억제하지 않는다. 이번 단계는 mode unmount 뒤 목록/필터/scroll을 복원하지 않으므로 모드 재진입은 여전히 전체 목록을 읽는다.
- 다음 단계는 같은 session namespace와 invalidation 경계를 재사용해 **Memory snapshot 복원**을 진행해도 된다. 다만 재고 첫-page progressive publish는 그 다음 단계로 분리하고, snapshot 단계에서 logout/session 변경·offline 정책·write reconcile을 다시 회귀 검증한다. deploy, commit, push, dependency, P3 디자인 변경은 실행하지 않았다.

### 2026-09-20 P2-B2 session Memory snapshot 복원 — 완료/미배포

- customer와 inventory에 각각 작은 module Memory snapshot store를 두고 namespace당 feature snapshot을 최대 1개만 보관한다. namespace는 기존 coordinator의 `uid:sessionVersion:permissionsVersion`을 그대로 쓰며 다른 namespace가 들어오면 이전 coordinator·snapshot·reconciler를 먼저 폐기한다. durable cache, IndexedDB, local/sessionStorage 업무 snapshot, 사진/Blob cache는 추가하지 않았다.
- customer snapshot은 authoritative 목록·freshness/last-success와 검색어·검색창 상태·scroll만 저장한다. inventory snapshot은 authoritative context/전체 목록·기준일·freshness/last-success와 검색어·장소·임박/비활성 필터·표시 limit·scroll만 저장하며 기존 `InventoryListReconciler`도 같은 namespace에서 유지한다. editor/form draft, modal, busy/error, mutation 중간값은 저장하지 않는다.
- warm 재진입은 snapshot을 첫 render부터 사용한다. TTL 안에는 customer/list와 inventory context/list 요청이 모두 0회이며, TTL 만료 시에도 snapshot을 먼저 표시한 뒤 기존 coordinator로 background revalidation한다. 1,000개 inventory 대표 시나리오는 이전 context 1 + list 10 = 11회에서 TTL 안 context 0 + list 0 = 0회로 줄었다. P2-A의 약 4.35초 전체 재조회 loader 대신 동기 Memory render/다음 paint에 기존 목록을 사용할 수 있게 됐으며 별도 절대시간 필드 계측값은 만들지 않았다.
- 모드 재진입 때 customer 검색어·검색창·scroll, inventory 검색어·장소·임박/비활성 필터·표시 limit·scroll을 복원한다. scroll은 목록 commit 뒤 유효 최대 범위로 clamp하며 layout-effect cleanup으로 DOM 축소 전 위치를 보존한다. 데이터가 줄면 범위를 벗어난 위치로 강제 이동하지 않는다.
- logout은 두 store를 즉시 clear하고, uid/sessionVersion/permissionsVersion 변경은 snapshot 반환 전에 이전 entry를 폐기하며, 인증/권한 실패도 catalog/UI를 비운다. customer offline clear와 inventory write/draft 정책은 유지했다. customer authoritative save에는 write generation을, inventory에는 기존 reconciler와 authoritative product update를 적용해 늦은 목록 응답이나 재진입 snapshot이 write 결과를 되돌리지 못하게 했다.
- PASS: snapshot/coordinator 집중 39/39, customer 전체 270/270, inventory unit/Functions 320/320, auth 28/28와 logout snapshot 직접 회귀 1/1, performance 18/18, PWA 17/17, typecheck(app/Functions), lint, production static build와 performance/PWA/Hosting gate, inventory production UI E2E 10/10 + demo Emulator integration 10/10, customer mobile E2E 전체 24/24 및 snapshot remount 집중 4/4. 최신 build gate는 initial gzip 140,764B, customer lazy 36,812B/36KiB, inventory lazy 24,926B/25KiB, worker 41,238B, exported/shipped 98개·precache 69개로 통과했다.
- 남은 위험은 snapshot이 탭 reload/종료에서 사라지는 의도된 Memory 범위, 60초 TTL 동안 다른 사용자의 write가 늦게 보일 수 있는 점, 실제 Galaxy S20+·현장 네트워크 T2 미계측이다. P2-B3 첫-page progressive publish는 진행 가능하지만, page 중간 publish가 retained reconciler/write generation을 우회해 authoritative write를 되돌리지 않도록 결합해야 한다. deploy, commit, push, dependency, P3 및 progressive publish는 실행하지 않았다.

### 2026-09-20 P2-B3 inventory first-page progressive publish — 완료/미배포

- 기존 `listInventoryProducts` 100개 cursor 계약과 5,000개 방어 한계는 그대로다. repository가 각 page 뒤 dedupe된 누적 목록과 page count/complete만 callback으로 내보내고, workspace가 기존 coordinator task 안에서 snapshot listener로 publish한다. 별도 서버 contract, durable cache, 상태관리 계층은 추가하지 않았다.
- cold load는 첫 page가 오기 전까지만 기존 loading을 유지하고 첫 page부터 실제 카드·검색·장소/필터를 사용할 수 있다. 이후 page는 `최신 정보 확인 중` freshness 아래 비차단으로 합쳐진다. stale refresh는 기존 full snapshot을 baseline으로 유지하면서 도착한 page만 덮어쓰고, final page에서 baseline을 제거해 전체 서버 catalog를 authoritative하게 확정한다. 표시 limit·scroll은 B2 snapshot 정책을 유지한다.
- 모든 partial/final publish는 현재 coordinator generation과 namespace 및 retained reconciler identity를 검사한다. `InventoryListReconciler`는 매 page마다 기존 baseline/누적 page 위에 in-flight write 결과를 마지막으로 적용하므로 입고·출고·조정·lot/product write 직후 늦은 page가 값을 되돌리지 않는다. final reconcile에서는 서버에서 사라진 기존 row도 정상 제거된다.
- 통제된 300ms/page 기준 pagination T2는 500개 1,500ms(5 page 완료) → 300ms(첫 page), 1,000개 3,000ms(10 page 완료) → 300ms다. T4는 각각 1,500ms/3,000ms로 동일하다. 요청은 5/10회, 논리 read는 약 504/1,009개로 변경 전과 같으며 E2E의 150ms/page 1,000개에서도 terminal page 전에 60개 카드와 검색이 usable함을 확인했다.
- page 실패는 이미 publish된 목록을 `stale-error`로 유지하고, 인증/권한 실패는 partial catalog까지 폐기한다. refresh 중 모드 재진입은 같은 in-flight를 join하고 현재 partial snapshot을 즉시 복원하며 이후 page 알림을 이어받는다. logout/session/permissions/offline invalidation 뒤의 늦은 callback은 generation/reconciler guard로 snapshot에 들어오지 않는다.
- PASS: progressive 집중 44/44, inventory unit/Functions 328/328, auth/logout 29/29, performance 18/18, PWA 17/17, typecheck(app/Functions), lint, production build와 performance/PWA/Hosting gate, inventory production UI E2E + demo Emulator 10/10. 최신 build gate는 initial gzip 140,765B, inventory lazy 25,163B/25KiB, worker 41,238B, exported/shipped 98개·precache 69개다. `git diff --check`도 통과했다.
- P2의 coordinator/freshness, session snapshot 복원, inventory progressive publish 3단계는 모두 완료됐다. 다음은 실제 Galaxy S20+ 설치 PWA와 현장망에서 T2/T3/read 감소를 재측정한 뒤 상세 cache 또는 제한적 JS prefetch가 필요한지 판단한다. customer progressive, inventory detail cache, JS prefetch, persistent cache, realtime listener, offline queue, dependency, deploy, commit/push, P3는 실행하지 않았다.

### 2026-09-20 P2 checkpoint 통합 검증 — 승인 요청 가능/미커밋·미배포

- P1 checkpoint `0766882` 이후 dirty worktree 28개 파일은 revalidation/freshness, customer·inventory session Memory snapshot, inventory first-page progressive publish와 그 테스트·성능 budget·두 P2 문서뿐이다. unrelated 변경은 확인되지 않았다.
- PASS: lint, app/Functions typecheck, 전체 unit 1,395/1,408(13 skip), `npm run test:acceptance`, `npm run test:acceptance:emulator`, safe-config/customer mobile 포함 browser 262/262, production full user journey 65/75(10 skip), inventory production UI E2E + demo Emulator 10/10, P2 집중 55/55, production build, PWA/performance/Hosting gate, `git diff --check`. 첫 acceptance의 safe-config mobile 1건은 cold compile 중 5초 assertion을 넘긴 일시 실패였고 동일 브라우저 전체 및 acceptance 전체 재실행에서 통과했다. acceptance emulator가 마지막에 demo `out/`을 만든 뒤 production build를 다시 생성해 세 build gate를 최종 확인했다.
- 핵심 계약은 1,000개 TTL 내 재진입 context/list 0회, stale snapshot 즉시 표시 뒤 background revalidation, 첫 100개 page의 terminal 이전 usable publish, 500/1,000개 요청 5/10회·논리 read 약 504/1,009개 유지, write/reconciler 우선, namespace/logout/auth·permission invalidation, refresh/page 실패 시 usable 목록 유지로 모두 통과했다.
- 최종 build 수치는 initial gzip 140,765B, customer lazy 36,812B/36KiB, inventory lazy 25,163B/25KiB, worker 41,238B, exported/shipped 98개, precache 69개다. 성능 gate는 5,000개 index 109.59ms, search p95 1.25ms·max 5.22ms, typing network 0회로 통과했다.
- 남은 위험은 실제 Galaxy S20+·현장망 및 8명 동시 사용에서의 T2/T3/read 감소 미계측, 의도된 탭 Memory 수명, 60초 TTL 내 타 사용자 write 지연 가능성, customer lazy budget 잔여 52B와 inventory lazy 잔여 437B다. npm audit의 firebase-tools 계열 moderate 7건은 P1의 문서화된 일시 예외이며 dependency는 변경하지 않았다.
- **P2 checkpoint 승인 요청 가능 — 아직 미커밋/미배포**

### 2026-09-20 P2 운영 배포·Galaxy S20+ 체감 검증 — 완료

- checkpoint `4f0407c10eacc2b219ab805c543148f8f63efa96`을 Firebase Hosting release `1789911750990000`, version `86903327ba3c41a4`로 배포했다. 두 production origin verifier와 worker SHA가 일치했고, PWA 업데이트 뒤 로그인 유지가 정상이며 console warning/error는 0건이었다. rollback은 필요하지 않다.
- 실제 Galaxy S20+에서 모드 재진입 시 이전처럼 전체 loading을 다시 기다리는 느낌이 사라졌고, 방금 보던 목록 위치·scroll 위치·검색/필터 상태가 즉시 복원됐다. 사용자는 이전 버전보다 체감속도가 명확히 빨라졌다고 확인했다. 이는 사용자 체감 확인이며 ms 기반 T2/T3 현장 계측 결과는 아니다.
- 기존 last-success 60초 TTL과 인증 namespace별 Memory-only 경계는 유지한다. 8명 동시 사용의 실제 read 비용은 아직 미측정이다.
- 현 시점에서는 inventory detail cache나 제한적 JS prefetch를 추가할 필요성이 확인되지 않았다. **P2 완료 — checkpoint/운영 배포/실기기 체감 검증 완료**

### 2026-09-21 재고 제조사 Master M1 — 완료/미배포

- `companies/onnuri/inventoryManufacturers/{manufacturerId}`에 `manufacturerId`, `name`, `normalizedName`, `active`, `revision`, `createdAt`, `createdBy`, `updatedAt`만 저장한다. NFC·trim·공백 정리 뒤 기존 거래처명 규칙과 같은 소문자/문장부호/공백 제거로 exact normalized name을 만들고, SHA-256 결정적 ID의 `companies/onnuri/inventoryManufacturerNames/{hash}` reservation을 같은 transaction에서 점유해 동시 중복 생성을 차단한다. fuzzy 자동 차단·병합과 hard delete는 없다.
- `listInventoryManufacturers`는 최대 500개 master를 bounded read한 뒤 active만 반환한다. `createInventoryManufacturer`는 delivery/sales/admin, `updateInventoryManufacturer`의 rename/deactivate는 admin만 허용하며 모든 mutation은 기존 active employee/session/permission transaction 재검증, 영구 request receipt/idempotency, revision conflict, append-only audit를 사용한다. viewer는 read-only다. 기존 default-deny Rules가 master와 reservation의 client read/write를 모두 막으며 새 Rules·복합 index는 추가하지 않았다.
- 상품의 기존 `manufacturer` string은 legacy fallback이자 선택 시점 canonical name snapshot으로 유지하고 `manufacturerId`만 optional로 저장한다. 신규/변경 연결은 active master를 요구하고 canonical name을 snapshot하며, 비활성화된 기존 연결은 ID와 snapshot을 보존한 채 다른 상품 수정/표시가 가능하다. rename/deactivate는 기존 상품을 rewrite하지 않으며 legacy string-only 상품도 그대로 동작한다. migration/backfill은 없다.
- 구형 strict client 보호를 위해 서버 전용 확장 Zod contract와 `includeManufacturerReference` opt-in을 사용한다. opt-in하지 않은 기존 list/detail/mutation 응답에서는 `manufacturerId`를 재귀적으로 제거하고 기존 `includeSummary`와 독립적으로 처리한다. 현재 frontend repository/form은 opt-in하지 않으며 제조사 picker·검색·최근 사용 UI는 M2로 남겼다.
- PASS: inventory gate 374/374, 전체 unit 1,425/1,439(14 skip), production inventory E2E 10/10, 격리 Emulator transaction/Rules 11/11, 전체 Rules 41/41, app/Functions typecheck, lint, Functions build, production static build, PWA/performance/Hosting gate, `git diff --check`. frontend 코드를 추가하지 않아 inventory lazy JS gzip 25,595B/25KiB와 inventory CSS raw 29,184B 예산 수치는 그대로다. deploy, commit/push, 운영 데이터 접근은 실행하지 않았다. **M2 dynamic picker 진행 가능**이다.

### 2026-09-21 재고 제조사 Master M2 — 완료/미배포

- 새 품목/수정 form의 제조사 문자열 입력을 기존 BottomSheet 기반 picker로 교체했다. picker를 열면 active master 최대 500개를 한 번 읽고, 검색은 `name`/`normalizedName`을 기준으로 Memory에서만 수행한다. 검색창은 자동 focus하지 않으며 신규 제조사 추가 화면의 이름 입력에서만 focus한다. 최근 선택은 인증 session namespace별 Memory에 최대 5개를 최신순·중복 제거로 보관하고 logout/session·권한 version 변경 시 폐기한다. persistent cache, realtime listener, fuzzy dependency는 추가하지 않았다.
- delivery/sales/admin은 active 제조사를 선택하고 새 제조사를 추가할 수 있다. 신규 추가는 loaded 목록에서 단순 유사 후보를 안내하고 create Callable 성공 즉시 현재 상품에 선택하며, exact duplicate 서버 거절 시 입력을 유지한 채 기존 제조사 선택을 안내한다. viewer에는 생성 UI를 노출하지 않는다. inactive 기존 reference는 snapshot과 함께 경고 표시하고 선택 목록에서는 제외하며, legacy string-only 상품은 picker를 열거나 수정 form을 저장했다는 이유만으로 자동 연결하지 않는다.
- 기존 strict client와 M1 response 계약을 유지했다. 기본 inventory repository는 opt-in하지 않고, 별도 동적 manufacturer repository의 reference read와 manufacturer-aware save만 `includeManufacturerReference`를 사용한다. 명시적 `clearManufacturerReference: true` write intent를 추가해 `제조사 없음`에서 `manufacturer: ""`와 실제 document의 `manufacturerId` 제거를 같은 기존 revision/request ID/idempotency/audit transaction으로 처리한다. 필드가 없는 구형 client는 기존 ID를 보존하고, clear와 새 ID를 함께 보내면 contract가 거절한다. migration/backfill과 M1 master/reservation 재설계는 없다.
- product editor를 별도 lazy boundary로 분리하고, 작은 manufacturer trigger와 실제 picker/repository/UI를 다시 분리해 picker는 사용자가 제조사 버튼을 누를 때만 로드한다. 360px에서 overflow가 없고 모든 picker target은 44px 이상이며 dialog/combobox/listbox/option semantics와 방향키 탐색을 제공한다. Back/취소는 form draft를 바꾸지 않고, local 검색 중 추가 network 요청은 0회다.
- PASS: manufacturer/form/Functions 집중 159/159와 backend 집중 76/76, inventory unit/Functions 391/391, production inventory E2E 10/10, Emulator integration 11/11, app/Functions typecheck, lint, production build, performance unit 18/18, PWA/performance/Hosting build gate, `git diff --check`. 최종 bundle은 inventory base JS 24,834B gzip, workspace JS 22,603B gzip, manufacturer picker 3,727B gzip, trigger 802B gzip, inventory CSS 29,184B raw, manufacturer CSS 3,010B raw이며 기존 budget을 완화하지 않았다. admin rename/deactivate UI, dependency 변경, migration/backfill, deploy는 실행하지 않았다. **M2 완료**다.

### 2026-09-21 inventory mobile controls checkpoint — 운영 배포 완료

- commit `6c17f324dd041b7bd3fcc161d6040f0a139a094b` (`Refine inventory mobile controls`)에서 단위 preset을 `낱개 / 봉 / 팩 / 병 / 직접입력`으로 정리했다. 첫 행은 `낱개 / 봉 / 팩`, 둘째 행은 `병 / 직접입력` 2열이다. 기존 `개`는 사용자에게 `낱개`로 표시하되 신규 `낱개` preset의 canonical/storage value는 기존 `개`를 사용한다. 기존 literal `낱개` 데이터는 보존하고 migration/backfill은 없으며 unit lock과 재고 처리 계약을 유지한다.
- 검색창 오른쪽에 sliders 계열 `목록 옵션` 버튼을 두고 BottomSheet에 `표시 옵션`(비활성 품목 보기, 임박 상품만 보기)과 `작업 모드`(재고조사 OFF/ON)를 구분했다. 기존 검색·filter·snapshot·revalidation 상태 로직은 변경하지 않았다.
- 구역 선택 `전체 / 냉장 / 냉동1 / 냉동2 / 샘플`은 회청색 container, subtle raised surface, 선택 상태 inset 표현과 44px touch height를 사용하며 360px에서 가로 overflow가 없다.
- Firebase Hosting release `1789974931146000`, version `03c10d3f79c62a9b`로 `2026-09-21 16:15:31 KST`에 Hosting만 배포했다. worker SHA-256은 `8b95bd550d8e3ee332126708d0991439ce69ed86b595a58c6f28ea8fbf4dc7ce`고 `https://onnuriway.com`·`https://onnuriway.web.app` verifier가 모두 통과했다. Functions, Rules, Indexes 등은 배포하지 않았다.

### 2026-09-21 inventory 목록 옵션 시인성 checkpoint — 운영 배포 완료

- commit `f815ded566b554cd4f8569244ce72fa92e960261` (`Improve inventory list options`)에서 checkbox/check indicator를 label 바로 옆에 배치하고 전체 56px row를 touch target으로 만들었다. label은 16px 수준으로 유지하고 선택 row에 subtle background/border를 적용했으며 `D-100일` secondary text를 보존했다. 재고조사는 `OFF | ON` segmented control이며 ON 시 sheet 밖에 compact `재고조사 ON`을 표시하고, 임의 목록 옵션이 활성화되면 trigger의 active dot를 유지한다.
- legacy UI 기대값은 unit preset 6→5, 표시명 `개`→`낱개`, 초기 수량 접근성 이름 `(개)`→`(낱개)`, 직접입력 2열 geometry, BottomSheet 이동에 따른 selector로 현재 계약에 맞게 갱신했다. canonical `개`와 literal `낱개` 보존 테스트는 유지했다.
- PASS: Legacy inventory E2E 11/11, Emulator integration 11/11, inventory 29 files/395 tests, typecheck, lint, production build, PWA, performance, Hosting gate, 360px horizontal overflow, console warning/error 0건. performance budget, dependency, 설정은 변경하지 않았다.

### 2026-09-21 inventory mobile UI 최종 production 검증 — 완료

- production commit은 `f815ded566b554cd4f8569244ce72fa92e960261`이고 Firebase Hosting release는 `1789979180255000`, version은 `9f46329655f14f0b`, 배포 시각은 `2026-09-21 17:26:20 KST`다. worker SHA-256은 `6e244e6d3385ccd7c68de525ace457aad5c1311e2a93d25550d3580b6e4e776a`다.
- `onnuriway.com`과 `onnuriway.web.app`에서 각각 25개 public resource 검증이 통과했고 worker/assets는 두 origin과 candidate에서 일치했다. worker의 `Cache-Control: no-store`와 `Service-Worker-Allowed: /`를 유지했으며 production build, PWA, performance, Hosting gate가 모두 통과했다.
- production read-only smoke에서 목록 옵션 버튼·active dot·BottomSheet, `표시 옵션`, 비활성/임박 옵션, label 인접 indicator, 56px 전체 row touch, 16px label, `D-100일`, `OFF | ON` segmented control, compact `재고조사 ON`, sheet 재개방 후 상태 유지를 확인했다. 360px horizontal overflow는 없었고 console warning/error는 0건이었다. 검증 후 비활성/임박/재고조사 상태는 OFF로 복원했다.
- 배포는 Firebase project/site `onnuriway`의 Hosting만 대상으로 했다. Functions, Firestore Rules/Indexes, Storage Rules, Extensions 등은 배포하지 않았고, 품목 저장/수정·제조사 변경·입고/출고/조정·사진 업로드·테스트 데이터 생성을 수행하지 않아 production data write는 없다. release 회귀가 없어 rollback은 필요하지 않다.
- 사용자가 최종 production UI의 목록 옵션과 변경된 inventory UX를 실제로 사용해 사용성에 문제가 없음을 확인했다. 이는 자동화 테스트 결과와 구분되는 정성적 실사용 확인이다. **inventory mobile UI 개선은 완료 상태**다.

### 2026-09-21 재고 제조사 Master M3 — 구현·production release 완료

- commit `194309b9a9266045688d17d624c8d202d3fdd5ad` (`Add inventory manufacturer management`)에서 일반 manufacturer row tap은 기존 선택 동작을 유지하고, 관리자에게만 각 active row 오른쪽의 독립된 `⋯` 관리 버튼을 표시한다. 실제 touch target은 44×48px이며 row 선택과 관리 이벤트를 분리했다. long-press는 도입하지 않았고 기존 공용 BottomSheet 패턴에서 `이름 수정`·`비활성화`·`취소`를 제공한다.
- rename/deactivate는 기존 production Callable `updateInventoryManufacturer`를 그대로 사용한다. Functions 제품 코드, Rules, indexes, schema는 변경하지 않았다. rename은 `expectedRevision`, 기존 request ID/idempotency, duplicate 처리와 revision conflict 시 최신 목록 refresh를 유지하고 성공 뒤 active 목록을 갱신한다. deactivate는 active picker에서만 제거하며 hard delete나 reactivate UI는 없다. 두 작업 모두 현재 product draft의 `manufacturerId`/이름을 자동 변경하거나 기존 상품에 write하지 않는다.
- M1/M2 snapshot 호환 정책도 유지한다. 기존 상품의 `manufacturerId`와 `manufacturer` string snapshot, inactive reference, legacy string-only 상품을 보존하고 자동 master 연결, migration/backfill, 기존 상품 문자열 일괄 전파를 하지 않는다. 따라서 master rename 뒤 picker의 active master 이름은 새 이름이지만 이미 저장된 상품 화면은 선택 당시 snapshot 이름을 계속 표시할 수 있으며 이는 의도된 호환성 정책이다.
- Frontend는 `context.canAdmin`을 필요한 inventory editor/field/picker까지 전달해 관리자에게만 관리 affordance를 노출한다. Backend 권한의 최종 기준은 기존 admin authorization이며 authenticated Callable, session/permission 재검증, transaction, revision, request receipt, audit 경계를 그대로 유지한다.
- 구현 검증은 전체 unit 1,456 passed/14 skipped, Inventory/Functions 404 passed, M3 관리자 E2E 1 PASS, Firestore Emulator integration 11 PASS, 기존 Inventory browser scenarios 11 PASS다. app/Functions typecheck, 전체 lint, production build, PWA 17, performance 18, PWA/performance/Hosting gate, 360px overflow, keyboard/Escape/Back, reservation/audit 검증도 모두 통과했다. budget, dependency, config는 변경하지 않았다.
- production application commit `194309b9a9266045688d17d624c8d202d3fdd5ad`를 Firebase Hosting release `1789983232326000`, version `2c48893eab60f919`로 `2026-09-21 18:33:52.326 KST`에 배포했다. worker SHA-256은 `2129650a8800dedc5239af91185d3310ba735fe0fd9d8dffb3d3910e84f48594`다. `onnuriway.com`과 `onnuriway.web.app`에서 각각 25개 verifier가 통과했고 candidate/production assets, worker, 양 origin worker가 일치했다. worker는 `Cache-Control: no-store, max-age=0`, `Service-Worker-Allowed: /`를 유지한다. production/PWA/performance/Hosting build gate가 통과했으며 Hosting 산출물은 102개, precache 73개, initial asset 9개다.
- 배포 범위는 Firebase project/site `onnuriway`의 Hosting뿐이다. Functions, Firestore Rules/indexes, Storage Rules, Extensions 및 기타 Firebase resource는 배포하지 않았다.
- production read-only smoke에서 관리자 로그인/session 유지, inventory 진입, 관리자 `⋯` 노출, 일반 row 선택, `⋯` 클릭 시 선택 미발생, 관리 BottomSheet, rename 입력/취소, deactivate 안내/취소, Escape/Back, picker/draft 유지, 360×800 horizontal overflow 없음과 console warning/error 0건을 확인했다. 안전한 기존 production 비관리자 session이 없어 비관리자 `⋯` 미노출은 운영에서 별도로 재검증하지 않았고, 해당 권한 동작은 frontend/backend 자동 테스트와 Emulator 검증 범위에서 확인했다.
- 운영 데이터 보호를 위해 production smoke에서는 manufacturer rename/deactivate/create, 품목 저장·수정, 입고·출고·조정, 사진 업로드, 테스트 데이터 생성을 실행하지 않았고 모든 form/confirm을 실행 전에 취소했다. 실제 production rename/deactivate write는 아직 수행하지 않았으며 해당 경로는 Emulator/Auth/Callable 자동 검증으로 확인한 상태다. 이는 실패가 아니라 의도된 read-only 검증 경계다.
- 사용자가 최종 production M3 UI를 실제 기기에서 확인해 현재 사용성이 괜찮다고 판단했다. 이는 자동 검증과 구분되는 정성적 실사용 확인이며 rollback은 필요하지 않다. **Manufacturer M3는 완료 상태**다.
- 현재 지원 범위는 create, rename, deactivate다. hard delete, reactivate, manufacturer merge, 기존 product snapshot 일괄 rename 전파는 지원하지 않으며 실제 사용에서 필요성이 확인되기 전에는 후속 작업으로 자동 지정하지 않는다. 기존 product snapshot과 master current name 불일치가 실제 업무 문제가 될 때만 read-time overlay 또는 별도 정리 정책을 검토한다.

### P3 — 디자인 디테일

1. 실기기에서 재고 카드 밀도, 토글/checkbox alignment, 사진 확대 affordance와 고정 action의 safe-area/키보드 겹침을 점검한다.
2. 모드별 aurora·motion은 기존 tone/mood와 `prefers-reduced-motion`, 고대비 접근성을 유지한다. 장식 추가보다 정보 밀도와 한 손 조작을 우선한다.
3. 새 UI 패턴은 거래처·학교납품·영업/홍보·재고 사이의 radius, divider, 버튼 상태, loader/photo viewer 일관성을 먼저 대조한다.

## 9. 관련 문서

- 공통 규칙: `AGENTS.md`
- 구현 기준: `급식길 PWA 구현 명세서.md`
- 데이터 구조: `급식길 PWA 데이터베이스 상세 설계서.md`
- 캐시/성능: `급식길 PWA 검색·캐시·성능 설계서.md`
- Hosting/도메인: `docs/phase-45-hosting-migration-status.md`
- 재고 기반 계획: `docs/phase-45-firebase-hosting-and-inventory-plan.md`
- 재고 최신 UX/검증: `docs/phase-46-inventory-field-experience.md` ~ `docs/phase-49-inventory-count-mode.md`

이 문서는 대화 로그가 아니라 현재 구현으로 진입하기 위한 색인이다. 새 결정·검증·배포가 생기면 확인된 결과만 갱신하고, 추정은 ‘미확인’에 남긴다.
