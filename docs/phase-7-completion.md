# Phase 7 완료 기록

- 완료일: 2026-08-23
- 기준 문서: 구현 명세서 v1.1, 화면·UX 상세 명세서, 데이터베이스 상세 설계서, 검색·캐시·성능 설계서, 테스트·인수 기준서 v1.1, ADR 0007
- 검증 환경: `demo-onnuriway`, Firestore Standard Edition Emulator, Chromium

## Phase

Phase 7 — School Detail & Field Info

## 주요 변경 파일

- `src/features/school-detail/school-detail.tsx`
- `src/features/school-detail/school-detail-cache.ts`
- `src/features/school-detail/school-detail-repository.ts`
- `src/features/school-detail/use-school-detail.ts`
- `functions/src/field/profile-contract.ts`
- `functions/src/field/profile-service.ts`
- `functions/src/field/callables.ts`
- `scripts/run-phase7-field-gate.ts`
- `tests/e2e-auth/phase7-school-detail.spec.ts`
- `functions/tests/field-profile-service.test.ts`
- `src/domain/school.ts`, `src/features/auth/private-client-state.ts`
- `src/features/app-shell/app-shell.tsx`, `src/app/globals.css`
- `package.json`, `README.md`, `docs/adr/0007-cache-first-school-detail-mutation.md`

## 구현

### School Detail Repository & Cache

- `Memory → IndexedDB → Firestore` Cache-first/SWR 순서 구현
- `employeeId:roleScope:sessionVersion:schoolId` Namespace로 역할·세션별 상세 Cache 분리
- 학교, `schoolFieldProfiles`, 활성 사진 Metadata만 Cache하고 Sales 데이터는 제외
- Cache Hit를 즉시 표시하고 Online이면 뒤에서 학교·현장정보·사진 Revision 최신화
- Offline을 즉시 감지해 저장된 정보 안내를 표시하고 `online` 복구 시 자동 재검증
- 처음 보는 학교의 Offline Error와 재시도 UI 제공
- 로그아웃·세션 무효화 시 Search와 School Detail IndexedDB를 함께 제거
- 사진 Collection List 권한을 넓히지 않고 고정 슬롯 `01~03`을 각각 `get`

### School Detail & Field UI

- 학교명·주소·학교급·행정구·현장정보 Revision과 완성도 표시
- 첫 화면에 검수시간, 대차, 급식실 위치를 독립된 고대비 3열 Summary로 배치
- 출입구·동선, 계단·엘리베이터, 차량·하역·주차, 특이사항을 Progressive Disclosure Card로 구성
- 급식실, 검수, 장비, 차량, 특이사항을 각각 Section Bottom Sheet에서 수정
- 대차·계단·엘리베이터·차량·주차는 명시적 3~4상태 Select로 제한
- Sticky Collapse 성격의 Header와 `길안내 · 사진 · 정보 수정` Floating Context Bar 제공
- 검증된 좌표가 있을 때만 카카오맵 단일 목적지 URL을 새 창으로 제공하고 Key·SDK는 추가하지 않음
- 사진 Binary는 Phase 8로 남기고 현재 3개 Slot의 Caption·Revision Metadata만 표시
- 납품·영업은 공용 현장정보를 수정할 수 있고 Viewer는 수정 Control을 받지 않음
- 모바일 단일열, Scroll 가능한 Bottom Sheet, Reduced Motion, Focus, Axe, 44px Touch Target 유지

### Callable Mutation

- `updateSchoolFieldProfile` 2nd gen Callable 추가
- Production App Check 강제, Emulator에서만 App Check 제외
- Firebase Auth와 `authz`의 직원·활성·Session/Permission Version·Role Scope 교차검증
- Client Firestore Write는 계속 Default DENY, Admin SDK Transaction만 Mutation 수행
- Strict Zod Schema로 Unknown Field, 2,000자 초과, 잘못된 Enum·시간·빈 Patch 거부
- Expected Revision 불일치 시 `aborted` 충돌 반환 및 Client 최신화
- UUID Request ID와 SHA-256 Payload 지문으로 동일 재시도만 멱등 허용
- Profile·Request Lock·Audit Log를 하나의 Transaction으로 기록
- 서버가 현장 핵심 13항목 기준 `completeness`와 `reviewRequired`를 계산
- 신규 Profile은 Expected Revision 0에서 Revision 1로 생성

