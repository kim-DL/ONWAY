# 급식길 PWA 디자인 시스템

**문서 버전:** 1.0  
**대상:** 급식길 PWA MVP  
**디자인 방향:** Tactile · Liquid Glass · Soft 3D · Aurora Gradient  
**기본 폰트:** Pretendard Variable  
**주요 환경:** 모바일 우선 PWA / 태블릿 / PC 관리자 화면

---

# 1. 디자인 목표

급식길은 단순한 사내 데이터 입력 시스템처럼 보이지 않아야 한다.

현장 직원이 매일 사용하는 업무 도구이므로 다음 두 가지를 동시에 만족해야 한다.

1. **빠르고 명확한 업무 수행**
2. **만지고 싶은 촉감과 고급스러운 시각 경험**

디자인의 핵심 표현은 다음과 같다.

> 부드러운 Aurora/Mesh Gradient 위에 입체적인 카드와 Liquid Glass 컨트롤이 떠 있고, 사용자의 터치에 짧고 탄력 있게 반응하는 현장 업무 UI.

기능 자체는 단순하게 유지하되 버튼·카드·탭·하트·사진 등 주요 인터랙션에 물리적 깊이와 촉감을 부여한다.

---

# 2. 핵심 디자인 키워드

| 키워드 | 적용 의미 |
|---|---|
| Tactile | 눌림, 튀어오름, 스냅 등 실제 물체와 비슷한 반응 |
| Liquid Glass | 두께와 빛 굴절이 느껴지는 반투명 유리 오브젝트 |
| Soft 3D | 과하지 않은 그림자와 하이라이트를 이용한 입체감 |
| Aurora Gradient | 공기감 있는 다색 그라디언트 배경 |
| Layered Depth | 배경 → 카드 → 버튼 → 오버레이의 깊이 차이 |
| Photo First | 학교 현장 사진을 핵심 정보 자산으로 취급 |
| Progressive Disclosure | 필요한 정보만 먼저 보여주고 나머지는 펼쳐서 확인 |
| Fast Feedback | 터치 즉시 시각적으로 반응 |
| Calm Premium | 화려함보다는 절제된 고급감 |

---

# 3. 시각적 재질 계층

모든 요소에 동일한 재질을 사용하지 않는다.

화면에 재질 계층을 만들어 입체감과 정보 우선순위를 동시에 표현한다.

## 3.1 Background

**Aurora / Mesh Gradient**

배경은 완전한 단색 흰색보다 아주 옅은 다색 그라디언트를 사용한다.

기본 구성:

- Warm White
- Soft Blue
- Pale Violet
- Subtle Peach
- 필요 시 미세한 Teal

색 덩어리는 명확한 띠 형태가 아니라 큰 Blur Orb 형태로 겹친다.

배경 자체는 정보보다 눈에 띄어서는 안 된다.

권장 불투명도:

```text
Gradient Orb Opacity
약 8~18%
```

---

## 3.2 Navigation Material

상단 내비게이션, Segmented Control, Floating Bar 등은 **Liquid Glass** 재질을 사용한다.

특징:

- 반투명
- Backdrop Blur
- 얇은 흰색 Highlight
- 부드러운 외곽 Shadow
- 미세한 내부 Reflection
- 필요 시 아주 약한 Iridescent Edge

---

## 3.3 Card Material

학교 카드와 정보 카드는 완전 투명한 Glass보다 **Soft Solid** 재질을 기본으로 한다.

이유:

- 텍스트 가독성
- 사진과의 충돌 방지
- 상태 색상 표현 용이
- 긴 목록에서 시각적 피로 감소

카드에는 다음을 사용한다.

```text
Soft White Surface
+
Thin Border
+
Top Highlight
+
Layered Shadow
```

---

## 3.4 Interactive Material

주요 버튼과 작은 액션 오브젝트에는 **Liquid/Bubble Glass**를 적극 사용한다.

예:

- 길안내
- 방문 기록
- 사진 보기
- 저장
- 내 구역 / 전체 보기 선택
- Filter Chip
- Floating Action Bar

유리 버튼 중앙은 비교적 투명하게 유지하고 가장자리에서 빛이 맺히도록 한다.

---

# 4. 컬러 시스템

정확한 HEX 값은 구현 과정에서 실제 화면을 보며 미세조정하되 다음 색군을 기본으로 한다.

## 4.1 Neutral

```text
Canvas Warm White
Surface White
Soft Gray
Mid Gray
Charcoal
Near Black
```

