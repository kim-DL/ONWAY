# Phase 41 — 실제 대기 표시와 사진 확대 모션

## 방향과 범위

- Uiverse의 교차하는 네 캡슐 리듬을 급식길의 블루/제이드/코랄 팔레트로 재해석한다. 기존 웰컴의 QuantumCloud 장식은 변경하지 않는다.
- OnnuriLoader는 실제 비동기 작업 동안에만 렌더한다. 동기식 이름·초성 검색이나 아직 등록되지 않은 빈 정보에 가짜 대기/진행률을 추가하지 않는다.
- 고정 크기의 네 조각을 transform으로 이동·늘인다. 너비·높이·그림자를 매 프레임 변경하지 않고 별도 애니메이션 라이브러리를 추가하지 않는다.
- 기존 앱 일시정지, OS 모션 감소, 탭 숨김을 공동 구독하며 SSR에서는 정적으로 표시한다. 로더는 상태 텍스트를 대체하지 않으며 기존 live 영역 안에서는 장식용으로 처리한다.
- 사진은 기존 인증된 메모리 이미지와 확대 기능을 사용한다. 전환은 기능을 실행하기 위한 대기 시간이 아니며, 뒤로가기·포커스·닫기 및 안전한 오류 대체 동작을 우선한다.

## 적용 가이드

- frontend-design: 기존 밝은 톤을 유지하고 같은 동작에는 일관된 반응을 적용한다.
- vercel-react-best-practices: 초기 JS와 공용 이벤트 리스너를 최소화하고 고정 도형 transform을 사용한다.
- Playwright: 기존 합성 데이터 브라우저 검증을 확장해 동작·접근성·레이아웃을 검증한다.

## 구현과 검증

- 로그인·데이터 초기 로딩·사진 준비·저장·동선 계산과 학교 상세 열기의 실제 대기 상태에 공용 로더를 연결했다. 반복 선택은 동기 잠금으로 막고, 대기 안내는 기존 상태 영역을 유지한다.
- 거래처/학교 사진은 누른 위치에서 300ms 동안 균일 확대와 크롭으로 펼쳐지고 260ms 동안 복귀한다. 극단적인 사진 비율·사라진 원본·빠른 닫기는 즉시 열기/닫기로 대체한다. 사진 복사본, 외부 이미지 URL 또는 추가 모션 라이브러리를 생성하지 않는다.
- 학교 사진을 기존 공용 네이티브 대화상자로 통합해 뒤로가기와 포커스를 일관되게 처리했다. 확대 사진과 상위 창을 함께 닫을 때 남던 body 스크롤 잠금도 공동 소유 방식으로 수정했다.
- 전체 단위 테스트: 969 통과, 환경 전용 3개 건너뜀. ESLint, 앱/Functions TypeScript, production build, PWA build gate 통과.
- 브라우저 회귀: 모바일/데스크톱 104 통과. 사진 선택·실패·취소·재시도·확대·키보드·Back·중첩창 해제, 관리자 저장/PIN, 로더 색상/크기/모션 감소/앱 일시정지/숨김 탭 포함. 사용자 사진이나 운영 데이터를 작성하지 않는 합성 fixture 검증이다.
- 최종 균일 확대/CSS 분리 후 사진 집중 8개를 다시 통과했다. 시작/18% 중간 프레임의 x/y 배율이 같고 크롭 영역이 누른 사진 영역과 4px 이내 일치하는지 확인했다.
- 성능: 초기 JS 140,507B gzip, 최대 청크 66,843B gzip. 초기/기존 CSS/관리자/영업 예산은 유지한다. 공용 사진 UI는 Next가 학교 전용 모듈과 합쳐 3,395B raw / 1,045B gzip 청크로 만들며 두 사진 뷰어에서만 지연 로드되는지 별도 제한으로 검증한다. 사용하지 않는 기존 전역 사진 뷰어 CSS는 제거했다.
- 거래처 지연 JS는 34,663B gzip로 기존보다 약 1.5KB 늘었다. 취소 가능한 사진 전환/수명 관리에 대해 34.5KiB의 좁은 예산으로 관리하며 초기 로딩에 사진 코드를 추가하지 않는다.
- 실제 갤럭시 S20+의 앨범 공급자와 물리적 핀치 감각은 데스크톱 검증으로 대체하지 않는다. 이번 작업은 기존 사진 읽기·압축·업로드 API 및 인증/권한 규칙을 변경하지 않는다.

## 운영 반영 — 2026-09-08

- Vercel 원격 production build: `dpl_71SdkbtumaR17gZ2gLHWqd4srsCn`, 상태 `READY`.
- 배포: https://onnuriway-382hx7dd3-daeins-projects.vercel.app
- 운영 별칭: https://onnuriway.com
- 운영 브라우저에서 새 버전 준비 안내 → 업데이트 → 로그인 화면 복귀를 확인했다. 이 확인 중 브라우저 console error는 없었다. 실제 직원 PIN 제출과 운영 사진 작성은 하지 않았다.
- 이 기록은 배포 완료 후 남기는 로컬 작업 이력이며 앱 코드의 추가 변경은 없다.

## 레퍼런스

- SchawnnahJ, https://uiverse.io/SchawnnahJ/tough-baboon-87 — 교차·늘어남 리듬. 구현은 CSS transform 기반으로 재작성했다.
- Motion-Primitives, https://motion-primitives.com/docs/morphing-dialog — 누른 이미지에서 상세 보기로 이어지는 시각적 연결. 예제의 램프 사진·콘텐츠·의존성은 가져오지 않는다.
- https://web.dev/articles/animations-guide — transform/opacity 및 렌더링 비용 고려.
- https://developer.mozilla.org/en-US/docs/Web/API/Element/animate — 취소 가능한 Web Animations API.

### Uiverse reference license

MIT License

Copyright - 2026 SchawnnahJ

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
