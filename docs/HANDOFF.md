# 급식길 개발 인수인계

기준일: 2026-09-25
대상: 이전 대화 없이 이어서 작업할 새 Codex 스레드

## 1. 먼저 알아야 할 상태

### 확인된 사실

- 저장소: `C:\Users\HOME\Desktop\onnuriway`
- Git branch: `codex/mobile-action-reach`
- 마지막 제품 코드 commit은 branch `codex/mobile-action-reach`의 `b4831ff4d24b8956e327ea806f1ca6bba1651d9c` (`Add delivery photo deletion`)다. 납품사진 Phase 3A/3B/3C/3D와 Galaxy 실사용 확인까지 완료됐으며 아래 2026-09-24 Hosting release가 현재 production frontend다. 이후 Git HEAD에는 documentation-only checkpoint가 포함될 수 있다.
- 초기 HANDOFF 정리 시점에 기록된 대규모 dirty worktree는 이후 P0~P2, 재고 제조사 M1~M3, inventory mobile controls checkpoint로 정리되었다. 이 문서의 각 시점별 기록은 역사적 검증 결과로 유지한다.
- 2026-09-21 HANDOFF 마감은 documentation-only로 진행하며 제품 코드·dependency·테스트·설정을 변경하지 않는다.
- 운영 Frontend는 Next.js static export → Firebase Hosting site `onnuriway`다. 운영 주소는 `https://onnuriway.com`, 기본 주소는 `https://onnuriway.web.app`이다.
- Backend는 Firebase Auth, App Check, Firestore Standard/Native(서울), Storage, Cloud Functions 2nd gen(Node 22, `asia-northeast3`)이다.
- 거래처, 학교납품, 영업/홍보, 재고에 더해 납품사진 field workspace가 production feature flag로 활성화돼 있다.
- 현재 Firebase Hosting live release는 `1790297267844000`, version은 `a85d184f5184fcec`, 배포 시각은 `2026-09-25 09:47:47.844 KST`다. 실제 Service Worker 경로는 `/sw.js`이고 SHA-256은 `095e171afb361969b91684702f94ef99c08aaa94208683d1eca16c377dcc9845`다. 직전 rollback 지점은 release `1790217833155000`, version `79b66cdeae0b2036`이다.
- 납품사진 core feature는 Phase 3D production 배포와 Galaxy S20+ 실사용 확인을 마쳐 **FEATURE FREEZE** 상태다. 다음 작업은 신규 기능 개발이 아니라 repository cleanup/optimization의 OPT-0 read-only audit다.
- 2026-09-21 release `1789983232326000`, version `2c48893eab60f919`와 worker `2129650a8800dedc5239af91185d3310ba735fe0fd9d8dffb3d3910e84f48594`는 당시 inventory/manufacturer production 기록이며 현재 live baseline이 아니다.

### 2026-09-25 OPT-4 release regression — 로컬 PASS, 미배포

- 검증 코드 commit `570a46caaeee2b36963695ba997eac8621c227a0`에서 acceptance의 demo 환경을 고정하고 납품사진 flag를 해당 demo build에만 활성화했다. 원인은 acceptance launcher가 build-time `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS`를 설정하지 않아 납품사진 메뉴가 빠진 것이었다. production 기본값과 제품 코드는 변경하지 않았다.
- 추가 harness 오류 두 건도 수정했다. safe-config 브라우저 runner는 HTTP 200 뒤 실제 클라이언트 설정 화면이 준비될 때까지 기다리고, PIN 로그아웃 테스트는 Firestore auditLogs의 모든 page에서 이번 로그아웃 기록을 확인한다. 단언 완화, 테스트 skip/retry, 성능 예산 증가는 없다.
- 수정 후 canonical acceptance 10/10 gate와 내부 emulator 12/12 gate PASS (`output/acceptance/phase17-report.json`, 2026-09-25 09:34:36 KST). OPT-4는 clean commit에서 처음부터 다시 실행해 app/Functions typecheck, lint, unit 1,581 PASS/14 SKIP, 검색 성능 5,000건 p95 1.11ms/50ms, Rules 50/50, 납품사진 backend emulator, production build, PWA/성능/Hosting verifier, safe-config browser 262/262, 재고 static browser 12/12·emulator 11/11, 납품사진 frontend 8/8, 마지막 canonical acceptance 10/10·내부 emulator 12/12를 모두 PASS했다. 마지막 acceptance의 full user journey gate는 469,990ms였다.
- production build의 초기 JS gzip은 139,733B, customer 36,821B, inventory 25,029B, 납품사진 10,230/3,559/2,918/1,662B로 기존 ceiling 안이다. Hosting export/shipped 96개, precache 83개, 초기 asset 9개다. 재고 격리 E2E 전후 기존 production `out` 96개 파일 집합 SHA-256은 `539e34efc16def7a83e8ab2801e82771b5b09f1d9584b42755b5812aca40564d`로 동일했고 `static-app-*` 잔여는 0이다. 마지막 acceptance의 demo build 뒤 production `out`을 다시 생성해 성능/PWA/Hosting verifier를 재통과했다.
- Emulator gate는 순차 실행했고 각 종료 후 공유 포트와 관련 프로세스가 0임을 확인했다. production deploy와 운영 Firebase/GCP mutation은 하지 않았다. audit에는 high 이상 0건, moderate 7건이 남아 있다. 로컬 구조 검증은 통과했지만 설치 PWA의 실제 업데이트·offline 복구, 운영 Kakao 경로와 현장망, 운영 환경의 새 candidate 배포 후 브라우저 확인은 이번 미배포 검증 범위 밖이다.

### 2026-09-25 검증된 RC의 Firebase Hosting 승격 — 완료

- 검증된 HEAD `21bf5bd7358490eb12ed246c3e80a4cfeef1caa6`의 clean tree에서 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`를 빌드 프로세스에만 지정해 정적 `out`을 생성했다. flag는 ignored production env 파일에 정의돼 있지 않아 명시적 지정이 필요했고, 이전 운영 Hosting build도 같은 방식이었다. 생성된 navigation bundle의 납품사진 기본값은 활성(`true`)이다. 제품 코드, flag 기본값, dependency, budget, Firebase 설정 파일은 변경하지 않았다.
- production build·성능·PWA·Hosting verifier PASS. 정적 export/shipped 96개, precache 83개, 초기 asset 9개다. 배포 후보 `out`의 파일 집합 SHA-256은 `12dcbb7e4c1a035f86c1ed93d237e02a6233c3c68db8f8ea789d714251f3151e`이고 `/sw.js` SHA-256은 `095e171afb361969b91684702f94ef99c08aaa94208683d1eca16c377dcc9845`다.
- 저장소의 canonical 명령 `npx firebase deploy --project onnuriway --only hosting`으로 site `onnuriway`의 Hosting만 배포했다. 새 live release `1790297267844000`, version `a85d184f5184fcec`, time `2026-09-25 09:47:47.844 KST`를 Hosting API로 확인했다. 직전 release `1790217833155000` / version `79b66cdeae0b2036`가 rollback 지점이며 그 이전 version은 `e603258b088093f0`이다. Functions, Rules, Auth, Firestore, Storage, IAM, Scheduler, Vercel은 변경하지 않았다.
- `https://onnuriway.web.app`과 `https://onnuriway.com`에서 canonical Hosting verifier가 각각 PASS했다. 두 origin의 worker hash, manifest, connectivity, 초기 asset, cache/scope header, 비공개·존재하지 않는 경로의 404를 확인했고, 두 origin 각각 83개 precache 자원을 후보 파일과 byte 단위로 대조해 불일치 0건이었다.
- 운영 브라우저에서 기본 URL의 비로그인 PIN 화면을 확인했다. 기존 관리자 세션이 있는 custom domain에서는 새 버전 알림의 `업데이트` 적용 뒤 로그인 유지, 운영 개요·거래처 관리·재고 관리의 읽기 전용 진입과 console error 0건을 확인했다. 운영 데이터 저장·수정·삭제나 사진 업로드는 수행하지 않았다.
- Galaxy S20+ 자체를 Codex 환경에서 조작하지 못했다. 사람이 설치 PWA에서 업데이트 적용 뒤 로그인 유지, 직원 계정의 거래처 `납품사진` 메뉴·오늘 경로/기록·viewer/Back, 재고 진입을 최소 확인해야 한다. 이는 이번 desktop browser 및 byte-level 검증으로 대체하지 않는다. 운영 Kakao 지도 타일/길찾기와 현장망 체감도 이번 배포 smoke에서 미확인이다.

### 미확인 또는 다시 확인할 사실

- 8명 동시 사용 환경의 실제 read 비용과 현장망 T2/T3는 아직 계측하지 않았다. 이는 이번 inventory mobile UI release의 배포·사용성 확인과는 별도의 운영 계측 항목이다.
- 납품사진 network 장애/retry는 구현·Emulator 검증 범위는 있으나 production fault injection 결과가 명확히 기록돼 있지 않다. Web Share와 GPS nearby suggestion은 freeze 범위 밖의 후속 후보이며 실제 업무 필요성이 확인될 때 별도 Phase로 판단한다.

### 2026-09-23 납품사진 Phase 2A/2B production backend — 완료 당시 기록

- Project `onnuriway` (`347044588399`)의 `asia-northeast3`에 납품사진 Functions 9개만 targeted deploy했다: `getDeliveryPhotoRoute`, `saveDeliveryPhotoRoute`, `getDeliveryPhotoDay`, `saveDeliveryPhotoDay`, `createDeliveryPhoto`, `listDeliveryPhotos`, `getDeliveryPhoto`, `deleteDeliveryPhoto`, `expireDeliveryPhotos`. 모두 ACTIVE, Gen2, Node.js 22이며 전용 runtime SA `delivery-photo-runtime@onnuriway.iam.gserviceaccount.com`을 사용한다. `createDeliveryPhoto`는 1GiB/concurrency 1/maxInstances 4/timeout 120초, `expireDeliveryPhotos`는 maxInstances 1/timeout 120초다. 배포 전후 비교에서 기존 production Functions 62개의 이름·상태·runtime·service account·updateTime은 불변이다.
- Scheduler job `firebase-schedule-expireDeliveryPhotos-asia-northeast3`는 ENABLED, `every 60 minutes`, `Asia/Seoul`이다. OIDC identity는 위 전용 SA이고, 정확한 scheduled Cloud Run service에 이 SA의 service-specific `roles/run.invoker`가 확인됐다. 실제 scheduled invocation은 Batch C에서 수동 실행하지 않았으며 당시 `lastAttemptTime`은 없었다.
- 전용 Standard bucket `prod-delivery-photos-an3-68e5c4d72a90`은 같은 project/region에 있으며 UBLA ON, Public Access Prevention enforced, Soft Delete OFF, Versioning OFF, Autoclass OFF, retention/default hold 없음, bucket 전체에 적용되는 Lifecycle Delete age 8일이다. Batch C 후 object count는 0이다. 기존 업무 bucket `onnuriway.firebasestorage.app`은 변경하지 않았다.
- 전용 SA의 project role은 `roles/datastore.user`뿐이다. 전용 bucket의 custom role `projects/onnuriway/roles/deliveryPhotoObjectRuntime`은 `storage.objects.create/get/delete`만 포함한다. 전용 bucket create/get/delete는 GRANTED, list/update는 DENIED이며, 기존 업무 bucket의 create/get/delete/list/update는 모두 DENIED로 검증했다. M2 legacy ACL baseline 대조에서도 새 SA의 기존 bucket 접근 경로는 확인되지 않았다.
- `deliveryPhotos` COLLECTION composite index 2개는 `deliveryDateKey ASC, createdAt DESC` (`CICAgJjmiJEK`) 및 `customerId ASC, createdAt DESC` (`CICAgNi47oMK`)로 모두 READY다. 기존 index 5개는 불변이고 `deliveryPhotos`·`deliveryPhotoDays` TTL은 없다. Git에서 제외된 `functions/.env.onnuriway`에 production deploy용 `DELIVERY_PHOTO_BUCKET`·`DELIVERY_PHOTO_SERVICE_ACCOUNT`가 설정돼 있다.
- Batch C에서 9개 runtime/options, 기존 62개 불변, Scheduler·Cloud Run invoker를 확인했다. 무인증 `getDeliveryPhotoRoute` Callable smoke는 HTTP 401, `application/json`, `error.status=UNAUTHENTICATED`였다. 인증된 운영 납품사진 Callable 호출, 사진/문서 write, Hosting/frontend deploy는 하지 않았다. 버킷 객체는 0개이며 Firestore 업무 collection의 document count는 직접 조회하지 않았다. rollback은 필요하지 않았다.
- **당시 경계:** backend infrastructure는 production에 있지만 delivery-photo feature flag는 OFF이고 UI는 production에 노출되지 않았다. 아래 2026-09-24 Phase 3 기록이 이 과거 경계를 대체한다.

