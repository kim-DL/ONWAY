# 유리 버튼 표면·입체감 — 로컬 후보

2026-10-31. 사용자가 면 반사+얕은 그림자 안을 확정하고 main 병합·Hosting 배포를 승인했다. 브랜치 `codex/glass-material-depth-20261031`에서 릴리스를 준비한다. 배포 결과는 HANDOFF와 별도 릴리스 기록을 기준으로 확인한다.

## 현재 적용

- 3개/4개 권한용 WebP를 재제작했다. 해상도 600×293/512×341, alpha, 경로 유지. 합계 85,590→48,888B. 버튼 크기·배치·글자·권한·API는 그대로다.
- 에셋은 절단면과 국소 프리즘을 담당한다. 중앙 명암이 강한 후보는 회색/청색 판처럼 보여 제외했다. 중앙의 투명도 검사 기준은 그대로 유지했다.
- 사용자 제안에 따라 정적 CSS 면 반사와 짧은 접촉 그림자를 추가했다. 반사는 `glassSurface::after`, 그림자는 보이는 유리 영역에 적용한다. 실제 HTML 글자는 기존 상위 레이어에 남으며 반사·흐림·그림자로 덮지 않는다.
- 그림자는 `0 1px 2px / 20%`와 `0 3px 5px / 8%`. 큰 외부 광채, 움직이는 광택, 새 라이브러리·필터·JS는 추가하지 않았다. 고대비/forced-colors에서는 기존 규칙대로 장식 유리를 숨긴다.
- 에셋만 / 밝은 중성 배경판 / 청회색 배경판 / 면 반사 / 면 반사+그림자를 비교했다. 현재는 마지막 조합을 적용한다. 공통 배경판은 메뉴를 무겁게 보여 미리보기 실험으로만 남겼다.

## 조사와 적용 판단

| 1차 자료 | 확인한 원리와 적용 판단 |
|---|---|
| [PBRT — Dielectric BSDF](https://pbr-book.org/4ed/Reflection_Models/Dielectric_BSDF) | 반사·투과 비율은 각도에 따라 변한다. 중앙의 약한 면 반사와 가장자리의 강한 반사를 구분했다. |
| [PBRT — Specular reflection/transmission](https://www.pbr-book.org/4ed/Reflection_Models/Specular_Reflection_and_Transmission) | 파장에 따른 굴절 차이가 분산을 만든다. 전체 무지개 테두리 대신 국소 빛의 분리를 표현했다. |
| [Edmund Optics — Optical prisms](https://www.edmundoptics.com/knowledge-center/application-notes/optics/introduction-to-optical-prisms/) | 면의 각도·배치·연마·모따기가 광학 요소를 결정한다. 윗면과 네 절단면이 같은 소재로 연결되도록 했다. |
| [Blender — Bevel](https://docs.blender.org/manual/en/latest/render/shader_nodes/input/bevel.html) | 작은 모서리 곡면이 정반사 하이라이트를 만든다. 두꺼운 검은 외곽선 대신 밝고 어두운 면으로 두께를 표현했다. |
| [Apple — Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) | 형태에 맞는 하이라이트·굴절·그림자를 함께 구성한다. 효과 하나만 증폭하지 않고 면·절단면·그림자를 비교했다. |
| [Corning Museum — Glass photography](https://blog.cmog.org/2019/photographing-glass-highly-reflective-black-objects-part-2) | 조명 환경·반사판 제어로 표면을 드러낸다. 사례는 검은 유리이며 투명 버튼과 직접 동일시하지 않았다. 배경 대비 실험에 참고했다. |
| [Profoto — Glass highlights](https://www.profoto.com/ca/en/still-photography/tips-tricks/how-to-create-highlights-on-a-cocktail-glass) | 반사판·차광으로 가장자리 빛을 제어한다. 백색 반사 방향을 통일하고 불필요한 광채를 줄였다. |

이 구현은 위 원리를 참고한 **정적 시각 표현**이다. 실제 광선 추적·배경 굴절·기기 각도에 반응하는 광학 시뮬레이션이 아니다. 인쇄된 듯한 글자와 최종 소재 만족도는 사용자의 시각 판단이 필요하다.

## 제작·검증

- 내장 imagegen으로 반복 제작했다. 중앙을 비우면 액자처럼 보이고 명암을 높이면 불투명 판처럼 보이는 후보를 제외했다. 최종 에셋은 투명 중앙·매끄러운 절단면·국소 분산에 집중하고 면 반사는 정적 UI 레이어로 분리했다. Sharp는 리사이즈와 WebP 변환에만 사용했다.
- 최종 PNG: `exec-21713779-3ef7-494b-890f-e1128d335642.png`(3개), `exec-f25e67e5-b399-456e-afe3-6cf75365ce77.png`(4개). 프롬프트·원본 사본·비교 도구·캡처는 ignored `output/glass-material-depth-20261031/`에 보관한다.
- 최종 관련 단위 **9 PASS**: `brand-assets.test.ts`, `app-shell-header.test.ts`. 용량·alpha·투명도·권한 기준을 완화하지 않았다.
- 최종 관련 브라우저 **3 PASS**: 여러 폭의 배치·모드/뒤로 가기, S26 360×780/DPR3의 3/4권한·터치 영역·접근성, reduced-motion/forced-colors. `header-layout.spec.ts`에서 해당 사례만 실행했다.
- 360px/1280px·3/4권한 PNG와 배경/면/그림자 비교 PNG 확인. Aside에서도 실제 로컬 탭을 360×780으로 설정해 확인했다. 모두 합성 헤더이며 실제 Android 기기 검증은 아니다.
- 전체 회귀·운영 빌드·전체 CI는 반복하지 않았다. 커밋/릴리스 시 범위별 검증 규칙을 적용한다.
- 이전 후보의 전체 헤더 검사는 49 PASS/1 FAIL(끝점 1px 차이), 단독 재확인은 PASS였다. 이번 3개 통과를 이전 전체 실패 원인 해결이나 전체 50개 통과로 해석하지 않는다.

미리보기: `http://127.0.0.1:4330/?modes=4` (3도 가능). 비교 도구 `compare.mjs` 실행 시 `http://127.0.0.1:4331/compare`.
