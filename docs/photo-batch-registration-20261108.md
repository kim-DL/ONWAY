# 명세서와 손글씨 목록의 사진 일괄 등록

> 후속 상태: 사용자 승인 후 2026-11-08 13:31 KST 운영 배포 완료. 아래는 구현 당시의 실험 기록이며, 최종 검증·배포·데이터 보존은 [릴리스 기록](releases/2026-11-08-photo-batch-sol-luna.md)을 따른다.

직원이 명세서나 거래처 목록을 촬영하면 여러 거래처를 추출한다. 확실한 항목은 내 납품처와 오늘 납품처에 중복 없이 추가한다. 애매한 항목은 기존 거래처를 선택하거나 제외하고 한 번에 확인한다. 이번 작업은 로컬 구현이며 운영 배포는 하지 않았다.

## 인식과 연결

- 사진 한 장에서 최대 60개 항목을 추출한다. 여러 명세서는 각각 수취인과 날짜를 읽는다.
- 명세서는 공급받는 자의 상호와 주소를 대조한다. 공급자와 품목 비고의 학교명은 수취인으로 사용하지 않는다.
- 손글씨 목록은 유일한 정식 상호 또는 직원이 확인한 줄임말만 자동 연결한다. 유사한 이름은 확인 후보로만 제공한다.
- 흐린 글자, 동명 거래처, 주소 충돌, 다른 날짜는 확인 대상으로 남긴다. 날짜가 없는 목록은 오늘 목록으로 처리한다. 월일만 쓰인 날짜는 연도를 만들어내지 않고 오늘의 월일과 비교한다.
- 사진이 잘렸거나 60개 항목을 넘으면 일부만 저장하지 않는다. 지원하지 않는 사진과 빈 인식 결과는 등록 성공으로 표시하지 않는다.

사진은 브라우저와 서버 메모리에서 처리한다. Firebase Storage, IndexedDB, localStorage에 원본을 저장하지 않는다. OpenAI Responses 요청은 인라인 이미지와 `store:false`를 사용한다. 거래처 전체 목록과 직원별 줄임말은 OpenAI에 보내지 않는다. OpenAI의 별도 보존 정책은 앱의 사진 저장 정책과 구분한다.

## 확인 화면과 줄임말

진입 버튼은 `사진으로 등록`이다. 분석 중에도 다음 사진을 촬영하거나 갤러리에서 추가할 수 있다. 자동 연결된 항목은 접힌 요약에서 볼 수 있다. 확인할 항목에는 인식된 상호와 등록 주소를 함께 표시한다.

선택한 항목과 제외한 항목은 한 요청으로 처리한다. 미선택 항목은 확인 목록에 남는다. 날짜 확인은 해당 사진에서 한 번만 저장한다. 응답 유실 시 같은 요청 ID와 같은 본문으로 저장 결과를 다시 확인한다. 명확한 서버 거절은 다시 편집할 수 있다.

줄임말은 직원별로 기억한다. 불확실한 인식은 기억 옵션을 기본으로 끄며, 직원이 기억할 표기를 확인하거나 수정할 수 있다. `기억한 줄임말`에서 연결을 변경하거나 기억을 해제한다. 이 변경은 기존 납품 기록을 삭제하지 않는다. 해제된 별칭도 revision을 유지해 오래된 요청의 덮어쓰기를 차단한다.

## 서버 경계

새 Callable은 `analyzeDeliveryPhotoBatch`, `confirmDeliveryPhotoBatch`, `getDeliveryPhotoAliases`, `updateDeliveryPhotoAlias`이다. 기존 단일 명세서 Callable의 엄격한 응답과 요청 해시는 유지한다. 구버전 설치 앱이 새 응답 구조를 받지 않도록 별도 API를 선택했다.

사진 결과, 행 상태, 확인 결정, 직원별 별칭은 `photo-batch-contract.ts`에서 정의한다. 확정은 행별 `connect` 또는 `skip` 결정으로 처리한다. 서버가 직원 범위, 오늘 날짜, 활성 거래처, scan revision, 별칭 revision, 요청 영수증을 검증한다.

공유 `addCustomers`는 모든 문서를 읽은 뒤 한 번 병합한다. 기존 경로와 오늘의 명시적 선택, 완료된 납품사진에서 가져온 거래처를 유지한다. 최대 100곳 제한에 걸리면 별칭 학습을 포함해 해당 저장 전체를 취소한다. 기존 API와 새 API는 같은 일일 분석 한도를 사용한다.

