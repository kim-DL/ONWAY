# 재고 앱 설정 Hosting 릴리스

- 승인: 사용자가 main 병합·Hosting 배포를 요청하고 전체 검사 대신 간단한 검사를 명시했다. 이번 릴리스에 한해 전체 CI를 실행하지 않았으며 `[skip ci]`로 자동 실행을 생략했다. 생략은 CI 통과로 보고하지 않는다. 기존 CI 규칙 자체는 변경하지 않았다.
- 제품 소스 `e28adca9bd7954cd5a411ba2639e06a996cfb9b5`. `b71bc03` 구현을 main에 병합하고 불필요한 메뉴 스타일 선언 두 개를 제거했다. main을 origin에 push했다.
- 기존 관련 단위 34개·브라우저 12개·TypeScript·변경 파일 lint 통과 결과 재사용. 스타일 정리 후 관련 화면 회귀 2개 통과. 전체 회귀는 실행하지 않았다.
- 운영 build·PWA·성능·Hosting 검사 통과. 초기 재고 CSS gzip 6664B가 예산 6656B를 8B 초과해 중복 선언을 정리했다. 최종 6656B 통과, 예산 변경 없음.
- 사진·재고 ON, emulator OFF. 로컬 생산 빌드의 PWA revision은 기본 UUID이며 소스와 117개 산출물 해시를 candidate manifest로 연결했다. 배포 전후 해시 동일.
- 명령: `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project onnuriway --only hosting:onnuriway --non-interactive`.
- **2026-10-31 21:20:51.708 KST**, Hosting version `10ce0ed273e639ad`, release `1793449251708000`. 직전 복구 version `9c55e93a21e26f39`.
- https://onnuriway.com · https://onnuriway.web.app 공개 Hosting 검사 PASS. Aside 새 확인용 탭에서 업데이트 적용 후 실제 로그인된 재고 화면의 하단 탐색 없음, 목록 옵션→앱 설정→재고 복귀를 확인했다. 운영 데이터 쓰기·로그아웃은 수행하지 않았다.
- 조회 전용은 합성 세션 테스트로 확인했으며 운영 조회 전용 계정이나 실제 S26 설치 PWA는 별도 미확인이다. Functions·Rules·Auth는 배포 대상에서 제외했다.
- 상세 증거: ignored `output/inventory-settings-release-20261031/`의 candidate.json, state-before/after.json, 배포·필수 검사·공개 검사 로그.
- 후속 문서 커밋은 제품 재빌드·재배포 없이 Git에 반영한다.
