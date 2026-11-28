# 급식길 카메라의 초점과 라벨 판독

2026년 11월 28일. 창고에서 작은 글씨와 바코드가 흐리다는 의견을 바탕으로 카메라 제어, 촬영 해상도, 인식기 세 단계를 살폈다. 휴대전화가 피사체에 초점을 맞출 수 있는 거리와, 촬영한 글씨가 판독기에 전달될 때까지 보존되는 픽셀이 모두 중요하다.

## 개발자가 참고할 공식 문서와 코드

| 현장 문제 | 공식 가이드와 코드에서 확인한 내용 | 급식길에 적용한 방식 |
| --- | --- | --- |
| 휴대전화를 가까이 대면 더 흐려짐 | Apple의 `AVCamBarcode` 예제에서 `CameraViewController.swift`의 `setRecommendedZoomFactor()`는 렌즈의 `minimumFocusDistance`, 시야각, 관심 영역 크기로 필요한 확대율을 계산한다. Apple은 작은 QR 코드를 직접 비춰 거리를 늘리는 장면도 시연한다. [Apple 예제와 소스 다운로드](https://developer.apple.com/documentation/avfoundation/avcambarcode-detecting-barcodes-and-faces) · [WWDC 카메라 시연](https://developer.apple.com/videos/play/wwdc2021/10047/) | 기종에 공통인 촬영 거리를 가정하지 않는다. 조금 물러나 글씨를 탭하고, 지원하면 현재 카메라 배율을 기준으로 최대 두 배까지 확대한다. 기본 카메라 앱으로도 바로 촬영할 수 있다. |
| 어두운 곳에서 초점이나 노출이 옆 상자에 맞음 | Android CameraX의 `PreviewView.meteringPointFactory.createPoint(x,y)`와 `CameraControl.startFocusAndMetering()`는 미리보기의 터치를 센서의 초점·측광 지점으로 바꾼다. `enableTorch()`와 확대 제어도 제공한다. 웹에는 W3C의 트랙 제약 조건과 Chrome의 정지 사진 예제가 있다. [CameraX 개발자 가이드와 Kotlin 코드](https://developer.android.com/media/camera/camerax/configuration) · [CameraControl API](https://developer.android.com/reference/androidx/camera/core/CameraControl) · [웹 카메라 제어 명세](https://w3c.github.io/mediacapture-image/) · [Chrome 촬영 예제](https://developer.chrome.com/blog/imagecapture) | PWA는 현재 영상 트랙에서 지원을 확인하고 손전등·연속 초점·터치 지점·확대를 요청한다. 영상의 여백은 초점 좌표에서 제외한다. 손전등이 켜져 있을 때 초점이나 확대를 바꿔도 기존 조명 설정을 함께 전달한다. |
| 미리보기에서는 보이던 바코드나 작은 글씨가 사진에서 사라짐 | Google ML Kit의 EAN-13 예시는 가장 가는 막대 약 2px, 인쇄 심벌 95모듈 기준 폭 약 190px를 권장한다. 문자 인식의 글자당 약 16×16px도 **ML Kit 모델**의 권장 입력 예다. Android에는 감지 후보에 맞춰 확대율을 제안하는 `ZoomSuggestionOptions`가 있다. Apple VisionKit은 텍스트·바코드, 품질 수준, 관심 영역을 선택할 수 있다. [Google 바코드 입력·확대](https://developers.google.com/ml-kit/vision/barcode-scanning/android) · [Google 문자 인식](https://developers.google.com/ml-kit/vision/text-recognition/v2/android) · [Google 바코드 예제 소스](https://github.com/googlesamples/mlkit/blob/master/android/vision-quickstart/app/src/main/java/com/google/mlkit/vision/demo/kotlin/barcodescanner/BarcodeScannerProcessor.kt) · [Apple VisionKit](https://developer.apple.com/documentation/visionkit/scanning-data-with-the-camera) | 가능한 기기는 고해상도 정지 사진을 우선한다. 촬영 당시의 영상 프레임도 확보해 둔다. 바코드는 긴 변 최대 2,400px의 사진과 1,440px 축소본을 읽는다. AI 글자 인식에 적용할 고정 픽셀 기준은 두지 않았다. |
| 여러 상자 중 어느 포장의 날짜인지 모호함 | 네이버는 스마트렌즈의 이미지·주변 텍스트 활용과 관심 영역 지정을 공개했고, 문자 인식 화면은 터치·드래그로 영역을 고른다. NAVER의 오픈소스 CRAFT는 글자 영역과 글자 간 연결을 검출하는 모델이다. 글자 전사에는 별도 인식기가 필요하다. 네이버가 개발자에게 제공하는 별도 문자 판독 서비스로 CLOVA OCR도 있다. [스마트렌즈의 스코픽 기술 소개](https://navercorp.com/media/pressReleasesDetail?seq=29565) · [스마트렌즈 영역 선택](https://help.naver.com/service/18159/contents/7676?lang=ko&osType=MOBILE) · [CRAFT 논문](https://openaccess.thecvf.com/content_CVPR_2019/papers/Baek_Character_Region_Awareness_for_Text_Detection_CVPR_2019_paper.pdf) · [CRAFT 소스](https://github.com/clovaai/CRAFT-pytorch) · [CLOVA OCR 개발자 API](https://api.ncloud-docs.com/docs/ai-application-service-ocr) | 촬영 사진에서 직원이 **표제와 값**을 함께 선택해 기존 판독 함수에 보낸다. 선택 영역은 날짜·원산지 보완에만 쓰며 직원이 입력한 값과 사진 번호를 유지한다. 사진 전송 경로는 급식길의 기존 OpenAI 판독 경로 하나다. |

CameraX·ML Kit의 카메라 연동과 Apple의 AVFoundation·VisionKit 예제는 네이티브 앱용이다. 현재 급식길 PWA에서는 렌즈별 최소 초점 거리와 매크로 렌즈 전환을 브라우저 공통 API로 지정할 수 없다. 화면의 ‘초점 요청’은 카메라에 보낸 동작을 뜻한다. 실물 글씨에 초점이 맞았는지는 직원이 미리보기와 사진을 보고 확인할 수 있다. [웹 카메라 제어 명세](https://w3c.github.io/mediacapture-image/)

## 같은 사진으로 비교한 바코드 판독기

2400×1400 합성 사진에 EAN-13 한 개를 그렸다. 가장 가는 막대 폭 1·1.5·2·3px, 촬영 각도 0·30·45·60·90도, 흐림 0·1.3px를 조합한 40장이다. 모두 동일하게 JPEG 품질 0.9로 인코딩 후 다시 열었다. 브라우저 내장 바코드 API를 끄고 Chromium 151.0.7922.34에서 각 판독기에 같은 픽셀을 입력했다. 표의 숫자는 실제 번호와 일치한 장수다.

| 조건 | 가로·세로 판독 | ZXing-C++ WebAssembly | 급식길 가로·세로·양 대각선 판독 |
| --- | ---: | ---: | ---: |
| 흐림 없음, 20장 | 8 | 8 | 13 |
| 흐림 1.3px, 20장 | 2 | 2 | 5 |
| **합계 40장** | **10** | **10** | **18** |

- WebAssembly 비교에는 `zxing-wasm@3.1.8`의 읽기 전용 배포본과 소매용 바코드 형식을 사용했다. 기본 설정에서 같은 번호를 읽은 장수는 기존 두 방향 방식과 같았다. WebAssembly 파일과 JS 로더의 gzip 크기는 합쳐 약 416KiB였다. 급식길에는 기존 `@zxing/library@0.21.3`를 유지하고 각 방향에서 최대 72줄의 실제 픽셀을 읽도록 적용했다. 사진을 45도 회전해 한 번 더 읽는 비교 구현도 18장을 읽었고, 운영 구현은 회전용 전체 이미지를 만들지 않는다. [ZXing JS 행 판독 코드](https://github.com/zxing-js/library/blob/master/src/core/oned/OneDReader.ts) · [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp) · [WebAssembly 배포 소스](https://github.com/Sec-ant/zxing-wasm)
- 준비된 데스크톱 브라우저에서 사진별 판독 시간 중앙값은 두 방향 67ms, 새 방식 128ms, WebAssembly 27ms였다. 기존 방식으로 사진 전체를 회전해 재시도하는 데는 중앙값 99ms가 더 들었다. 실험 코드는 첫 실행 준비 시간을 제외하고 사진별 처리 시간을 함께 기록한다. 실제 직원 전화에서의 시간은 별도 측정 대상이다.
- 서로 다른 두 번호를 같은 방향에 놓았을 때 급식길은 한 제품에 자동 연결하지 않았다. 한 번호만 45도로 돌린 대조 사진에서는 기존 두 방향 판독과 WebAssembly가 가로 번호 하나만 보고했다. 새 구현은 두 번호를 발견해 연결을 보류했다. 브라우저 내장 인식과 보조 판독이 서로 다른 번호를 읽는 경우도 단위 테스트에 넣었다. 빈 사진에서 나온 번호와 40장에서 나온 잘못된 번호는 모두 0개였다.
- 단일 바코드 **22장은 새 방식으로도 읽히지 않았다.** 반사, 구겨짐, 손떨림, 손전등, 렌즈 간 자동 전환은 이 합성 시험 범위를 벗어난다. 직원에게 제공할 사용 팁은 ‘작은 바코드가 흐리면 조금 물러난 뒤 확대하고, 한 제품의 바코드 전체와 양옆 흰 여백을 화면에 담기’다. [Google 입력 가이드](https://developers.google.com/ml-kit/vision/barcode-scanning/android) · [Apple 바코드 기술 노트 TN2325](https://developer.apple.com/library/archive/technotes/tn2325/_index.html)

## 초점 점수와 날짜·원산지 판독

- **자동 촬영 판단.** 동일한 400×200 영역에서 4방향 라플라시안 분산을 구했다. 선명한 바코드는 16,090, 흐린 바코드는 68이었지만 같은 흐린 사진에 합성 노이즈를 더하면 5,883이었다. 아무 글씨가 없는 회색 면도 노이즈만 더하면 0에서 8,677로 올랐다. 창고 조준선은 밝기·질감·흔들림 안내로 사용하고, 이 수치로 초점 성공을 선언하거나 자동 촬영하지 않는다. [OpenCV 라플라시안 예제](https://docs.opencv.org/4.x/d5/db5/tutorial_laplace_operator.html) · [Pertuz 등 초점 척도 비교 연구](https://doi.org/10.1016/j.patcog.2012.11.011)
- **글자를 다시 읽는 비용과 효과.** 실제 OpenAI 판독에서 작은 글씨의 한 상자 사진은 전체·부분 모두 ‘대한민국’과 ‘2027-06-18’을 얻었다. 날짜가 다른 두 상자를 한 사진에 담았을 때 전체 판독은 날짜·원산지를 모두 비워 두었고, 직원이 한 상자의 표시를 선택하자 두 값이 읽혔다. 모든 사진을 자동 확대·재전송하는 대신 직원이 필요한 경우에 한해 추가 판독한다. 날짜는 해당 입고분, 제품 원산지는 제품 초안에 들어간다.
- **후속 OCR 후보.** Tesseract.js는 브라우저에서 실행할 수 있고 Tesseract 개발 문서는 기울기·이진화·분할 문제를 설명한다. 한글 언어 모델, 다운받는 용량, 저사양 전화의 대기 시간, 제조일과 소비기한 연결 정확도를 현장 표본으로 비교한 다음 도입 여부를 정할 수 있다. CRAFT의 공개 코드와 스마트렌즈의 실제 서비스 내부 구현 간에는 확인된 연결 근거가 없다. [Tesseract.js](https://github.com/naptha/tesseract.js) · [Tesseract 판독 품질 가이드](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)

## 재현과 실물 확인

프로젝트 의존성과 이 저장소의 Git 이력이 있는 환경에서 실행한다. 비교용 라이브러리는 무시 경로인 `output`에만 설치한다. 실행 중에는 외부 사진, 카메라 권한, 계정, API 키를 쓰지 않는다. JSON에는 사진별 각도·막대 폭·흐림과 각 판독기가 반환한 실제 번호가 담긴다. [실험 코드](../scripts/benchmark-inventory-camera.mjs)

```sh
npm install --prefix output/camera-benchmark --no-save --package-lock=false --ignore-scripts --no-audit --no-fund zxing-wasm@3.1.8
npx playwright install chromium
node scripts/benchmark-inventory-camera.mjs output/camera-benchmark/node_modules/zxing-wasm
```

다음 현장 확인은 직원이 실제 쓰는 iPhone과 Android에서 같은 상자·반사 비닐·작은 날짜 표시를 평소 조명과 어두운 보관 장소에서 촬영하는 방식이 적합하다. 기본 배율과 조금 물러난 확대 촬영을 비교해 첫 시도 정답, 재촬영 횟수, 날짜와 원산지 수정 여부, 촬영부터 확인까지의 시간을 기록한다. 시험 중에는 등록 전 확인 화면에서 멈출 수 있다. 손전등 실제 점등·반사와 기종별 초점 성공 여부는 이 현장 비교에서 확인할 항목이다.