## 실제 사진 검증

2026년 11월 8일, 사용자 손글씨 원본과 기존 소은푸드 명세서를 새 OpenAI 인식 경로로 각각 한 번 시험했다. 운영 Firestore는 거래처 대조용 읽기만 수행했다.

- 손글씨에서 12개 줄과 `11-08`을 추출했다. 정식 상호 2곳은 자동 연결 대상이고 나머지 10곳은 확인 대상이었다.
- `자연유통`을 `자연우동`으로 읽은 오독이 있었다. 자동 연결되지 않았고, 후속 후보 검색 개선으로 유사한 등록 상호를 확인 후보에 포함했다. 한 장의 시험을 일반적인 정확도 수치로 보지 않는다.
- 명세서는 `소은푸드(금산)`과 `2026-11-09`를 읽었다. 시험 당일과 달라 자동 저장을 막았다.
- 이 실제 추출 결과를 에뮬레이터에 재사용했다. 2곳 자동 저장, `소은`을 소은푸드로 확인, 같은 확인 요청 재전송, 다음 사진에서 직원 별칭 재사용, 오독 확인 유지, 다른 날짜 명세서 확인 유지의 6개 검사가 통과했다.

실제 인식의 원본과 상세 결과는 Git에서 제외된 `output/photo-batch/`에만 있다. 운영 목록에 시험 데이터를 만들지 않았다. 운영에 배포된 새 API와 실물 휴대폰 카메라 전환은 아직 검증하지 않았다.

## 검증 명령

```text
npx vitest run functions/tests/delivery-planning.test.ts functions/tests/delivery-planning-callables.test.ts functions/tests/delivery-planning-address.test.ts functions/tests/delivery-photo-batch.test.ts functions/tests/photo-batch-boundary.test.ts --maxWorkers=2
npx playwright test tests/e2e/delivery-planning.spec.ts tests/e2e/photo-batch.spec.ts tests/e2e/customer-ceramic-navigation.spec.ts --workers=2
npm run typecheck
npm run build:hosting
npm run verify:pwa:build
npm run verify:hosting:build
npm run verify:performance:build
```

서버 통합 검사는 자격 증명이 없는 `demo-onnuriway` Firestore 에뮬레이터에서 `scripts/run-delivery-planning-gate.ts`와 `scripts/run-photo-batch-gate.ts`를 실행한다. 실행기 `output/photo-batch/run-emulator.ts`가 운영 자격 증명 환경 변수를 제거한다. 실제 추출 결과 재사용 검사는 `output/photo-batch/run-actual-emulator.ts`로 별도 실행한다.

최종 단위 67개와 에뮬레이터 38개가 통과했다. 실제 추출 결과 재사용 검사는 별도 6개가 통과했다. 사진 등록·경로의 브라우저 검사 42개와 내비게이션 22개가 통과했다. 화면 코드 분리 뒤 관련 내비게이션 4개와 캡처용 2개를 추가로 재실행해 통과했다. 전체 lint, 이후 수정 범위 lint, Functions build, Hosting build, PWA·Hosting·성능 gate가 통과했다.

처음에는 새 확인 화면이 기존 준비 화면의 JavaScript와 CSS 한도를 넘었다. 확인할 행이 생길 때 리뷰 화면을, 줄임말 영역을 열 때 관리 화면을, 사진을 선택할 때 이미지 준비 코드를 불러오도록 분리했다. 기존 준비 화면은 gzip 8,087B와 CSS 8,118B raw·2,344B gzip으로 기존 한도에 들어간다. 새 확인·별칭 영역은 JavaScript 3,820B gzip, CSS 2,731B raw·855B gzip이다. 이미지 준비는 701B gzip이다. 모든 분리 자산의 PWA 사전 캐시도 검사했다.

동일 모델의 독립 검토에서 정식 상호로 다시 선택했을 때 숨겨진 별칭 입력이 저장을 막거나 전송될 수 있는 문제를 찾았다. 표시·검사·전송에 동일한 조건을 적용했고 빈 입력과 남아 있는 입력을 각각 브라우저에서 검증했다. 후속 검토에서 추가 결함을 찾지 못했다.

운영 배포에는 별도 승인이 필요하다. 신규 서버를 먼저 준비하고 Hosting을 반영해야 하며, 이 작업에서 배포나 비밀 키 변경은 수행하지 않았다. 실물 휴대폰 카메라 전환과 배포된 신규 Callable 연결은 아직 검증하지 않았다.
