# MCP 브라우저 안내

`https://onnuriway-mcp.web.app/mcp`는 일반 브라우저 탐색에만 온누리종합식품의 연결 안내를 표시한다. 기존 ChatGPT 연결 URL·도구 계약·OAuth 권한은 바뀌지 않는다.

## 요청 분리

- 정확한 `/mcp`의 GET, `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`, 명시적인 `Accept: text/html` 허용이 모두 있어야 HTML을 반환한다.
- Authorization(빈 값 포함), MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID, Content-Type 헤더 또는 JSON/SSE Accept가 있으면 기존 MCP 경로를 유지한다. 쿼리 문자열·HEAD·POST·Fetch Metadata 없는 클라이언트도 기존 경로다. 오래된 브라우저가 이 메타데이터를 보내지 않으면 기존 401을 받는 보수적인 정책이다.
- 인증 없는 프로토콜 요청은 기존 401 JSON 및 WWW-Authenticate, 인증된 GET은 기존 405/Allow: POST를 유지한다. JSON/SSE 협상과 POST 처리는 기존 SDK에 맡긴다. OAuth discovery는 HTML Accept에도 JSON이다.
- HTTPS·Origin·본문 크기·전체/IP rate limit 이후에 안내를 제공한다. 기존 `private, no-store, max-age=0`와 보안 헤더를 유지한다. 랜딩만 nonce 스크립트와 same-origin 글꼴 CSP를 추가하며 업무 API 통신은 허용하지 않는다.

## 파일과 배포

사용자가 제공하고 모바일에서 승인한 ZIP의 HTML·PNG·WOFF2를 `functions/assets/mcp-landing/`에 보관한다. 실제 기존 회사 로고와 바이트가 같으며, 제목은 Noto Serif CJK KR Bold 기반 OnnuriEditorial, 본문은 Noto Sans CJK KR Regular 기반 OnnuriText다. 원본 OFL 라이선스와 이름 변경/부분집합 표기를 함께 포함했다. 한글 부분집합 글꼴이므로 문구를 추가하면 글리프 범위를 확인해야 한다.

운영 반영은 시안 표기 제거, 정적 자산 절대 경로, favicon 및 CSP nonce 삽입만 변경한다. 외부 CDN·분석기·PIN 입력·새 인증정보는 없다. 두 복사 버튼은 Clipboard API를 우선 사용하고 차단되면 주소 선택/수동 복사를 지원한다. 모션 감소와 키보드 이동을 유지한다.

`functions:employeeMcp` 한 개에 자산을 함께 배포한다. `/mcp-assets/v1/`의 정확한 네 파일만 공개한다. 파일명으로 경로를 만들지 않으며 디렉터리·HTML 원본·임의 파일은 제공하지 않는다. 기존 MCP Hosting catch-all rewrite를 사용하므로 Hosting/PWA/다른 Functions 배포는 필요 없다. 공개 안내와 자산도 기존 rate limit 예산에 포함한다.

## 검증과 운영

- `landing.test.ts`: 실제 HTTP로 탐색/프로토콜 경계·보안·캐시·자산 허용 목록 검사.
- `landing.browser.test.ts`: Chromium/WebKit 320·390·844·1440px, 로고/글꼴, 가로 넘침, 터치 가능한 복사 버튼, 복사 거절 복구, 키보드, reduced-motion 검사. 엔진/viewport 검사는 실물 모바일 검증과 구분한다.
- `emulator.test.ts`: demo Firebase Hosting → Functions의 실제 탐색과 자산 제공 뒤 기존 OAuth·SDK 인증·도구 호출 검사. 운영 데이터는 만들거나 수정하지 않는다.
- `verify-mcp-remote.mjs`: 운영 discovery·미인증 POST/JSON/SSE/HTML 비탐색 GET·Origin 거절·no-store 검사. 실제 브라우저 랜딩과 기존 ChatGPT 인증 연결은 별도로 확인한다.

되돌릴 때는 이전 검증 커밋의 employeeMcp 함수만 재배포한다. Hosting rewrite나 OAuth 등록·토큰/권한 데이터 변경은 하지 않는다.
