# Phase 0 완료 보고

- 완료일: 2026-08-23
- 판정: PASS
- 범위: 선행 조건 정리, 문서 정규화, 프로젝트 Bootstrap, 품질 게이트

## 완료 항목

- 원문 설계의 PIN, 관리자 인증, 영업정보 Cache, 관심도, Client Write 충돌 정규화
- Git `main` 저장소 초기화와 `origin` 연결
- Node.js 22.23.2 / npm 10.9.8 / JDK 21.0.12.1 개발 기준
- Next.js 16.3.2 App Router, React 19, TypeScript strict 앱 셸
- Firebase Web SDK, Cloud Functions 2nd gen, Demo Project Emulator 설정
- Firestore / Storage 전 경로 Default DENY
- Vitest, Firebase Rules Unit Testing, Playwright, Axe 접근성 검사
- GitHub Actions CI와 Runtime·사진 세션·PIN Rate Limit ADR

## 최종 품질 게이트

| 게이트 | 결과 |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | Unit 4 PASS |
| `npm run functions:build` | PASS |
| `npm run build` | PASS |
| `npm run test:rules` | Firestore 2 + Storage 2 PASS |
| `npm run test:e2e` | Mobile/Desktop 렌더링·Axe 4 PASS |
| agent-browser | 본문 존재, 오류 Overlay 없음, 시각 검토 PASS |
| `npm run audit` | High 0, Critical 0, 게이트 PASS |

## 보안 영향

- 실제 Firebase Project 대신 `demo-onnuriway`만 사용한다.
- 실제 API Key, 직원정보, 학교 운영정보는 저장소에 넣지 않았다.
- Firebase Client 설정은 전체 값이 없으면 초기화하지 않고, 일부 값만 있으면 즉시 실패한다.
- Firestore와 Storage는 Phase 0에서 인증 여부와 무관하게 직접 읽기·쓰기를 거부한다.
- Functions 상태 함수도 App Check를 요구한다.

## 알려진 제한

- 실제 Development/Staging/Production Firebase Project와 Secret은 아직 연결하지 않았다.
- PWA Service Worker와 Offline Cache는 설계상 Phase 14 범위라 구현하지 않았다.
- 최신 Firebase CLI/Admin 전이 의존성에 npm moderate 10건이 보고된다. 현재 npm의 자동 해결안은 Firebase 주요 버전 강제 하향이므로 적용하지 않았고, high/critical 게이트를 CI에서 차단한다.
- Next.js 16.3.2의 ESLint Plugin Peer 범위 때문에 ESLint 9.39.5를 사용한다. ESLint 10을 공식 지원하는 안정 Next.js 구성이 나오면 함께 갱신한다.
- GitHub 원격에는 아직 Commit/Push하지 않았다.

## 다음 단계

Phase 1에서 Firebase와 React에 독립적인 Domain Type, Enum, Zod Schema, Firestore Path Helper, Converter, Seed Skeleton을 구현한다. 업무 UI와 실제 외부 API 연결은 Phase 1 범위에 포함하지 않는다.
