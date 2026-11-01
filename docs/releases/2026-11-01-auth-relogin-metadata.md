# PIN 재로그인 로딩 복구 — 2026-11-01

## 원인

AuthProvider는 `fromCache`인 authz 스냅샷을 인증 근거로 사용하지 않는다. 그런데 `onSnapshot`에 메타데이터 변경 수신 옵션이 없어서, 캐시와 서버 문서 내용이 같고 fromCache만 true에서 false로 바뀔 때 서버 확인 콜백이 생략됐다. 로그아웃은 검증된 앱 세션 캐시를 지우지만 Firestore 메모리 캐시를 비우지 않으므로 동일 계정 재로그인에서 발생할 수 있다.

[Firebase 공식 문서](https://firebase.google.com/docs/firestore/manage-data/enable-offline)의 fromCache 의존 리스너 요구사항과 로컬 SDK 재현 결과가 일치한다. 운영 기기 내부 로그를 직접 수집한 것은 아니다.

## 수정과 검증

- authz 구독에 `includeMetadataChanges: true`만 추가. 서버에서 확인된 권한만 승인/취소하며 세대 번호, App Check, PIN 검증, 권한 검증은 유지한다.
- 실제 AuthProvider의 로그인 → 로그아웃 → 동일 계정 로그인 회귀 추가. 캐시만 도착했을 때 resolving, 서버 확인 뒤 authenticated 및 검증 캐시 저장을 확인.
- 수정 전 신규 회귀가 resolving에 남아 실패함을 확인, 수정 후 관련 인증/도메인 테스트 58개와 lint 통과.
- 로컬 demo-onnuriway Firestore 에뮬레이터와 실제 Firebase SDK에서 옵션 false 이벤트 `[true]`, true 이벤트 `[true,false]`를 확인. 운영 데이터 사용/변경 없음.
- 증거: `output/auth-relogin-restore/`. 실제 휴대폰 및 운영 PIN 로그인은 미검증.

## 배포

운영 build와 필수 산출물 검사 후 Hosting 복구 결과를 기록한다.