### 2026-09-24 납품사진 Phase 3A/3B/3C — production 완료

- **Phase 3A field workspace:** 오늘 남은 납품처와 기록완료 projection, 기본 route, today override, 내 납품처 편집, 오늘 거래처 추가/제외, 순서 편집, 거래처 검색, 최근 거래처 20 활용을 구현했다. route/day/photo metadata repository를 연결하고 화면 상태는 Memory-only로 유지하며 revision conflict를 처리한다. 별도 completion boolean은 저장하지 않고 server-confirmed photo metadata count에서 기록완료를 투영한다.
- **Phase 3B capture/upload:** camera capture와 album selection, max long edge 2560, fresh WebP re-encode, orientation normalize, crop/upscale 금지, EXIF/GPS 제거를 적용했다. upload coordinator와 job은 Memory-only이고 customer당 active job 1개, preparation concurrency 1, Callable relay 최대 2개로 제한한다. duplicate tap을 막고 같은 사진 retry는 동일 request ID/payload를 유지한다. `createDeliveryPhoto`가 반환한 server-confirmed metadata 이후에만 기록완료로 이동하며 persistent/offline upload queue와 Client direct Storage write는 없다.
- **Phase 3C history/viewer:** 기록완료 customer history를 `listDeliveryPhotos` customer scope로 읽고 최근 기록 N장, metadata-first, viewport thumbnail lazy load, 선택 evidence lazy load, 등록자/등록 시각을 제공한다. viewer는 previous/next, Arrow keys, Escape, Android Back, dependency 없는 pointer swipe를 지원한다. Blob/Object URL은 Memory-only이며 viewer close/logout/session 변경 시 정리하고 persistent photo cache는 두지 않는다.
- **Galaxy 실기기:** Galaxy S20+ production에서 camera upload, album upload, 기록완료 이동, 기록완료 customer의 추가 사진, 여러 장 순차 촬영/저장, history, thumbnail, evidence viewer, previous/next, Back 뒤 history 유지가 모두 PASS했다.
- **Card UX:** 기존 `Customer.accessPassword`를 추가 조회 없이 in-memory catalog에서 재사용하고 `accessPasswordState === "registered"`일 때만 `행정동 · 출입비번 1234#` 형태로 표시한다. 기록완료의 독립 `사진 보기` 버튼은 제거했고 왼쪽 customer 정보 block 전체가 History를 여는 native button이다. camera와 album은 각각 capture/album picker를 여는 독립 sibling control이며 Galaxy 최종 UX 확인이 PASS했다.
- **Backend 불변:** Phase 2B의 delivery-photo Functions 9개 ACTIVE, dedicated runtime SA/bucket/custom Storage IAM, composite indexes 2개 READY, hourly expiration Scheduler, bucket lifecycle Delete age 8일과 기존 business bucket 격리를 유지한다. Phase 3 frontend와 Hosting release 때문에 Functions, Firestore, Storage, IAM, Scheduler resource를 변경하지 않았다.
- **Production frontend:** `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true` candidate를 Hosting site `onnuriway`에만 배포했다. live release `1790211742342000`, version `e603258b088093f0`, time `2026-09-24 10:02:22.342 KST`, `/sw.js` SHA-256 `20520cc6aaa7d8b1ca5ee67522e41b9dc4f691429e8b940b7c154ecb52d5291d`다. 두 production origin verifier와 candidate/live worker 및 precache asset 대조가 PASS했다.
- **Bundle ceiling:** Workspace JS는 10,239B gzip / 10,240B로 headroom이 1B뿐이다. Workspace CSS는 6,066B raw / 1,584B gzip, History JS는 3,459B gzip, Viewer JS는 2,811B gzip, Initial JS는 141,040B gzip이다. 앞으로 delivery-photo workspace에 코드를 직접 늘리지 말고 가능한 기능을 event-loaded/lazy chunk로 분리하며 budget 완화보다 split을 우선한다.
- **최종 검증:** app/Functions typecheck, backend contract/Functions 54 tests, frontend 12 files/50 tests, Demo Emulator Chromium 6/6, lint, production build, PWA/performance/Hosting gate, `git diff --check`, 320/360/200% overflow 0, 접근성, production Galaxy 실기기가 PASS했다.
- **당시 후속 범위:** Phase 3A/3B/3C 완료 시점에는 delete UI, Web Share, GPS nearby suggestion을 완료로 기록하지 않았다. delete UI의 이후 완료 상태는 아래 Phase 3D 기록을 따른다. network 장애/retry도 production fault injection 완료로 과장하지 않는다.

### 2026-09-24 납품사진 Phase 3D Delete — production·Galaxy 완료

- **삭제 계약·권한:** 기존 `deleteDeliveryPhoto` Callable의 `requestId`/`photoId` 입력과 `photoId`/`deletedAt` 응답을 재사용했다. 일반 직원은 본인 UID·직원 ID로 등록한 서울 기준 당일 사진만, verified admin은 retention 만료 전 사진을 삭제할 수 있다. Frontend의 action 노출 조건은 UX용이며 최종 권한 판단은 backend다. Functions 제품 코드는 변경하지 않았다.
- **확인·재시도:** 삭제 확인 UI에서 취소, Escape, Android Back은 write 0이다. 첫 delete intent에서 만든 requestId를 동일 photoId의 retry에 재사용하고 rapid double tap은 하나의 logical request로 제한한다. Server-confirmed success 후에만 local metadata를 제거하며 authoritative not-found/already deleted는 reconcile한다. Permission/transport failure에서는 local remove를 하지 않는다.
- **기록완료 projection·privacy:** 사진 수는 삭제 성공에 따라 `3 → 2 → 1 → 0`으로 감소한다. 0장이 되면 오늘 customer photo summary와 기록완료에서 제거되고 오늘 남은 납품처로 즉시 복귀한다. 별도 completion boolean은 저장하지 않는다. 삭제한 사진의 thumbnail/evidence Object URL을 즉시 revoke하고 늦게 도착한 응답은 UI에 반영하지 않는다. Persistent photo cache는 추가하지 않았다.
- **검증·bundle:** delete focused 10/10, delivery-photo frontend 62/62, demo Emulator Chromium 8/8, app/Functions typecheck, lint, production static build, PWA/performance/Hosting gate 및 `git diff --check`가 PASS했다. Workspace JS `10,230/10,240B` gzip(잔여 10B), History `3,559/3,584B`(25B), Viewer `2,918/3,072B`(154B), Delete `1,662/1,792B`(130B), History/viewer CSS `5,548B` raw/`1,418B` gzip, Initial JS `141,056B` gzip이다. 기존 budget 완화 없이 delete는 Viewer 내부 nested dynamic boundary로 유지했다.
- **Production Hosting:** 제품 코드 commit `b4831ff4d24b8956e327ea806f1ca6bba1651d9c`를 `NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS=true`로 build해 Firebase project/site `onnuriway`/`onnuriway`의 Hosting에만 배포했다. Release `1790217833155000`, version `79b66cdeae0b2036`, time `2026-09-24 11:43:53.155 KST`, `/sw.js` SHA-256 `ebd4c57444b5437ba3f2fe4947a7b54d694ad02e7d56a22718f93fa5694d1a51`다. 두 production origin verifier와 candidate/live worker 및 83개 precache asset hash 대조가 PASS했다. Rollback target은 직전 version `e603258b088093f0`다. Functions/Firestore/Storage/IAM/Scheduler 변경은 0이다.
- **Galaxy S20+ 사용자 실기기 확인:** 사용자가 production에서 본인 당일 사진 delete action, 확인 UI, 취소, 실제 삭제, 사진 수 감소, 마지막 사진 삭제 뒤 기록완료에서 오늘 남은 납품처로 복귀, history/viewer reconciliation, Back/Escape를 모두 PASS로 확인했다. 기존 camera/album/history/viewer 회귀도 없었다. 이는 사용자의 실기기 확인 결과이며 Codex의 production authenticated photo read/write/delete 결과가 아니다.

### 납품사진 FEATURE FREEZE와 다음 작업

1. Core 범위인 route/day, camera, album, upload/retry model, 기록완료 projection, history, thumbnail, evidence viewer, delete, 출입비번 표시를 현재 상태에서 **FEATURE FREEZE**한다.
2. Web Share와 GPS nearby suggestion은 freeze 범위 밖이다. 실제 업무 필요성이 확인되면 별도 Phase로 진행한다.
3. 다음 새 Codex 스레드의 첫 단계는 repository cleanup/optimization을 위한 **OPT-0 READ-ONLY AUDIT**다. 파일과 테스트를 `KEEP`, `CONSOLIDATE`, `DELETE CANDIDATE`, `GENERATED / SAFE TO CLEAN`으로 분류하고 근거와 영향을 기록한다. OPT-0에서는 삭제·수정하지 않는다.
4. 감사 결과를 검토한 후 실제 cleanup 범위를 결정한다. security, Rules, Auth, revision, requestId, upload replay, Emulator, PWA, performance, Hosting regression tests는 중요한 안전망이며 단순히 테스트 파일이라는 이유로 삭제하지 않는다.

## 2. 확정 요구사항과 현재 코드 대조

| 영역 | 확정 요구 | 현재 코드 상태 | 판정 |
| --- | --- | --- | --- |
| 호스팅 | Firebase Hosting과 `onnuriway.com` 사용 | `output: "export"`, `firebase.json` public=`out`, site=`onnuriway`; apex와 www 전환 기록 존재 | 구현·운영 기록 있음 |
| 모드 선택 | 회사명/로고 옆에서 네 모드를 인지 가능하게 선택, 모션과 터치 영역 유지 | 4개면 compact trigger + picker, 적으면 segmented control; 권한 없는 모드는 제외 | 구현됨 |
| 거래처 | 전 직원 조회·등록·수정, 주소/좌표·전화·출입정보·전경사진·전체보기 | Callable 기반 목록/저장/검색/역지오코딩/사진, 지역 directory, 최근 5개 ID 기록 | 구현됨 |
| 학교납품 | compact 카드와 리뉴얼된 field brief, 학교급 아이콘, 사진 확대 | 학교 검색/상세 cache, delivery field brief와 photo viewer 모듈 존재 | 구현됨 |
| 영업/홍보 | 방문 기록, 전화, 현장 사진, route planner, 배송 불필요 정보 제외 | 월별 assignment/profile/visit/history 및 route planner가 분리돼 있음 | 구현됨 |
| 재고 기본 | 냉장·냉동1·냉동2·샘플, 최대 수백 품목, D-100, 제품 사진 1개 | 독립 inventory contract/service/workspace와 네 장소, urgentDays 기본 100 | 구현됨 |
| 재고 입력 | 사진은 등록/수정 모두 촬영 전용, 초기 수량을 한 화면에서 저장 | camera capture 입력과 제품+초기 lot 저장 흐름 존재 | 구현됨; 실기기 미확인 |
| 재고 조사 | 직원별 ON/OFF, 지정일 미완료 강조, 조작한 유통기한만 확인 | sessionStorage preference, per-lot inspection, match-only 확인과 충돌 검증 | 구현됨 |
| 재고 상세 | 2행 고정 action, 더보기에 이력·비활성·삭제, 사진 확대 힌트 | 상세 footer와 more dialog, `showExpandHint`, lot 카드 `수정` 텍스트 존재 | 로컬·운영 실제 Chromium 확인됨 |
| 납품사진 | 오늘 route/day, camera/album upload, 기록완료 projection, customer history/viewer/delete | Memory-only workspace/upload, private Callable relay, thumbnail/evidence lazy load, delete reconciliation, Galaxy production 검증 | Phase 3A/3B/3C/3D 운영 완료·FEATURE FREEZE |
| 오프라인 | 조회 cache만 제한 허용, 민감 쓰기 queue 금지 | 검색/학교만 namespace IndexedDB, 거래처·재고는 Memory, 쓰기 queue 없음 | 구현됨 |
| 보안 | Client 직접 쓰기 금지, App Check/권한/revision/request ID/audit 유지 | Callable service와 Rules 경계, private no-store 응답 | 구현됨 |

