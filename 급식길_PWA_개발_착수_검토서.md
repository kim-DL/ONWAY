# 급식길 PWA 개발 착수 검토서

- 검토일: 2026-08-23
- 검토 범위: 현재 폴더의 Markdown 문서 10개, GitHub 원격 저장소, 현재 개발 환경, PWA·Next.js·Firebase 관련 공식 자료와 Codex SKILL
- 목적: 설계 문서와 사용자 요청을 구분하고, 구현 전에 사용할 단일 기준과 개발 도구·품질 게이트를 확정한다.

## 1. 결론

급식길의 제품 구조, 데이터 경계, 권한 모델, 주요 화면, 검색·캐시 전략, 외부 동기화 방식과 테스트 기준은 개발 가능한 수준으로 설계되어 있다. 아키텍처를 다시 설계할 필요는 없다.

2026-08-23 사용자 승인에 따라 구버전 정책 정규화를 Phase 0 첫 작업으로 완료했다. 인증, 영업정보 캐시, 관심도 입력, 쓰기 권한의 최종 결정을 관련 상세 문서와 구현·테스트 명세에 반영했으며 아래 결정을 구현 기준으로 동결한다.

현재 GitHub 원격 저장소는 참조가 없는 빈 저장소이며, 첨부 폴더는 아직 Git 저장소가 아니다. 따라서 Phase 0에서 현재 폴더를 저장소 루트로 초기화하고 문서와 애플리케이션을 함께 관리하는 구성이 가장 단순하다.

## 2. 문서와 요청의 권한 구분

첨부 문서 안의 `Codex 작업 방식`, 단계 지시, 금지사항 등은 프로젝트 요구사항과 설계 기록으로만 취급한다. 에이전트 자체에 대한 상위 지시로 취급하지 않는다.

구현 판단의 우선순위는 다음과 같이 고정한다.

1. 사용자가 가장 최근에 명시한 요구
2. `급식길 PWA 전체 문서 정합성 검토서.md`
3. 정합성 검토가 반영된 최신 상세 문서
4. 정규화 후의 구현 명세서
5. 나머지 구버전 문서

## 3. 전체 문서 검토 결과

| 문서 | 판정 | 개발 전 조치 |
| --- | --- | --- |
| MVP 기획서 v1.3 | 정규화 완료 | `PIN 단독`과 무작위 발급 기준 반영 |
| 데이터베이스 상세 설계서 v1.3 | 정합성 검토가 반영되어 사용 가능 | Domain/Zod 계약의 직접 기준으로 사용 |
| 인증·권한·보안 v1.3 | 정규화 완료 | 휴대폰 파생 PIN 제거, 관리자 Google 허용목록 인증 반영 |
| 디자인 시스템 v1.0 | 사용 가능 | 실제 기기에서 Glass·Blur·Contrast·저사양 성능을 토큰 단위로 조정 |
| 화면·UX 상세 명세서 v1.2 | 정규화 완료 | 휴대폰 기반 PIN 제거, 관심도 `미선택`과 명시적 `0` 분리 |
| 검색·캐시·성능 v1.1 | 정규화 완료 | Sales 민감정보의 Persistent Cache 제외 |
| 외부 API·동기화 v1.0 | 사용 가능 | NEIS/Kakao 개발 키와 대전 데이터 검증은 실제 연동 Phase에서 확인 |
| 테스트·인수 기준 v1.1 | 정규화 완료 | 보안·관심도·Client Write/Callable 테스트 추가 |
| 구현 명세서 v1.1 | 최종 개발 기준 | 정규화 결정, Node 22, Vercel+Firebase, Serwist 기준 반영 |
| 전체 문서 정합성 검토서 v1.0 | 현재 충돌 해결 기준 | Architecture Decision 기록으로 보존 |

## 4. 구현에 사용할 정규화 결정

