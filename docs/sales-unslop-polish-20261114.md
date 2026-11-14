# 영업 모드 가독성과 SVG 개선

영업 담당자가 조회 월의 방문 현황과 담당 학교 상태를 읽기 쉽게 다듬는다. 기존 학교 배정, 방문 동선, 담당 제외 조건, 내 학교와 전체 보기, 과거 월 읽기 전용 동작은 유지한다.

## 확인한 문제와 선택

Aside의 실제 React 합성 화면에서 390px 기준 월 상태는 9.76px, 작업 이름은 10.72px, 담당 정보는 12px, 상태는 11px이었다. 새 가독성 검사에서도 이 문제가 재현됐다. 기존 범위 전환과 관리 제한 검사는 통과했다.

`unslop-ui`로 기존 파란색, 유리와 세라믹 질감을 유지하는 방향을 정했다. `poteto-mode`의 독립 설계 두 안과 새 검토자의 비교를 거쳤다. 저장된 설정에 따라 모든 작업자는 부모 모델을 상속했으며 서로 다른 모델 비교는 아니다.

주요 작업은 정적 SVG를 선택했다. 기존 장식 span과 버튼의 업무 처리기를 사용한다. 별도 요청이 생기지만 SVG 재질 표현을 영업 범위에 한정할 수 있다. 좁은 화면의 2열 배치는 세로 공간을 더 쓰는 대신 글자 크기를 확보한다. 샘플 상태에는 물건을 뜻하는 상자 glyph를 쓴다.

기존 SalesCycle과 배정 데이터 타입을 유지했다. 상태 모델을 새로 만들지 않는다. 후행 영업 스타일에 덮이는 선언을 정리하고 기존 용량 제한을 유지한다.

## 재현 방법

로컬 미리보기는 `SALES_PREVIEW=true`로 `npx tsx scripts/preview-customer-ceramic.ts`를 실행하고 출력 주소의 `/app?mode=sales`를 연다. 예시 데이터만 사용하며 CSP가 운영 연결을 차단한다.

- `npx vitest run src/features/sales-cycle src/features/sales-route --maxWorkers=2`
- `npx playwright test tests/e2e/sales-polish.spec.ts tests/e2e/sales-school-cards.spec.ts tests/e2e/sales-district-filter.spec.ts tests/e2e/sales-route-planner.spec.ts tests/e2e/customer-presentation.spec.ts --workers=2`
- `npm run typecheck`와 `npm run lint`
- `npm run build:hosting`
- `npm run verify:performance:build`, `npm run verify:pwa:build`, `npm run verify:hosting:build`

검증 결과와 운영 버전은 최종 후보 확인 후 아래에 기록한다. 브라우저 합성 화면, 서버 에뮬레이터, 운영 공개 파일 검증과 실물 기기 사용은 구분한다.

## 검증 및 배포 기록

관련 단위 108개가 통과했다. 첫 관련 브라우저 실행에서는 92개가 통과했고, 합성 빌드의 정적 SVG 경로 해석과 활동 행 높이 검사에서 실패했다. SVG 경로는 실제 public URL로 남기도록 합성 빌드를 고쳤다. 14px 글씨와 전체 주소를 유지하며 활동 행의 세로 여백을 줄였다. 검사 상한은 바꾸지 않았다.

후속 브라우저 78개가 통과했다. 최종 제목과 개수 줄바꿈 수정 뒤 영업 전용 12개도 통과했다. 320·390·430·1280px, 200% 글자 확대, 강제 색상, 키보드, 접근성, 월과 범위 전환, 담당 제외 제한, 빈 목록과 저장된 목록 안내, 활동 큐를 확인했다. SVG 5종 decode와 활성 동선의 아이콘 보존은 표현 상태 검사다. 실제 운영 동선 저장을 실행한 검사는 아니다.

독립 검토가 발견한 두 CSS 충돌을 수정했다. 후행 모바일 규칙이 2열을 덮던 문제와 활성 동선의 배경 shorthand가 SVG를 지우던 문제다. 재검토에서 남은 소스 결함은 발견되지 않았다.

전체 lint와 최종 변경 파일 lint, TypeScript를 포함한 운영 빌드, PWA·성능·Hosting 검사가 통과했다. gzip 기준 초기 JS 144,012B, 영업 묶음 14,316B, 기존 CSS와 공용 사진 CSS 합계 46,890B다. 변경 전 합계는 47,182B였다. SVG 5개 원본 합계는 6,077B다. 기존 제한을 변경하지 않았다. 이 수치는 전송 파일 용량이며 실행 속도 개선 측정은 아니다.

정확한 후보 커밋의 Quality Gate와 운영 배포 결과는 후속 기록에 남긴다. 실물 휴대폰과 설치된 PWA, 인증된 운영 계정의 실제 방문 저장은 이 로컬 검증에 포함하지 않았다.
