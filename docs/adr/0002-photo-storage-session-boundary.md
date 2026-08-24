# ADR 0002: Photo storage and session revocation boundary

- 상태: 승인
- 날짜: 2026-08-23

## 결정

- Cloud Storage의 Client SDK 직접 읽기·쓰기는 기본 DENY한다.
- 사진 업로드와 다운로드는 HTTPS/Callable 서버 경계를 통과하며 App Check, Firebase Auth, 직원 활성 상태, 역할, `sessionVersion`, 학교·슬롯 권한을 매 요청 검증한다.
- 업로드 전 Client에서 이미지 크기를 제한하고 압축하며, 서버는 EXIF 제거·방향 보정·WebP 파생본 생성 후 버전 경로에 저장한다.
- Offline 사진은 사용자·역할·사진 버전 Namespace로 격리한다. 세션 무효화 감지 시 앱이 해당 Namespace를 제거한다.

## 결과

관리자 세션 폐기 후 새 네트워크 요청은 즉시 거부된다. 이미 기기에 내려받은 Offline 복사본은 원격 회수가 불가능하므로 신뢰 기기 정책, 로그아웃 정리, 짧은 Cache 수명과 기기 분실 운영 절차로 위험을 제한한다.
