# Phase 3 인증 보안 검토

- 검토일: 2026-08-23
- 대상: PIN Callable, Custom Token, Auth 지속성, Session 폐기, Audit

## 결론

Demo Emulator 범위에서 PIN 원문 노출, 관리자 PIN 우회, 비활성 사용자 로그인, stale Session 유지, 무제한 대입 경로를 발견하지 못했다. 실제 배포 안전성은 App Check 등록, 환경별 Secret, IAM, 운영 Alert가 완료된 뒤 다시 승인해야 한다.

## 확인 항목

| 위협 | 방어 | 검증 |
|---|---|---|
| PIN 원문 유출 | HMAC Index와 scrypt Hash 분리, Client 저장 금지, Audit 민감값 제외 | Unit + Audit E2E |
| Lookup DB 탈취 후 빠른 대입 | 서버 전용 Collection, 비밀 HMAC Key, 별도 scrypt Pepper | Rules + Unit |
| 온라인 무차별 대입 | Lookup 5회 잠금, 출처 30/10분 제한, 점진 잠금 | Functions E2E + Unit |
| 사용자 열거 | 공통 오류 문구, 존재하지 않는 PIN에도 scrypt 수행 | Functions E2E |
| 비활성 직원 | Employee·Authz·Firebase Auth 상태 교차검증 | Functions E2E |
| 관리자 PIN 로그인 | Admin PIN 미발급, Token 발급 전 admin Scope 거부 | Unit + Seed |
| 탈취 Token 장기 사용 | Authz 실시간 구독, Session/Permission Version 비교 | Browser E2E |
| 로그아웃 후 Client 잔류 | Auth Sign-out, 앱 전용 Cache와 Blob URL 정리 | Browser E2E + Code Review |
| Emulator 설정의 운영 유입 | Demo Project 제한, Emulator 플래그 분리, Production App Check Fail Closed | Config Review |

## 남은 운영 위험

- 6자리 PIN의 제한된 탐색 공간은 App Check와 Rate Limit 운영 상태에 의존한다.
- 다중 인스턴스에서도 일관된 제한을 위해 Firestore Transaction을 사용하지만, 운영 전 비용·경합 부하 시험이 필요하다.
- Secret 회전 시 기존 PIN Index와 Hash를 안전하게 재생성하는 Versioned Migration 절차가 아직 없다.
- PIN 재발급·잠금 해제 관리자 UI와 Audit는 후속 관리자 Phase 범위다.
- Firebase Auth ID Token의 기본 만료 이전에도 authz 실시간 감시로 Client를 폐기하지만, 별도 백엔드 요청은 매 요청마다 동일한 Session 검증을 계속 적용해야 한다.
