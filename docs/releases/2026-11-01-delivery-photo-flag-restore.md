# 납품사진 운영 플래그 복구 — 2026-11-01

## 원인과 수정

로그인 갱신 빌드에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 주입하지 않았다. `delivery-photo-feature.ts`는 값이 정확히 true일 때만 활성화하므로 AppShell이 사진 콜백을 전달하지 않았고, CustomerHome의 홀수 마지막 항목 전체 너비 규칙이 등록 버튼에 적용됐다. 디자인 충돌이나 캐시 문제가 아니다. 재고 플래그는 기존 운영 환경 파일에 true로 존재하여 유지됐다.

- 기존 납품사진/재고 기능을 true로 지정하는 `npm run build:hosting` 명령을 추가했다. 다른 환경 변수와 인증 설정은 기존 환경을 사용한다.
- 운영 프로젝트(onnuriway)의 production 빌드에서 두 플래그 중 하나라도 true가 아니면 즉시 실패하도록 방어했다. 개발/합성 환경은 영향을 받지 않는다.
- 거래처 디자인과 최신 로그인 디자인은 변경하지 않았다.

## 관련 검증

- 사진 플래그 누락 시 운영 build가 명확한 오류로 즉시 중단됨을 확인.
- 사진 플래그를 true로 주입한 운영 build/타입, PWA·성능·Hosting gate 통과. 동일 산출물을 재사용하여 반복 빌드하지 않았다.
- 변경 config/스크립트 lint 및 CustomerHome/shell-policy 단위 10개 통과.
- 실제 AppShell/CustomerHome을 사용하는 합성 데이터 화면(390×844)에서 비활성 상태의 3버튼/등록 전체 너비를 재현했다. 활성 상태의 이름으로 찾기/전체보기/납품사진/거래처 등록 2×2 및 사진 화면 진입을 확인했다.
- 실제 휴대폰 및 운영 인증 후 화면은 미검증. 운영 데이터 쓰기 없음.
- 증거: `output/customer-photo-restore/`.

## 배포

운영 Hosting 복구 배포 결과 기록 예정.