## 3. 현재 아키텍처와 데이터 흐름

### Frontend

- Next.js 16.3.2 App Router, React 19.2.8, TypeScript strict, CSS Modules/전역 token을 사용한다.
- `src/features/app-shell/app-shell.tsx`가 인증된 session의 role scope와 feature flag로 모드를 구성한다. 거래처·영업·재고 Workspace는 동적 import로 분리된다.
- 공유 계약은 `src/domain/*`가 `functions/src/*/*-contract.ts`를 다시 export하는 방식이 많다. Client와 Functions의 Zod 응답 계약을 동시에 변경해야 한다.
- Firebase Web SDK의 Firestore는 `memoryLocalCache()`다. 영속성이 필요한 제한된 데이터는 별도 idb 모듈이 담당한다.

### 쓰기 경계

```text
UI form
  → client repository + Zod input parse
  → Firebase authenticated Callable + App Check
  → authorization/session/role 재검증
  → service transaction(revision + request ID)
  → Firestore/Storage + audit/event/receipt
  → Zod response parse
  → 현재 화면 Memory만 갱신
```

- 거래처: `companies/onnuri/customers/{customerId}`. 목록은 250개 이하 page schema와 cursor로 조회하며 5,000개에서 방어적으로 중단한다. 전경 사진은 Callable과 비공개 WebP variant를 사용한다.
- 재고: `companies/onnuri/inventoryProducts/{productId}` 아래 `lots`, `events`; 별도 `inventorySettings/current`, `inventoryCountCycles`, `inventoryRequests`. 목록은 100개 page, 상세에서 활성 lot와 이력을 읽는다.
- 재고 수량 작업은 metadata revision과 stock revision을 구분한다. `lotSummary`는 `includeSummary: true`인 새 Client에만 포함하도록 호환 배포가 적용됐다.
- 학교·영업 흐름은 기존 `schools`, `schoolFieldProfiles`, 월별 sales cycle/assignment/profile/visit 구조를 유지한다.

## 4. 현재 캐싱과 PWA 경계

| 데이터 | Memory | IndexedDB/local storage | Service Worker |
| --- | --- | --- | --- |
| 학교 검색 Catalog/최근 학교 | Memory index | IndexedDB, session/role/version namespace | 업무 응답 cache 안 함 |
| 학교 상세 공용정보 | 즉시 표시 | IndexedDB | 업무 응답 cache 안 함 |
| 학교 영업정보 | 활성 탭 | 저장하지 않음 | cache 안 함 |
| 학교 thumbnail/preview | Blob Memory | IndexedDB 24개/36MiB | 명시적 thumbnail route만 허용 |
| 학교 original | Memory | 저장하지 않음 | cache 안 함 |
| 거래처 목록/사진 | Memory | 최근 거래처 ID 저장 용량 20개, 기존 홈 표시는 최대 5개인 namespaced localStorage | cache 안 함 |
| 재고 목록/상세/사진/draft | Memory | 실사 모드 preference만 날짜·session 기준 sessionStorage | cache 안 함 |

- Serwist runtime cache version은 코드상 `phase35`다. App Shell navigation은 NetworkFirst(3초), public asset과 학교 thumbnail은 CacheFirst다.
- Firebase, Callable, Storage relay, `/api`, CSV, 거래처·재고·영업 응답은 runtime cache에 넣지 않는다.
- 로그아웃/세션 무효화는 `onnuriway:private:` storage, Blob URL, 검색·학교 상세·학교 사진 IndexedDB와 영업 Memory를 정리한다.
- 업데이트는 자동 `skipWaiting`하지 않고 사용자의 `업데이트` 선택 뒤 적용한다.

## 5. 마지막 확인 결과

### Phase 49에 문서화된 전체 검증 — 확인됨

- 단위 테스트 1,364개 통과, 일반 실행에서 통합환경 전용 13개 제외.
- 정적 운영 유사 UI E2E 10/10 통과.
- 실제 Firestore Emulator 통합 10/10 통과.
- ESLint, 앱/Functions TypeScript, 정적 운영 build, PWA/성능/Hosting gate 통과.
- 360/768/1280px와 1,000개 품목 목록 확인.
- 2026-09-13 09:28 KST Firebase Hosting 반영 후 두 공개 origin에서 GET/HEAD 25개씩 통과. 당시 worker SHA-256은 `1dfd4de1253236f806553930dab9432816eeb32c7443d3aff232b7777ec73d9f`.

### Phase 49 이후 마지막 작업 — 확인 범위 제한

- 임박 상품 필터를 검색창 아래 중앙 checkbox로 이동하고 검색창을 확장했다.
- 실사 토글 문구를 `재고조사` + 아래 `on/off`로 바꿨다.
- 상품 상세 사진 오른쪽 아래 확대 돋보기 힌트를 추가했다.
- 유통기한별 수량 카드의 `정보 수정`을 `수정`으로 바꿨다.
- 마지막 명령 `npm run build && npx firebase deploy --project onnuriway --only hosting`은 성공했다.
- 이 작은 변경 뒤 전체 단위/E2E/Emulator suite와 원격 worker hash 검사는 재실행하지 않았다.

### 초기 HANDOFF 문서 정리 당시 실행하지 않은 것

- 앱/Functions 코드 수정 없음.
- 테스트, typecheck, lint, build, bundle/PWA/Hosting verifier 실행 없음.
- 배포 및 운영 데이터 접근 없음.

### 2026-09-20 P0 회귀 확인 — 로컬

- 실제 Chromium에서 수정 전 360×800 화면을 캡처해 필터 세 개는 한 행의 3열이지만 `재고조사 off`가 가로로 표시되는 것을 재현했다. 원인은 `.countToggleLabel { display: inline-grid; }` 뒤의 `.countToggle > span:last-child { display: inline-flex; }`가 같은 요소의 display를 덮는 cascade였다.
- `src/features/inventory/inventory.module.css`에서 뒤쪽 범용 selector의 `display: inline-flex` 선언만 제거했다. 다른 간격·정렬·토글 동작은 바꾸지 않았다.
- 수정 후 production static export를 쓰는 격리 Chromium에서 `재고조사` 아래 `on/off`, 검색창 아래 3열, 44px 이상 터치 높이, 360px 가로 범위, 1,000개 목록을 computed style과 geometry로 확인했다. flex item인 label의 computed display는 CSS blockification에 따라 `grid`이며 상태 text의 top이 label top보다 아래다.
- 격리된 현재 소스 build는 기존 production `out`/worker를 바꾸지 않았고 98개 파일을 내보냈다. 이 로컬 build의 worker SHA-256은 `00cea3474b853a27b5ddff1091c5137e3333aa40e01ed82518dbdd57ee82cf54`이며 운영 worker와 다르므로 아직 배포되지 않은 build임이 명확하다.
- 제품 상세의 확대 힌트는 사진 버튼 우하단의 23×23 absolute element로 확인했다. 상세 하단은 스크롤 body와 분리된 footer에서 1행 `출고/입고/조정/정보 수정`, 2행 `수량 일치 확인/더보기`가 스크롤 전후 같은 위치를 유지했다.
- 최종 검증: 재고 UI 단위 40/40, 정적 production UI E2E 10/10, Firestore emulator 통합 10/10, 앱/Functions typecheck 통과. 변경 TypeScript 파일 ESLint는 오류 없이 통과했고 CSS 파일은 현재 ESLint 설정상 대상이 아니라 ignore 경고 1건만 발생했다.
- E2E의 이전 2열 geometry, `switch`로 남은 임박 checkbox role, 오래된 `유통기한 정보 수정` 접근성 이름도 현재 렌더링/코드에 맞춰 P0 테스트 기대만 갱신했다.

### 2026-09-20 P0 회귀 확인 — 운영 배포/PWA

- 새 배포는 실행하지 않았다. `https://onnuriway.com`과 `https://onnuriway.web.app`에서 공개 GET/HEAD 25개씩 통과했고, 두 origin의 worker SHA-256은 `35a673947f19f04005c71bcbb67400db6375e07a517055d078643de8bd3e9fcb`로 일치했다. worker는 `no-store`, root scope를 유지한다.
- Firebase Hosting live release는 `1789262169443000`, version `1274c8c40b063e3f`, release time `2026-09-13T01:16:09.443Z`로 조회됐다. 이는 이번 로컬 CSS 수정 전 배포다.
- 기존 Chrome 세션에서 실제 `새 버전이 준비되었습니다` 알림을 확인하고 `업데이트`를 적용했다. 로그인은 유지됐고 재고 화면이 다시 열렸으며, 운영 데이터 저장·실사 완료·상태 변경·사진 업로드는 하지 않았다.
- 운영 360×800 화면에서도 검색창 아래 필터 3열은 확인됐지만 `재고조사 off`는 가로였다. 반면 제품 사진 확대 힌트는 `display: grid`, `position: absolute`로 사진 우하단에 있었고, 상세 body는 `overflow-y: auto`, 2행 footer는 body 아래 별도 영역으로 viewport 하단을 유지했다.
- 확인 후 상세를 닫고 임시 viewport override를 원래대로 복원했다. 브라우저 warning/error log는 0건이었다. 이번 브라우저 확인은 기존 로그인 세션의 읽기만 사용했으며 운영 레코드를 생성·수정·삭제하지 않았다.

### 2026-09-20 P0 배포 준비 검증 — 미배포/차단

- 배포 후보는 `codex/mobile-action-reach`의 `fb173f13d5f1e271b6a34674253d88a4d903bc31`와 dirty worktree 전체로 만든 `out` 98개 파일 및 현재 `firebase.json` Hosting 설정이다. 대상은 Firebase project/site `onnuriway`/`onnuriway`, 산출물은 `out`이다. Functions·Rules·운영 데이터는 이 Hosting 후보에 포함되지 않는다.
- worktree에는 런타임 프런트 파일 100개와 Hosting/build 설정 3개의 미커밋 변경이 있으므로 소스 기준으로 “CSS 한 줄만 배포”되는 후보가 아니다. 다만 직전 운영 `out`과 이번 후보를 내용 비교한 결과, 공개 CSS의 실질 차이는 inventory 후행 rule의 `display:inline-flex` 제거와 그에 따라 생성된 `.inline-grid{display:inline-grid}` rule 추가였다. HTML/RSC, build manifest, webpack runtime, worker의 경로·hash 변경은 새 build ID, CSS hash, PWA revision 참조 갱신이다.
- 후보 식별값: `out` manifest SHA-256 `d17332b727c4ab008305069159e8e7719cb7ef24e66a3e20ee8b48f5a080eeee`, worker SHA-256 `4d0e468fd65b0f3d9b7cf434b045934e4b8f25b29816afd1c1df69093cf2d710`. 직전 운영 worker `35a673947f19f04005c71bcbb67400db6375e07a517055d078643de8bd3e9fcb`와 다르다.
- 새 실행: `npm run build` 통과, PWA build gate 통과, Hosting build gate 통과(98 exported/shipped, 69 precached, 초기 asset 9개). 최종 inventory CSS에는 `.countToggleLabel`의 `display:inline-grid`가 있고 후행 `span:last-child`에는 `align-items`/`gap`만 남았다. worker는 `skipWaiting: false`와 `SKIP_WAITING`, 새 CSS precache를 유지해 기존 사용자 승인형 업데이트 절차와 일치한다.
- 재사용: 직전 P0와 대상 소스/테스트가 바뀌지 않아 재고 UI 단위 40/40, 정적 production UI E2E 10/10, Firestore emulator 10/10, 앱/Functions typecheck와 변경 TypeScript ESLint 통과 결과를 재사용했다. 운영 두 origin/기존 worker/live release 및 실제 업데이트 알림 확인도 현 운영 기준 결과로만 재사용했으며 후보 배포 완료 근거로 사용하지 않는다.
- 차단: `npm run verify:performance:build`가 inventory CSS raw 29,349B로 28.5KiB(29,184B) 예산을 165B 초과해 실패했다. 예산을 완화하거나 코드를 추가 수정하지 않았다. 또한 실행 Node `22.12.0`은 `package.json`의 `>=22.13 <23` 요구보다 낮다. 호환 Node에서 동일 후보를 다시 만들고 성능 gate 실패 원인을 최소 범위로 해소하기 전에는 배포 승인 요청이 불가하다.
- 미확인: 후보는 배포하지 않았으므로 두 운영 origin의 후보 worker/hash 일치, 실제 설치 PWA의 후보 업데이트 알림·적용, 운영 360×800의 세로 `on/off`는 확인하지 않았다.
- 배포 후 확인 절차: 두 origin에 `verify-firebase-hosting-build.mjs --url`을 실행하고 worker hash/no-store/root scope를 대조한 뒤, 기존 로그인 세션에서 업데이트 알림을 사용자 동작으로 적용하고 로그인 유지·재고 3열·세로 `on/off`만 읽기 전용으로 확인한다. 이상 시 Firebase Hosting Release history에서 직전 version `1274c8c40b063e3f`로 rollback하고 두 origin verifier 및 worker `35a673947f19f04005c71bcbb67400db6375e07a517055d078643de8bd3e9fcb` 복원을 확인한다.

