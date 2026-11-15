# 재고 실사 표시와 작업 버튼 정리

사용자는 실사 완료 아이콘과 입고·출고·조정 버튼의 색과 아이콘에 대한 직원 피드백을 전달했고, 레퍼런스를 검토해 가장 적합한 안을 골라 적용하고 만족할 만하면 운영 배포하도록 요청했다. 기준 main은 `d030f7c`, 작업 브랜치는 `codex/inventory-action-icons`다.

## 점검과 방향

기존 목록은 `✓`·`↻` 글자를 원 안에 넣고 완료 상태를 진한 초록 면으로 채웠다. 글꼴에 따라 선과 중심이 달라지며 재확인 기호도 작은 원에 몰려 있었다. 상세의 출고·입고·조정·정보 수정·수량 일치는 주황·파랑·보라·청록·초록 면을 각각 사용해 정보보다 버튼 색이 먼저 보였다. 조정의 톱니는 설정의 의미와 겹쳤고 버튼 본문은14px이었다.

Unslop UI의 polish mode로 이 부분만 다듬었다. 기존 유리·세라믹 표현, 한국어 폰트, 재고 목록 구조와 업무 순서는 유지했다. 이 점검 기준은 Damir Sokolovsky의 [Unslop](https://heydamir.design/unslop), CC BY4.0에 따른다.

- 제품: 냉장·냉동 식품의 재고와 실물 수량을 확인하는 직원 업무 화면
- 성격: 차분함, 정확함, 정돈된 선
- 재질: 기존 펄 표면과 유리 위의 짙은 잉크색
- 중심: 제품명·수량이 먼저 읽히고, 완료 표시는 확인 결과만 전달
- 공통 표현: 원형 확인 표시와 동일한 받침선을 쓰는 입고·출고 화살표

## 참고 자료와 선택

2026-11-15에 아래 공식 자료를 확인했다. Aside 프로필은 연결되지 않은 상태여서 공개 웹 조회로 대체했다. 운영 사진·직원 정보는 외부로 보내지 않았다.

| 참고 자료 | 채택한 요소 |
| --- | --- |
| [Lucide circle-check](https://lucide.dev/icons/circle-check) | 장식 배지 대신 채움 없는 원과 체크로 완료를 전달 |
| [Lucide arrow-down-to-line](https://lucide.dev/icons/arrow-down-to-line) | 받침선으로 들어가는 방향을 입고에 연결 |
| [Lucide arrow-up-from-line](https://lucide.dev/icons/arrow-up-from-line) | 같은 받침선에서 나오는 방향을 출고에 연결 |
| [Lucide sliders-horizontal](https://lucide.dev/icons/sliders-horizontal) | 설정 톱니 대신 수치 조정의 의미를 전달 |
| [Radix Button](https://www.radix-ui.com/themes/docs/components/button) | neutral/soft 표현과 명확한 글자 대비 |
| [Carbon Button](https://www.carbondesignsystem.com/building-blocks/core/components/button/guidelines) | 동작과 관련된 아이콘, 기능 이름을 남기는 버튼 구분 |

위 의미와 표현을 참고해 급식길의 재고 전용 SVG 기하를 작성했다. 라이브러리·의존성·이미지 파일은 추가하지 않았다. 공용 `Icon` 전체에 경로를 추가하지 않고 재고 모듈 안에서만 공유한다.

## 적용

목록의 완료·재확인·미확인 표시는 각각 원형 체크·회전 화살표·빈 원 SVG다.22px,24px 슬롯,1.65 stroke와 둥근 선 끝을 쓴다. 진한 초록 채움은 제거했고 완료는 짙은 잉크색, 재확인은 기존 황갈색 의미를 유지한다. 상태 문구와 접근성 설명은 그대로이므로 색만으로 구분하지 않는다. 실사 모드·날짜·권한·서버 확인에 따른 표시 판단은 바꾸지 않았다.

상세의 출고·입고·조정·정보 수정은 받침선 화살표·슬라이더·문서 편집 아이콘으로 교체했다. 수량 일치는 목록과 같은 원형 체크, 더보기는 동일 크기의 점 SVG다. 모든 아이콘은22px·1.65 stroke, 글자는16px·600으로 맞췄다. 버튼은 펄 그레이의 작은 명도 차이와 짙은 잉크색을 쓰고, 수량 일치에만 약한 청회색 강조를 남겼다. 기존 다섯 색상과 미사용 클래스는 제거했다. 초점·hover·disabled·고대비 표현과 최소44px 누름 영역을 유지했다.

## 확인

실제 `InventoryCard`·`InventoryDetail`·입출고 폼을 로컬 합성 데이터에 연결해 Playwright CLI로 확인했다. 운영 저장은 하지 않았다.320·390·1280px에서 가로 넘침과 버튼 내부 잘림이 없었다.320px의 정보 수정은 두 줄이 되고 네 버튼은 같은 높이92.78px로 정렬된다.390px에서는83×72px, PC에서는111.5×72px이다.

완료·재확인·미확인의 SVG가 서로 다른지, 실사 모드를 끄면 아이콘이 숨는지 확인했다. 출고·입고·조정·더보기는 기존 화면을 열고 Escape로 돌아왔다. 키보드 Tab의3px 초점 표시, 고대비에서도 남는 상태 형태, 읽기 전용에서 작업 미노출, 최신 재고 확인 중 작업 비활성을 확인했다. 브라우저 JavaScript 오류는0이었다. 본문·수량·상태 계산과 호출 핸들러는 변경하지 않았다.

변경된 목록의 순서 이동 후 초점 복귀,600개 목록의 화면 밖 탐색·대화상자 복귀·접근성을 다루는 기존 모바일 브라우저2개도 첫 실행에 통과했다. 앱 타입 검사와 변경 TSX lint가 통과했다. SVG와 CSS 변경이므로 별도 서버·단위·에뮬레이터 회귀는 반복하지 않았다.

초기 로컬 합성 화면의 상대 경로 오류를 수정했고, 소스 스타일의 Tailwind 빌드 지시문을 브라우저 CSS로 직접 읽던404도 합성 화면에서 제거했다. 제품 오류나 제품 코드 우회가 아니며 기존 통과 결과와 구분한다. 합성 화면·전후 캡처·검증 로그는 ignored `output/playwright/inventory-actions-20261115/`에 있다.

## 릴리스 상태

운영용 Hosting 빌드와 성능·PWA·Hosting 산출물 확인이 모두 첫 실행에 통과했다. 최초 JS는gzip144050B로 그대로이며 재고 CSS는raw30377B·gzip6850B, 재고 JS는gzip25471B로 기존 예산 안에 있다. 정적 파일145개·사전 캐시129개이며 제품 파일4개와 Hosting145개 파일의 SHA-256을 `release-candidate.json`에 고정했다. 이 산출물을 다시 빌드하지 않고 배포한다.

사용자의 기존 중복 검사 금지 지시에 따라 전체 원격 CI·전체 회귀를 반복하지 않았다. 승인 범위인 Hosting `onnuriway`만 배포했고 Functions·Rules·인증·직원 세션·운영 데이터 변경은 없다. 버튼 글자 대비는 가장 어두운 펄 그레이 면 기준8.59:1, 수량 일치7.52:1, 완료 표시6.77:1, 미확인 아이콘3.33:1이다.

| 항목 | 최종 결과 |
| --- | --- |
| 소스 커밋 | `78d77b843e91b74c82599e68a3e91e737a9f5ff3` |
| main 병합 | `0c3575859c2d8ff8873d8aaeb761e3b3d84b103d`, 원격 동기화 완료 |
| Hosting | `26b244f30104c8a2`,2026-11-15 12:27:25 KST |
| 배포 대상 | `--project onnuriway --only hosting:onnuriway --non-interactive` |
| 후보 확인 | 병합 후 제품4개·Hosting145개 해시 일치, 빌드/통과 검사 재실행 없음 |
| 공개 확인 | `https://onnuriway.com`, `https://onnuriway.web.app` 각각36개 응답 확인·145개 파일 SHA-256 일치 |
| 이전 Hosting | `e1ccf66dbdbcfc1d` |

`browser-verification.json`·`browser-check.log`·`list-browser.log`·`typecheck.log`·`lint.log`는 관련 검증, `build.log`·`performance.log`·`pwa.log`·`hosting-build.log`는 최종 산출물 검증이다. `release-candidate.json`·`deploy-hosting.log`·`release-verification.json`·`public-domain.json`·`public-firebase.json`·`public-artifact-hashes.json`은 고정 후보와 최종 배포/공개 확인 근거다. 원시 Hosting 응답의 계정 메타데이터는 ignored 폴더에만 보관하며 커밋하지 않았다. 전후 캡처는 합성 데이터다.

실물 휴대폰·설치 PWA·인증된 실제 재고 저장은 이번 검증 범위에 포함하지 않았다.
