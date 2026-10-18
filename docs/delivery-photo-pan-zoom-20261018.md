# 거래처 납품사진 Pan & Zoom — 2026-10-18

## 적용 범위와 공통화

기준 main `be494755694b07cfe080f8ba6c4f8672a7a45e20`의 재고 Pan & Zoom을 거래처의 **저장된 납품사진**과 **촬영 후 업로드 중인 로컬 미리보기**에 함께 적용했다. PC 커서 중심 휠·드래그·더블클릭, 모바일 핀치·한 손가락 이동·더블탭, 맞춤 1배·빠른 확대 1.8배·최대 2.5배/충분한 실제 픽셀일 때 3배, 배율·조작 안내·확대/축소/화면 맞춤을 동일하게 제공한다.

재고 전용 파일의 제스처·기하 계산·조작 UI/CSS를 `src/components/ui/photo-{gestures,geometry,pan-zoom}`으로 옮겼다. 재고 뷰어와 납품사진 두 진입점은 같은 `PhotoPanZoom`을 지연 로딩하며 실행 의존성을 추가하지 않았다. 이동량마다 React를 다시 렌더하지 않고 기존 frame·pointer capture·경계·취소·resize·가려진 창 복구·해제 계약을 재사용한다.

저장된 납품사진은 기존 인증된 evidence 조회와 Blob URL 소유권을 그대로 사용한다. 확대 도중의 드래그·방향키는 현재 사진 이동이며 다른 사진으로 넘기지 않는다. 화면 맞춤일 때만 한 포인터 수평 swipe(60px 초과, 수직보다 큰 이동)와 좌우 방향키로 넘긴다. 핀치·포인터 취소는 넘기기를 유발하지 않는다. 명시적 이전/다음 버튼은 유지하고 사진을 바꾸면 100%로 초기화한다. 사진 전환 중에는 바깥 썸네일에 포커스를 복원하지 않고 전체 뷰어가 닫힐 때 복원한다.

촬영 미리보기는 별도 `delivery-photo-local-preview` 경계에서 열린다. 기존 outbox의 `preview.full`을 사용하며 이미지 바이트를 다시 복사·조회·업로드하지 않는다. 업로드 중에도 확대할 수 있고 서버 응답에 따른 상태 변경이 뷰어의 확대를 초기화하지 않는다. 확인/닫기/Back 뒤 미리보기 버튼에 포커스를 복원한다. coordinator·보관 한도·동시 업로드·재시도·복구·서버 저장 완료 판정은 변경하지 않았다.

## 검증

- 전체 unit **1,746 PASS / 기존 emulator 조건 15 SKIP**. 납품사진과 공통 geometry 선택 단위 **94 PASS**.
- 재고·납품사진 Chromium PC/모바일 조작 합계 **20 PASS / 플랫폼 분리 4 SKIP**. 이 중 새 납품사진은 10 PASS / 2 SKIP이다. 실제 mouse wheel/drag/double click, Chromium CDP native touch의 저장 사진 핀치·남은 손가락 이동·더블탭·취소 뒤 복구·맞춤 swipe와 촬영 미리보기 핀치를 검사했다.
- Windows Playwright WebKit desktop 합계 **10 PASS / Chromium native touch 전용 2 SKIP**. 새 납품사진은 5 PASS / 1 SKIP이다.
- 이전/다음·키보드·사진별 확대 초기화, 실패 후 재조회, 기존 이미지 hook의 Blob URL 교체/닫기 해제, 저장 확인 전 pending 유지, 상태 갱신 중 확대 유지, 320px/200% 글자·axe를 검사했다.
- `aside-browser`로 localhost 합성 사진의 실제 뷰어/업로드 패널을 직접 조작했다. 저장 사진의 180% 빠른 확대·220% 휠 확대·약 85px 이동 후 순서 유지·다음 사진 100% 초기화·닫기 포커스 복원, 촬영 미리보기의 180% 확대·확인 후 업로드 중 상태와 포커스 유지를 확인했다.
- 전체 lint·app/Functions typecheck PASS. production-mode build·PWA·성능·Hosting artifact gate PASS. 최초 새 테스트의 중복 닫기 선택자를 header의 명시적 label로 좁혔고, 합성 브라우저 window 타입을 명시했다. 제품 동작이나 검사 assertion을 완화하지 않았다.

합성 컴포넌트 회귀는 실제 viewer·image hook·upload panel·제스처를 사용하고 인증 I/O·private registry·삭제만 대체한다. 최종 source의 실제 demo 인증·Callable·Firestore·Storage 납품사진 회귀 **16 PASS**, 재고 static PWA 업무 회귀 **18 PASS**와 transaction integration **12 PASS**를 별도로 확인했다. 실제 iPhone Safari/설치 PWA의 손가락·OS 제스처·lifecycle은 아직 확인하지 않았다. 운영 업무 데이터를 테스트에 사용하지 않는다.

## 성능과 운영 반영

기존 workspace/viewer/preview의 JS·CSS 상한은 유지했다. 촬영 확인에만 필요한 CSS를 새 지연 경계로 분리해 기존 preview CSS 2KiB raw 상한을 유지하고, 새 inspection 경계는 JS 2KiB/CSS raw 1KiB·gzip 512B로 제한한다. 세 `photo-pan-zoom` 호출 경계가 같은 물리 자산을 사용하며 로그인·다른 업무로 유입되지 않고 PWA precache에 포함되는지 검사한다. 공통 조작부의 기존 JS 6KiB/CSS raw 2KiB·gzip .75KiB 상한도 유지한다.

같은 PC·기존 운영 설정 production-mode 비교에서 initial JS gzip **140,071→140,103B(+32B)**, 납품사진 workspace **10,160→10,160B**, 저장 사진 viewer **2,918→2,941B**, 공통 Pan & Zoom **3,306→3,408B**, 공통 조작 CSS **473→462B**, 재고와 사진을 모두 연 JS **28,822→28,926B**다. 이는 용량 실측이며 현장 네트워크·기기 지연 측정은 아니다.

사용자의 같은 기능 추가 적용 요청에 따라 앞선 Git/Hosting 작업 범위를 이어서 완료했다. 최종 제품 source **`3493d7b84285d9ef89aabecd7541cf50d75ad6fe`**의 전체 [Quality Gate](https://github.com/kim-DL/ONWAY/actions/runs/39099168789) 성공 후 clean main·새 production build/113파일 manifest를 확인해 **2026-10-18 14:25:33.437 KST** `--project onnuriway --only hosting:onnuriway`로 배포했다. Live version은 `b9cbb96b32a7bc6c`다. 두 origin 검사 각 25개, 새 서비스 워커 activated·page error 0을 확인했다. Functions 72개·MCP 전용 Hosting·비공개 env 3종은 전후 동일하다. 로컬 demo 빌드는 배포하지 않았다. 기존 인사 애니메이션 검사 2건의 재시도 통과 등 전체 CI 세부 결과와 공개 검증 범위는 [릴리스 기록](releases/2026-10-18-delivery-photo-pan-zoom.md)을 따른다.
