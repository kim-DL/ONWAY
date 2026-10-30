# Android 설치형 PWA 시스템 버튼 대비 조사

## 확인된 현상과 범위

사용자 관찰: 최신 Android·One UI·Chrome에서 일반 크롬 탭은 정상이고, 홈 화면 설치형 PWA에서 흰 배경에 흰 시스템 내비게이션 아이콘이 표시된다. 정확한 버전 번호는 미확인이다. PC의 adb 연결 목록은 비어 있었고 사용자는 현재 휴대폰 연결이 어렵다고 답했다. 실기기 확인 완료로 취급하지 않는다.

Aside에서 운영 페이지를 읽어 `theme-color=#0b5a84`, color-scheme meta 부재, root color-scheme normal, body 배경 rgb(248,250,252)를 확인했다. 기존 열린 운영 업무 화면의 로그인·데이터·업데이트 버튼은 조작하지 않았다.

## 원인 후보와 수정

밝은 실제 배경과 어두운 테마 힌트가 불일치했다. [Chromium의 설치형 앱 내비게이션 바 변경 코드](https://chromium.googlesource.com/chromium/src/+/0a6ab4f0e2ce17e572b05400ae6eacd7fc5389f0%5E%21/)는 Webapp/WebAPK에서 manifest 색상을 시스템 바에 전달하는 경로를 확인해 준다. 일반 탭 정상·설치형 불량이라는 사용자 관찰과 부합하는 원인 후보지만, 기기의 시스템 바 상태를 측정하지 않았으므로 단독 원인으로 확정하지 않는다. 다른 TWA의 Chrome 버그 보고를 급식길 PWA의 확정 원인으로 사용하지 않는다.

- 공용 themeColor를 `#f8fafc`로 바꿔 HTML meta와 manifest theme_color가 실제 밝은 배경과 일치하도록 했다.
- 초기 viewport에 colorScheme light, 루트 CSS에 color-scheme only light를 추가했다. 현재 밝은 UI에 맞는 브라우저 기본 제어 요소와 자동 어두운 색 변환 방지 힌트다. Android 아이콘을 직접 제어하는 네이티브 API라고 설명하지 않는다.
- 브랜드 강조색·업무색·유리 버튼은 변경하지 않는다. PWA id/start_url/scope/display와 보관 정책도 유지한다.

## 로컬 검증

- metadata/PWA 관련 unit 18 PASS, 앱·Functions typecheck, 관련 lint, 운영 형식 build, PWA·성능·Hosting gate 및 로컬 HTTP 28개 검사 PASS.
- 정적 export manifest의 theme_color/background_color가 모두 #f8fafc, display standalone이며 기존 앱 식별자가 유지됨을 확인했다.
- Aside 360×780에서 HTML meta light와 root computed light only, 밝은 배경, 가로 넘침 없음 확인. prefers-color-scheme dark 에뮬레이션에도 밝은 테마 유지. 캡처는 Android 시스템 바를 포함하지 않는다.
- 증거는 ignored output/android-system-bar-20261031/와 Aside session 2026-10-31_DMLE9JFTnoALuvKS에 있다.

## 남은 확인

운영 배포와 전체 CI는 실행하지 않았다. 일반 탭의 정상 상태는 사용자 관찰, 설치형 실제 버튼 색상은 미검증이다. 배포 후 동일 휴대폰에서 일반 탭/설치형 앱의 새 실행·복귀·키보드 열기/닫기와 시스템 밝음/어두움 설정을 비교해야 한다. Chrome/Android/One UI의 정확한 버전도 함께 기록한다.

[Chrome의 manifest 갱신 안내](https://web.dev/articles/manifest-updates)에 따라 설치 앱의 테마 갱신은 웹 콘텐츠 갱신과 시점이 다를 수 있다. 새 manifest가 설치 앱에 반영됐는지 확인한 뒤 판정한다. 운영 자료가 있는 앱을 검증 목적으로 삭제하거나 저장 데이터를 초기화하지 않는다.