### 2026-09-20 P0 차단 해소 시도 — 미배포/Node 차단 유지

- inventory CSS에서는 선언 집합이 같던 `.photoOpen > span`과 `.photoExpandHint`를 한 규칙으로만 합쳤다. 선택자별 specificity와 모든 값은 유지되며 확대 힌트의 UI·동작·접근성은 바뀌지 않는다. 생성 inventory CSS는 29,349B에서 29,175B로 174B 감소해 28.5KiB 예산보다 9B 작아졌고 performance gate가 통과했다. budget/verifier는 변경하지 않았다.
- 현재 설치 확인 결과 nvm에는 Node `22.12.0`, `20.10.0`만 있고 Codex 번들 Node는 `24.19.0`이었다. `package.json`의 `>=22.13 <23`을 만족하는 기존 런타임이 없어 설치·다운로드·영구 환경 변경은 하지 않았다.
- Node `22.12.0`에서 한 잠정 검증은 inventory 단위 313/313, production static inventory E2E 10/10, runner의 demo emulator 통합 10/10, `npm run build`, PWA/performance/Hosting build gate 모두 통과했다. 이 결과는 엔진 요구를 만족하는 실행을 대체하지 않는다.
- 잠정 후보는 `out` 98개, manifest SHA-256 `25b5214dd9c22426fe27ac28b580c172dc5c38a9bcd4de4c68b5882d5c4a27f8`, worker SHA-256 `ee34c666cae3d0c45c84e5a74f0736ad24eed57a7c71afa88d8a0ede9974aa70`이다. 실제 배포와 운영 확인은 실행하지 않았다.
- 남은 차단은 호환 Node 부재 하나다. 기존 변경을 건드리지 않고 Node `22.13` 이상 `23` 미만 런타임을 제공한 뒤 같은 여섯 검증을 재실행해 모두 통과해야 `배포 승인 요청 가능`으로 전환한다.

### 2026-09-20 P0 호환 Node 최종 재검증 — 배포 승인 요청 가능/미배포

- 기존 nvm으로 LTS Node `22.23.2`를 설치·선택했다. npm은 `10.9.8`, 실제 Node binary는 `C:\nvm4w\nodejs\node.exe`이며 `package.json`의 `>=22.13 <23`을 만족한다. package/lockfile/engine은 변경하지 않았다.
- 호환 Node에서 inventory 단위 313/313, production static inventory E2E 10/10, demo Firestore Emulator 통합 10/10, `npm run build`, PWA/performance/Hosting build gate가 모두 통과했다.
- 최종 inventory CSS는 29,175B로 예산 이내다. `out`은 98개 파일, manifest SHA-256은 `852f72c1e5cb139791179a7c083cb5e9507a133fcb3152346fc92b5e9dac80ea`, worker SHA-256은 `df389ad66ac037b57cf4515f764a3a371bfb40fdd19ef8871d2856e9d7410d07`이다. Node 변경에 따른 PWA revision/hash 갱신 외 예상 밖 소스·기능 차이는 확인되지 않았다.
- P0 상태: **배포 승인 요청 가능 — 아직 미배포**. Firebase deploy와 운영 데이터 접근·변경은 실행하지 않았다.

### 2026-09-20 P0 운영 배포 및 검증 — 완료

- 승인된 `out` 98개 파일을 Node `22.23.2` 환경에서 Firebase project/site `onnuriway`/`onnuriway`의 Hosting에만 배포했다. Functions, Firestore/Storage Rules, Extensions와 운영 데이터는 변경하지 않았다.
- 새 live release는 `1789837912426000`, version은 `f1517baef9f1657f`, release time은 `2026-09-19T17:11:52.426Z`다.
- `https://onnuriway.web.app`과 `https://onnuriway.com`에서 기존 Hosting verifier가 각각 공개 GET/HEAD 25개 검사를 통과했다. 두 origin은 worker `df389ad66ac037b57cf4515f764a3a371bfb40fdd19ef8871d2856e9d7410d07`로 후보와 일치했고 `no-store`, root scope를 유지했다.
- 기존 로그인 Chrome 세션에서 `새 버전이 준비되었습니다` 알림을 확인하고 사용자 동작으로 업데이트를 적용했다. 로그인은 유지됐고 재고 화면이 정상 복귀했다.
- 운영 360×800에서 검색 아래 필터 세 개가 같은 행의 3열이고 `재고조사` 아래 `off`가 세로로 표시됨을 computed geometry/style로 확인했다. 상품 사진 확대 힌트는 우하단 23×23 absolute grid였고, 상세 body는 `overflow-y: auto`, 별도 footer는 하단에서 4개+2개의 두 행 버튼을 유지했다.
- 브라우저 console warning/error는 0건이었다. 상세를 닫고 임시 viewport override를 복원했으며 운영 레코드를 생성·수정·삭제하지 않았다.
- P0 상태: **완료 — 운영 배포 및 검증 완료**.

### 2026-09-20 P1 dirty worktree checkpoint 검증 — checkpoint 차단

- Node `22.23.2`/npm `10.9.8`, branch `codex/mobile-action-reach`, HEAD `fb173f13d5f1e271b6a34674253d88a4d903bc31`에서 확인했다. checkpoint 후보는 tracked 65개와 untracked 211개, 합계 276개 파일이며 tracked diff는 2,821 insertions/1,811 deletions다.
- 변경은 거래처 Callable·Rules·도메인·UI·관리자·지도/사진, 학교납품 현장정보·사진·검색, 영업/홍보 배정·경로·방문·내보내기, 재고 Callable·도메인·UI·감사, 공통 모드/모션/사진 UI, PWA/캐시, Firebase Hosting·Rules·Indexes, 테스트·검증 스크립트와 Phase 32~49 문서로 묶인다. `functions/src/index.ts`, app shell, Rules/Indexes와 테스트가 새 untracked 모듈을 직접 참조하므로 일부 그룹만 떼어 checkpoint하면 현재 운영 상태를 재현할 수 없다. typecheck/build/전체 검증에서 소스 누락 신호는 없었다.
- 현재 확정 UX와 어긋난 E2E 기대값만 최소 수정했다. 모바일 compact mode picker, 4모드/기능 플래그 차이, `납품 현장정보` 접근 이름, 영업 coral 색, 보이는 mode control의 touch target/motion 상태를 현재 구현에 맞췄다. 앱 기능 코드는 변경하지 않았다. `.env.example`의 재고 플래그 설명은 배포 완료 후에도 안전한 기본값 `false`를 유지한다는 뜻으로 바로잡았다.
- PASS: typecheck(app/Functions), lint, unit 1,364/1,364(13 skip), performance unit/gate 18/18, `git diff --check`, production build, PWA build gate(worker 41,238B), performance build gate(initial gzip 140,763B), Hosting build gate(98 exported/shipped, 69 precached), inventory static production E2E 10/10과 Firestore Emulator integration 10/10. 전체 `test:acceptance:emulator`도 12개 gate가 모두 통과했고 production user journey는 65 pass/10 skip이다.
- FAIL: `npm run test:acceptance`의 첫 dependency audit가 19건(critical 1, high 2, moderate 16)으로 중단된다. 직접 의존 Next `16.3.2`에 critical Windows-hosted server/Image Optimization advisory가 있고 `js-yaml`, `sharp`는 high다. 현재 앱은 Firebase static export라 Next 서버 경로 노출은 제한되지만 audit gate 실패 자체는 해소되지 않았다. 의존성 업그레이드 금지에 따라 `npm audit fix`는 실행하지 않았다. Emulator는 `firebase-functions` 구버전 경고도 출력했다.
- checkpoint에는 위 8개 기능/인프라 그룹의 소스·설정·Rules/Indexes·테스트·문서와 P1 E2E 기대값 수정을 함께 포함해야 한다. `output/`의 Playwright/acceptance/security/runtime 자료와 `customer-security-analysis.md`, `phase32-kakao-sdk-mobile.png`, `.next`, `out`, Functions 빌드, 로그·cache·로컬 env는 제외한다. 최종 확인 시점 `output/`은 10,805개/약 2.75GB였고 두 가시 파일도 `.gitignore`에 명시했다.
- P1 최종 상태: **checkpoint 차단**. dependency audit 차단을 별도 승인된 의존성 작업으로 해소하고 동일 audit·typecheck·lint·unit·Emulator acceptance·inventory integration·build 3종 gate를 다시 통과하기 전에는 checkpoint 승인이나 P2 시작이 안전하지 않다. commit, push, deploy, 운영 데이터 접근·변경은 실행하지 않았다.

### 2026-09-20 P1 dependency audit 최소 보안 패치 — checkpoint 차단

- Node `22.23.2`/npm `10.9.8`에서 root cause와 설치 경로를 확인한 뒤 직접 의존성만 최소 변경했다. `next`는 `16.3.2`에서 advisory 최소 수정판 `16.3.3`으로 정확히 고정했고, `sharp`는 `0.35.3 → 0.35.4`, `firebase-admin`은 `14.3.0 → 14.4.0`, 개발용 `firebase-tools`는 `15.28.1 → 15.30.2`로 올렸다. Functions manifest도 공유하는 `firebase-admin`/`sharp` 범위만 맞췄으며 `firebase-functions 7.3.2`, React/React DOM과 앱 코드는 변경하지 않았다.
- lockfile에서는 상위 의존성 갱신에 따라 15개 추가·8개 제거·17개 변경이 발생했고 최종 diff는 465 insertions/336 deletions다. `firebase-admin 14.4.0`이 `@google-cloud/storage 8.2.0`/Firestore 9 계열을 선택했고, 취약한 동일-major transitive는 `js-yaml 4.3.2`, `hono 4.13.8`, `morgan 1.12.1`, `qs 6.16.0`으로 해소됐다. direct dependency 추가나 `overrides`는 사용하지 않았다.
- audit는 변경 전 critical 1/high 2/moderate 16, 합계 19건에서 변경 후 moderate 7건으로 줄었다. Next·sharp·js-yaml 및 기존 firebase-admin storage 계열의 critical/high는 해소됐고 `npm run audit`의 high 이상 acceptance 임계치는 통과하지만, 일반 `npm audit`/`npm audit --json`은 여전히 실패한다.
- 남은 개발 경로는 `firebase-tools 15.30.2 → @google-cloud/pubsub 5.3.1 → @opentelemetry/core 1.30.1`, `csv-parse 5.6.0`, `stream-json 1.9.1`, `gaxios 6.7.1 → uuid 9.0.1`이다. production audit에도 `firebase-admin 14.4.0 → @google-cloud/storage 8.2.0 → gaxios 6.7.1 → uuid 9.0.1`의 moderate 2건이 남는다. 현재 최신 상위 direct 버전으로는 해소되지 않으며 각각 Pub/Sub 6/OpenTelemetry 2, csv-parse 7, stream-json 3, gaxios 7+/uuid 11+ 등 transitive major 변경 또는 호환성 미확인 override가 필요하다. npm의 자동 제안인 `firebase-tools 10.1.1` 강제 downgrade도 breaking 변경이므로 적용하지 않았다.
- 일반 audit가 통과하지 않아 지시된 stop condition에 따라 dependency 변경 후 전체 typecheck/lint/unit/acceptance/Emulator/E2E/build gate 재실행은 시작하지 않았다. `git diff --check`는 통과했고 예상 밖 앱/테스트 코드 변경은 없다. commit, push, deploy, 운영 데이터 접근·변경은 실행하지 않았다.
- P1 최종 상태: **checkpoint 차단**. upstream에서 안전한 상위 dependency 패치를 제공하거나 별도 승인 아래 transitive major/override 호환성을 검증하기 전에는 checkpoint 승인 요청이 불가하다.

