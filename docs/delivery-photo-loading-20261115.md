# 모바일 납품사진 확대와 조회 대기 개선

사용자는 모바일의250% 확대 한도가 부족하고 서버 수신·렌더가 느리다고 보고했다. `codex/delivery-photo-inspection`의 이전 로컬 변경을 보존하고 확대 한도와 실제 조회 경로를 개선했다. 기준 main은 `5a0e274`이다. 이번 확인 시 운영 Hosting은 학교 릴리스 `457477f2acda01ef`, 배포 시각은2026-11-14 23:12:10 KST였다. 이전 사진 개선은 로컬에만 있어 운영의250%는 기존 버전 동작이었다. 이 차이를 먼저 사용자에게 알렸다.

## 확대와 표시 크기

저장된 사진 기준 최대800%로 높였다. `PhotoView`와 `PhotoGeometry`의 구조를 유지하며 `max=8*nativeScale`로 계산한다. fit은 전체 사진, 원본 크기는 저장 픽셀100%다. DPR은 상한을 낮추지 않는다. 모바일 실제 두 손가락 입력에서100%→400%→800%를 확인했다. 2400px 사진은 실제19200px 너비까지 표시되며 가로·세로 이동 경계와 사진 전환 계약은 유지한다. 세부 정보의 복원이나 저장 해상도 변경을 뜻하지 않는다.

WebKit 확대 검사에서 JS가 설정한 transform과 짧은 CSS 전환이 겹쳐 수치와 실제 렌더가 어긋나는 순간이 관측됐다. transform은 이미 gesture 엔진의 RAF 보간과 모션 설정이 소유하므로 확대 이미지에만 `transition:none`을 적용했다. 전역 reduced-motion의0.01ms duration이 별도 전환을 만들지 않게 한다. stage의 열기·닫기 애니메이션은 유지한다.

## 수신과 렌더 대기

사진은 기존 인증 Callable의 evidence를 사용한다. Base64 응답을 검증하고 WebP Blob으로 바꾸는 경로의 `Uint8Array.from(binary,callback)`을 사전 할당과 인덱스 루프로 교체했다. schema·사진ID·variant·MIME·길이·WebP 바이트와 응답 앞뒤 세션 검증은 유지했다. 완료 사진 캐시나 새 binary endpoint를 추가하지 않았다. 두 독립 조사는 일반 thumbnail과 evidence가 다른 데이터여서 합칠 수 없음을 확인했고, 같은 진행 요청 중복의 실제 이득이 입증되지 않은 registry도 추가하지 않았다.

저장 뷰어가 열릴 때 확대 모듈을 사진 수신과 함께 준비한다. 기존 `next/dynamic` import 경계와 동일 모듈을 사용한다. 대기 사진이 아직 도착하지 않은 시점에 확대 모듈이 실행됨을 브라우저에서 확인했다. 이미지 자체를 선행 수신하거나 썸네일을 원본으로 대체하지 않는다.

서버의 `GoogleDeliveryPhotoStorage.download`는 최초 live 메타데이터 확인과 별도 세대 고정 핸들의 range download를 겹친다. 두 작업은 `Promise.all`이 소유하며 모두 성공해야 다음 단계로 간다. 마지막 메타데이터는 반드시 live 핸들에서 확인한다. 기존 세대·MIME·업로드 token·바이트 범위와 서비스의 전후 권한·삭제·만료 검증을 유지한다.

Storage SDK8.2.0은 generation을 Number로 변환하므로 양의 안전 정수이며 문자열 왕복도 정확한 경우만 고정 핸들을 쓴다. 나머지 문자열은 기존 직렬 경로를 사용한다. Storage RPC는 메타데이터2회와 다운로드1회로 그대로다. 직렬 대기 관계만 `M1+D+M2`에서 `max(M1,D)+M2`가 된다. 공유 인증이나 콜드스타트·비용 설정은 변경하지 않았다.

## 측정

실제 converter 소스를 동일한 minify 설정으로 번들하고, 같은1512000B WebP와 압축하지 않은2016133B 로컬 JSON 응답을 사용했다. CPU4배 제한, 네트워크750000B/s·80ms, viewport412×839/DPR2.625 조건이다. A/B를5회씩 교차했다. warmup과 별도 profile은 시간 비교에서 제외했다. SHA-256·전체 바이트·2560×1920 디코딩 치수·서버 사진 응답11회와 오류0을 확인했다. 프로파일의 주된 샘플은 기존 converter 경로였다. 사전 Windows 샘플은 논리 프로세서12개·CPU0%였고 연속 부하 기록은 아니다. 최종 비교 중 빌드·회귀는 실행하지 않았다.

| 범위 | 변경 전 중앙값, 범위 | 변경 후 중앙값, 범위 |
| --- | --- | --- |
| 응답이 이미 있는 converter→검증된 Blob | 491.6ms,484.3–539.4ms | 30.1ms,27.9–104.0ms |
| 요청 시작→로컬 JSON 수신/파싱→Blob→이미지 decode/2RAF | 3462.2ms,3444.5–3487.5ms | 2975.6ms,2959.6–2994.6ms |

두 번째 경로에서 약486.6ms가 줄었다. 네트워크 수신·파싱은 약2.8초로 대부분을 차지하며 바꾸지 않았다. 전체 Next·Firebase 인증·Functions 콜드스타트나 실물 휴대폰 시간은 아니다. 이전 prototype의502.7/35.5ms와3470.7/2990.4ms 대신 실제 적용 코드의 위 final JSON을 사용한다. Base64 문자열의 크기 증가를 운영 wire bytes 증가율로 일반화하지 않는다.