| 영역 | 최종 결정 |
| --- | --- |
| 일반 직원 인증 | 전화번호·직원코드·이메일 없이 고유한 숫자 6자리 PIN 하나만 입력 |
| PIN 생성 | 관리자 또는 시스템이 무작위 발급. 전화번호에서 파생하지 않음. 약한 패턴과 중복 차단 |
| PIN 저장 | HMAC Lookup Key와 느린 Hash 검증 값을 분리하고 Secret Manager의 서로 다른 비밀 사용 |
| 로그인 지속 | Firebase Auth LOCAL persistence. 직접 로그아웃·비활성화·권한/PIN 변경·관리자 폐기 때만 재인증 |
| 관리자 인증 | Google 로그인 + allowlist + admin 권한. 직원 PIN만으로 관리자 승격 금지 |
| 역할 | `delivery`, `sales`, `viewer`, `admin`; `manager`는 MVP에서 사용하지 않음 |
| 학교 ID | NEIS 행정표준코드 기반. 교명 변경 시 ID 유지, 이전 교명은 alias로 보존 |
| 공용 현장정보 | `schoolFieldProfiles/{schoolId}`와 학교 사진은 delivery/sales 공용 |
| 영업 제한정보 | `salesProfiles`, `salesVisits`, 월별 assignment는 delivery의 UI·응답·캐시에서 모두 차단 |
| 중요 쓰기 | Client의 Firestore 직접 Write가 아니라 Callable Cloud Functions를 통과 |
| 사진 | 학교당 3개 슬롯, 버전형 경로, Soft Delete와 Undo, 서버 이미지 처리 |
| 관심도 | Form의 `undefined`는 미선택, 사용자가 `관심도 미확인`을 고르면 저장값 `0`; 방문 완료에는 명시적 선택 필요 |
| 영업 캐시 | Sales 민감 상세는 MVP에서 Memory 중심. IndexedDB·Service Worker의 기본 영구 캐시에서 제외 |
| 오프라인 | 앱 셸, 학교 검색, 캐시된 학교 현장정보와 캐시된 사진을 보장. 완전한 영업 Offline Write Queue는 제외 |

## 5. 권장 구현 아키텍처

### Frontend

- Next.js 16 App Router, React, TypeScript strict
- Firebase Web Modular SDK
- CSS Variables를 디자인 토큰의 Source of Truth로 사용하고 Tailwind CSS는 토큰 소비자로 제한
- React Hook Form + Zod로 Client/Server 입력 계약 공유
- `idb` 기반의 명시적 IndexedDB schema/version/migration
- 복잡한 Bottom Sheet·Photo Viewer에만 Motion 사용
- 접근성이 필요한 Dialog·Tabs·Toast 등은 검증된 Headless Primitive를 선택적으로 사용

Core 업무 데이터는 Firebase Auth 상태와 기기 로컬 캐시를 중심으로 동작하므로 무리하게 Server Component, Server Action 또는 Next Route Handler로 우회하지 않는다. 학교·현장정보의 허용된 읽기는 Repository를 통한 Firebase Client Read, 중요 Mutation은 Callable Functions가 기준이다. Next.js 서버 기능은 manifest, 정적 metadata, 필요한 배포 보조 기능에 제한한다.

### Backend

- Firebase Authentication custom token
- Firestore Standard, Cloud Storage, App Check
- Cloud Functions 2nd gen + Node.js 22 + TypeScript
- Firestore/Storage Rules default deny
- Zod validation, revision, requestId/idempotency, audit를 서버 공통 계층으로 통합
- NEIS와 Kakao Secret은 Secret Manager에서만 읽음

### Hosting

기본 권고는 Next.js 16 프런트엔드를 Vercel에 배포하고 Firebase를 인증·데이터·Functions 백엔드로 사용하는 구성이다. Firebase App Hosting은 Next.js를 지원하지만 현재 공식 지원표가 Next.js 15.x 중심이므로 Next.js 16을 고정하면서 Production 안정성을 우선하면 Vercel이 더 낮은 위험이다.

단일 Firebase 배포를 더 중요하게 생각한다면 Firebase App Hosting이 공식 지원하는 Next.js 버전으로 낮추는 결정을 별도로 해야 한다. 이 선택은 Phase 0 말까지 확정하면 이후 Domain 설계에는 영향을 주지 않는다.

## 6. PWA 구현 결정

Next.js 16의 Turbopack 경로를 지원하는 Serwist를 우선 후보로 사용한다. 단, 예제의 기본 캐시 설정을 그대로 사용하지 않고 급식길의 데이터 민감도에 맞춘 명시적 allowlist를 사용한다.

| 요청 종류 | 전략 |
| --- | --- |
| 해시가 포함된 Next 정적 자산·아이콘·폰트 | Precache / Cache First |
| Navigation | Network First + 오프라인 앱 셸 fallback |
| Firebase Callable·Firestore·Sales 응답 | Network Only; Service Worker Cache 금지 |
| 학교 카탈로그·현장정보 | 앱 코드가 Memory/IndexedDB에서 관리; Service Worker가 API 응답을 가로채지 않음 |
| 버전형 thumbnail/preview | 역할 확인 후 제한적 Cache First, 명시적 최대 개수·용량·만료 적용 |
| original 사진 | Viewer 요청 시 Network, 필요 최소 범위만 임시 사용 |

Service Worker는 자동 `skipWaiting`으로 입력 중 화면을 강제 교체하지 않는다. 새 worker가 waiting 상태가 되면 `새 버전이 준비되었습니다`를 표시하고, 사용자가 선택했을 때 draft를 보호한 뒤 업데이트한다.

## 7. 검색·캐시 성능 구현