텍스트는 순수 검정보다 약간 부드러운 Charcoal을 기본으로 사용한다.

---

## 4.2 업무 모드 컬러

### 학교 현장정보 / 납품 중심 화면

**Blue / Cyan 계열**

의미:

- 이동
- 현장
- 정보
- 신뢰

---

### 홍보·영업

**Teal / Emerald 계열**

의미:

- 관계
- 활동
- 성장
- 진행

---

## 4.3 상태 컬러

색은 `방문 상태`라는 하나의 축에서 가장 강하게 사용한다.

| 상태 | 색상 방향 |
|---|---|
| 방문 전 | Neutral Gray |
| 방문 완료 | Teal / Green |
| 후속 필요 | Orange |
| 재방문 필요 | Red/Coral |
| 보류 | Soft Gray |

색상만으로 상태를 표현하지 않는다.

항상 텍스트 또는 아이콘을 병행한다.

---

# 5. Aurora Gradient

배경은 OpenAI 웹사이트에서 느껴지는 부드러운 공기감과 광원을 참고하되 직접적인 복제는 하지 않는다.

권장 구성:

```text
좌상단
Soft Blue Orb

우상단
Pale Violet Orb

중앙
Warm White

좌하단 또는 하단
Very Light Peach

선택적 포인트
Muted Teal
```

Orb 크기는 화면 너비의 60~140%까지 크게 사용하고 Blur를 충분히 준다.

스크롤 시 아주 미세한 Parallax는 허용하지만 필수는 아니다.

---

# 6. Texture / Noise

완벽하게 매끈한 디지털 Gradient보다 미세한 Noise를 추가하면 재질감이 좋아진다.

권장 강도:

```text
1~2%
```

사용자가 직접 Noise를 인지할 정도로 강하게 표현하지 않는다.

---

# 7. Typography

## 7.1 Font Family

```text
Pretendard Variable
```

Fallback:

```text
Pretendard
system-ui
-apple-system
BlinkMacSystemFont
"Segoe UI"
sans-serif
```

---

## 7.2 Typography Scale

| 용도 | 권장 크기 | Weight |
|---|---:|---:|
| Hero 숫자/KPI | 28~36px | 700 |
| 화면 제목 | 24~28px | 700 |
| 학교명 | 19~22px | 650~700 |
| 섹션 제목 | 16~18px | 600~650 |
| 주요 본문 | 15~16px | 450~500 |
| 카드 보조정보 | 13~14px | 450 |
| Caption | 12~13px | 450 |
| Button | 14~16px | 600 |

숫자, 학교명, 방문 상태가 빠르게 구분되어야 한다.

---

# 8. Spacing System

기본 spacing 단위는 4px 기반으로 한다.

```text
4
8
12
16
20
24
32
40
48
```

모바일 기본 좌우 페이지 여백:

```text
16~20px
```

카드 내부 padding:

```text
16~20px
```

큰 섹션 사이:

```text
24~32px
```

---

# 9. Border Radius

급식길의 핵심 시각 요소 중 하나다.

| 요소 | Radius |
|---|---:|
| 작은 Chip | 12~16px |
| Button | 16~20px |
| Card | 20~24px |
| Bottom Sheet | 상단 26~32px |
| 큰 Glass Panel | 24~30px |
| Floating Bar | 22~30px 또는 Pill |
| 사진 | 18~22px |

완전한 직각 요소는 최소화한다.

---

# 10. Depth / Elevation System

깊이는 4단계로 관리한다.

```text
Depth 0
평면 콘텐츠

Depth 1
Chip / 작은 Control

Depth 2
Card / 일반 Button

Depth 3
Floating Bar / Bottom Sheet / Modal
```

각 깊이는 Shadow뿐 아니라 Highlight와 Border까지 함께 정의한다.

---

# 11. Shadow 원칙

검은색 단일 Drop Shadow 한 개만 사용하지 않는다.

권장 구조:

```text
Primary Shadow
아래 방향의 넓고 부드러운 그림자

Ambient Shadow
아주 약하게 퍼지는 주변 그림자

Inset Highlight
상단 가장자리 내부 흰색 빛
```

예시 방향:

```text
0 10px 30px rgba(20, 30, 45, 0.08)
0 2px 8px rgba(20, 30, 45, 0.05)
inset 0 1px 0 rgba(255,255,255,0.55)
```

구현 시 Dark Mode 여부와 실제 Gradient를 보고 조정한다.

