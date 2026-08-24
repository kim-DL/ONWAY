# ADR 0001: Runtime and hosting baseline

- 상태: 승인
- 날짜: 2026-08-23

## 결정

- 애플리케이션과 Cloud Functions의 기준 Runtime은 Node.js 22 LTS다.
- Frontend는 Next.js 16 App Router로 구현하고 Vercel 배포를 기본으로 한다.
- Firebase Authentication, Firestore, Storage, Functions, App Check와 Local Emulator Suite를 Backend 기준으로 사용한다.
- Firebase App Hosting은 Next.js 16의 활성 지원 범위와 운영 요구가 확인된 뒤 다시 평가한다.

## 이유

Next.js 16과 Functions Node 22를 같은 개발 기준으로 맞추면서, Frontend Framework 지원 범위와 Firebase Backend 기능을 각각 가장 안정적인 배포 경로에 둔다. 로컬과 CI는 Firebase Demo Project와 Emulator만 사용해 Production 오접속을 막는다.
