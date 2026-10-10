# 재고 상품 사진 — MCP 1.8.0

온누리종합식품 앱에서 **“[상품명] 상품 사진 보여줘”**라고 요청한다. 이름이 여러 제품에 일치하면 제조사·규격으로 대상을 확인한다. 이미 조회한 제품은 **“이 상품 사진 보여줘”**로 ID를 재사용한다. 카드에는 상품명·제조사·규격을 표시하고 클릭하면 큰 사진, 확대/축소·맞춤·드래그·핀치·닫기를 사용할 수 있다.

## 조회 계약과 비용

- `get_inventory_photo`는 `query` 또는 `productId` 중 하나를 받는다. 기본 `variant:thumbnail`, 확대는 `preview`다. 확대 UI는 현재 `photoId`도 전달해 열어 둔 사진과 교체된 사진을 혼동하지 않는다.
- 유일한 상품명은 검색과 첫 이미지를 **MCP 1회**에 반환한다. ID 조회는 상품 검색도 생략한다. 사진만 필요한 요청에서는 실사 이력·기록자·묶음 수량을 읽지 않는다. 전체 사진을 미리 다운로드하지 않는다.
- 현재81개 활성 상품 규모에서는 기존 부분 문자열·초성 검색의 bounded scan을 재사용한다. 최대5페이지/500개와 부분 결과/커서 규칙을 유지한다. 중복 후보·불완전 검색·이전 페이지가 있는 결과는 자동 선택하지 않는다. 새 검색 인덱스·캐시·복제 카탈로그는 추가하지 않았다.
- 기존 재고 응답의 `hasPhoto`는 현재 사진 참조가 있는지 알려준다. 실제 파일/첨부/권한 유효성은 사진 도구에서 다시 검사한다. 사진이 없으면 `no_photo`, 없는 이름은 `not_found`, 중복은 `ambiguous`, 부분 검색은 `incomplete_search`로 구분한다.
- 이미 업로드 때 만든 WebP를 그대로 반환한다. 읽을 때 변환·재저장하지 않는다. 모델에 최소 메타데이터와 표준 MCP image content, 위젯에는 `_meta` 이미지 데이터를 전달한다. 위젯/일반 클라이언트 양쪽 호환을 위해 이미지 바이트가 두 경로에 포함되므로 전송 전체가 이미지 원본 크기와 같지는 않다. 토큰·청구액 절감률은 측정하지 않았다.
- 큰 사진은 사용자 클릭 때만 UI에서 추가 조회한다. 배율/이동은 브라우저에서 처리한다. 기존 독립 툴바와 호스트 안전 영역/실제 표시 높이 계산을 재사용한다. 상품 사진은 현재 모델에서 한 장의 대표 사진이며 납품사진 갤러리와는 별도다.

## 데이터·인증·보관

`InventoryPhotoService.getWithMetadata`가 기존 상품/사진 단계 문서와 canonical 직원 권한을 transaction으로 확인하고, Storage를 읽은 뒤 다시 확인한다. 기존 PWA `get()` 다운로드의 strict 응답은 그대로 유지한다. 상품 이름은 후속 확인의 최신 메타데이터다. MIME/10MiB 상한·교체/삭제/비활성 직원·잘못된 첨부 연결 검사와 오류 정제를 유지한다. 공개 URL·download token·외부 이미지 요청·브라우저 영구 저장을 만들지 않는다.

기존 직원 PIN OAuth의 조회 scope로 사용할 수 있다. 추가 계정/PIN 전달/쓰기 동의는 필요 없다. 기존 rate limit·허용 직원·매 요청 인증과 응답 전 재인가는 유지한다. 비활성 상품은 확인된 ID의 현재 첨부로 조회할 수 있으나 이름 검색은 기존 활성 상품 검색이다.

상품 사진에는 납품사진의168시간 제한을 적용하지 않는다. 현재 attached 사진은 기존 상품 보관 정책을 따르며, 미연결 업로드24시간/retired 정리30일을 유지한다. 제거·교체는 파일 정리 이전에도 즉시 조회 불가다. 사진의 촬영일이나 현재 재고 묶음의 실제 상태를 추정하지 않는다. 이미 ChatGPT에 전달한 이미지의 보존은 ChatGPT 대화 정책을 따른다.

