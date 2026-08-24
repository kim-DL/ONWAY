# Phase 4 완료 기록

- 완료일: 2026-08-23
- 기준 문서: 구현 명세서 v1.1, 디자인 시스템 v1.0, 화면·UX 상세 명세서 v1.2
- 검증 환경: `demo-onnuriway`, Firebase Auth·Firestore·Functions·Storage Emulator

## 구현 범위

Phase 3 인증 성공 화면을 역할별 실제 App Shell로 교체하고, 다음 업무 단계가 동일한 화면 언어 위에서 확장될 수 있도록 공통 디자인 시스템을 구현했다.

- Aurora Background: warm white 바탕의 blue·violet·peach·teal 저채도 Mesh
- Soft Solid: 학교·정보·빈 상태처럼 내용 중심 영역의 불투명 카드
- Liquid Glass: 내비게이션, Segmented Control, Bottom Sheet, Floating Context Bar, Toast
- 공통 컴포넌트: `SoftCard`, `GlassButton`, `SegmentedControl`, `SmartChip`, `StatusBadge`, `BottomSheet`, `FloatingContextBar`, `Toast`, `SkeletonCard`
- 공통 토큰: 색상, Radius, Shadow, Motion, 역할별 Accent를 인증 후 Shell Scope의 CSS Variable로 관리
- Motion: 일반 전환 170–180ms, Bottom Sheet 260ms, `prefers-reduced-motion` 대응

## 역할별 App Shell

- 납품 직원: `학교`, `설정` 내비게이션과 납품 Blue Accent
- 영업 직원: `학교`, `활동`, `설정` 내비게이션과 영업 Teal Accent
- 복수 역할: 납품·영업 Segmented Control, 허용된 모드만 노출, 버전이 붙은 Private Local Storage에 최근 모드 저장
- 모바일: Safe Area를 고려한 Floating Bottom Navigation
- 데스크톱: 같은 정보 구조를 유지하는 좌측 Glass Rail과 2–3열 Content Layout
- 역할 변경 시 허용되지 않는 View를 학교 Home으로 정규화

## 화면

### 납품 Home

- 현장 중심 Hero와 학교 검색 진입 Shell
- Firestore `schools`의 실제 기본 정보를 실시간 구독해 학교 카드로 표시
- 위치 확인, 운영 확인 필요 상태를 텍스트 Badge와 Status Rail로 함께 표시
- Loading Skeleton, Empty, Permission/Network Error, Retry 상태

### 영업 Home과 활동

- `내 구역`을 기본 범위로 두고 `전체 보기`와 구분
- 공통 학교 수만 실제 값으로 표시하고, 아직 연결하지 않은 담당 배정·활동 통계는 `—`와 설명으로 명시
- 학교 배정이 연결되기 전의 정직한 Empty State
- 방문 기록 기능이 확장될 Activity Timeline Shell

### 학교 상세 Shell

- 실제 학교명, 주소, 지역, 학교 유형, 대표 전화, NEIS 학교 코드, Revision 표시
- 납품·영업 모드별 후속 업무 영역을 같은 Detail 구조로 제공
- Floating Context Bar에서 주소 복사와 전화 연결
- 검색 순위, NEIS 동기화, 현장 프로필 편집, 영업 Mutation은 다음 단계 경계를 지켜 포함하지 않음

### 설정과 로그아웃

- 표시명, 직원 ID, 현재 역할, 세션 보호 상태, 디자인 시스템 및 기기 데이터 경계
- 로그아웃 확인 Bottom Sheet와 진행 상태
- 로그아웃 시 Phase 3 서버 Audit 후 Firebase Auth, 버전이 붙은 앱 전용 Local/Session State, Blob URL 정리

## 접근성·성능 결정

- 모든 주요 Button·Link는 최소 44px, 주요 Action은 50px 이상
- 색상만으로 상태를 전달하지 않고 Badge Text와 Rail을 함께 사용
- Landmark·Heading·Dialog Name, `aria-current`, `aria-pressed`, Live Toast를 제공
- Bottom Sheet는 열릴 때 Focus 이동, Escape/Backdrop 닫기, Body Scroll Lock, 닫힌 뒤 Focus 복원
- Firestore Web SDK는 Modular Import와 Converter를 사용하고 조회 Repository를 `client-only` 경계로 격리
- Page와 Root Layout은 Server Component로 유지하고 인증 후 Shell만 Client Boundary로 둠
- 다음 기능을 가짜 수치나 임시 업무 상태로 꾸미지 않아 후속 데이터 계약과 충돌하지 않음

## 검증 결과

- Lint: PASS, warning 0
- Typecheck: App·Functions PASS
- Unit: 9 files, 30 tests PASS
- Firestore·Storage Rules: 2 files, 23 tests PASS
- Functions Build: PASS
- Next.js Production Build: PASS, static route prerender PASS
- 기본 Playwright: mobile/desktop 4 tests PASS
- Phase 4 Emulator Playwright: 7 tests PASS
  - PIN 로그인 지속, 명시적 로그아웃과 Private State 제거
  - 잘못된 PIN 5회 잠금, 비활성 직원 거부, Session Version 즉시 폐기
  - 납품 역할 내비게이션, 실제 학교 조회, 학교 상세 Shell
  - 영업 역할 내비게이션, 범위 Empty State, 전체 학교, 활동 Shell
  - PIN 화면과 인증 후 Shell 자동 접근성 검사
  - 인증 후 모든 보이는 Button·Link의 44px Touch Target 검사
- 데스크톱 1440×1000 납품 Home과 모바일 390×844 영업 Home 실제 Chromium 시각 검토 PASS
- npm audit: high/critical 0, Firebase 도구 전이 의존성 moderate 10건

## 다음 단계 경계

현재 Firestore 조회는 이미 승인된 `demo-onnuriway` Standard Edition Emulator만 사용한다. 실제 Firebase 프로젝트를 생성·변경·배포하지 않았다.

Phase 5에서는 이 App Shell 위에 NEIS API Proxy, 학교 기본정보 동기화, 변경 감지와 운영 검토 흐름을 연결한다. 실제 Cloud Project, Secret, API Key 또는 배포 권한이 필요한 작업은 별도 승인 후 수행한다.