### 2026-09-20 P1 moderate dependency graph 확정 — dependency 정책 결정 필요

- 일반 audit의 moderate 7개 노드 중 production 포함은 `gaxios`와 `uuid` 2개다. 경로는 `firebase-admin 14.4.0 → @google-cloud/storage 8.2.0 → gaxios 6.7.1 → uuid 9.0.1`이며, 같은 root `gaxios 6.7.1/uuid 9.0.1`은 개발용 `firebase-tools 15.30.2`에서도 공유된다. `npm audit --omit=dev`는 이 2건으로 실패한다.
- dev-only 5개는 `firebase-tools 15.30.2`를 root로 하는 집계 노드 `firebase-tools`, `@google-cloud/pubsub 5.3.1 → @opentelemetry/core 1.30.1`, `csv-parse 5.6.0`, `stream-json 1.9.1`이다. 안전 범위는 각각 Pub/Sub `6.0.1+`/OpenTelemetry Core `2.8.0+`, csv-parse `7.0.2+`, stream-json `3.5.0+`이지만 firebase-tools의 선언 범위는 Pub/Sub `^5.2.0`, csv-parse `^5.0.4`, stream-json `^1.7.3`이어서 모두 transitive major 변경이다. 설치된 firebase-tools `15.30.2`가 현재 최신이고 같은 major 내 상위 direct 업데이트도 없다.
- gaxios advisory 집계 범위는 `6.4.0–6.7.1`, uuid 영향 범위는 `<11.1.1`이다. gaxios v6의 마지막 릴리스가 `6.7.1`이고 firebase-tools는 `^6.7.0`, 최신 Storage `8.2.0`은 `^6.0.2`를 선언한다. 안전한 gaxios 7은 uuid 의존성을 제거했지만 두 부모 범위 밖의 major이며, uuid `11.1.1+` 강제 적용도 gaxios의 `^9.0.1` 범위 밖이다. 최신 firebase-admin은 `14.4.0`, 최신 Storage는 `8.2.0`이라 A/B 해법이 없고, gaxios 7 또는 uuid 11 override는 검증되지 않은 D 단계라 적용하지 않았다.
- 이번 조사에서는 dependency, lockfile, security override와 audit 정책을 변경하지 않았다. 기존 `@serwist/next → browserslist 4.28.9` override만 그대로다. 최종 결과는 일반 `npm audit` moderate 7건, `npm audit --omit=dev` moderate 2건으로 동일하다.
- 기존 high 이상 audit 정책은 변경 없이 통과하므로 전체 P1 회귀 검증을 실행했다. PASS: 앱/Functions typecheck, lint, unit 1,364/1,364(13 skip), Emulator acceptance 12/12 gate와 production journey 65 pass/10 skip, inventory production E2E 10/10, inventory Emulator integration 10/10, production build, PWA gate(worker 41,238B), performance gate(initial gzip 140,763B), Hosting gate(98 exported/shipped, 69 precached), `git diff --check`.
- FAIL: `npm run test:acceptance`의 정적 브라우저 단계는 224 pass/38 fail로 종료됐다. 34건은 `admin-navigation` fixture가 `운영 개요` heading을 만들지 못하는 공통 초기화 실패이며 1개를 단독 worker로 재실행해도 재현됐다. 나머지는 auth shell 색 대비 2건과 welcome particle geometry 2건이다. React/React DOM, esbuild, Playwright, axe-core에는 이번 dependency patch의 lockfile 변경이 없어 명백한 dependency 호환 회귀로 볼 근거가 없으며 앱 코드·테스트·기대값을 수정하지 않았다. inventory demo build 직후 Hosting gate가 demo project 값으로 한 차례 실패했지만 정상 production rebuild 후 세 build gate가 모두 통과해 생성 산출물 문제로 분리됐다.
- P1 최종 상태: **checkpoint 차단 — dependency 정책 결정 필요**. upstream의 호환 패치가 나오거나 transitive major/override를 별도 승인하고 Firebase Admin/Storage 및 CLI 호환성까지 검증해야 하며, 정적 브라우저 38건의 기존 구현/fixture 실패도 별도 최소 범위로 확인하기 전에는 checkpoint 승인 요청이 불가하다.

### 2026-09-20 P1 static acceptance 38건 해소 — dependency 정책 결정만 남음

- `admin-navigation` 34건은 제품 route/auth 회귀가 아니라 esbuild 공통 fixture가 브라우저용 `process.env`를 초기화하지 않아 import 시 `process is not defined`로 mount가 중단된 테스트 환경 문제(C)였다. `tests/e2e/admin-navigation.spec.ts`의 공통 define만 보완했고 그룹 34/34가 통과했다.
- auth shell 2건은 10.08px 브랜드 보조문구가 `#768b84`/`#fbfcf8`에서 3.51:1로 4.5:1 기준에 미달한 제품 스타일 회귀(A)였다. `src/app/globals.css`에서 기존 `--ink-soft`를 직접 사용해 4.71:1로 복구했다. particle 2건은 390×844, no-preference motion의 고정 animation fraction에서 orbit가 제목과 약 5.6px 겹친 제품 geometry 회귀(A)였고, `src/features/app-shell/welcome-greeting.module.css`의 중심만 6px 위로 옮겼다. threshold·허용 범위·retry는 바꾸지 않았으며 두 그룹은 각각 2/2 통과했다.
- 전체 재실행에서 드러난 200% 확대 mobile admin dock/320px settings overflow는 `src/features/admin/admin-navigation.module.css`의 고정 높이를 최소 높이로, `src/features/admin/admin-workspace.module.css`의 grid child를 `min-width: 0`으로 고쳤다. safe-config boundary의 동적 chunk 완료 경쟁은 `tests/e2e/app-shell.spec.ts`에서 `networkidle` 상태를 기다리게 했다. 변경 파일은 위 6개 코드/fixture 파일과 이 문서이며 앱 기능·dependency/package/lockfile/audit 정책은 변경하지 않았다.
- 최종 정적 browser suite는 262/262 통과했다. 전체 P1 회귀도 앱/Functions typecheck, lint, unit 1,364 pass(13 skip), `test:acceptance`, Emulator acceptance 12/12 및 production journey 65 pass/10 skip, inventory production E2E 10/10, inventory Emulator integration 10/10, production build, PWA gate(worker 41,238B), performance gate(initial gzip 140,764B), Hosting gate(98 exported/shipped, 69 precached), `git diff --check`가 모두 통과했다.
- P1 상태: **static acceptance 해결 — dependency 정책 결정만 남음**. 일반 audit moderate 7건과 production audit moderate 2건은 그대로이며 commit, push, deploy, 운영 데이터 접근·변경은 실행하지 않았다.

### 2026-09-20 P1 dependency security exception — checkpoint 승인 요청 가능

- audit 7개 node는 고유 Moderate advisory 4개(`uuid` CVE-2026-41907, OpenTelemetry Core CVE-2026-54285, `csv-parse` CVE-2026-85063, `stream-json` CVE-2026-71429)와 부모 aggregate 3개다. production 2개 node는 `firebase-admin → @google-cloud/storage → gaxios 6.7.1 → uuid 9.0.1`의 동일 uuid advisory이고 나머지 5개 node는 `firebase-tools` 개발 경로다. 상세 경로·버전·패치 범위는 `docs/phase-17-completion.md`에 기록했다.
- 설치 소스에서 gaxios는 `uuid.v4()`를 buffer/offset 없이 호출하며 advisory 대상 v3/v5/v6을 사용하지 않았다. 급식길의 인증된 Storage save/download/delete 경로도 UUID API나 buffer/offset을 제어하지 못해 production 취약 동작은 reachable하지 않다. dev 항목은 Pub/Sub emulator, Auth/Database import, CLI의 Next dependency 분석에만 있고 production runtime/bundle이나 untrusted production request에는 포함되지 않는다.
- `firebase-admin 14.4.0`, `firebase-tools 15.30.2`, `@google-cloud/storage 8.2.0`은 2026-09-20 현재 최신 stable이고 안전한 동일-major 경로가 없다. 범위 밖 major override는 특히 stream-json subpath 호환성을 깨뜨릴 수 있어 적용하지 않았다. dependency/package/lockfile/audit gate와 제품 코드는 변경하지 않았고 직전 전체 P1 PASS를 유지한다.
- Moderate 7건을 숨기지 않고 **2026-10-20까지 known accepted transitive risk**로 일시 수용한다. 새 Firebase stable, Storage의 gaxios 7+ 이동, severity High/Critical 상향, Storage/HTTP 구조 변경 시 즉시 재검토하며 High/Critical은 계속 checkpoint 차단이다.
- P1 상태: **checkpoint 승인 요청 가능 — moderate 7건 문서화된 일시적 예외, 아직 미커밋**. commit, push, deploy, 운영 데이터 접근·변경은 실행하지 않았다.

## 6. 실행·검증 명령

```powershell
# 개발
npm install
npm run dev

# 기본 정적 검증
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run verify:pwa:build
npm run verify:performance:build
npm run verify:hosting:build

# 재고 집중 검증
npm run test:inventory
npm run test:e2e:inventory

# 전체 기존 수용 검증(시간과 Emulator 필요)
npm run test:acceptance
npm run test:acceptance:emulator

# 빌드된 Firebase Hosting 정적 export 로컬 실행
npm start -- --port 3000
```

배포가 명시적으로 요청된 경우에만 실행한다.

```powershell
npx firebase deploy --project onnuriway --only hosting
node scripts/verify-firebase-hosting-build.mjs --url https://onnuriway.web.app
node scripts/verify-firebase-hosting-build.mjs --url https://onnuriway.com
```

Functions는 전체 무차별 배포를 피하고 변경된 Callable 목록과 배포 순서를 Phase 문서에서 확인한다. Phase 49 이후 schema를 롤백해야 할 때는 `.cache/deploy/inventory-compat-phase49-20260913-0910` 호환 패키지를 기준으로 하며, 엄격한 구 parser로 바로 되돌리지 않는다.

## 7. 주의점

- `.env.local`, `.env.production.local`은 무시되는 실제 설정이다. 값 또는 Firebase/Kakao 키를 문서/로그/commit에 넣지 않는다.
- `.firebaserc` 기본 project는 `demo-onnuriway`이고 staging/production alias만 `onnuriway`다. 운영 명령은 반드시 `--project onnuriway`를 명시한다.
- 운영 데이터로 기능 검증을 하지 않는다. 제품/수량/실사/사진/거래처를 테스트 목적으로 저장·수정·삭제하지 않는다.
- 현재 worktree에는 서로 연관된 대규모 미커밋 변경이 있다. 새 스레드는 자동 포맷/대량 정리 전에 diff를 확인하고 unrelated 변경을 되돌리지 않는다.
- `AGENTS.md`의 Next.js 생성 블록을 유지하고, Next API/구조를 바꿀 때는 설치된 `node_modules/next/dist/docs/`의 관련 문서를 먼저 읽는다.
- 실제 Galaxy S20+ 카메라, 설치 PWA 키보드/뒤로가기, 사진 촬영 저장 체감은 자동 브라우저 검증으로 대체할 수 없다.