---

# 12. Liquid Glass 시스템

## 12.1 목적

장식적인 Glassmorphism이 아니라 실제 두께가 느껴지는 인터랙티브 재질을 만든다.

Liquid Glass 구성 요소:

```text
Backdrop Blur
+
Semi-transparent Fill
+
Top Highlight
+
Edge Reflection
+
Soft Inner Glow
+
Outer Shadow
```

---

## 12.2 Glass Blur

권장 범위:

```text
16~28px
```

모바일 성능에 따라 낮출 수 있다.

---

## 12.3 Bubble Reflection

일부 주요 버튼 가장자리에 약한 다색 Reflection을 허용한다.

예:

```text
Blue
→ Violet
→ Transparent
→ Peach
```

강도는 낮게 유지한다.

```text
약 5~10%
```

무지개 버튼처럼 보이면 안 된다.

---

# 13. Button System

## 13.1 Primary Button

주요 행동:

- 방문 기록 저장
- 현장정보 저장
- 길안내
- 구역 설정 완료

특징:

- 큰 Radius
- Soft 3D 또는 Liquid Glass
- 명확한 Label
- 최소 높이 50px 이상

---

## 13.2 Secondary Button

보조 행동:

- 사진
- 전화
- 수정
- 필터

Primary보다 Shadow와 색 강조를 낮춘다.

---

## 13.3 Press Interaction

버튼의 핵심은 눌리는 느낌이다.

기본 상태:

```text
scale 1
translateY 0
```

Press:

```text
scale 0.97~0.98
translateY 1~2px
shadow 감소
highlight 약간 이동
```

Release:

```text
0.97
→ 1.01~1.015
→ 1.0
```

Spring 기반으로 구현한다.

---

# 14. Motion System

## 14.1 Motion 원칙

- 빠르다.
- 과장하지 않는다.
- 상태 변화를 설명한다.
- 업무 수행을 늦추지 않는다.

---

## 14.2 Timing

일반 UI:

```text
160~220ms
```

Modal / Bottom Sheet:

```text
220~320ms
```

Page Morph:

```text
250~400ms
```

---

## 14.3 Spring

권장 느낌:

```text
Responsive
Low Bounce
Medium Stiffness
```

장난감처럼 오래 튀지 않는다.

---

# 15. Haptic Feedback

지원되는 모바일 환경에서 의미 있는 상태 변경에 제한적으로 사용한다.

허용:

- 관심도 하트 선택
- 방문 완료
- 중요 Toggle 변경
- Swipe Action 확정
- 사진 순서 변경

일반적인 페이지 이동이나 버튼 터치마다 사용하지 않는다.

---

# 16. Segmented Control

대표 활용:

```text
내 구역 | 전체 보기
```

또는

```text
납품 | 홍보·영업
```

전체 Container는 Liquid Glass Capsule로 표현한다.

선택 항목은 내부에서 실제 유리 조각이 좌우로 움직이는 느낌을 준다.

선택 변경 시:

```text
Slide
+
Soft Spring
```

을 사용한다.

---

# 17. School Card

학교 카드는 가장 자주 보게 되는 컴포넌트다.

기본 구성:

```text
학교명
학교급 · 행정구

상태
필요 정보

추가 요약
```

홍보 카드에서는:

```text
대전둔산초등학교
서구 · 초등학교

♥ ♥ ♥ ♡ ♡
방문 완료

홍보지 ✓
샘플 ✓
```

---

# 18. Status Rail

카드 전체 테두리 색보다 왼쪽의 3~5px 상태선을 우선 사용한다.

```text
┃ 학교명
┃ 상태
┃ 보조 정보
```

장점:

- 상태 인지 속도
- 화면 색상 과밀 방지
- 카드 디자인 일관성

---

# 19. Status Badge

상태 Rail과 함께 텍스트 Badge를 제공한다.

예:

```text
방문 전
방문 완료
후속 필요
재방문 필요
```

Pill 형태의 작은 Glass 또는 Soft Solid 컴포넌트를 사용한다.

---

# 20. Product Interest Component

숫자 퍼센트 대신 하트 5개를 사용한다.

데이터 저장값:

```text
0
20
40
60
80
100
```

표시:

```text
0    ♡♡♡♡♡
20   ♥♡♡♡♡
40   ♥♥♡♡♡
60   ♥♥♥♡♡
80   ♥♥♥♥♡
100  ♥♥♥♥♥
```

