# 납품사진 헤더 Hosting 릴리스

2026-11-04 21:02 KST. 사용자가 로컬 헤더 수정의 배포를 명시적으로 승인했다.

납품사진 제목 오른쪽으로 거래처 복귀 버튼을 이동했다. 새 SVG 복귀 아이콘과 짧은 ‘거래처’ 표시를 적용하되, 접근성 이름 ‘거래처로 돌아가기’와 기존 복귀 동작을 유지했다. 별도 상단 줄을 제거하고 상단 padding을4px로 조정했다. 44px 터치 높이와 키보드 복귀를 유지했다. 사진 저장·재시도·권한 처리 변경은 없다.

- [PR #8](https://github.com/kim-DL/ONWAY/pull/8), 후보2544436de339aa50abd2c768999d0d721b98db8e, main 병합f0c4066ff72a34954ecaae2508c8dd7208599b4f.
- 독립 검토와 자동 코드 리뷰 PASS. 로컬 브라우저4개(320/390/430/1280px), 아이콘37개, 헤더 단위4개, lint·build·PWA/성능/Hosting gate 통과. 예산 한도 변경 없음.
- [후보 Quality Gate](https://github.com/kim-DL/ONWAY/actions/runs/41824050270) 전체 성공. 단위1875통과/15조건부skip, 브라우저422통과/8skip, 전체 사용자흐름83통과/19skip. CI 재실행과 flaky 없음. 조건에 따라 제외된 job은 통과로 집계하지 않았다.
- 후보와 main 병합 커밋의 트리가 같고 작업트리가 깨끗한지 확인했다. 배포 직전에 candidate manifest의 모든 해시를 확인했다.
- --project onnuriway --only hosting:onnuriway --non-interactive로 Hosting만 배포했다. 새 버전5689ce4f10d5cff8, 배포 시각2026-11-04T12:02:06.887Z, 직전 버전51a6090b8e139b80.
- [onnuriway.com](https://onnuriway.com)과 [onnuriway.web.app](https://onnuriway.web.app)의 공개 Hosting 검사가 모두 통과했다. 각 주소 JS/CSS94개 해시가 배포 후보와 일치했다. 배포 대상122파일과 후보 복사본을 보존했다.
- Functions·Rules·Auth 설정·운영 데이터·자격 증명은 변경하지 않았다. 운영 로그인과 실제 휴대폰·설치형PWA 검증은 하지 않았다. 공개 GET/HEAD 검사와 로컬 합성 UI 검증을 구분한다.

증거는 output/photo-header-20261104/의 candidate-manifest.json, deploy.log, hosting-before/after.json, public-custom.log, public-firebase.log, public-asset-hashes.json 및 로컬 검사 로그에 있다. 390px 캡처는 output/playwright/photo-header-detail-mobile-chromium.png다. 초기 검증 실패와 수정 과정은 이 작업의 로컬 report.md에 기록했다.