## 검증 결과

- `npm run lint`: 통과, 경고 0건
- `npm run typecheck`: App·Functions 모두 통과
- `npm test`: 테스트 파일 14개 통과·1개 조건부 Skip, 테스트 54개 통과·3개 Emulator 전용 Skip
- `npm run test:field`: 현장정보 Mutation·Domain 계약 10개 통과
- `npm run test:field:emulator`: Revision 0→1→2, 동일 Payload 멱등 Replay, 다른 Payload Request ID 충돌 거부, Stale Revision 거부, Audit 2건 통과
- `npm run test:rules`: Firestore·Storage Rules 23개 통과; 고정 사진 Slot Get 허용·Collection List 거부 유지
- `npm run seed:verify`: Auth 사용자 5명·Firestore 문서 58개 생성 검증 통과
- `npm run functions:build`, `npm run build`: Functions와 Next.js Production Build 통과
- `npm run test:e2e:phase7`: 누적 13개 통과; 학교 상세 핵심정보, 사진 Metadata, 카카오 길안내, IndexedDB, Offline, Callable 저장, 동시 Revision 충돌, Axe, Touch Target 포함
- `npm audit --audit-level=high`: High·Critical 0건, Moderate 10건 확인

## Security Impact

- Firestore Rules를 넓히지 않았고 모든 Client 직접 Mutation 거부를 유지한다.
- 고정 사진 Slot을 Known-ID `get`으로 읽어 Collection List 권한을 추가하지 않는다.
- Callable은 Token만 신뢰하지 않고 서버의 활성 `authz`와 Version을 교차검증한다.
- Server Contract가 허용 Field와 길이·Enum을 엄격히 제한하며 직원 식별자, Revision, 완성도, Audit 시각을 서버가 재구성한다.
- Viewer는 공용 상세 읽기만 가능하고 Callable에서 수정이 거부된다.
- School Detail Cache에는 납품 Role이 볼 수 없는 Sales 정보가 들어가지 않는다.
- 세션 변경과 로그아웃은 Persistent School Detail Cache를 제거한다.

## Performance Impact

- Cache가 있는 학교는 Network 완료 전에 즉시 렌더링한다.
- 학교 Detail 진입은 학교 1건, 현장정보 1건, 고정 사진 Slot 최대 3건만 Known-ID로 확인한다.
- 전체 학교 상세 Prefetch와 전체 사진 Collection Query를 사용하지 않는다.
- Offline 상태에서 불필요한 Firestore Timeout을 기다리지 않고 IndexedDB를 즉시 사용한다.
- Network 복구 시 해당 학교 Detail만 다시 확인한다.

## Known Issues

- 실제 Firebase Project에 Callable을 배포하거나 데이터를 수정하지 않았다.
- 사진 Binary Upload, Thumbnail/Preview/Original 표시와 교체·삭제는 Phase 8 범위다.
- IndexedDB는 브라우저 Eviction 대상이므로 처음 보는 학교는 Offline에서 열 수 없다.
- Request Lock의 운영 TTL·정리 Job은 아직 없다.
- 학교 상세의 Sales Profile·Visit·Assignment는 해당 영업 업무 Phase에서 Memory 중심으로 연결한다.
- `firebase-tools`·`firebase-admin` 계열 전이 의존성 Moderate 10건은 호환 가능한 후속 갱신 대상으로 유지한다. `npm audit fix --force`가 요구하는 Breaking Downgrade는 적용하지 않았다.

## 다음 Phase 참고사항

Phase 8은 3개 고정 사진 Slot에 Temporary Upload, EXIF 제거, WebP 처리, Thumbnail·Preview·Original Version과 Soft Delete·Undo를 연결한다. Phase 7 Detail Cache에는 사진 Metadata만 유지하고 원본 Binary를 IndexedDB에 저장하지 않는다.

실제 Firebase Project, Cloud Functions 배포, Hosting, Secret Manager, Catalog Live Publish는 변경하지 않았다.
