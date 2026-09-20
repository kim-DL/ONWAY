# Phase 38 — 모바일 앨범 처리·전경사진·검색 위치

2026-09-06~07. Galaxy S20+의 앨범 선택 실패 신고에 대한 후속 개선.

## 확인한 사실과 한계

- 사용자가 제공한 Google Keep 다운로드본은 3024×4032, 2,215,707바이트의
  정상 JPEG(sRGB, EXIF 회전값 없음)다. PC Chromium에서는 기존 원본 미리보기와
  수정된 준비/미리보기가 모두 성공했다. 로컬 메모리에서 실제 브라우저 디코딩과
  1920×2560 WebP 변환도 확인했다. 사용자 사진을 저장소/테스트 fixture에 복사하거나
  외부·운영 서비스로 업로드하지 않았다.
- Google Keep을 거친 파일이므로 휴대폰 원본과 바이트/메타데이터가 동일하다고
  가정하지 않는다. 실제 Galaxy 앨범의 최초 실패는 PC에서 재현되지 않았다.
  이번 수정이 해당 기기의 실패를 제거했는지는 실기기 재확인이 필요하다.
- 문제 안내는 Firebase 업로드 오류가 아니라 선택한 원본을 바로 표시하던
  SelectedPhotoPreview의 img onError였다. 당시 이 안내만으로 저장이 차단되는
  구조는 아니었다. 조사한 운영 사진 호출은 업로드 1건/조회 8건 HTTP 200,
  Auth/App Check VALID였으며 조사 범위에서 4xx/5xx·서버 내부 오류는 없었다.
- 기존 사진 선택은 파일 내용을 읽기 전에 input.value를 비웠고, 미리보기와 저장이
  원본을 각각 디코딩했다. 임시 파일 참조와 중복 메모리 사용 위험을 보완했지만
  둘 중 하나가 원래 Galaxy 실패의 확정 원인이라고 주장하지 않는다.

## 구현