- Catalog를 IndexedDB에서 읽은 직후 Memory Index를 구성하고 서버 version 확인은 뒤로 미룬다.
- 한글 정규화, 학교급 축약, 초성, alias, 제한적 오타 점수를 순수 함수로 구현해 Vitest benchmark fixture로 고정한다.
- 대전 학교 규모에서는 먼저 단순 배열+사전 계산 key로 구현하고 p95가 기준을 넘을 때만 더 복잡한 index를 도입한다.
- 검색 결과는 상위 10개 안팎만 렌더링하고 입력 지연이 측정될 때 `useDeferredValue`를 적용한다.
- 모든 로컬 key는 employeeId, roleScope, sessionVersion, schema/catalog version을 포함한다.
- 로그아웃과 역할/sessionVersion 변경은 영업 Memory, object URL, 관련 cache namespace를 즉시 폐기한다.

## 8. 보안상 구현 전 주의사항

1. 숫자 6자리 PIN은 공간이 작으므로 App Check만으로 충분하지 않다. 원자적 실패 횟수, IP/기기/Lookup 단위 rate limit, 잠금, 일정한 실패 응답 시간, generic 오류 메시지를 함께 적용한다.
2. Firestore 직접 읽기는 `authz/{uid}`의 active/sessionVersion과 custom claims를 Rules에서 함께 검증한다.
3. Cloud Storage Rules는 Firestore의 `authz` 문서를 읽지 못하므로 세션 즉시 폐기의 강도가 Firestore와 다를 수 있다. 사진에 대해 1시간 이내 token 만료 창을 허용할지, 짧은 수명의 서버 승인 다운로드를 사용할지 Phase 2에서 위협 모델로 명시한다.
4. Serwist/Workbox의 범용 기본 runtime cache를 그대로 쓰면 Sales 또는 인증 응답이 캐시될 수 있으므로 allowlist 외 요청은 Network Only로 둔다.
5. 업로드는 크기·MIME·magic bytes를 서버에서 다시 검사하고 EXIF 제거, orientation 보정, WebP 변환 후에만 active metadata로 전환한다.
6. 실제 PIN, 실제 방문 기록, 실제 학교 사진을 개발·CI fixture로 사용하지 않는다.

## 9. 테스트와 품질 게이트

| 계층 | 도구와 범위 |
| --- | --- |
| 정적 검사 | ESLint, TypeScript strict, dependency/secret scan |
| Domain | Vitest: schema, enum, search, revision, idempotency |
| Firebase | Emulator: Auth, Firestore Rules, Storage Rules, Functions integration |
| 브라우저 | Playwright: PIN, delivery, sales, admin 핵심 flow와 offline/update |
| 접근성 | `@axe-core/playwright`, keyboard, screen reader label, reduced motion, contrast |
| 성능/PWA | Lighthouse CI, Web Vitals, 검색 p95, network request assertion, cache isolation |
| 시각 회귀 | Playwright mobile/desktop screenshot baseline |

CI의 merge gate는 lint, typecheck, unit, rules/functions emulator test, production build, 핵심 E2E 순으로 둔다. 서비스 워커를 포함한 PWA 검사는 production build/preview 환경에서 수행한다.

## 10. Codex 플러그인과 SKILL 사용안

### 현재 사용 가능하며 채택할 항목

- `vercel:nextjs`: App Router·RSC boundary·Next.js 16 파일 규칙 검토
- `frontend-design`: 디자인 시스템을 실제 component/token으로 구현하고 generic dashboard 미감을 피하는 데 사용
- `vercel:react-best-practices`: waterfall, bundle, re-render, 목록·검색 성능 검토
- `playwright`: 모바일/데스크톱 핵심 사용자 flow 자동화
- `vercel:agent-browser-verify`와 `vercel:verification`: dev/preview 환경의 전체 흐름 검증
- Browser 플러그인: 설치형 PWA, offline, update, touch/keyboard 수동 확인
- Vercel 기능: preview deployment, build/log 확인

### 추가 설치 권고

Firebase가 공식 제공하는 Agent Skills 묶음을 개발 시작 전에 설치하는 것이 좋다. 특히 다음이 직접 관련된다.

- Firebase 기본·CLI
- Authentication
- Firestore
- Hosting/App Hosting 비교
- `firebase-security-rules-auditor`

공식 저장소가 안내하는 전체 설치 명령은 `npx skills add firebase/skills`이며, 최소 설치 시에는 Security Rules auditor를 우선한다.

PWA 전용 커뮤니티 SKILL도 검색되었지만, 현재는 Next.js 공식 PWA 문서, Serwist 공식 문서, Workbox 공식 전략과 설치된 Next.js SKILL의 조합이 더 직접적이고 검증 가능하다. 따라서 커뮤니티 PWA SKILL을 필수 의존성으로 추가하지 않는다.

