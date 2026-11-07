# 명세서 납품 준비 및 인공지능 경로 추천 릴리스

- 사용자 화면 승인 후 API 연결·최종 점검·배포 승인으로 진행했다. 소스 `01aa86c`, 브랜치 `codex/invoice-delivery-planning`.
- 2026-11-07 22:11:40 KST Hosting `318444ae7f371689` 배포 완료. 직전 Hosting `87ddaf3743a7e31d`.
- 신규 Functions 6개: getDeliveryPlanningContext, saveDeliveryPlanningSettings, analyzeDeliveryInvoice, confirmDeliveryInvoice, recommendDeliveryRoute, applyDeliveryRoute. 모두 asia-northeast3 / Node.js 22 / ACTIVE. 기존 함수 72개 메타데이터 동일.
- 운영 주소 onnuriway.com / onnuriway.web.app 각각 JS/CSS 98개가 로컬 최종 빌드와 해시 일치. 신규 서버 6개의 인증 없는 요청은 모두 401로 거부.

## 연결 및 실제 검증

- OpenAI 전용 키 `onnuriway-invoice-production`: Responses Write 제한 권한, Default project. Secret Manager OPENAI_API_KEY 버전 1. TMAP은 사용자 직접 계정 인증 및 필수 약관/제3자 제공 동의 승인 후 앱 `급식길 납품 경로`의 Free 상품을 신청했다. 무료 상품 사용중, 유료 상품 미신청. TMAP_APP_KEY 버전 1 등록. 두 비밀에 전용 delivery-photo-runtime 계정 accessor 권한을 연결했다. 키 원문을 소스·환경 파일·검증 결과에 남기지 않았다.
- 실제 첨부 명세서 → 앱 provider → OpenAI gpt-6-luna: **9,180ms**. `소은푸드(금산)` 정확 인식, uncertain=false, 기존 활성 거래처 유일 후보 및 주소 일치. 명세서 날짜 11월 9일과 검사 날짜 11월 7일 차이에 따라 자동 저장은 보류하는 것을 확인했다. 테스트용 운영 기록 생성 없음.
- 실제 기존 거래처 좌표로 화물차 경로 API: 2곳 **406ms**, 15곳 **742ms**, 모두 HTTP 200. 방문지 누락·중복 없고 선택한 마지막 거래처 유지. 2곳 453초/2,019m, 15곳 2,805초/12,015m. 회사와 가까운 거래처를 골라 시험한 결과이며 직원의 실제 당일 목록이나 현장 평균 시간이 아니다.
- 승인된 회사 주소를 기존 Kakao geocoder로 정확히 대조한 좌표가 최초 기본값이다. 저장한 별도 회사 출발지는 보존한다. 봉고3 일반 냉동탑차 높이 240cm/폭 175cm/길이 520cm/적재량 1,000kg; 총중량 4,000kg은 계산용 보수 가정이다. 하상도로 일괄 제외 보장은 없고 도로 표지 확인 문구를 유지한다.

## 보존 및 검사

- 배포 전후 운영 상품 92개, lot 89개, 입출고 이력 240개의 문서 해시 동일. 재고 변경 없음. 명세서 이미지는 RAM에서만 처리해 Firebase Storage/Firestore/기기 영구 저장소에 저장하지 않는다. 기존 납품사진 서버와 기록에 배포/시험 쓰기를 하지 않았다.
- 전체 단위 1,910 passed / 16 skipped, 전체 lint, 앱 타입/Functions 빌드 통과. 신규 브라우저 모바일·PC 6개, 실제 Firestore 에뮬레이터 16개 통과. 마지막 회사 기본 좌표 반영 뒤 빌드·에뮬레이터·PWA/Hosting/성능 gate 재검증 통과.
- 실제 외부 API는 로컬에서 배포와 같은 provider로 검증했고, 운영 Callable 인증 경계는 무인증 요청 거부로 확인했다. 실사용자 인증을 통과한 전체 운영 저장 흐름, 실물 휴대폰 카메라·설치 PWA·현장 통신망은 이번 점검에 포함하지 않았다. 외부 호출 시간과 앱 전체 처리시간을 구분한다.
- 증거는 git 제외 `output/delivery-planning-release/`: live-invoice-result.json, live-route-result.json, cloud-before/after.json, inventory-preservation.json, verification-after.json. 공개 운영 파일 126개 중 JS/CSS 98개를 두 주소에서 대조했다.

## 운영

- 납품사진 → 명세서로 납품 준비 → 촬영/갤러리 → 마지막 납품처 → 인공지능 경로 추천 → 오늘 목록 적용.
- 경로 추천은 출발 전 2~20곳 대상. 이미 오늘 납품사진이 있으면 회사 출발 추천을 막는다. 회사 전체 경로 API 호출을 하루 45회로 제한한다. 외부에서 동일 키를 직접 사용한 호출은 앱 제한 집계에 포함되지 않는다.
- 기존 IndexedDB v2 사진 보존 계약 유지. 복구 시 해당 계약을 유지하는 이전 Hosting 버전을 사용한다. 새 Functions는 기존 함수와 분리되어 있다.
