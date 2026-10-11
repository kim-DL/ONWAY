# MCP 사진 전달과 갤러리 비용 절감

MCP 1.14.0의 `get_photo_images`는 사진 바이트를 표준 MCP `content`의 `image` 블록으로 한 번에 전달한다. 자체 갤러리 resource/outputTemplate을 지정하지 않으며 `_meta`에 이미지 바이트를 복제하지 않는다. 실제 ChatGPT 표시 검증 결과를 반영해1.14.2에서는 기존 갤러리의 최초 큰 이미지·메모리 재사용·보기 전용 단일 전송을 주 경로로 안내한다.

## 사용

```json
{"source":"inventory","query":"합성 만두"}
{"source":"delivery","query":"합성 거래처","date":"2026-10-07","limit":3}
```

- 상품은 현재 연결된 대표 사진의 `preview` 1장이다. 이미 확인한 `productId`는 이름 검색을 생략한다. 재고 상세·실사 로그를 자동으로 읽지 않는다.
- 납품은 최근168시간의 `evidence` 기본3장/최대5장이다. 기존 거래처 약칭 확정·직원 ID·서울 등록 날짜·등록시간/ID 커서를 재사용한다. 초기 thumbnail을 다운로드하지 않는다. 이름이 모호하거나 검색이 불완전하면 후보/검색 커서를 반환하며 사진을 가져오지 않는다.
- 각 사진에 상품명/제조사/규격 또는 거래처명/서울 등록시각/실제 사진 기록자를 붙인다. 납품 등록시각은 실제 납품완료시각이 아니며 `deliveryCompletedAt`은 null이다. 상품 사진의 촬영시각은 추정하지 않는다.
- 이미지는 실제 바이트 크기를 확인하며 합계12MiB 이하, 기존20초 조회/28MiB 응답 한도를 적용한다. 크기 한도에 걸리면 `budgetLimited=true`, `delivery.nextCursor`를 반환한다. 같은 customerId·날짜·직원 조건과 `after`로 이어서 조회한다. 경계의 들어가지 않는 사진1장을 읽을 수 있지만 그 뒤 사진은 읽지 않는다.
- `imageCount`는 실제 포함된 사진 수다. 각 사진을 다운로드 전후의 기존 canonical 검사로 확인한다. 해당 검사에서 삭제·만료된 행은 `unavailablePhotoIds`로 구분하고 원본 커서 진행을 유지한다. 권한·Storage·사진/거래처/직원 조건 변경은 전체 응답을 차단한다. 순차 조회는 전체 자료의 동일 시점 스냅샷이 아니며 마지막 OAuth 검사도 수행한다. 새 OAuth scope/계정/PIN 입력 경로는 없다.

## 지원 범위와 확인할 사항

공식 MCP 이미지 응답은 이미지 데이터 전달 규격이다. **2026-10-11 실제 Windows Chrome의 연결된 ChatGPT에서 get_photo_images를1회 호출한 결과 사진 바이트는 정상 전달됐지만 기본 이미지 카드/뷰어는 표시되지 않았다.** UIA와 실제 화면을 함께 확인했다. 따라서 이 도구는 표준 이미지를 수신하는 다른 MCP 클라이언트 또는 직접 데이터 전달 진단용으로 유지하고, ChatGPT의 표시 요청에는 기존 갤러리를 사용한다. 상품 검색 이미지와 같은 OpenAI CDN 저장/즉시 확대를 지원한다고 주장하지 않는다.

해당 운영 표본은 서버1,247ms/Storage1회/사진188,822B/응답254,651B/returnedCount1/재시도0이다. 이름 검색을 포함하며 ChatGPT 전체 처리시간이나 SLO가 아니다. 실제 상품명/ID/사진/대화 식별자는 Git에 보관하지 않는다.

## 갤러리에서 실제 추가 호출 절감

MCP 1.14.2 사진 UI v11은 이미 받은 사진을 **현재 UI의 메모리 안에서만** 최대5분/10항목/약12MiB 이미지 바이트 한도로 재사용한다. 히트할 때5분을 연장하지 않는다. 새 거래처·상품·날짜·직원 범위, 거래처 갤러리의 최신 retrievedAt 응답, 인가 오류, teardown 때 이전 데이터를 비우며 로컬/세션 스토리지·Service Worker·공개 URL·공용 캐시를 쓰지 않는다. 개별 이미지/원본 사업 데이터의 서버 캐시는 추가하지 않는다.