실제 Storage 클래스도 이전·현재 소스를 각각 고정해 합성 bucket에 연결하고5회씩 교차했다. 메타데이터40ms·다운로드90ms 지연을 설정한 모델에서196.96ms(195.36–204.82)가147.73ms(147.19–148.14)로 줄었다. 반환 바이트 해시와2회 메타데이터/1회 다운로드를 매번 확인했으며 오류0이다. 이 결과는 중첩 순서를 확인하는 모델로, 운영 서버 지연 수치가 아니다. 운영 요청 로그30행은 도구의 정규화 결과에 latency/status가 없어 실제 운영 지연·오류율을 알 수 없었다.

## 필요한 검증

관련 단위89개가 통과했다. 새 Storage 검사는 live/pinned 핸들 구분, 초기/도중 세대·MIME·token 변경 거절, 마지막 live 확인 전 반환 금지, 안전 정수가 아닌 세대의 직렬 처리와 두 Promise 거절 처리를 포함한다. 변환은 큰 응답의 전체 바이트를 대조했다. 기존 서비스의 만료·권한·삭제와 Callable 검사를 포함했다.

추가 브라우저 고유11개가 통과했다. 모바일5개, PC4개, WebKit2개이며 수정된 확대·조작·공통 재고·오류/Blob 해제·확대 도구 선행 준비에 집중했다. 이전의 전체40개 화면 검사를 다시 돌리지 않았다. 높은 확대 검사는 표시값을 기다린 뒤 실제 렌더·scale·비율을 확인한다. 첫 WebKit 실패는 CSS 전환, 다음 실패는 마지막 RAF 전 scale1을 기대값으로 고정한 검사 경합이었다. CSS 소유권을 정리하고 의도한800% 적용 뒤 읽도록 고쳤다. 실제 렌더와 evidence 요청1회 검증은 유지했다. 실패와 최종 통과 로그를 모두 남겼다.

demo 전용 Firestore/Storage 게이트도 통과했다. 실제 SDK로 생성·재실행·목록·세대 고정 조회·권한 회수·소유자/다른 직원/운영자 삭제·만료를 확인했다. loopback과demo 프로젝트·가짜 전용 bucket guard를 사용했고 운영 자격 증명은 배제했다. SDK MetadataLookupWarning이 있었지만 게이트는 첫 실행에서 성공했고 정상 종료했다. 실제 운영 쓰기는 없다.

앱 타입, 수정 파일 lint, 최종 운영용 빌드·성능·PWA·Hosting 산출물 검사가 통과했다. 공유 이미지 CSS 한 줄이 추가돼 최종 산출물만 다시 빌드했다. 전체 CI·전체 회귀는 실행하지 않았다. 서버 코드는 위 emulator 진입의 Functions TypeScript 컴파일도 통과했다. 독립 같은 모델 검토는 최종 PASS이며 모델 다양성은 없다.

최종 history/viewer CSS는 raw5576B·gzip1721B, 공통 PanZoom은 CSS raw1134B·gzip535B와 JS gzip3406B로 기존 예산 안에 있다. 최초 JS는 gzip144050B이며 정적 파일145개·사전 캐시129개다. 제품 파일8개와 Hosting 파일145개의 해시 및 컴파일된 Storage 구현을 `release-candidate.json`으로 고정했다. 이후 문서 수정은 앱 산출물을 바꾸지 않는다.

`Model the Domain`에 따라 기존 사진 기하와 Blob·객체 세대 타입을 유지했다. `Laziness Protocol`로 새 캐시나 전송 계층 대신 관측한 비용만 줄였다. `Prove It Works`와 benchmark checklist로 실제 함수/클래스의 바이트·치수·실행·오류와 범위를 확인했다. 이전 유리·세라믹 UI와 업로드/outbox·서버 확인·세션·보관 계약은 유지한다.

## 반영 상태와 증거

사용자가2026-11-15에 검증된 변경의 커밋·main 병합과 `getDeliveryPhoto` 함수1개/Hosting 운영 배포를 승인했다. 운영 반영 대상은 이전 확대 개선을 포함한 Hosting `onnuriway`와 `getDeliveryPhoto` 함수1개다. 계약이 호환되며 다른 인증·직원·업로드 함수의 배포는 필요하지 않다. 제품8개·Hosting145개·컴파일된 Storage 구현의 해시가 검증 당시와 일치함을 확인했다. 통과한 검사와 앱 빌드는 반복하지 않고, Firebase의 필수 Functions predeploy 컴파일과 배포·공개 확인을 진행한다. 배포 식별자와 결과는 완료 후 기록한다.

세부 자료는 ignored `output/delivery-photo-loading-20261115/`에 있다. `client-benchmark-final.json`과 `measurement-notes.json`, `storage-benchmark.json`이 최종 측정 근거다. `zoom-before.log`는800%의 실패 재현이며, `unit.log`, `browser-mobile.log`, `browser-desktop.log`, `browser-webkit-confirmed.log`, `browser-mobile-final.log`, `browser-shared-final.log`, `emulator.log`에 관련 검증을 남겼다. `build-final.log`·`performance-final.log`·`pwa-final.log`·`hosting-final.log`는 최종 산출물 검사다. `review.md`는 실패 이력을 포함한 독립 검토다.

실물 휴대폰·설치 PWA·실제 운영 사진의 판독성과 운영 Firebase 지연은 미측정이다. 저장 해상도/화질, 보관 기한과 no-store는 바꾸지 않았다. 서버·Hosting 운영 배포가 완료되기 전에는 직원 화면이 갱신됐다고 표현하지 않는다.
