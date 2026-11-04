# 납품사진·재고 안정화 Hosting 릴리스

2026-11-04 20:27 KST. 사용자가 오늘의 두 개선 작업 모두 main 반영과 Hosting 배포를 승인했다.

## 반영 범위

- 재고 카드의 불필요한 재렌더링 감소, 오래된 조회 응답·요청 종료 경쟁 차단.
- 납품처 편집 시작 시점의 목록과 revision 보존. 다른 기기의 갱신으로 이전 초안이 최신 revision을 사용하지 않도록 보호.
- 납품사진 원본 우선 기기 보관, pagehide 중 잘못된 폐기 방지, 불변 사진 payload와 가변 작업 상태 분리.
- 재연결·화면 복귀 재시도와 기기 보관/서버 완료 안내 구분.

두 작업 31파일을 [PR #7](https://github.com/kim-DL/ONWAY/pull/7)로 병합했다. 후보 커밋은 `b28f8872813986d64104a4e8ba4ce174b89424e4`, main 병합 커밋은 `0f3916fc1b4eeed2877e29783180d3420f54efeb`이다. 후보와 병합 커밋의 트리가 동일함을 확인했다. 독립 검토와 GitHub 자동 코드 리뷰는 중요한 지적 없이 완료됐다.

## 검증과 배포

- [후보 Quality Gate](https://github.com/kim-DL/ONWAY/actions/runs/41819566659)는 필수14항목 통과. 조건에 따라 제외된3항목은 통과로 세지 않았다. 실행 재시도 없음.
- CI 전체 단위1874통과/15조건부 skip. 브라우저420통과/8skip. 전체 사용자 흐름83통과/19skip.
- 로컬의 두 작업 브라우저 회귀20개와 사진 보관18개 통과. 로컬 전체 단위는 공유 node_modules의 vendored 경로 검사1개 환경 실패가 있었으나 원래 설치 경로에서 해당3개 통과, CI의 새 설치에서 전체 통과했다.
- 로컬 production build, lint, PWA/성능/Hosting gate 통과. 운영 프로젝트 설정과 기능 플래그, emulator OFF를 Hosting gate로 확인했다.
- `--project onnuriway --only hosting:onnuriway --non-interactive`로 Firebase Hosting만 배포했다. Functions/Rules/Auth/Storage 데이터 및 자격 증명은 변경하지 않았다.
- 새 Hosting version은 `51a6090b8e139b80`, release time은 `2026-11-04T11:27:34.954Z`이다. 직전 version은 `91dbd23e04c70e0a`였다.
- 배포 후보122파일 manifest와 산출물 복사본을 보관했다. [onnuriway.com](https://onnuriway.com)과 [onnuriway.web.app](https://onnuriway.web.app)의 공개 Hosting 검사 모두 통과했다. 두 주소 각각 JS/CSS94개 해시가 후보와 일치했다.

## 검증 경계와 복구 주의

실제 iPhone/Android 카메라, 잠금·강제 종료, 설치형PWA 업데이트와 운영 계정의 인증/App Check는 이번 공개 검증에 포함하지 않았다. 브라우저가 OS에 의해 정지한 동안 업로드 완료를 보장하지 않는다. 기기 보관 transaction 완료 후 다시 앱을 열 때 복구하는 방식이다.

보관함 DBv2 이후 구v1 번들은 VersionError로 재연결·정리에 실패할 수 있다. 이전 Hosting version으로 단순 복귀하거나 사진 보관함을 삭제하는 것을 안전한 롤백으로 취급하지 않는다. 구버전 탭과 롤백은 v2를 읽는 코드로 복구해야 한다. 직전 버전 번호는 감사 기록이며 무조건적인 롤백 승인이 아니다.

세부 로컬 자료는 `output/local-quality-20261104`, `output/photo-durability-20261104`, 격리 릴리스 폴더 `C:/Users/HOME/Desktop/onnuriway-photo-release/output/photo-release`에 있다. 원래 미커밋 작업은 로컬 stash에 백업한 뒤 main을 fast-forward하여 모두 보존했다.