`0`은 **미평가 / 정보 없음**을 의미한다.

---

## 20.1 접근성 Label

하트만 보여주지 않는다.

예:

```text
♥♥♥♡♡
관심 있음
```

Screen Reader:

```text
제품 관심도 5단계 중 3단계, 관심 있음
```

---

## 20.2 Heart Interaction

하트를 터치하면 해당 단계까지 채워진다.

Animation:

```text
Scale Up
→ Fill
→ Soft Spring Back
```

지원 기기에서는 미세한 Haptic을 사용한다.

---

# 21. Smart Chip

필터와 빠른 상태 선택에 사용한다.

예:

```text
전체
방문 전 14
완료 21
후속 3
```

선택된 Chip은 약간 올라온 느낌을 준다.

가로 공간이 부족하면 Horizontal Scroll을 허용한다.

---

# 22. Bottom Sheet

모바일에서 보조 입력과 선택 기능의 기본 패턴으로 사용한다.

적용:

- 방문 기록
- 관심도 선택
- 구역 선택
- 필터
- 후속 일정
- 사진 설명
- 담당자 선택
- CSV 옵션

Bottom Sheet는 아래에서 자연스럽게 올라오며 Drag Handle을 제공한다.

---

# 23. Floating Context Bar

학교 상세에서 중요 액션을 항상 접근 가능하게 만든다.

학교 현장정보 화면:

```text
길안내
전화
현장정보 수정
```

홍보 화면:

```text
길안내
전화
방문 기록
```

Glass Capsule 형태로 화면 하단에 띄운다.

Safe Area를 반드시 고려한다.

---

# 24. Photo System

사진은 급식길의 핵심 콘텐츠다.

학교당 최대 3장.

기본 화면에서는 Rounded Thumbnail 또는 Horizontal Gallery를 사용한다.

---

# 25. Photo Viewer

사진 터치 시 Full Screen에 가까운 Viewer를 연다.

동작:

- 사진 터치 → 확대
- 다시 터치 또는 닫기 → 원래 위치로 축소
- 좌우 Swipe → 다음/이전
- Pinch-to-Zoom
- Double Tap Zoom
- 아래 Swipe → 닫기
- 현재 위치 `1 / 3`
- Caption 표시

---

## 25.1 Shared Element 느낌

Viewer가 별도 화면으로 갑자기 나타나지 않도록 한다.

```text
Thumbnail
→ 자연스럽게 확대
→ Viewer
```

닫을 때:

```text
Viewer
→ 축소
→ 원래 Thumbnail 위치
```

---

# 26. Photo Viewer Material

사진 주변 UI는 Dark Liquid Glass를 사용한다.

배경:

```text
Dark translucent
+
Blur
```

완전한 불투명 검정보다 공간감을 유지한다.

---

# 27. Progressive Disclosure

학교 상세에서 모든 정보를 한 번에 펼치지 않는다.

홍보 화면 예:

```text
학교 사진

방문 상태
제품 관심도
다음 행동

──────────

학교 현장정보        >
이전 방문 기록       >
커뮤니케이션 참고    >
전체 메모            >
```

자주 쓰는 정보가 위에 위치한다.

---

# 28. Context-Aware Layout

동일한 학교 데이터라도 업무에 따라 정보 순서를 다르게 한다.

## 납품 중심 화면

```text
학교 사진
급식실 위치
검수시간
대차 필요
엘리베이터
차량 진입
길안내
```

## 홍보·영업 화면

```text
이번 달 방문 상태
제품 관심도
다음 행동
홍보지·샘플

학교 사진
학교 현장정보
이전 방문 기록
```

홍보 직원은 학교 현장정보 전체에 접근할 수 있다.

납품 직원은 홍보·영업 전용 영역에 접근하지 않는다.

---

# 29. Sticky Collapse Header

학교 상세 진입 시:

```text
대전둔산초등학교
서구 · 초등학교
사진
```

스크롤 후:

```text
← 대전둔산초        길안내
```

형태로 축소해 상단에 고정한다.

---

# 30. Skeleton Loading

로딩 시 단순 Spinner 또는 `로딩 중` 문구보다 실제 카드 구조와 비슷한 Skeleton을 보여준다.

```text
██████████
██████

████████
```

캐시 데이터가 있으면 Skeleton 대신 캐시 데이터를 즉시 표시한다.

---

# 31. Optimistic UI