- 상품 사진을 처음부터 크게 받으려면 기존 `get_inventory_photo(variant="preview")`를 사용한다. 별도 thumbnail 조회 없이 카드와 확대에 같은 데이터를 사용한다.
- 거래처는 기존 `get_delivery_gallery(initialVariant="evidence")`로 첫 사진1장만 큰 크기로 받는다. 기존 기본 thumbnail/기록 페이지/직원 최신 갤러리는 유지한다. 첫 큰 사진을 보여준 뒤 다시 열기/닫기/배율 변경은 추가 사진 호출이 없다. 아직 받지 않은 다른 사진은 선택할 때만 조회하고, 이미 받은 사진 전환은 재사용한다. 큰 사진을 받은 뒤 카드를 다시 표시할 때도 같은 바이트를 재사용해 썸네일을 따로 내려받지 않는다.
- 보기만 하는 요청은 기존 상품·납품사진·거래처 갤러리에 `imageResponse="ui_only"`를 지정한다. 이미지 바이트를 UI용 `_meta`에 한 번 전달하고 표준 `content.image`의 중복을 생략한다. UI의 추가 이미지 조회도 이 옵션을 사용한다. 모델이 사진 내용을 분석할 때와 다른 클라이언트에는 기본 `compatible`을 유지하며 표준 image와 UI metadata를 모두 전달한다. 기본값의 기존 호환성은 바꾸지 않는다. 같은256KiB 합성 이미지의 SDK 비교에서 단일 전송 응답은 기존 중복 응답의55% 미만이다. 이 비율은 응답 바이트이며 전체 Firebase 청구액의 감소율이 아니다. Storage 원본 다운로드는 두 방식 모두1회다.
- 납품사진의 기존 service가 다운로드 전후에 확인한 실제 expiresAt을 private metadata에 추가했다. 기존 PWA download 계약은 그대로다. UI는 expiresAt과 등록+168시간 중 더 이른 기한에 이미지·해당 데이터 사본을 비운다. 인증 오류는 진행 중이거나 뒤늦은 응답에서도 전체를 비운다.
- 재사용은 이전에 승인된 응답의 표시이지 최신 서버 재조회가 아니다. 원본 삭제/교체/권한 취소가 발생해도 호스트가 새 오류나 조회 결과를 전달하기 전에는 UI가 즉시 알 수 없다. 새 조회는 항상 기존 canonical 검사를 거친다. OpenAI 기본 뷰어나 영구 서버 캐시와 구분한다.

OpenAI의 `uploadFile` API는 사용자가 선택한 파일을 대상으로 하며, 위젯 state는 단일 UI 인스턴스의 상태다. 이를 업무 사진의 영구 보관소나 서버 측 파일 업로드 API로 간주하지 않는다. `openai/title`은 문서의 `ui/update-model-context` 확장 맥락이므로 이번 표준 도구 응답의 렌더 보장에 사용하지 않았다. 비공개 Storage URL·새 공개 CDN·OpenAI 파일 업로드·데이터 이관은 추가하지 않았다.

표준 일괄 도구는 최초 응답에서 요청한 큰 이미지를 모두 전송하므로 선택해서 볼 때보다 초기 전송량/Storage 읽기가 많을 수 있다. 갤러리는 첫1장만 선전달하고 이후 선택한 사진을 재사용해 이 비용을 제한한다. 모든 과거 사진을 미리 받는 방식은 사용하지 않는다.

2026-10-11 MCP1.14.1의 실제 Windows Chrome/ChatGPT에서 상품명으로 `get_inventory_photo(preview,ui_only)`를1회 호출해 카드와 큰 사진을 확인했다. 상품명은 기대 원문과 같았으며 사진은 실제 등록된 상품 포장 이미지였다. 최초 서버1,345ms/관측100문서/Firestore15회/Auth2/Storage1회/사진188,822B/응답253,578B/재시도0이다. 세 번 열기·확대·축소·맞춤·닫기 뒤 추가 사진 MCP/Storage 호출은0이었다. 큰 이미지의 실제 가시성과 조작 버튼 위치를 UIA와 화면으로 확인했다. 처음 열기509ms, 반복 열기390ms는 UIA 준비·조작/관측 오버헤드를 포함한 단일 표본이며 프레임 렌더 시간/SLO가 아니다. 이름 검색을 포함한 서버 시간과 모델 처리/호스트 렌더/네트워크 시간을 구분한다.

최종1.14.2 실제 ChatGPT 거래처 갤러리는 ID 재사용1회/서버1,350ms/26문서/Storage1회로2장 목록과 첫 큰 사진을 표시했다. 둘째 사진은 선택할 때1회/1,431ms/Storage1회였으며 이후 닫기·재열기·앞뒤 전환·확대·맞춤에는 추가 사진 호출0이었다. 처음 이름 검색 표본246문서와 비교해 확인된 ID의 읽기 절감도 확인했다. 두 사진의 카드 정보와 버튼 가시성을 실제 화면으로 확인했고 초기/선택 합계Storage2회였다. 이는 Windows 표본이며 실물 모바일이나 총청구액/SLO 측정이 아니다.

인증과 원본 삭제/만료 검사는 새 조회마다 적용한다. **이미 ChatGPT에 전달된 사본의 대화 보관·삭제는 급식길 원본의7일 정책과 별개**다. 원본 삭제로 이미 전달한 OpenAI 사본까지 회수한다고 주장하지 않는다. 이 점은 기존 표준 image content도 동일하다.

공식 근거: [MCP 도구 이미지 응답](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [OpenAI 도구 결과와 UI](https://developers.openai.com/plugins/reference), [MCP Apps resource 연결](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx), [OpenAI 확장](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md).