## 8. 다음 작업 우선순위

### P0 — 최신 UI의 짧은 회귀 확인

1. 로컬 360×800 실제 Chromium에서 재고 필터 3열, `재고조사` 아래 `on/off`, 확대 힌트와 상세 고정 버튼을 확인했다.
2. `.countToggle > span:last-child`의 `display: inline-flex` 덮어쓰기를 실제 재현했고 해당 선언만 제거했다. 격리 production E2E와 computed style 검증이 통과했다.
3. 최신 Hosting의 두 origin, worker hash, live release, 로그인 유지와 PWA 업데이트를 읽기 전용으로 확인했다.
4. inventory CSS 성능 차단과 Node 환경 차단을 해소하고 승인된 후보를 Hosting에 배포했다. 두 origin, worker/PWA 업데이트, 360×800 재고 UI와 console을 확인했으며 현재 상태는 **완료 — 운영 배포 및 검증 완료**다.

### P1 — 현재 dirty worktree 전체 검증과 checkpoint

1. `typecheck`, `lint`, 단위, 재고 E2E/Emulator, build와 세 verifier를 현 소스에서 다시 실행한다.
2. 실패가 없으면 변경을 기능 단위로 검토하고 사용자의 commit 지시를 받아 checkpoint를 만든다. 현재 HEAD만으로는 운영 코드가 재현되지 않는다.

### P2 — 성능과 캐싱

1. 재고의 explicit refresh/reconnect가 모든 100개 page를 다시 읽는 비용과 500개 실사용 규모의 체감 시간을 계측한다. 증거 없이 persistent cache나 realtime listener를 추가하지 않는다.
2. 거래처의 가시 상태 60초 재검증이 8명 사용 환경에서 필요한지 read 수와 stale 허용 시간을 계측한다. 민감 거래처 문서를 durable cache로 옮기지 않는다.
3. Service Worker cache version `phase35` 명명과 현재 Phase 49+ 릴리스의 관계를 정리하되, cache key 변경은 업데이트/오프라인 회귀 검증과 함께 수행한다.
4. 기존 bundle budget(초기·거래처·재고 lazy chunk)과 1,000개 목록 progressive rendering을 최신 코드에서 다시 측정한다.

### 2026-09-20 P2-A 체감속도 연구 — 완료/구현 전

- 격리 production static export + Chromium 360×800 + demo Firebase Emulator에서 100/500/1,000개 재고를 계측했다. 목록 Callable은 1/5/10회, 논리 문서 read는 query cursor sentinel을 포함해 약 100/504/1,009개다.
- warm normal first usable 목록은 500개 약 1.34초, 1,000개 약 1.84초였다. 1,000개 각 page에 300ms를 더하면 약 4.84초였고, 같은 세션 모드 재진입도 context+10 page를 다시 읽어 약 4.35초였다. 첫 100개 run은 callable cold start가 섞여 절대시간 비교에서 제외했다.
- 재고 검색/장소/필터는 1,000개에서도 약 27ms·추가 요청 0회였다. 상세→목록 복귀도 목록 재조회 0회다. 실제 병목은 모든 page 완료 전 목록을 숨기는 구조와 모드 재진입 시 Memory/UI 상태를 버리는 구조다.
- 거래처는 background 성공 중 기존 목록을 유지하지만 250개 전체 page를 60초 timer 및 focus/online/visibility에서 재검증한다. refresh 실패와 retry는 기존 목록을 숨긴다. 8명 실제 활성시간·focus 빈도·현재 거래처 수는 미확인이다.
- `phase35` cache 이름은 namespace일 뿐 현재 Phase와 맞출 필요가 없다. navigation/public asset/학교 thumbnail 정책과 사용자 승인형 worker update를 유지하며 업무 데이터 cache는 추가하지 않는다.
- P2-B 권장 순서: (1) session Memory revalidation coordinator와 in-flight/event dedupe·freshness UI, (2) 인증 namespace별 목록/필터/scroll snapshot 복원, (3) 재고 첫 100개 page progressive publish. durable cache, realtime listener, offline write queue는 범위 밖이다.
- 임시 계측 코드는 제거했다. 제품 최적화, dependency, deploy, commit/push, 운영 데이터 접근·변경은 하지 않았다. 실제 Galaxy S20+ 설치 PWA/현장 네트워크는 미확인이다.

### 2026-09-20 P2-B revalidation coordinator/freshness — 완료/미배포

- 범위는 inventory/customer의 session Memory revalidation만이다. `uid:sessionVersion:permissionsVersion`별 coordinator가 in-flight 요청을 합치고 last-success 60초 TTL로 focus/visibility/online 연속 이벤트를 coalescing한다. logout·권한/session 변경과 인증 실패에서는 coordinator와 민감 화면 상태를 폐기한다. IndexedDB, persistent Firestore cache, Service Worker 업무 cache, realtime listener, offline write queue는 추가하지 않았다.
- background 갱신은 기존 목록을 유지하며 `최신 정보 확인 중 · 마지막 확인 HH:MM`, 성공 후 `마지막 확인 HH:MM`, 일시 실패 후 `갱신 실패 · 기존 정보 표시 · 마지막 확인 HH:MM`을 작은 status text로 표시한다. 인증/권한 실패는 기존대로 목록과 편집 상태를 비운다. 거래처의 기존 offline clear 정책과 재고의 in-memory draft 유지 정책도 바꾸지 않았다.
- 대표 순차 이벤트 기준 revalidation batch 수는 customer가 최초 성공 뒤 TTL 안 visibility+focus+online에서 기존 총 4회(최초 1+추가 3) → 총 1회, TTL 이후 같은 연속 이벤트에서 총 4회 → 총 2회(최초 1+갱신 1)다. inventory는 TTL 안 기존 총 2회(online이 1회 추가) → 총 1회, TTL 이후 기존 총 3회(visibility+online) → 총 2회다. 동시에 들어온 이벤트/in-flight는 한 promise만 사용한다. 한 inventory batch는 context 1회와 전체 100개 page 요청을 포함하므로 1,000개에서는 억제한 batch당 Callable 11회(context 1+list 10)를 피한다.
- write의 authoritative 성공/실패 처리는 변경하지 않았다. 거래처 저장 뒤 `retry`, 재고 설정 저장 뒤 `refresh`는 force revalidation으로 TTL을 우회한다. 재고 수량/lot/상품 write는 기존 mutation 응답과 `InventoryListReconciler`를 계속 사용하며 불필요한 전체 목록 read를 새로 만들지 않는다.
- PASS: coordinator/customer/inventory 집중 34/34, customer 전체 265/265, inventory unit/Functions 315/315, performance 18/18, PWA 17/17, typecheck(app/Functions), lint, `git diff --check`, production static build, PWA/Hosting build gate, inventory production UI E2E 10/10 + demo Emulator integration 10/10, customer mobile Chromium E2E 24/24. 성능 build gate도 통과했다(initial gzip 140,763B, customer lazy 36,705B/36KiB, inventory lazy 25,028B/25KiB). P2-B의 lazy-only 증가만 customer +0.5KiB/inventory +1KiB 예산으로 기록했고 초기·CSS·다른 feature 예산은 바꾸지 않았다.
- 남은 위험: 실제 8명 사용 환경의 focus 빈도/read 감소량과 Galaxy S20+ 설치 PWA 체감은 아직 미측정이다. 60초 TTL 안에는 다른 사용자의 최신 write가 늦게 보일 수 있지만 강제 refresh/write 후 최신화는 억제하지 않는다. 이번 단계는 mode unmount 뒤 목록/필터/scroll을 복원하지 않으므로 모드 재진입은 여전히 전체 목록을 읽는다.
- 다음 단계는 같은 session namespace와 invalidation 경계를 재사용해 **Memory snapshot 복원**을 진행해도 된다. 다만 재고 첫-page progressive publish는 그 다음 단계로 분리하고, snapshot 단계에서 logout/session 변경·offline 정책·write reconcile을 다시 회귀 검증한다. deploy, commit, push, dependency, P3 디자인 변경은 실행하지 않았다.

### 2026-09-20 P2-B2 session Memory snapshot 복원 — 완료/미배포

- customer와 inventory에 각각 작은 module Memory snapshot store를 두고 namespace당 feature snapshot을 최대 1개만 보관한다. namespace는 기존 coordinator의 `uid:sessionVersion:permissionsVersion`을 그대로 쓰며 다른 namespace가 들어오면 이전 coordinator·snapshot·reconciler를 먼저 폐기한다. durable cache, IndexedDB, local/sessionStorage 업무 snapshot, 사진/Blob cache는 추가하지 않았다.
- customer snapshot은 authoritative 목록·freshness/last-success와 검색어·검색창 상태·scroll만 저장한다. inventory snapshot은 authoritative context/전체 목록·기준일·freshness/last-success와 검색어·장소·임박/비활성 필터·표시 limit·scroll만 저장하며 기존 `InventoryListReconciler`도 같은 namespace에서 유지한다. editor/form draft, modal, busy/error, mutation 중간값은 저장하지 않는다.
- warm 재진입은 snapshot을 첫 render부터 사용한다. TTL 안에는 customer/list와 inventory context/list 요청이 모두 0회이며, TTL 만료 시에도 snapshot을 먼저 표시한 뒤 기존 coordinator로 background revalidation한다. 1,000개 inventory 대표 시나리오는 이전 context 1 + list 10 = 11회에서 TTL 안 context 0 + list 0 = 0회로 줄었다. P2-A의 약 4.35초 전체 재조회 loader 대신 동기 Memory render/다음 paint에 기존 목록을 사용할 수 있게 됐으며 별도 절대시간 필드 계측값은 만들지 않았다.
- 모드 재진입 때 customer 검색어·검색창·scroll, inventory 검색어·장소·임박/비활성 필터·표시 limit·scroll을 복원한다. scroll은 목록 commit 뒤 유효 최대 범위로 clamp하며 layout-effect cleanup으로 DOM 축소 전 위치를 보존한다. 데이터가 줄면 범위를 벗어난 위치로 강제 이동하지 않는다.
- logout은 두 store를 즉시 clear하고, uid/sessionVersion/permissionsVersion 변경은 snapshot 반환 전에 이전 entry를 폐기하며, 인증/권한 실패도 catalog/UI를 비운다. customer offline clear와 inventory write/draft 정책은 유지했다. customer authoritative save에는 write generation을, inventory에는 기존 reconciler와 authoritative product update를 적용해 늦은 목록 응답이나 재진입 snapshot이 write 결과를 되돌리지 못하게 했다.
- PASS: snapshot/coordinator 집중 39/39, customer 전체 270/270, inventory unit/Functions 320/320, auth 28/28와 logout snapshot 직접 회귀 1/1, performance 18/18, PWA 17/17, typecheck(app/Functions), lint, production static build와 performance/PWA/Hosting gate, inventory production UI E2E 10/10 + demo Emulator integration 10/10, customer mobile E2E 전체 24/24 및 snapshot remount 집중 4/4. 최신 build gate는 initial gzip 140,764B, customer lazy 36,812B/36KiB, inventory lazy 24,926B/25KiB, worker 41,238B, exported/shipped 98개·precache 69개로 통과했다.
- 남은 위험은 snapshot이 탭 reload/종료에서 사라지는 의도된 Memory 범위, 60초 TTL 동안 다른 사용자의 write가 늦게 보일 수 있는 점, 실제 Galaxy S20+·현장 네트워크 T2 미계측이다. P2-B3 첫-page progressive publish는 진행 가능하지만, page 중간 publish가 retained reconciler/write generation을 우회해 authoritative write를 되돌리지 않도록 결합해야 한다. deploy, commit, push, dependency, P3 및 progressive publish는 실행하지 않았다.

### 2026-09-20 P2-B3 inventory first-page progressive publish — 완료/미배포