사용자가 행동을 완료하면 서버 응답 전에 먼저 UI를 반영한다.

예:

```text
방문 기록 저장
→ 즉시 방문 완료 표시
→ 서버 저장
```

실패한 경우:

```text
저장하지 못했습니다.
다시 시도
```

를 제공한다.

---

# 32. Undo Toast

취소 가능한 행동은 확인 Modal을 남발하지 않는다.

예:

```text
사진을 삭제했습니다.     실행 취소
```

적용 가능:

- 사진 제거
- Tag 삭제
- 배정 목록 제외
- 상태 변경

중대한 데이터 삭제는 별도의 확인 절차를 사용할 수 있다.

---

# 33. Empty State

`데이터 없음`으로 끝내지 않는다.

예:

```text
아직 현장정보가 없습니다.

첫 방문에서 정보를 남겨두면
다음 직원이 바로 확인할 수 있습니다.

현장정보 등록
```

사진:

```text
아직 등록된 사진이 없습니다.

첫 사진 추가
```

방문 기록:

```text
아직 홍보 방문 기록이 없습니다.

첫 방문 기록
```

---

# 34. Pull to Refresh

모바일 목록 화면은 Pull-to-Refresh를 지원할 수 있다.

기본 Browser Refresh와 충돌하지 않도록 PWA 환경을 고려한다.

Refresh 자체는 작은 진행 Motion으로 표현한다.

과도하게 캐릭터화하지 않는다.

---

# 35. Swipe Interaction

Swipe는 단독 기능으로 사용하지 않는다.

동일 행동을 수행하는 명시적인 버튼도 항상 제공한다.

향후 적용 후보:

```text
학교 카드 왼쪽 Swipe
→ 후속 처리

학교 카드 오른쪽 Swipe
→ 방문 기록
```

MVP에서는 선택적으로 적용한다.

---

# 36. Micro Celebration

중요한 업무 완료 시 작고 절제된 성공 표현을 제공한다.

예:

```text
✓ 방문 기록 완료
```

체크 아이콘 Draw Motion과 카드 Status Rail 색상 전환을 함께 사용한다.

Confetti 등 과도한 Celebration은 사용하지 않는다.

---

# 37. Icon System

아이콘은 일관된 Rounded Line 계열을 사용한다.

권장 특성:

- Round stroke
- 1.75~2px
- 지나치게 귀엽지 않음
- Filled icon 남용 금지

주요 아이콘:

- Search
- Map
- Phone
- Camera
- Edit
- Check
- History
- User
- Filter
- Upload
- Download
- Chevron
- Calendar

---

# 38. Accessibility

디자인 완성도와 접근성을 별도 영역으로 취급하지 않는다.

디자인 시스템 자체에 포함한다.

필수:

- 최소 Touch Target 44×44px
- 색상만으로 상태 전달 금지
- 충분한 Contrast
- Keyboard Navigation
- Focus Visible
- Screen Reader Label
- 확대 글씨 대응
- 사진 alt 또는 caption
- Reduced Motion 지원

---

# 39. Reduced Motion

운영체제에서 `prefers-reduced-motion`이 활성화된 경우:

- Spring 최소화
- Morph Transition 단순 Fade로 대체
- Parallax 제거
- Scale Bounce 제거

기능 자체에는 영향이 없어야 한다.

---

# 40. Responsive Breakpoints

모바일 우선으로 설계한다.

권장 개념:

```text
Mobile
~767px

Tablet
768~1199px

Desktop
1200px~
```

정확한 breakpoint는 구현 시 Tailwind 설정과 함께 확정한다.

---

# 41. 모바일 레이아웃

주요 특성:

- Single Column
- Bottom Navigation
- Floating Context Bar
- Bottom Sheet
- Horizontal Filter Chips
- 큰 Touch Target

현장 업무는 대부분 한 손으로 사용할 수 있어야 한다.

---

# 42. PC 레이아웃

관리·편집 작업에서는 Master-Detail 방식을 우선 검토한다.

예:

```text
학교 목록      학교 상세
─────────      ─────────────
둔산초         사진
갈마초         현장정보
탄방초         방문기록
...
```

Desktop에서도 모바일과 전혀 다른 디자인 언어를 만들지 않는다.

---

# 43. Navigation Structure

모바일 Bottom Navigation은 최대 3~4개 중심 기능만 둔다.

홍보 예:

```text
학교
내 활동
전체 현황
설정
```

필요 시 역할에 따라 항목이 달라질 수 있다.