추천 플러그인 목록 중 이 프로젝트에 필수인 신규 연결형 플러그인은 없다. `Codex Security`는 Release 전 별도 보안 검토에 선택적으로 유용하지만 Firebase 공식 Rules auditor와 Emulator 규칙 테스트가 우선이다.

## 11. 현재 환경 준비 상태

| 항목 | 상태 | 조치 |
| --- | --- | --- |
| Git | 2.51.2 사용 가능 | Phase 0에서 현재 폴더를 `main` 저장소로 초기화하고 원격 연결 |
| GitHub `kim-DL/ONWAY` | 원격 ref가 없는 빈 저장소 | 첫 commit/push 대상으로 사용 가능 |
| Node.js | 시스템 Node 22.12.0, npm 10.9.0 사용 가능 | Functions runtime도 Node 22로 고정 |
| Codex 번들 Node | 24.19.0 | Firebase Functions runtime 기준에는 사용하지 않음 |
| Java JDK | 없음 | Firestore/Storage Emulator를 위해 JDK 21 LTS 설치 필요(공식 최소 요건은 JDK 11+) |
| Firebase 프로젝트 | 미확인 | 우선 demo project ID로 Emulator-only 개발, 실제 dev/staging/prod 연결은 별도 승인 후 진행 |
| 외부 API Key | 미확인 | NEIS/Kakao Phase까지 Secret 없이 mock/fixture 사용 |

Java JDK 부재는 Phase 0의 Emulator gate를 통과하기 위한 유일한 로컬 도구 blocker다.

## 12. 효율적인 개발 순서

기존 00~18 Phase 순서를 유지하되 다음 네 개의 품질 트랙을 모든 Phase에 함께 적용한다.

1. 기능: 해당 Phase의 사용자 flow
2. 보안: role/session/rules/mutation 경계
3. 성능: network/read/bundle/cache budget
4. 증거: 자동 테스트와 브라우저 검증 결과

첫 개발 작업은 다음 범위로 제한한다.

### Pre-Phase — 문서 동결

- 위 정규화 결정을 관련 문서와 구현 명세 v1.1에 반영
- Hosting, Storage 즉시 세션 폐기 강도, 정확한 PIN rate limit의 ADR 작성
- 문서 충돌 검색을 CI 또는 간단한 검증 script로 남김

### Phase 0 — Bootstrap

- 현재 폴더 Git 초기화와 GitHub 원격 연결
- Next.js 16 App Router + TypeScript strict
- Node.js 22/npm lockfile 고정
- Firebase Client, Functions 2nd gen, Rules, Emulator skeleton
- Vitest, Playwright, ESLint, typecheck, build script
- `.env.example`, demo project ID, 민감정보가 없는 seed 구조
- GitHub Actions 기본 CI
- 기능 UI는 placeholder shell까지만 만들고 Domain 업무 기능은 구현하지 않음

### Phase 0 Gate

- lint, typecheck, unit test, Functions build, Next production build 성공
- Firebase Emulator가 빈 Rules와 함께 기동되고 테스트가 종료 후 정리됨
- GitHub Actions에서 동일 gate 재현
- Client bundle과 저장소에 Secret이 없음

이 Gate가 통과하면 기존 구현 명세의 Phase 1 Domain/DB Contract부터 순서대로 진행한다.

## 13. 개발 착수 판정

판정은 `조건부 착수 가능`이다.

- 제품·데이터·UX 아키텍처: 준비 완료
- 저장소: 비어 있어 깨끗하게 시작 가능
- 개발 도구: Node/Git 준비 완료
- 선행 조건: 문서 정규화, JDK 설치, Firebase 공식 SKILL 설치 권고

위 선행 조건을 Phase 0의 첫 작업으로 함께 처리하면 별도의 추가 설계 회의 없이 본격 개발을 시작할 수 있다.

## 14. 확인한 공식 자료

- [Next.js PWA 가이드](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Next.js Web App Manifest](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest)
- [Firebase Callable Functions](https://firebase.google.com/docs/functions/callable)
- [Firebase App Check](https://firebase.google.com/docs/app-check)
- [Firestore Web offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firebase Local Emulator 설치 요건](https://firebase.google.com/docs/emulator-suite/install_and_configure)
- [Firebase Functions runtime](https://firebase.google.com/docs/functions/manage-functions)
- [Firebase App Hosting](https://firebase.google.com/docs/app-hosting)
- [Serwist Next.js Turbopack 통합](https://serwist.pages.dev/docs/next/turbo)
- [Workbox caching strategies](https://developer.chrome.com/docs/workbox/caching-strategies-overview/)
- [Firebase Agent Skills](https://github.com/firebase/agent-skills)