## 최소 Storage 권한

기존 MCP runtime의 `storage.objects.get` 전용 custom role을 상품 사진 경로에만 추가 적용했다. 기본 버킷은 fine-grained access이므로 bucket-level 조건을 위해 uniform access를 켜지 않았다. 프로젝트 IAM에 다음 조건의 binding 하나를 추가하고 기존 project bindings와 bucket IAM/설정을 보존했다.

```text
resource.type == 'storage.googleapis.com/Object' &&
resource.name.startsWith('projects/_/buckets/onnuriway.firebasestorage.app/objects/companies/onnuri/inventoryPhotos/')
```

runtime은 해당 경로의 알려진 파일을 읽을 수 있으며 새 list/create/update/delete 권한은 없다. 기존 납품사진 버킷과 다른 사진 경로 권한은 확장하지 않았다. 관련 공식 문서: [IAM 조건과 프로젝트 적용](https://docs.cloud.google.com/iam/docs/conditions-overview), [Cloud Storage IAM](https://docs.cloud.google.com/storage/docs/access-control/iam).

## 배포·검증

배포 대상은 `functions:employeeMcp` 하나다. 기존 PWA/Callable/Rules/인덱스/사진 데이터 변경은 없다. 기존 앱에서 도구를 새로 고친 뒤 새 대화에서 사용한다. 현재 ChatGPT에서는 **설정 → 플러그인 → 온누리종합식품 → 페이지 하단 개발자 → 도구 새로 고침**에 있다. 하단이 안 보이면 설정 검색의 “개발자”로 이동하거나 해당 영역을 스크롤한다. 일반 플러그인 상세의 ZIP 업로드나 OAuth 계정 다시 연결은 도구 갱신 절차가 아니다. 공용 UI resource는 MCP1.9.0에서 v9이며 기존 납품사진 갤러리와 동일한 모바일 뷰어를 재사용한다. 아래 상품 사진 검증 표본은1.8.0 당시 기록이다. [공식 갱신 안내](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata).

전체 unit 1,791 PASS, demo Firebase/공식 SDK24 PASS, Chromium/WebKit38 PASS/1 CDP 전용 SKIP. 상품 사진의 첫 응답·중복/없는 상품·교체·삭제·권한 취소·7일 이전 attached·메타데이터 변경·Strict PWA 호환·320px/가로 회전·확대·닫기를 검증했다. build/typecheck/lint/PWA/성능 예산을 검사했다. 운영 frontend 설정이 없는 검증 산출물은 Hosting gate가 차단하며 배포하지 않는다.

실제 배포 revision, ChatGPT 확인과 서버 응답시간은 [HANDOFF](HANDOFF.md)의 최신 기록을 따른다. 브라우저 엔진 검사는 실물 Android/iPhone ChatGPT 앱 검사를 의미하지 않는다.

2026-10-09 실제 ChatGPT 표본:

| 경로 | 도구 호출 | 서버 시간 | 관측 문서 읽기 | 이미지 / 전체 응답 |
|---|---:|---:|---:|---:|
| 이름으로 최초 사진 | 모델이 같은 조회2회 수행 | 각각1,291 /931ms | 각각100 | 각각16,992 /47,206B |
| 카드에서 큰 사진 열기 | UI1회 | 1,151ms | 19 | 219,234 /586,514B |
| 같은 상품 ID로 재조회 | 모델1회 | 1,427ms | 19 | 16,992 /47,206B |

모든 사진 요청은 성공했고 서버 재시도는0회였다. 같은 사진 확대/축소/맞춤/닫기에는 추가 호출0회였다. 상품명·제조사·규격은 원본과 hash 대조, 이미지 load 및 실제 버튼 hit test도 확인했다. 최초 썸네일은 같은 사진 preview보다 약92% 작았으며 이 표본의 바이트 비교다. 이름 검색의 카탈로그81문서는 ID 조회에서 생략된다. ChatGPT의 중복 선택은 관측됐으므로 자연어 요청이 언제나1회로 끝나거나 전체 응답시간이 위 서버 시간과 같다고 보장하지 않는다. 전체91개 상품 원본 수정시각과 기존 업무 배포는 그대로 유지했다.