---

# 44. Loading Perception

실제 속도와 체감 속도를 함께 최적화한다.

우선순위:

```text
Cache UI 즉시 표시
→ Skeleton
→ 실제 데이터 갱신
→ 자연스러운 내용 교체
```

Loading Spinner가 앱 전체를 막지 않도록 한다.

---

# 45. Error State

오류 메시지는 기술 용어를 사용하지 않는다.

나쁜 예:

```text
Firebase permission-denied
```

좋은 예:

```text
이 정보를 불러오지 못했습니다.

인터넷 연결을 확인한 뒤 다시 시도해주세요.

다시 시도
```

---

# 46. Offline State

오프라인 상태에서는 화면 상단이나 하단에 조용한 상태 표시를 제공한다.

예:

```text
오프라인 · 저장된 정보를 표시하고 있습니다.
```

빨간 경고 화면처럼 표현하지 않는다.

---

# 47. Design Token 기본 구조

Codex 구현에서는 CSS 변수 또는 Tailwind Theme으로 중앙 관리한다.

예:

```text
--radius-sm
--radius-md
--radius-lg
--radius-xl

--shadow-1
--shadow-2
--shadow-3

--glass-bg
--glass-border
--glass-highlight
--glass-blur

--surface-primary
--surface-secondary

--text-primary
--text-secondary
--text-muted

--status-before
--status-complete
--status-followup
--status-revisit

--motion-fast
--motion-default
--motion-sheet
```

개별 Component에 임의의 값이 반복되지 않도록 한다.

---

# 48. Component 우선순위

MVP 디자인 시스템에서 먼저 구현할 핵심 Component:

1. App Shell
2. Header
3. Liquid Glass Button
4. Soft Card
5. School Card
6. Segmented Control
7. Smart Chip
8. Status Rail
9. Status Badge
10. Heart Interest Selector
11. Bottom Sheet
12. Floating Context Bar
13. Photo Gallery
14. Photo Viewer
15. Skeleton
16. Toast
17. Empty State
18. Form Input
19. Toggle
20. Modal

---

# 49. 피해야 할 디자인

다음 스타일은 사용하지 않는다.

- 전 화면 강한 Glassmorphism
- 강한 Rainbow Gradient
- 과도한 Glow
- 게임 같은 Bounce
- 캐릭터 중심 UI
- 지나치게 작은 폰트
- 약한 Contrast
- 색상만으로 상태 표시
- 모든 카드에 서로 다른 Shadow
- 긴 Animation
- 버튼인지 장식인지 구분하기 어려운 요소
- 업무 화면 전체를 덮는 화려한 Background Animation

---

# 50. 최종 디자인 원칙

급식길 UI를 구현할 때 모든 화면은 다음 다섯 가지 질문을 통과해야 한다.

### 1. 빠른가?

현장 직원이 고민하지 않고 바로 사용할 수 있어야 한다.

### 2. 읽기 쉬운가?

Gradient와 Glass가 정보 전달을 방해해서는 안 된다.

### 3. 만지고 싶은가?

Button, Card, Heart 등 주요 요소에는 실제 물체 같은 반응이 있어야 한다.

### 4. 일관적인가?

모든 화면에서 동일한 Material, Radius, Shadow, Motion 규칙을 사용한다.

### 5. 업무 목적이 먼저인가?

시각 효과 때문에 사용자의 행동 단계가 늘어나서는 안 된다.

---

# 51. 디자인 시스템 한 줄 정의

> **급식길은 부드러운 Aurora Gradient를 배경으로 Soft Solid 카드와 Liquid Glass 컨트롤을 배치하고, Pretendard와 짧은 Spring Motion을 통해 입체감·촉감·업무 속도를 동시에 구현하는 모바일 우선 현장 업무 UI다.**

---

# 52. 디자인 시스템 버전 운영

본 문서는 디자인 시스템 `v1.0`이다.

실제 MVP 구현 이후 다음 항목을 사용자 테스트를 통해 조정한다.

- Glass 투명도
- Gradient 강도
- Shadow 깊이
- Button Press 정도
- Card Radius
- Heart 색상
- Status 색상
- Motion 속도
- Bottom Sheet 높이
- 모바일 정보 밀도

변경 시:

```text
Design System v1.1
Design System v1.2
```

형태로 변경 이력을 유지한다.

디자인 철학 자체보다 구체적인 수치는 실제 기기에서의 사용성을 우선해 조정한다.