- 기존 `listInventoryProducts` 100개 cursor 계약과 5,000개 방어 한계는 그대로다. repository가 각 page 뒤 dedupe된 누적 목록과 page count/complete만 callback으로 내보내고, workspace가 기존 coordinator task 안에서 snapshot listener로 publish한다. 별도 서버 contract, durable cache, 상태관리 계층은 추가하지 않았다.
- cold load는 첫 page가 오기 전까지만 기존 loading을 유지하고 첫 page부터 실제 카드·검색·장소/필터를 사용할 수 있다. 이후 page는 `최신 정보 확인 중` freshness 아래 비차단으로 합쳐진다. stale refresh는 기존 full snapshot을 baseline으로 유지하면서 도착한 page만 덮어쓰고, final page에서 baseline을 제거해 전체 서버 catalog를 authoritative하게 확정한다. 표시 limit·scroll은 B2 snapshot 정책을 유지한다.
- 모든 partial/final publish는 현재 coordinator generation과 namespace 및 retained reconciler identity를 검사한다. `InventoryListReconciler`는 매 page마다 기존 baseline/누적 page 위에 in-flight write 결과를 마지막으로 적용하므로 입고·출고·조정·lot/product write 직후 늦은 page가 값을 되돌리지 않는다. final reconcile에서는 서버에서 사라진 기존 row도 정상 제거된다.
- 통제된 300ms/page 기준 pagination T2는 500개 1,500ms(5 page 완료) → 300ms(첫 page), 1,000개 3,000ms(10 page 완료) → 300ms다. T4는 각각 1,500ms/3,000ms로 동일하다. 요청은 5/10회, 논리 read는 약 504/1,009개로 변경 전과 같으며 E2E의 150ms/page 1,000개에서도 terminal page 전에 60개 카드와 검색이 usable함을 확인했다.
- page 실패는 이미 publish된 목록을 `stale-error`로 유지하고, 인증/권한 실패는 partial catalog까지 폐기한다. refresh 중 모드 재진입은 같은 in-flight를 join하고 현재 partial snapshot을 즉시 복원하며 이후 page 알림을 이어받는다. logout/session/permissions/offline invalidation 뒤의 늦은 callback은 generation/reconciler guard로 snapshot에 들어오지 않는다.
- PASS: progressive 집중 44/44, inventory unit/Functions 328/328, auth/logout 29/29, performance 18/18, PWA 17/17, typecheck(app/Functions), lint, production build와 performance/PWA/Hosting gate, inventory production UI E2E + demo Emulator 10/10. 최신 build gate는 initial gzip 140,765B, inventory lazy 25,163B/25KiB, worker 41,238B, exported/shipped 98개·precache 69개다. `git diff --check`도 통과했다.
- P2의 coordinator/freshness, session snapshot 복원, inventory progressive publish 3단계는 모두 완료됐다. 다음은 실제 Galaxy S20+ 설치 PWA와 현장망에서 T2/T3/read 감소를 재측정한 뒤 상세 cache 또는 제한적 JS prefetch가 필요한지 판단한다. customer progressive, inventory detail cache, JS prefetch, persistent cache, realtime listener, offline queue, dependency, deploy, commit/push, P3는 실행하지 않았다.

### 2026-09-20 P2 checkpoint 통합 검증 — 승인 요청 가능/미커밋·미배포

- P1 checkpoint `0766882` 이후 dirty worktree 28개 파일은 revalidation/freshness, customer·inventory session Memory snapshot, inventory first-page progressive publish와 그 테스트·성능 budget·두 P2 문서뿐이다. unrelated 변경은 확인되지 않았다.
- PASS: lint, app/Functions typecheck, 전체 unit 1,395/1,408(13 skip), `npm run test:acceptance`, `npm run test:acceptance:emulator`, safe-config/customer mobile 포함 browser 262/262, production full user journey 65/75(10 skip), inventory production UI E2E + demo Emulator 10/10, P2 집중 55/55, production build, PWA/performance/Hosting gate, `git diff --check`. 첫 acceptance의 safe-config mobile 1건은 cold compile 중 5초 assertion을 넘긴 일시 실패였고 동일 브라우저 전체 및 acceptance 전체 재실행에서 통과했다. acceptance emulator가 마지막에 demo `out/`을 만든 뒤 production build를 다시 생성해 세 build gate를 최종 확인했다.
- 핵심 계약은 1,000개 TTL 내 재진입 context/list 0회, stale snapshot 즉시 표시 뒤 background revalidation, 첫 100개 page의 terminal 이전 usable publish, 500/1,000개 요청 5/10회·논리 read 약 504/1,009개 유지, write/reconciler 우선, namespace/logout/auth·permission invalidation, refresh/page 실패 시 usable 목록 유지로 모두 통과했다.
- 최종 build 수치는 initial gzip 140,765B, customer lazy 36,812B/36KiB, inventory lazy 25,163B/25KiB, worker 41,238B, exported/shipped 98개, precache 69개다. 성능 gate는 5,000개 index 109.59ms, search p95 1.25ms·max 5.22ms, typing network 0회로 통과했다.
- 남은 위험은 실제 Galaxy S20+·현장망 및 8명 동시 사용에서의 T2/T3/read 감소 미계측, 의도된 탭 Memory 수명, 60초 TTL 내 타 사용자 write 지연 가능성, customer lazy budget 잔여 52B와 inventory lazy 잔여 437B다. npm audit의 firebase-tools 계열 moderate 7건은 P1의 문서화된 일시 예외이며 dependency는 변경하지 않았다.
- **P2 checkpoint 승인 요청 가능 — 아직 미커밋/미배포**

### 2026-09-20 P2 운영 배포·Galaxy S20+ 체감 검증 — 완료

- checkpoint `4f0407c10eacc2b219ab805c543148f8f63efa96`을 Firebase Hosting release `1789911750990000`, version `86903327ba3c41a4`로 배포했다. 두 production origin verifier와 worker SHA가 일치했고, PWA 업데이트 뒤 로그인 유지가 정상이며 console warning/error는 0건이었다. rollback은 필요하지 않다.
- 실제 Galaxy S20+에서 모드 재진입 시 이전처럼 전체 loading을 다시 기다리는 느낌이 사라졌고, 방금 보던 목록 위치·scroll 위치·검색/필터 상태가 즉시 복원됐다. 사용자는 이전 버전보다 체감속도가 명확히 빨라졌다고 확인했다. 이는 사용자 체감 확인이며 ms 기반 T2/T3 현장 계측 결과는 아니다.
- 기존 last-success 60초 TTL과 인증 namespace별 Memory-only 경계는 유지한다. 8명 동시 사용의 실제 read 비용은 아직 미측정이다.
- 현 시점에서는 inventory detail cache나 제한적 JS prefetch를 추가할 필요성이 확인되지 않았다. **P2 완료 — checkpoint/운영 배포/실기기 체감 검증 완료**

### 2026-09-21 재고 제조사 Master M1 — 완료/미배포

- `companies/onnuri/inventoryManufacturers/{manufacturerId}`에 `manufacturerId`, `name`, `normalizedName`, `active`, `revision`, `createdAt`, `createdBy`, `updatedAt`만 저장한다. NFC·trim·공백 정리 뒤 기존 거래처명 규칙과 같은 소문자/문장부호/공백 제거로 exact normalized name을 만들고, SHA-256 결정적 ID의 `companies/onnuri/inventoryManufacturerNames/{hash}` reservation을 같은 transaction에서 점유해 동시 중복 생성을 차단한다. fuzzy 자동 차단·병합과 hard delete는 없다.
- `listInventoryManufacturers`는 최대 500개 master를 bounded read한 뒤 active만 반환한다. `createInventoryManufacturer`는 delivery/sales/admin, `updateInventoryManufacturer`의 rename/deactivate는 admin만 허용하며 모든 mutation은 기존 active employee/session/permission transaction 재검증, 영구 request receipt/idempotency, revision conflict, append-only audit를 사용한다. viewer는 read-only다. 기존 default-deny Rules가 master와 reservation의 client read/write를 모두 막으며 새 Rules·복합 index는 추가하지 않았다.
- 상품의 기존 `manufacturer` string은 legacy fallback이자 선택 시점 canonical name snapshot으로 유지하고 `manufacturerId`만 optional로 저장한다. 신규/변경 연결은 active master를 요구하고 canonical name을 snapshot하며, 비활성화된 기존 연결은 ID와 snapshot을 보존한 채 다른 상품 수정/표시가 가능하다. rename/deactivate는 기존 상품을 rewrite하지 않으며 legacy string-only 상품도 그대로 동작한다. migration/backfill은 없다.
- 구형 strict client 보호를 위해 서버 전용 확장 Zod contract와 `includeManufacturerReference` opt-in을 사용한다. opt-in하지 않은 기존 list/detail/mutation 응답에서는 `manufacturerId`를 재귀적으로 제거하고 기존 `includeSummary`와 독립적으로 처리한다. 현재 frontend repository/form은 opt-in하지 않으며 제조사 picker·검색·최근 사용 UI는 M2로 남겼다.
- PASS: inventory gate 374/374, 전체 unit 1,425/1,439(14 skip), production inventory E2E 10/10, 격리 Emulator transaction/Rules 11/11, 전체 Rules 41/41, app/Functions typecheck, lint, Functions build, production static build, PWA/performance/Hosting gate, `git diff --check`. frontend 코드를 추가하지 않아 inventory lazy JS gzip 25,595B/25KiB와 inventory CSS raw 29,184B 예산 수치는 그대로다. deploy, commit/push, 운영 데이터 접근은 실행하지 않았다. **M2 dynamic picker 진행 가능**이다.

### 2026-09-21 재고 제조사 Master M2 — 완료/미배포

- 새 품목/수정 form의 제조사 문자열 입력을 기존 BottomSheet 기반 picker로 교체했다. picker를 열면 active master 최대 500개를 한 번 읽고, 검색은 `name`/`normalizedName`을 기준으로 Memory에서만 수행한다. 검색창은 자동 focus하지 않으며 신규 제조사 추가 화면의 이름 입력에서만 focus한다. 최근 선택은 인증 session namespace별 Memory에 최대 5개를 최신순·중복 제거로 보관하고 logout/session·권한 version 변경 시 폐기한다. persistent cache, realtime listener, fuzzy dependency는 추가하지 않았다.
- delivery/sales/admin은 active 제조사를 선택하고 새 제조사를 추가할 수 있다. 신규 추가는 loaded 목록에서 단순 유사 후보를 안내하고 create Callable 성공 즉시 현재 상품에 선택하며, exact duplicate 서버 거절 시 입력을 유지한 채 기존 제조사 선택을 안내한다. viewer에는 생성 UI를 노출하지 않는다. inactive 기존 reference는 snapshot과 함께 경고 표시하고 선택 목록에서는 제외하며, legacy string-only 상품은 picker를 열거나 수정 form을 저장했다는 이유만으로 자동 연결하지 않는다.
- 기존 strict client와 M1 response 계약을 유지했다. 기본 inventory repository는 opt-in하지 않고, 별도 동적 manufacturer repository의 reference read와 manufacturer-aware save만 `includeManufacturerReference`를 사용한다. 명시적 `clearManufacturerReference: true` write intent를 추가해 `제조사 없음`에서 `manufacturer: ""`와 실제 document의 `manufacturerId` 제거를 같은 기존 revision/request ID/idempotency/audit transaction으로 처리한다. 필드가 없는 구형 client는 기존 ID를 보존하고, clear와 새 ID를 함께 보내면 contract가 거절한다. migration/backfill과 M1 master/reservation 재설계는 없다.
- product editor를 별도 lazy boundary로 분리하고, 작은 manufacturer trigger와 실제 picker/repository/UI를 다시 분리해 picker는 사용자가 제조사 버튼을 누를 때만 로드한다. 360px에서 overflow가 없고 모든 picker target은 44px 이상이며 dialog/combobox/listbox/option semantics와 방향키 탐색을 제공한다. Back/취소는 form draft를 바꾸지 않고, local 검색 중 추가 network 요청은 0회다.
- PASS: manufacturer/form/Functions 집중 159/159와 backend 집중 76/76, inventory unit/Functions 391/391, production inventory E2E 10/10, Emulator integration 11/11, app/Functions typecheck, lint, production build, performance unit 18/18, PWA/performance/Hosting build gate, `git diff --check`. 최종 bundle은 inventory base JS 24,834B gzip, workspace JS 22,603B gzip, manufacturer picker 3,727B gzip, trigger 802B gzip, inventory CSS 29,184B raw, manufacturer CSS 3,010B raw이며 기존 budget을 완화하지 않았다. admin rename/deactivate UI, dependency 변경, migration/backfill, deploy는 실행하지 않았다. **M2 완료**다.