- 촬영/앨범 입력은 image/*로 시스템 선택기에 전달하고 실제 파일 바이트로 JPEG,
  PNG, WebP, AVIF를 검증한다. 원본 30MB/서버 업로드 10MB 한도는 유지한다.
  AVIF는 ftyp의 major/compatible 브랜드 모두 확인해 mif1 + avif를 HEIC로
  오판하지 않는다. 박스 경계·정렬을 확인하고 minor-version/박스 밖 데이터는 제외한다.
- 선택한 원본을 끝까지 읽어 앱이 소유한 독립 File을 만든 뒤 native input을 비운다.
  Blob.arrayBuffer 읽기가 실패하면 FileReader로 한 번 재시도한다. 부분 읽기와
  읽기 실패, 지원하지 않는 내용, 이미지 변환 실패를 다른 안내로 표시한다.
- 미리보기/저장은 하나의 준비 Promise를 공유한다. 원본 반복 디코딩을 없애고
  실패한 준비는 캐시에서 빼 다시 시도할 수 있게 한다. 표시 실패 후에는 다시 준비를
  제공하며 기존에 선택한 정상 사진은 새 파일 읽기 실패/선택 취소로 지우지 않는다.
- 파일 읽기 중에는 사진 교체/제거/저장을 잠근다. 버튼 외 Enter/requestSubmit도
  동기 ref로 차단한다. 읽기 중 닫기는 미저장 변경으로 확인하고 늦은 응답은 폐기한다.
- 카드/편집 미리보기는 object-fit: cover로 가로 프레임을 채운다. 이는 표시 방식만의
  변경이며 전체 사진 뷰어는 contain/확대·이동을 유지한다.
- 검색을 열면 웰컴 장식/제목/보조 버튼을 접고 입력과 닫기를 한 줄에 둔다.
  검색 결과와 최근 거래처는 입력 바로 아래에 배치한다. 검색 종료 후 원래 검색 버튼으로
  초점을 되돌리고 한글 조합 중 Enter/Escape는 검색을 닫거나 키보드를 내리지 않는다.
- 비공개 Blob URL 등록/해제와 기존 인증·App Check·서버 재검증은 유지한다.
  공개 이미지 URL이나 서비스워커 이미지 캐시를 추가하지 않는다.

HEIC/HEVC는 현재 지원하지 않는다. 잘못된 .jpg/MIME로 전달돼도 헤더로 식별해
JPEG 전환을 안내한다. 이번 사용자 샘플은 JPEG이며 HEIC 문제라고 단정하지 않았다.
설치된 Sharp/libheif의 HEVC 디코더 부재도 확인했으므로 MIME만 확장해 지원하는
척하지 않는다. 별도 대형 코덱 의존성은 추가하지 않았다.

기술 참고: [File API 읽기 오류](https://www.w3.org/TR/FileAPI/#errorsAndExceptions),
[Sharp HEIF 빌드/코덱 조건](https://sharp.pixelplumbing.com/api-output/#heif).
[AVIF 호환 브랜드 규격](https://aomediacodec.github.io/av1-avif/v1.2.0.html#image-and-image-collection-brand).

## 검증

- 전체 단위 테스트: 903 통과/3 skipped, 94개 파일 통과/1 skipped.
- 앱/Functions TypeScript, 전체 ESLint, diff-check 통과.
- demo Firebase Auth·Firestore·Storage·Functions + production-mode Next 통합:
  거래처 등록/수정/사진 업로드·조회·교체·삭제·권한·검색 16/16 통과.
- 독립 Chromium 모바일/데스크톱 사진·화면 검증 24/24 통과:
  native input 초기화 시점, 읽기 중 잠금, 단일 decode 공유, 손상 JPEG 재시도,
  HEIC 오표기, FileReader 대체 성공/양쪽 읽기 실패, 세로 사진 채움, 기존 회귀 포함.
  AVIF compatible-brand 수정 후 24개를 다시 실행해 모두 통과했다. 독립 리뷰에서
  실제 합성 mif1 + avif 사진의 타입 식별과 WebP 디코딩도 확인했다.
- 검색 화면 8/8 통과: 320/390px, 키보드 축소 영역, 결과 시작점이
  입력틀 아래 56px 이내, 한글 IME, 검색 종료/초점 복귀, 빈 결과, 초성/최근 거래처,
  200% 글자 확대, 고대비 검사. 합성 자료 화면을 육안 확인했다.
- PWA 아이콘/서비스워커 검사 및 지연 로딩 경계 검사 통과.
- 초기 JavaScript 468,660B raw/139,497B gzip, 최대 JS 청크 66,843B gzip.
  초기/학교·영업/공통 CSS의 기존 예산은 유지한다. 이번 추가 처리를 포함한 거래처
  전용 지연 자산은 CSS 48,640B raw/9,727B gzip, JS 33,090B gzip이다.
  이 전용 예산만 48KiB/9.75KiB/33KiB로 좁게 조정했다. 의존성 추가 없음.

## 배포

Vercel 기존 onnuriway 프로젝트의 운영 환경으로 원격 빌드한다. demo emulator의
로컬 .next 산출물을 재사용하지 않는다. 이번 변경은 프런트엔드 전용이므로
Firebase 함수/보안 규칙/버킷/도메인 설정은 변경 배포하지 않는다.

- Vercel 운영 원격 빌드/TypeScript 통과, READY 확인:
  `dpl_EPvRnEYeM6UdjSrSMgMriWFwVbWJ`.
  불변 배포: https://onnuriway-n4odwp3mv-daeins-projects.vercel.app
  독립 inspect에서 onnuriway.vercel.app, onnuriway.com, www.onnuriway.com의
  기존 운영 별칭이 이 배포에 연결됨을 확인했다.
- 해당 배포 error 로그 조회 성공/반환 0건. 배포 직후 짧은 확인이며 장기 관찰이나
  갤럭시 앨범 오류 해소의 증거로 간주하지 않는다. 모니터링 설정은 변경하지 않았다.
- 실제 Chrome의 onnuriway.vercel.app에서 PWA 업데이트 버튼으로 새 버전을 적용했다.
  기존 로그인 세션이 유지되었고 검색 시 웰컴 제목이 접히는 새 화면을 확인했다.
  초성 검색 결과 1곳/길안내 1개, 입력 텍스트 영역 하단→첫 카드 간격 57 CSS px,
  닫기 후 기존 검색 버튼 초점 복귀를 확인했다. 운영 고객 자료/사진을 쓰지 않았다.
  새 PIN 로그인, 실제 Galaxy 카메라/앨범 실행은 이 운영 확인에 포함하지 않는다.

디자인 스킬은 기존 톤 보존, 검색 시 불필요한 장식 접기와 사진 프레임 채움에
적용했다. 모바일 에뮬레이션은 물리 Galaxy S20+ 앨범/카메라 실행을 대체하지 않는다.
