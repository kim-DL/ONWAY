# 급식길 사내 Remote MCP

현재 구현: **1.9.0 거래처 이름 → 납품사진 갤러리 한 번 조회**. 배포와 실제 ChatGPT 확인 상태는 [HANDOFF](HANDOFF.md)의 최신 항목을 따른다. [상품 사진 가이드](mcp-inventory-photos.md)와 [재고 업무 가이드](mcp-inventory-write.md)를 참고한다.

MCP URL은 `https://onnuriway-mcp.web.app/mcp`, 플러그인 이름은 **온누리종합식품**이다. 기존 직원 PIN·허용 직원·조회 token을 유지하며 사진 UI는 v9이다. 납품사진의168시간 보관과 상품 대표 사진의 기존 보관 정책을 구분한다. 저장에는 `geupsikgil:inventory.write` 추가 동의와 사용자 카드 승인이 필요하며 기존 read 토큰을 자동 승격하지 않는다. 모델 공개 도구16개와 UI 전용 실행1개다. 정상 조회의 요청 인증/응답 전 재인가, 제품별 count_match 시각·현재 명부 기록자 의미를 유지한다. 실물 모바일 기기는 별도 검증하지 않았다.

## Git 저장과 배포 경계

MCP 소스는 기존 [ONWAY 저장소](https://github.com/kim-DL/ONWAY)에서 함께 관리한다. PIN·재고·납품사진 서비스와 인가 계약을 공유하므로 별도 저장소로 복사하면 변경과 검증이 어긋날 수 있다. 작업 브랜치에 커밋·push하고 초안 PR에서 검토한 뒤 main에 병합한다. Git 저장 자체는 Firebase 배포가 아니다. 현재 GitHub Actions는 품질 검사만 수행하며 MCP 배포는 인증된 환경에서 지정된 Function/Hosting 대상으로 별도 실행한다.

현재 저장소는 공개 상태다. 소스·합성 테스트·회사 로고만 보관하며 실제 업무 데이터·직원 식별자·사진·PIN·OAuth 토큰·배포 자격증명·`.env*`는 포함하지 않는다. 설정의 이름과 역할은 아래 배포 안내를 따르고 실제 값은 기존 비공개 배포 환경에서 관리한다. 인증정보와 서명 키 파일도 `.gitignore`에서 제외한다.

## 조사와 선택

- 기준 소스 `04272ec`, 시작 worktree clean. 실제 현재 스택은 Next 16.3.8 정적 PWA → Firebase Hosting `onnuriway` / `onnuriway.com`, Node 22 Functions Gen2, 서울 `asia-northeast3` Firestore/Storage/Auth다. 기존 인수인계의 과거 dirty 상태와 구버전 설명을 현재 상태로 사용하지 않았다.
- 기존 직원 PIN은 6자리 자체로 사용자를 식별한다. `pinIndexes`의 HMAC 조회, `authCredentials`의 pepper+scrypt 검증, `employees`/`authz`의 역할·활성·sessionVersion·permissionsVersion과 Firebase Auth 비활성 상태를 확인한다. 관리자는 별도 Google 승인 경계이며 PIN이 허용되지 않는다. 사용자가 이번 연결에 **기존 직원 PIN 사용**을 선택했다.
- `CustomerService`, `InventoryService`, `DeliveryPhotoService`와 기존 인가·문서 codec을 그대로 호출한다. PIN 검증은 `EmployeePinService`로 추출했고 기존 `EmployeeLoginService.login()`의 Firebase custom token 계약·실패 제한·감사 기록을 보존했다. 상품 검색은 프런트와 서버가 같은 순수 함수를 사용한다.
- 새 `employeeMcp` HTTPS Function 하나, MCP SDK의 **stateless Streamable HTTP**, 같은 프로젝트의 별도 Hosting site `onnuriway-mcp`를 사용한다. 별도 업무 DB/두 번째 업무 백엔드/업무 로직 복제는 없다. 전용 Hosting은 OAuth의 루트 `.well-known` URL과 HTTPS만 담당한다. 기존 PWA Hosting·도메인·Callable App Check·Rules는 그대로다.
- App Check가 필요한 기존 Callable을 외부에서 우회 호출하지 않는다. 새 외부 경계는 OAuth 인증 후 같은 서버 서비스와 canonical 권한 검사에 진입한다. 브라우저용 Firebase ID/custom token을 MCP bearer token으로 수용하지 않는다.

조회 고도화의 페이지·오류·계측·새 도구 사용법은 [성능 운영 가이드](mcp-performance.md)를 따른다. 최신 검증·배포 결과는 [인수인계](HANDOFF.md)의 맨 위 기록에 있다.

## 도구

| Tool | 기존 경로와 응답 |
|---|---|
| `get_inventory_photo` | 상품 이름 또는 ID → 현재 등록 사진과 상품명·제조사·규격을 한 번에 표시. 기본 thumbnail, 카드 확대는 preview. 중복 후보·사진 없음은 명시적으로 반환 |
| `search_inventory_records` | 직원·상품·창고·최대93일 기간의 원본 실사/변동 이력을 인덱스로 직접 검색. 건수만 필요하면 includeRecords=false |
| `preview_inventory_change` | 기존 재고 계산으로 변경 전후를 표시. 업무 자료는 저장하지 않고 UI 승인 capability 발급 |
| `commit_inventory_change` | UI 전용. write scope·승인 capability·transaction 재인가·동시 변경 검사 후 기존 서비스로 저장 |
| `search_customers` | `companies/onnuri/customers`, 업체/학교 이름·초성 검색. ID·이름·지역만 반환. 출입 비밀번호·전화번호·메모 제외 |
| `search_inventory_products` | 기존 상품명/제조사/규격/원산지/초성 검색과 현재 수량·실사 시각. `query` 또는 최대10개 `queries`를 한 번의 활성 상품 순회로 검색 |
| `get_inventory_product` | 기존 transaction 상세 조회. `includeLots:false`이면 장소별/전체 수량·실사 시각만 조회해 묶음 읽기 생략. 기본값true는 기존 상세 계약 유지 |
| `list_low_stock` | 활성 상품의 모든 장소(샘플 포함) 수량 합계 ≤ threshold. 기본 0. **안전재고·수요 기준이 DB에 없어 그 기준의 부족 여부는 판단하지 않음** |
| `list_delivery_records` | 기존 `deliveryPhotos`에 저장된 최근 **168시간** 사진 등록 증빙. 거래처 ID·선택한 서울 날짜·커서 조회 |
| `get_delivery_photo` | 기존 다운로드의 상태·만료·generation·권한 확인 후 WebP 반환. 업체명·기록 정보 카드, 클릭 시 evidence 뷰어. 갤러리의 선택 사진 조회에도 사용 |
| `get_delivery_gallery` | 거래처 이름(query) 또는 확인한 ID → 검색·사진 목록·최초 썸네일을 한 번에 표시. 날짜 생략은 최근168시간, 기본50장/최대100장. 후보/불완전 검색은 명시하며 추가 사진·확대·페이지는 UI에서 조회 |
| `get_inventory_products` | 최대20개 상품의 장소별 수량을 같은 transaction에서 일괄 조회. 없는/삭제 ID는 별도 반환 |
| `list_inventory_alerts` | 한 번의 검색으로 부족 재고와 유통기한 임박/경과 후보 조회. 날짜는 서울 기준, 장소별 가장 빠른 유통기한 사용 |
| `get_inventory_overview` | 활성 품목 수·품절/부족·유통기한·이번 실사 상태를 서버에서 집계하고 소수 예시만 반환. 예시 제품의 최신 버튼 로그만 추가 조회. 묶음/전체 이력/사진 조회 없음 |
| `get_customer_delivery_summary` | 거래처 이름 또는 ID를 확인하고 최근 사진 기록까지 조회. 동명/불완전 검색이면 자동 선택하지 않음 |
| `get_latest_employee_delivery_gallery` | 직원 이름 → 직원 ID → 최신 유효 사진을 직접 검색. 해당 직원·최신 거래처·서울 등록일의 갤러리와 첫 썸네일을 한 번에 반환 |
| `search_delivery_records` | 직원 이름/ID·서울 등록 날짜·거래처 이름/ID의 AND 조건으로 사진 등록 기록 검색. 생략 조건은 전체, 사진 다운로드 없이 최신순 메타데이터만 반환 |

거래처/상품 검색은 기존 250/100개 페이지를 서버에서 최대5페이지까지 조회한다. 기본 반환50개·최대100개, 검색 예산5초(페이지 경계 검사), 도구 전체20초다. `page.complete`/`startedFromBeginning`/`returnedCount`와 `nextCursor`로 전체·부분 결과를 구분한다. 순차 목록은 동일 시점 스냅샷이 아니다. 납품사진도 삭제 행을 건너뛰면서 커서를 전진한다. 이름이 여러 개면 사용자가 대상 ID를 확인해야 한다. 별도 `schools`의 이름만으로 거래처 ID를 추측하거나 영업 방문 기록을 납품으로 바꾸지 않는다.

납품사진 전용 bucket은 기존 비공개 보관 정책(앱 168시간, bucket lifecycle 8일)을 유지한다. 영구 공개 URL·download token·새 복제 파일을 만들지 않는다. 사진 부재는 미납품 증거가 아니며 장기 품목/수량 납품 장부는 현재 구조에 없다. 이미 ChatGPT 대화에 전달된 이미지의 보존은 ChatGPT 대화 정책을 따르므로 Storage 만료가 대화 속 사본까지 삭제하지는 않는다.

### 재고 조회 사용법 (1.6.2)

- **“만두와 쌀의 현재 재고와 마지막 실사확인일을 비교해줘”**: `search_inventory_products(queries:["만두","쌀"])` 한 번으로 검색한다. 응답의 수량·단위·장소·시각으로 바로 답하며 단순 재고 질문에 상품별 상세를 반복 조회하지 않는다. `products`는 중복을 제거하고 `matches`는 검색어별 상품 ID를 연결한다. 동명/규격 후보는 임의로 선택하지 않는다. 기존 단일 `query`도 유지한다.
- **“전체 재고 현황과 이번 실사 미확인 품목을 요약해줘”**: `get_inventory_overview`가 기존 활성 상품 요약과 실사 설정을 읽어 집계한다. 품절/부족·유통기한 임박/경과·장소별 재고 보유 품목 수, 이번 주기의 확인/변동/미확인/신규 미대상 품목 수를 반환한다. 서로 다른 단위의 수량을 합치지 않는다. 소수 예시는 ID 순서이며 심각도 순위나 전체 목록이 아니다.
- 이미 확인한 상품 ID 여러 개는 `get_inventory_products`로 최대20개를 한 transaction에서 읽는다. 단일 ID의 수량/시각만 필요한 경우 `get_inventory_product(includeLots:false)`를 사용한다. 이때 `lots:null, lotsIncluded:false`는 생략을 뜻하며 재고 없음이 아니다. 날짜별 묶음 수량이 필요할 때만 기본값인 `includeLots:true`를 사용한다.
- 모든 재고 도구는 기본 `responseFormat:"compact"`로 전체 결과를 `structuredContent`에 한 번만 담고 text에는 짧은 안내를 넣는다. text만 읽는 클라이언트는 `responseFormat:"json"`으로 전체 JSON을 요청할 수 있다. 사진/거래처 도구의 응답 방식은 유지한다.

`lastStocktakeAt`은 **제품별 ‘수량 일치 확인’ 버튼으로 저장된 마지막 `count_match` 로그의 `createdAt`**이다. 기존 `inventoryProducts/{productId}/events`를 직접 읽는다. `lastStocktake`에는 해당 원본 로그의 `eventId`, `productId`, `kind`, `createdAt`, `locationId`, `cycleId`, `stockRevision`을 그대로 반환해 출처를 확인할 수 있다. 내부 ID는 일반 답변에 표시하지 않는다. 다른 장소가 미확인 상태라도 이 버튼 기록은 표시한다. `count_match`가 없으면null이며 입출고, 수량조정, 장소별 완료 요약이나 수정시각으로 대신 채우지 않는다. 이는1.6.0의 장소별 요약 기준을 사용자 요청에 따라 수정한 것이다.

`stocktakeByLocation`과 현황의 `counts.stocktake`는 기존 PWA의 완료/변동/미확인 상태다. 실사일의 입출고도 반영하는 요약이므로 버튼 로그와 구분한다. `updatedAt`은 **상품 문서 최종 수정 시각**이며 정보 수정, 수량 변경, 같은 수량 확인에도 갱신된다. 정확한 마지막 수량 변경 시각이나 버튼 확인일로 대체하지 않는다. 응답의 `stocktakeBasis`가 이 차이를 설명한다. 수량과 최신 로그는 별도 읽기이며 동일 시점 스냅샷을 보장하지 않는다.

검색·알림·단일/일괄 상세에 **실제로 반환하는 제품**만 최신 버튼 로그를 읽고, 현황은 중복 제거한 예시 제품만 읽는다. 제품별 `kind=count_match`+등록시각/ID 내림차순+limit1, 최대8개 동시 읽기를 사용한다. 상품별 전체 이력이나 탈락한 검색 후보의 로그는 순회하지 않는다. 예시가 없는 현황은 로그 읽기0이다. 반환 제품별 인덱스 쿼리1회가 추가되고 빈 결과도 Firestore 최소 조회 비용은 발생한다. 원문 기록을 읽기 위해 필요한 비용이며 새 요약 문서/캐시/쓰기·backfill을 추가하지 않았다. 로그 조회 오류를 ‘기록 없음’으로 숨기지 않는다. 원본 기록자 ID와 현재 명부의 이름을 포함하며, 메모·묶음 상세는 제외한다.

현황 집계는 최대500개/5페이지/페이지 경계5초 예산이다. `countScope:"returned_scan_segment"`는 **이번 커서 구간** 집계이며 `page.complete:false`이면 같은 threshold/days와nextCursor로 이어 읽어 합산한다. `startedFromBeginning:false`인 마지막 구간만으로 전체라고 답하지 않는다. 여러 페이지는 고정 스냅샷이 아니다. 활성 상품 조회는 기존 `status ASC, __name__ ASC` 단일 필드 인덱스, 버튼 로그는 새 `events` COLLECTION 범위의 `kind ASC, createdAt DESC, __name__ DESC` 복합 인덱스를 사용한다. 새 환경에서는 이 인덱스를 **추가만** 생성해 READY 확인 후 MCP 함수를 배포한다. PWA의 순수 실사 주기·대상·장소별 판정과 쓰기 로직은 유지한다.

사진 UI 1.5.0은 같은 MCP 함수의 `ui://geupsikgil/delivery-photo-v6.html` 리소스다. 표준 MCP Apps `ui.resourceUri`/`visibility: ["model", "app"]`와 ChatGPT `openai/outputTemplate`/`widgetAccessible`을 제공한다. `_meta.deliveryGallery`에는 업체명·사진별 등록 시각/기록자·페이지 정보를, `_meta.deliveryPhoto`에는 선택 사진 WebP와 표시 정보를 전달한다. UI는 data URI만 사용하며 외부 요청·공개 URL·별도 이미지 서버는 없다. 기존 단일 사진 입력/출력 schema와 MCP image content를 유지한다. 내부 ID는 도구 연결용 구조화 응답에 남지만 화면에는 표시하지 않는다.

1.3.0 배포 후 실제 ChatGPT에서 기존 PIN 연결로 날짜별 갤러리, 최근 사진 두 장의 이전/다음, 업체명·등록 정보, 큰 사진의 배율 변경·닫기/ESC 복귀를 확인했다. 사용자 PC의 도구 목록도 갱신했다. 모바일 스와이프와 배율 한계·팬·페이지 추가 로딩은 별도 Chromium11개 검사로 확인했다. 1.4.0의 직원 이름만으로 최신 갤러리 1회 호출·운영 기록 대조·조건 검색도 실제 ChatGPT에서 확인했다. 현재 release와 전체 검증 기록은 [인수인계](HANDOFF.md)를 따른다.

### 사진 갤러리 사용법

- 이름만 알면 `get_delivery_gallery({query:"합성업체유통"})`로 바로 요청한다. `search_customers`나 납품 요약을 먼저 조회할 필요가 없다. 이미 확인한 ID는 `customerId`로 재사용한다. 이름과 ID를 동시에 지정하지 않는다. 날짜를 말하지 않았다면 `date`를 생략하고 이전 대화의 날짜를 임의 적용하지 않는다.
- 요청명에 덧붙인 유통·식품 등 업종 접미 표현은 두 글자 이상인 전체 등록명과 일치할 때만 후보로 인정한다. 법인 표기·초성 검색도 지원한다. 일반 오타/비슷한 이름을 자동 선택하지 않으며 전체 검색을 끝내고 후보가 하나인 경우만 사진을 가져온다. `ambiguous/incomplete_search/not_found`는 사용자 확인/검색 계속/등록명 확인이 필요하다. 화면에는 현재 등록명을 표시한다.
- 첫 썸네일은 도구 응답에 포함되어 초기 UI 추가 호출0이다. 사진별 모델 호출을 반복하지 않는다. 사용자가 사진을 전환·확대하면 해당 사진만 인증된 도구로 다시 확인한다. 페이지 추가는 같은 거래처 ID·직원·날짜·커서를 유지하며 썸네일을 미리 다운로드하지 않는다.

- **“트윈스푸드의 2026년 10월 7일 납품사진 보여줘”**처럼 요청하면 거래처를 확인하고 `get_delivery_gallery`를 한 번 호출한다. 같은 업체·날짜의 사진을 한 갤러리에서 **←/→ 또는 가로 스와이프**로 넘긴다. 현재 위치와 사진 수를 표시하며 첫 장만 내려받는다. 사진이 많으면 **사진 더 보기** 또는 마지막 사진의 다음 버튼으로 같은 UI에 이어 불러온다. `50+` 표시는 아직 남은 페이지가 있다는 뜻이다. 사진은 최신 등록순이다.
- **납품업체명**은 기존 거래처의 현재 등록 이름이다. 폐업 처리된 업체의 기존 사진도 이름을 확인할 수 있으며 이름이 없으면 `업체명 정보 없음`으로 표시한다. 사진을 등록할 당시 업체명을 별도로 저장한 스냅샷은 아니다.
- 각 사진 아래 `YYYY-MM-DD HH:mm · 기록자`를 표시한다. 시각은 **등록 시각, Asia/Seoul**이며 EXIF 촬영 시각이나 실제 납품완료 시각이 아니다. 기록자는 사진 등록 당시 저장된 `createdByName`이며 직함을 추정하지 않는다.
- 썸네일 전체를 누르면 같은 사진의 `evidence`를 호스트 OAuth로 다시 조회한다. **−/＋**로 **50~400%, 25% 단위** 배율을 조절하고 **맞춤**으로100%에 복귀한다. 배율은 화면에 맞춘 크기를 기준으로 하며 두 손가락 핀치로도 배율을 조절하고 확대 후 드래그/스크롤로 사진 내부를 이동한다. 배율 조절은 추가 서버 호출이 없다. 확대 화면에서도 이전/다음으로 사진을 넘긴다.
- **닫기·ESC·빈 배경 클릭**으로 돌아온다. 전체화면 지원 호스트에서는 전체화면, 그 외에는 카드 내부 모달이며 모바일은 화면 너비를 채운다. 빠른 사진 이동은 요청을 순차 처리하고 최신 선택만 표시한다. 큰 사진은 닫을 때 제거하고 다시 열면 재인증 조회한다. 만료된 한 장은 안내하면서 다른 사진 이동을 유지하며 권한 취소 시 갤러리와 이미지 상태를 비운다.
- **온누리종합식품 → 앱 관리 → 도구 새로 고침** 후 새 대화에서 사용한다. 도구는 총16개(모델 공개15, UI 전용 실행1)다. 이전 메시지의 오래된 카드가 자동으로 바뀌지는 않는다. 기존 OAuth 연결을 그대로 사용하며 PIN/token/Storage URL은 사진 UI에 전달하지 않는다.
- 사진을 찾지 못해도 미납품을 의미하지 않는다. 최근168시간의 미삭제 사진만 조회하며 이전 기록을 복구하거나 촬영·등록하지 않은 사진을 만들지 않는다.

### 모바일 사진 뷰어 (1.5.0)

사진과 조작부를 서로 다른 grid 행에 배치한다. 상단에는 업체명·서울 등록 시각·기록자와44px 닫기 버튼, 가운데에는 크기가 줄어들 수 있는 사진 영역, 하단에는48px 터치 버튼의 툴바가 있다. 사진의 확대 크기는 가운데 영역의 스크롤에만 영향을 준다. 중복 제목과 성공 안내는 화면에서 제거하되 접근성 안내는 유지한다. 긴 정보는 상단 안에서 스크롤되며 툴바를 밀어내지 않는다. 좁은 세로 화면은 사진 전환/배율 두 줄, 가로 화면은 가능한 경우 한 줄로 배치한다.

기존에는 iframe의 `100dvh`를 전체 사용 가능 높이로 간주하고, 전체화면 중에도 뒤에 숨은 카드의 높이를 호스트에 알렸다. iframe의 viewport만으로는 ChatGPT의 상위 UI나 네이티브 하단 조작 영역을 알 수 없다. 새 뷰어는 `dvh`·VisualViewport 크기/offset과 표준 MCP Apps `containerDimensions` 및 ChatGPT 호환 `maxHeight` 중 실제 제한을 적용한다. 표준 `safeAreaInsets`, 호환 `safeArea.insets`, CSS `env(safe-area-inset-*)`는 같은 가장자리 측정치이므로 최대값만 적용한다. 임의의 ChatGPT 하단 높이를 고정 여백으로 가정하지 않는다. 호스트 context 변경·회전·VisualViewport 변경 때 다시 계산하고, 열린 뷰어에서는 inline 카드의 intrinsic height 보고를 중단한다.

핀치·확대 후 이동은 사진 내부에서 처리하고 사진 전환과 구분한다. 핀치/드래그 직후 일부 터치 브라우저가 다음 click을 생략하는 경우에도 정지한 단일 손가락 버튼 탭은 한 번만 실행한다. 마우스·키보드 조작은 유지한다. 배율50~400%, 맞춤100%와 배율 변경 시 MCP 호출0회는 동일하다.

호스트가 네이티브 UI의 가림 영역을 전달하지 않는 경우 cross-origin iframe에서 그 영역을 직접 알아낼 수는 없다. 실제 Android/iPhone 기기 연결이 없어 물리 기기의 ChatGPT 앱 검증과 브라우저 엔진 검증을 구분한다. 브라우저 검사는 Chromium/Android·WebKit/iPhone 프로필에서 호스트 하단 가림,320px 폭, 짧은 가로 화면, 긴 정보, 회전, 실제 버튼 좌표의 hit test와 터치 입력을 검사한다. CDP를 사용하는 두 손가락 입력·CSS safe area 주입 검사는 Chromium에서만 수행한다.

호스트 계약 근거: [MCP Apps host context](https://github.com/modelcontextprotocol/ext-apps/blob/main/src/spec.types.ts), [OpenAI Apps 호환 globals](https://github.com/openai/openai-apps-sdk-examples/blob/main/src/types.ts). 검증·배포·실제 ChatGPT 결과는 인수인계의 최신 기록을 따른다.

## 직원별 최신 사진·기록 검색 (1.4.0)

- **“김직원 직원이 마지막으로 사진을 등록한 거래처와 사진 보여줘”**: `get_latest_employee_delivery_gallery(employeeName)` 한 번으로 직원의 최신 등록 기록과 갤러리·첫 썸네일을 표시한다. 거래처 목록 조회/거래처별 반복 조회/최초 `get_delivery_photo` 호출이 필요 없다. 갤러리는 **해당 직원 + 최신 사진의 거래처 + 서울 등록일**의 사진이며 기존 확대·축소/이동/더 보기 기능을 유지한다. 다른 사진과 evidence는 사용자가 조작할 때 조회한다.
- **“김직원의 2026년 10월 8일 사진 등록 기록 정리해줘”**, **“김직원이 그날 한빛초에 등록한 사진 기록 찾아줘”**: `search_delivery_records`에 직원·날짜·거래처 조건을 함께 지정한다. 날짜는 `YYYY-MM-DD` 한 날짜, Asia/Seoul 기준이다. 범위 요청은 날짜를 생략해 최근168시간을 조회하거나 날짜별로 호출한다. 같은 종류의 이름과 ID를 동시에 지정하지 않는다.
- 직원은 기존 `employees.displayName` 단일 필드 인덱스로 **등록 이름의 접두어**를 검색한다. 이름 뒤 직함은 생략할 수 있지만 초성·부분 문자열·과거 이름을 추측하지 않는다. 최대20개 후보+lookahead1개로 동명/불완전 검색을 구분하고 자동 선택하지 않는다. 이 경우 확인된 직원 ID나 더 구체적인 이름으로 다시 조회한다. 조회 대상의 퇴사/중지 여부와 호출자의 권한은 별개다. 과거 기록은 보관기간 안에서 조회하되 호출자는 매번 기존 활성 직원 인증을 통과해야 한다.
- `deliveryPhotos.createdByEmployeeId`/`createdAt`을 직접 조회한다. `status=active`, 최근168시간·선택 날짜 범위, `createdAt DESC, __name__ DESC` 순서와 안정적인 커서를 사용한다. 등록 미래 시각·삭제·만료 사진은 제외하며 결과50개(최대100개), 최대5페이지/페이지 경계5초 예산을 유지한다. 만료 행이 이어져 예산을 소진하면 `incomplete_records`와 다음 커서를 반환한다. 빈 부분 결과를 기록 없음으로 확정하지 않는다.
- 최신 갤러리는 응답 안에서 하나의 상한 시각을 사용한다. `recordsPage`는 최신 한 장을 찾은 과정이며 `gallery.page`는 선택한 직원/거래처/날짜 사진의 페이지다. 최신 기록을 찾은 뒤 남은 과거 기록 때문에 갤러리 도구를 반복 호출하지 않는다. 갤러리 더 보기는 직원 조건을 유지한다. 여러 호출 사이의 동시 등록/삭제에 대한 고정 스냅샷을 보장하지 않는다.
- `registeredAt`은 기존 사진 등록 작업의 `createdAt`이다. 실제 납품완료 시각을 저장한 필드가 없으므로 `deliveryCompletedAt:null`, `timeBasis:photo_registered_at`을 반환한다. UI에도 두 시각의 차이를 안내한다. 사진 없음은 미납품 판정이 아니다.
- 거래처명은 현재 이름이며 배치 조회로 가져온다. 직원만 지정한 검색은 거래처 목록을 순회하지 않는다. 별도 `customerName`을 지정하면 기존 활성 거래처 이름 검색을 재사용하므로 그 이름 해석 단계에는 기존 카탈로그 스캔이 남는다. 폐업 거래처의 보관 사진은 확인된 ID 또는 직원별 최신 검색으로 조회할 수 있다.

새 복합 인덱스는 `firestore.indexes.json`의 `deliveryPhotos` 4개다. 모두 COLLECTION 범위이며 공통 `status ASC` 뒤에 직원 ID, 거래처 ID, 또는 둘 다의 ASC 조건을 놓고 `createdAt DESC, __name__ DESC`로 끝난다. 조건이 없는 전체 기록용 인덱스도 포함한다. 기존 인덱스/field override는 유지한다. 새 환경에서는 **기존 인덱스를 삭제하지 않는 추가 방식으로 생성하고 READY 확인 후 MCP 함수를 배포**한다. 사진 문서 변경·backfill은 필요 없다. 운영 Query Explain의 계획 검사로 네 가지 조건이 각각 복합 인덱스를 사용하는지 확인한다.

## PIN → OAuth

1. ChatGPT가 protected-resource / authorization-server 메타데이터를 발견하고 허용된 callback으로 DCR 등록한다. 클라이언트 인증 방식은 `none`인 public client, code + PKCE S256 필수다. 현재 공식 stable callback은 `https://chatgpt.com/connector_platform_oauth_redirect`이다.
2. `/authorize`의 급식길 HTTPS 화면에서 직원이 PIN을 입력하고 조회 연결을 승인한다. HttpOnly/Secure/SameSite=Lax `__session` 쿠키와 일회용 flow가 브라우저를 묶는다. Firebase Hosting이 전달하는 쿠키 이름을 사용했다. PIN은 URL·클라이언트 설정·저장소에 보관하지 않는다.
3. 기존 PIN 검증 뒤 `MCP_ALLOWED_EMPLOYEE_IDS`에 있는 직원만 승인한다. 관리자 PIN 우회는 불가하다. 60초 authorization code를 발급하고 callback에 정확한 `state`와 RFC9207 `iss`를 반환한다.
4. code는 client ID·redirect URI·resource·PKCE에 묶이며 transaction에서 한 번만 교환한다. access token 15분, refresh token은 회전하고 최초 연결로부터 최대 30일이다. 모두 256-bit opaque 값이며 서버에는 SHA-256 해시만 저장한다. 갱신 토큰 재사용은 해당 family 전체를 폐기한다. 동시 refresh는 한 번만 실행해야 하며 재사용 후에는 재연결한다.
5. 매 호출과 업무 조회 전후에 토큰/family·허용 직원·기존 권한/세션·Firebase 사용자 상태를 확인한다. 기존 PIN 교체/직원 중지/세션 폐기/권한 변경이 즉시 적용된다. `/revoke`는 그 연결의 family를 폐기한다. PIN 재입력 없이 갱신이 가능하며 새 비밀번호 계정 시스템은 없다.

기존 read scope는 조회/미리보기만 허용하며 재고 저장은 별도 write scope와 UI 승인이 필요하다. 인증에 필요한 기존 로그인 제한·성공/실패 감사와 새 `mcpPrivate`의 클라이언트/flow/code/token/family/rate 기록은 생성한다. 미리보기와 승인 실행은 기존 재고 서비스로 제한한다. 원시 DB 쓰기 도구는 제공하지 않는다. `mcpPrivate`는 기존 Firestore catch-all DENY로 Client 접근이 금지된다. 문서 만료는 매 요청 즉시 검사하고 저장소 정리는 `expiresAtTTL` 정책을 사용한다.

최소 보호: HTTPS, 고정 issuer/resource/callback allowlist, Origin 검사, body 크기 한도, private/no-store, CSP/frame 차단, 프로세스 간 공유 Firestore rate limit, 네트워크 식별자 HMAC, 기존 PIN source 30회/10분·초과 시 1시간 잠금 및 lookup 5회 실패·단계적 잠금. 추가 전역 PIN 20회/시간 및 60회/일, DCR 20회/시간, HTTP 600회/분·source 180회/분, 인증 사용자 120회/분. PIN·토큰·사진·업무 데이터·raw 오류는 로그에 남기지 않는다. 전용 함수 최대 3개 instance/instance 동시 4회이며 비용의 절대 상한은 아니다.

## 최초 배포 준비 (인증된 배포 환경)

Node 22.23.2/npm 10.9.8, `npm ci` 후 진행한다. 브라우저 검사는 `npx playwright install chromium`로 테스트 브라우저를 준비한다(CI에는 설치 단계가 있다). 비공개 설정은 기존 배포 PC의 `functions/.env.onnuriway`에 보존하면서 다음 **이름의 설정**을 추가한다. 직원 ID 실제 값은 관리자 화면에서 확인하여 비공개 설정에만 기록하고 출력·문서화·커밋하지 않는다. PIN은 대화로 받지 않는다.

- `MCP_PUBLIC_ORIGIN`: `https://onnuriway-mcp.web.app`
- `MCP_ALLOWED_EMPLOYEE_IDS`: 연결할 기존 직원 ID의 쉼표 구분 목록. 현재 사용자가 지정한 1명만 설정했다. 비어 있으면 서버가 닫힌다.
- `MCP_REDIRECT_URIS`: 기본은 위 ChatGPT stable callback. ChatGPT 관리 화면이 다른 callback을 제시하면 **그 정확한 HTTPS URI만** 추가한다. 다른 클라이언트도 정확한 callback을 추가하며 wildcard를 쓰지 않는다.
- 기존 `DELIVERY_PHOTO_BUCKET`, `DELIVERY_PHOTO_SERVICE_ACCOUNT`를 유지한다. PIN Secret Manager의 `PIN_LOOKUP_SECRET`, `PIN_PEPPER`는 기존 것을 재사용하고 값을 출력하거나 복제하지 않는다.

프로젝트는 항상 `onnuriway`로 명시한다. 첫 배포 전에:

1. `firebase hosting:sites:create onnuriway-mcp --project onnuriway`로 전용 site를 생성한다. 이미 존재하면 소유 프로젝트를 확인한다. 기존 `onnuriway` site에는 배포하지 않는다.
2. `mcp-readonly-runtime@onnuriway.iam.gserviceaccount.com` 전용 SA를 만든다. 기존 납품사진 SA의 권한을 넓히지 않는다. 이 SA에 Firestore transaction을 위한 `roles/datastore.user`, Firebase 사용자 비활성 확인용 `roles/firebaseauth.viewer`, **두 PIN secret 각각에만** `roles/secretmanager.secretAccessor`를 부여한다. OAuth 상태/기존 로그인 기록은 쓰기가 필요해 Firestore IAM 자체는 완전한 읽기 전용이 아니다. 업무 쓰기 차단은 tool/service 노출 경계에서 수행한다.
3. 기존 납품사진 전용 bucket에 **`storage.objects.get`만 포함한 custom role**을 새 SA에 부여한다. list/create/update/delete 및 기존 업무 bucket 접근은 부여하지 않는다. 기존 bucket 정책·수명주기·SA는 변경하지 않는다.
4. `mcpPrivate` collection group의 `expiresAtTTL`에 Firestore TTL을 활성화한다. 기존 receipt/업무 collection TTL은 변경하지 않는다. 기존 `deliveryPhotos`의 customerId ASC / createdAt DESC 인덱스를 읽기 확인한다(명시적 documentId DESC는 기존 desc index의 기본 suffix).
5. 아래 검증 후 `node scripts/deploy-mcp.mjs`를 실행한다. 이 스크립트는 인증 read-only preflight 후 **`functions:employeeMcp` → `hosting:onnuriway-mcp`만** 배포하고 공개 probe를 실행한다. `firebase.json`, 기존 PWA `out`, 기존 Functions, Rules, 업무 데이터는 배포 대상에 없다. 기존 서버 리팩토링이 들어 있는 다른 Functions를 함께 배포하지 않는다.

```sh
npm run test:mcp
npm run test:mcp:emulator
npm run test:mcp:browser
npm run typecheck
npm run lint
npm run functions:build
node scripts/deploy-mcp.mjs
npm run verify:mcp:remote -- https://onnuriway-mcp.web.app
```

이 작업의 로컬 `out`은 CI 안전 설정 검증용이며 운영 PWA에 배포하면 안 된다. MCP 배포는 `mcp-public`만 사용한다.

## ChatGPT 연결과 완료 판정

2026-10-07 사용자 Chrome에서 확인한 실제 UI는 **플러그인 → 추가 → 맞춤형 MCP 서버 만들기**다. 이름(예: 급식길), URL `https://onnuriway-mcp.web.app/mcp`, 인증 `OAuth`를 입력한다. 고급 OAuth 설정의 등록 방식은 DCR이다. 조회 scope는 `geupsikgil:read`, 재고 저장을 함께 허용하려면 `geupsikgil:read geupsikgil:inventory.write`로 기존 PIN을 다시 확인하고 동의한다. client ID/secret/PIN을 설정에 직접 입력하지 않는다. 신뢰 확인 후 플러그인을 만들고 급식길 승인 창에서 기존 직원 PIN으로 최초 연결한다. 이전 UI는 설정 → Apps/개발자 모드/새 MCP 연결일 수 있다. 해당 계정/워크스페이스에서 custom MCP가 허용되어야 한다.

도구/UI 메타데이터 변경 후에는 **설정 → 플러그인 → 온누리종합식품 → 앱 관리 → 도구 새로 고침**을 실행하고 새 대화에서 사용한다. 실제 확인 시 새로 고침 전 대화에는 사진 카드가 없었고, 새로 고침 후 새 대화에서 사진 표시가 정상 동작했다. 이전 조회 갱신에는 PIN 재인증이 필요하지 않았다. 1.7 쓰기 권한 추가는 별도 동의가 필요하다.

공개 probe PASS는 HTTPS·discovery·PKCE metadata·401 challenge·Origin/no-store만 증명한다. 실제 완료 판정은 사용자가 기존 직원으로 연결하고 조회/미리보기 도구가 등록되며 실제 거래처/상품을 조회하고 납품사진이 표시되는 것까지다. 테스트용 업무 자료를 운영에 만들지 않고 기존 자료만 사용한다. 연결 권한 취소/30일 만료 후에는 PIN으로 재연결한다.

예: “한빛초 거래처를 찾아 최근 납품사진 기록을 보여줘”, “재고 0인 상품을 모든 페이지에서 알려줘”, “이 상품의 현재 장소별 재고를 알려줘”. 날짜가 생략되면 연도/서울 시간 범위를 확인하고, 사진 168시간 범위 밖은 장기 기록이 없음을 설명한다.

공식 근거(2026-10-07 확인): [OpenAI OAuth](https://developers.openai.com/apps-sdk/build/auth/), [ChatGPT 연결](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt/), [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

## 실제 ChatGPT 호환성 후속 검증 (2026-10-07)

실제 ChatGPT가 OAuth authorize에 추가하는 `ui_locales=ko-KR` 때문에 최초 연결에서 `invalid_request`가 발생했다. RFC 6749에 따라 authorization/token의 미인식 확장 항목은 저장하지 않고 무시하도록 수정했다. client/redirect/resource/scope/PKCE 검증과 PIN consent의 strict 검증은 유지한다. locale이 포함된 unit·Chromium·실제 Firebase Hosting 경유 회귀를 추가했다.

OAuth 수정 뒤 실제 ChatGPT 연결 계정을 확인했다. 실제 `list_low_stock`는 오류 없이 결과와 마지막 커서를 반환했고, 기존 납품 기록 및 WebP 다운로드도 성공했다. 처음에는 MCP image bytes가 모델에 전달되어도 사용자 화면에 사진이 표시되지 않았다. 같은 함수에 MCP Apps 사진 뷰어를 추가하고 ChatGPT의 도구 새로 고침 후 새 대화에서 재검증했다. 뷰어의 이미지 load 완료 상태·접근성 이미지 요소(736×600)·실제 화면을 함께 확인했다. 운영 검증은 기존 자료만 읽었으며 사진/직원/거래처 값과 화면 캡처는 저장소 문서에 남기지 않았다.

사진 뷰어 추가 후 MCP/PIN unit **23 PASS**, Chromium **2 PASS**, 실제 Firebase 통합 **6 PASS**, app/Functions typecheck·lint·Functions build PASS다. 브라우저 검사는 표준 MCP Apps 메시지와 ChatGPT의 중첩 메타데이터 bridge, 잘못된 message source 거부, 이미지 로드·오류 처리, 외부 네트워크 요청 0을 확인했다. 최신 배포 revision은 `docs/HANDOFF.md`의 맨 위 MCP 완료 기록을 따른다. 기존 Functions 71개와 기존 PWA release는 그대로다.

## 최초 구현·연결 단계 검증 결과 (1.0.0)

- Node 22.23.2/npm 10.9.8. app/Functions typecheck, lint, Functions build PASS.
- 초기 전체 unit **1,730 PASS / 22 SKIP**(MCP emulator6·브라우저1 + 기존 emulator 조건부15). MCP 조건부7개는 전용 runner에서 모두 실제 실행했으며, Hosting 전체 경로를 포함한 MCP emulator **6/6 PASS**, Chromium **1/1 PASS**다. 일반 unit의 조건부 skip을 실제 실행 성공으로 혼동하지 않는다.
- OAuth 단위 10개: code 1회/경쟁 요청, PKCE·redirect·client·resource·scope, 브라우저 binding/동의, 15분/30일 만료, refresh 회전/재사용 family 폐기, 로그아웃/권한 취소, 분산 rate limit.
- 실제 Chromium 승인 UI **1 PASS**: password 폼·브라우저 cookie·PIN POST·승인 callback·토큰 교환. `Referrer-Policy: no-referrer`가 Origin을 제거해 정상 폼도 거부하는 문제를 `same-origin`으로 수정했고, CSP form-action에는 고정 allowlist callback origin을 포함해 승인 redirect를 허용했다. 외부로 Referer를 전달하지 않고 엄격한 Origin/CSRF 검사를 유지한다. 이 검사는 가상 callback으로 실제 ChatGPT 계정 연결과 구분한다.
- 당시 MCP/PIN unit **23 PASS**, 전용 emulator **6 PASS**, Chromium **2 PASS**로 총31개를 각 runner에서 실행했다. 일반 unit에서 조건부 skip하는 통합/브라우저 검사는 별도 runner 실행 결과를 사용한다.
- 실제 HTTP + 공식 MCP SDK 4개: discovery/401, DCR, PIN form→callback→token, initialize/tools/list/도구 호출/이미지, 잘못된 입력·비등록 쓰기 도구 거부, 조회 중 권한 취소 시 결과 비노출.
- 실제 Firebase emulator: 기존 PIN 해시 검증, allowlist, 상품 19봉·초성검색·부족 기준·개인 필드 최소화·업무 원본 불변, 비공개 WebP 다운로드, 날짜/페이지·삭제/만료, 계정/권한/세션 취소. **Hosting rewrite와 실제 employeeMcp 함수**를 경유한 OAuth 및 SDK 재고/이미지 조회까지 PASS.
- 기존 Rules **51 PASS**. 새 `mcpPrivate`에 익명·직원·승인 관리자 Client의 get/list/write 거부를 추가 검증했다. Rules 내용은 변경하지 않았다.
- CI 안전 설정 Next production-mode build, PWA, 검색/캐시 성능 18개, 기존 JS/CSS bundle budget PASS. 5,000개 검색 p95 1.28ms, 입력 중 네트워크 0. initial JS gzip 139,893B, inventory JS 25,539B/CSS 6,649B로 상한 유지.
- **PWA production Hosting artifact gate는 미통과**: 운영 Firebase frontend 설정이 없어 안전 설정 export를 거부했다. 운영 PWA 배포 대상이 아니며 검사를 완화하거나 가짜 운영 설정으로 통과시키지 않았다.
- audit high/critical **0**, moderate **7**. 신규 서버 의존성 외에도 기존 잠금 파일의 호환 보안 패치 SDK 1.32.1, proxy-addr 2.0.8, sharp 0.35.5, source-map-js 1.2.2, compression 1.8.2, ip-address 10.7.3을 적용했다. 나머지 moderate는 자동 예외 승인하지 않았으며 별도 관리 대상이다.
- Firebase Hosting wildcard가 `.well-known`을 포함하지 않는 사례를 실제로 발견해 세 metadata 경로를 명시했다. Firebase CLI 15.30의 NO_PROXY 미준수는 **테스트 runner에만** loopback HTTP 전용 adapter를 적용했다. 외부 트래픽은 기존 proxy를 유지하며 배포 서버에 포함되지 않는다.
- 최초 공개 probe는 **404**였다. 이후 사용자가 Firebase CLI 브라우저 인증을 완료했고 `onnuriway` Functions 71개·기존 Hosting 조회와 필요한 배포/IAM 권한을 확인했다. 전용 Hosting `onnuriway-mcp`, runtime SA와 사진 get-only custom role을 생성하고 위 범위의 IAM을 적용했다. 기존 IAM binding·bucket lifecycle/access 설정 보존과 새 SA의 정확한 역할을 재조회로 검증했다. 두 PIN secret은 메타데이터/IAM만 조회했으며 값은 읽지 않았다. 납품사진 customerId/createdAt 인덱스 READY, 새 `mcpPrivate.expiresAtTTL` TTL은 ACTIVE다.
- 사용자가 지정한 직원 1명의 active·비관리자 역할·canonical authz/session 일치·Firebase Auth enabled를 확인하고 ignored `functions/.env.onnuriway`의 allowlist에 설정했다. 실제 직원 ID·PIN·토큰은 문서/Git에 포함하지 않는다.
- `functions:employeeMcp`와 `hosting:onnuriway-mcp` 배포 PASS. 함수 ACTIVE / revision `employeemcp-00001-cod`, Hosting version `b6e6aac27dba693f`, release `1791378106859000`, 공개 시각 **2026-10-07T13:01:46.859Z**. 전용 runtime SA·secret 두 개·allowlist 1명·최대 instance3/concurrency4를 재조회로 검증했다. 배포 전후 기존 Functions **71개 updateTime 동일**, 기존 PWA Hosting release/version 동일을 확인했다. 기존 Rules·업무 데이터는 수정하지 않았다.
- 최초 배포 시 운영 HTTPS probe PASS: OAuth discovery/issuer/PKCE, 401 challenge, 잘못된 Origin 거부, no-store. 운영 DCR → Firestore에 저장되는 authorization flow → 한국어 PIN 폼, Secure/HttpOnly/SameSite=Lax 쿠키도 PASS. 검증용 인증 메타데이터만 생성했으며 실사용자 PIN 제출·토큰 발급·업무 자료 조회는 하지 않았다. 이는 실제 ChatGPT 연결 완료와 구분한다.
- 후속 실제 ChatGPT 연결·재고 조회·사진 화면 표시는 위 호환성 검증에서 완료했다. 클라우드 공개 probe는 Node 22 `--use-env-proxy` 또는 `NODE_USE_ENV_PROXY=1`로 환경 proxy를 유지한다. 사진 뷰어와 OAuth 호환성 수정은 MCP 함수에만 후속 배포했다. 기존 PWA/Functions는 배포하지 않았다.

## 쓰기 확장 원칙

1.7은 `geupsikgil:inventory.write`와 승인 카드로 재고 업무를 구현했다. 추가 업무도 별도 scope와 필요한 역할만 허용한다. 같은 기존 service command에 들어가 `expectedRevision`/`stockRevision`, 고유 requestId·멱등 receipt, transaction 내부 재인가, 감사 이력을 그대로 적용한다. 사용자에게 변경 대상/수량의 구체적 preview와 확인을 받은 뒤 실행하는 별도 도구로 만들고 readOnlyHint를 올바르게 바꾼다. 원시 Firestore 쓰기나 임의 관리자 API는 노출하지 않는다. MCP 외 클라이언트도 같은 인증·query/command 계층을 재사용할 수 있다.