### 2026-09-21 inventory mobile controls checkpoint — 운영 배포 완료

- commit `6c17f324dd041b7bd3fcc161d6040f0a139a094b` (`Refine inventory mobile controls`)에서 단위 preset을 `낱개 / 봉 / 팩 / 병 / 직접입력`으로 정리했다. 첫 행은 `낱개 / 봉 / 팩`, 둘째 행은 `병 / 직접입력` 2열이다. 기존 `개`는 사용자에게 `낱개`로 표시하되 신규 `낱개` preset의 canonical/storage value는 기존 `개`를 사용한다. 기존 literal `낱개` 데이터는 보존하고 migration/backfill은 없으며 unit lock과 재고 처리 계약을 유지한다.
- 검색창 오른쪽에 sliders 계열 `목록 옵션` 버튼을 두고 BottomSheet에 `표시 옵션`(비활성 품목 보기, 임박 상품만 보기)과 `작업 모드`(재고조사 OFF/ON)를 구분했다. 기존 검색·filter·snapshot·revalidation 상태 로직은 변경하지 않았다.
- 구역 선택 `전체 / 냉장 / 냉동1 / 냉동2 / 샘플`은 회청색 container, subtle raised surface, 선택 상태 inset 표현과 44px touch height를 사용하며 360px에서 가로 overflow가 없다.
- Firebase Hosting release `1789974931146000`, version `03c10d3f79c62a9b`로 `2026-09-21 16:15:31 KST`에 Hosting만 배포했다. worker SHA-256은 `8b95bd550d8e3ee332126708d0991439ce69ed86b595a58c6f28ea8fbf4dc7ce`고 `https://onnuriway.com`·`https://onnuriway.web.app` verifier가 모두 통과했다. Functions, Rules, Indexes 등은 배포하지 않았다.

### 2026-09-21 inventory 목록 옵션 시인성 checkpoint — 운영 배포 완료

- commit `f815ded566b554cd4f8569244ce72fa92e960261` (`Improve inventory list options`)에서 checkbox/check indicator를 label 바로 옆에 배치하고 전체 56px row를 touch target으로 만들었다. label은 16px 수준으로 유지하고 선택 row에 subtle background/border를 적용했으며 `D-100일` secondary text를 보존했다. 재고조사는 `OFF | ON` segmented control이며 ON 시 sheet 밖에 compact `재고조사 ON`을 표시하고, 임의 목록 옵션이 활성화되면 trigger의 active dot를 유지한다.
- legacy UI 기대값은 unit preset 6→5, 표시명 `개`→`낱개`, 초기 수량 접근성 이름 `(개)`→`(낱개)`, 직접입력 2열 geometry, BottomSheet 이동에 따른 selector로 현재 계약에 맞게 갱신했다. canonical `개`와 literal `낱개` 보존 테스트는 유지했다.
- PASS: Legacy inventory E2E 11/11, Emulator integration 11/11, inventory 29 files/395 tests, typecheck, lint, production build, PWA, performance, Hosting gate, 360px horizontal overflow, console warning/error 0건. performance budget, dependency, 설정은 변경하지 않았다.

### 2026-09-21 inventory mobile UI 최종 production 검증 — 완료

- production commit은 `f815ded566b554cd4f8569244ce72fa92e960261`이고 Firebase Hosting release는 `1789979180255000`, version은 `9f46329655f14f0b`, 배포 시각은 `2026-09-21 17:26:20 KST`다. worker SHA-256은 `6e244e6d3385ccd7c68de525ace457aad5c1311e2a93d25550d3580b6e4e776a`다.
- `onnuriway.com`과 `onnuriway.web.app`에서 각각 25개 public resource 검증이 통과했고 worker/assets는 두 origin과 candidate에서 일치했다. worker의 `Cache-Control: no-store`와 `Service-Worker-Allowed: /`를 유지했으며 production build, PWA, performance, Hosting gate가 모두 통과했다.
- production read-only smoke에서 목록 옵션 버튼·active dot·BottomSheet, `표시 옵션`, 비활성/임박 옵션, label 인접 indicator, 56px 전체 row touch, 16px label, `D-100일`, `OFF | ON` segmented control, compact `재고조사 ON`, sheet 재개방 후 상태 유지를 확인했다. 360px horizontal overflow는 없었고 console warning/error는 0건이었다. 검증 후 비활성/임박/재고조사 상태는 OFF로 복원했다.
- 배포는 Firebase project/site `onnuriway`의 Hosting만 대상으로 했다. Functions, Firestore Rules/Indexes, Storage Rules, Extensions 등은 배포하지 않았고, 품목 저장/수정·제조사 변경·입고/출고/조정·사진 업로드·테스트 데이터 생성을 수행하지 않아 production data write는 없다. release 회귀가 없어 rollback은 필요하지 않다.
- 사용자가 최종 production UI의 목록 옵션과 변경된 inventory UX를 실제로 사용해 사용성에 문제가 없음을 확인했다. 이는 자동화 테스트 결과와 구분되는 정성적 실사용 확인이다. **inventory mobile UI 개선은 완료 상태**다.

### 2026-09-21 재고 제조사 Master M3 — 구현·production release 완료

- commit `194309b9a9266045688d17d624c8d202d3fdd5ad` (`Add inventory manufacturer management`)에서 일반 manufacturer row tap은 기존 선택 동작을 유지하고, 관리자에게만 각 active row 오른쪽의 독립된 `⋯` 관리 버튼을 표시한다. 실제 touch target은 44×48px이며 row 선택과 관리 이벤트를 분리했다. long-press는 도입하지 않았고 기존 공용 BottomSheet 패턴에서 `이름 수정`·`비활성화`·`취소`를 제공한다.
- rename/deactivate는 기존 production Callable `updateInventoryManufacturer`를 그대로 사용한다. Functions 제품 코드, Rules, indexes, schema는 변경하지 않았다. rename은 `expectedRevision`, 기존 request ID/idempotency, duplicate 처리와 revision conflict 시 최신 목록 refresh를 유지하고 성공 뒤 active 목록을 갱신한다. deactivate는 active picker에서만 제거하며 hard delete나 reactivate UI는 없다. 두 작업 모두 현재 product draft의 `manufacturerId`/이름을 자동 변경하거나 기존 상품에 write하지 않는다.
- M1/M2 snapshot 호환 정책도 유지한다. 기존 상품의 `manufacturerId`와 `manufacturer` string snapshot, inactive reference, legacy string-only 상품을 보존하고 자동 master 연결, migration/backfill, 기존 상품 문자열 일괄 전파를 하지 않는다. 따라서 master rename 뒤 picker의 active master 이름은 새 이름이지만 이미 저장된 상품 화면은 선택 당시 snapshot 이름을 계속 표시할 수 있으며 이는 의도된 호환성 정책이다.
- Frontend는 `context.canAdmin`을 필요한 inventory editor/field/picker까지 전달해 관리자에게만 관리 affordance를 노출한다. Backend 권한의 최종 기준은 기존 admin authorization이며 authenticated Callable, session/permission 재검증, transaction, revision, request receipt, audit 경계를 그대로 유지한다.
- 구현 검증은 전체 unit 1,456 passed/14 skipped, Inventory/Functions 404 passed, M3 관리자 E2E 1 PASS, Firestore Emulator integration 11 PASS, 기존 Inventory browser scenarios 11 PASS다. app/Functions typecheck, 전체 lint, production build, PWA 17, performance 18, PWA/performance/Hosting gate, 360px overflow, keyboard/Escape/Back, reservation/audit 검증도 모두 통과했다. budget, dependency, config는 변경하지 않았다.
- production application commit `194309b9a9266045688d17d624c8d202d3fdd5ad`를 Firebase Hosting release `1789983232326000`, version `2c48893eab60f919`로 `2026-09-21 18:33:52.326 KST`에 배포했다. worker SHA-256은 `2129650a8800dedc5239af91185d3310ba735fe0fd9d8dffb3d3910e84f48594`다. `onnuriway.com`과 `onnuriway.web.app`에서 각각 25개 verifier가 통과했고 candidate/production assets, worker, 양 origin worker가 일치했다. worker는 `Cache-Control: no-store, max-age=0`, `Service-Worker-Allowed: /`를 유지한다. production/PWA/performance/Hosting build gate가 통과했으며 Hosting 산출물은 102개, precache 73개, initial asset 9개다.
- 배포 범위는 Firebase project/site `onnuriway`의 Hosting뿐이다. Functions, Firestore Rules/indexes, Storage Rules, Extensions 및 기타 Firebase resource는 배포하지 않았다.
- production read-only smoke에서 관리자 로그인/session 유지, inventory 진입, 관리자 `⋯` 노출, 일반 row 선택, `⋯` 클릭 시 선택 미발생, 관리 BottomSheet, rename 입력/취소, deactivate 안내/취소, Escape/Back, picker/draft 유지, 360×800 horizontal overflow 없음과 console warning/error 0건을 확인했다. 안전한 기존 production 비관리자 session이 없어 비관리자 `⋯` 미노출은 운영에서 별도로 재검증하지 않았고, 해당 권한 동작은 frontend/backend 자동 테스트와 Emulator 검증 범위에서 확인했다.
- 운영 데이터 보호를 위해 production smoke에서는 manufacturer rename/deactivate/create, 품목 저장·수정, 입고·출고·조정, 사진 업로드, 테스트 데이터 생성을 실행하지 않았고 모든 form/confirm을 실행 전에 취소했다. 실제 production rename/deactivate write는 아직 수행하지 않았으며 해당 경로는 Emulator/Auth/Callable 자동 검증으로 확인한 상태다. 이는 실패가 아니라 의도된 read-only 검증 경계다.
- 사용자가 최종 production M3 UI를 실제 기기에서 확인해 현재 사용성이 괜찮다고 판단했다. 이는 자동 검증과 구분되는 정성적 실사용 확인이며 rollback은 필요하지 않다. **Manufacturer M3는 완료 상태**다.
- 현재 지원 범위는 create, rename, deactivate다. hard delete, reactivate, manufacturer merge, 기존 product snapshot 일괄 rename 전파는 지원하지 않으며 실제 사용에서 필요성이 확인되기 전에는 후속 작업으로 자동 지정하지 않는다. 기존 product snapshot과 master current name 불일치가 실제 업무 문제가 될 때만 read-time overlay 또는 별도 정리 정책을 검토한다.

### P3 — 디자인 디테일

1. 실기기에서 재고 카드 밀도, 토글/checkbox alignment, 사진 확대 affordance와 고정 action의 safe-area/키보드 겹침을 점검한다.
2. 모드별 aurora·motion은 기존 tone/mood와 `prefers-reduced-motion`, 고대비 접근성을 유지한다. 장식 추가보다 정보 밀도와 한 손 조작을 우선한다.
3. 새 UI 패턴은 거래처·학교납품·영업/홍보·재고 사이의 radius, divider, 버튼 상태, loader/photo viewer 일관성을 먼저 대조한다.

## 9. 관련 문서

- 공통 규칙: `AGENTS.md`
- 구현 기준: `급식길 PWA 구현 명세서.md`
- 데이터 구조: `급식길 PWA 데이터베이스 상세 설계서.md`
- 캐시/성능: `급식길 PWA 검색·캐시·성능 설계서.md`
- Hosting/도메인: `docs/phase-45-hosting-migration-status.md`
- 재고 기반 계획: `docs/phase-45-firebase-hosting-and-inventory-plan.md`
- 재고 최신 UX/검증: `docs/phase-46-inventory-field-experience.md` ~ `docs/phase-49-inventory-count-mode.md`

이 문서는 대화 로그가 아니라 현재 구현으로 진입하기 위한 색인이다. 새 결정·검증·배포가 생기면 확인된 결과만 갱신하고, 추정은 ‘미확인’에 남긴다.
