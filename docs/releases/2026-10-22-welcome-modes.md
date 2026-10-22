# 2026-10-22 거래처 모션·재고 인사 Hosting 릴리스

## 승인 범위와 변경

사용자가 수정 커밋, 병렬 전체 CI 확인, Firebase Hosting 운영 배포, 배포 후 검증과 로컬 동기화를 승인했다. 대상은 project `onnuriway` / `hosting:onnuriway`다.

캐릭터·Helix는 포함하지 않는다. 재고 직원 화면은 보관 장소 위 개인 인사 타이핑만 표시한다. 거래처는 학교납품·영업의 네 원 장식을 인사 문구 바로 뒤 8px에 배치하고 명암·그림자·각 궤도 속도를 정리했다. 학교납품·영업의 기본 구성, 검색 시 거래처 인사 접기, 모션 정지 설정·동작 줄이기·화면 밖 정지는 유지한다. [구현·검증 범위](../welcome-customer-inventory-20261022.md)를 참고한다.

## 소스와 로컬 검증

- 제품 source: `b91a55ba33605f59b06712070445306f9f86793b` (`feat: refine customer welcome motion and enable inventory greeting`). main과 `codex/welcome-modes-20261022`의 로컬·원격에 저장했다.
- 관련 단위 138 PASS, 후속 집중 8 PASS, lint·앱/Functions typecheck PASS. 기존 welcome mobile Chromium 25 PASS, 재시도 0이다. 실제 컴포넌트의 합성 미리보기에서 320/390/740px 배치·8px 간격·거래처 원 4개/재고 장식 0개·타이핑·검색·모션 설정을 확인했다.
- 전체 단위 첫 로컬 실행은 1,797 PASS/기존 15 SKIP/1 FAIL이었다. Functions 사진 runtime identity의 5초 module import timeout이며 관련 Functions 소스는 변경되지 않았다. 같은 파일 분리 실행 4 PASS(3.09초), 최종 CI 전체 unit 1,798 PASS다. 동시 빌드 부하 가능성은 있지만 정확한 최초 timeout 원인은 미확정이다.
- 첫 운영 준비 빌드의 공통 CSS gzip 상한 초과는 새 거래처 스타일을 지연 거래처 CSS로 옮겨 해결했다. 후속 거래처 CSS raw 49,449B·49,256B 초과는 중복·선택자 정리로 해결했다. 최초 CSS Modules optional className 타입 오류는 빈 문자열 fallback으로 수정했다. 모든 실패 로그를 보존했고 검사 스크립트·용량 상한·assertion·timeout·skip은 변경하지 않았다.
- 최종 source revision으로 새 production build·PWA·성능·Hosting gate 모두 PASS다. 기존 비공개 설정, 납품사진·재고 ON / Emulator OFF를 사용했다. export/shipped 113개, precache 100개, initial assets 9개다.

| 최종 로컬 산출물 | 측정값 | 기존 한도 |
| --- | ---: | ---: |
| initial JS gzip | 140,107B | 기존 gate PASS |
| customer CSS raw | 49,093B | 48KiB (49,152B) |
| customer CSS gzip | 9,673B | 9.75KiB |
| inventory JS gzip | 25,752B | 25.375KiB |
| inventory CSS gzip | 6,604B | 6.5KiB |

## 병렬 CI

[Quality Gate 39744025075](https://github.com/kim-DL/ONWAY/actions/runs/39744025075)는 위 제품 source의 main push 실행이다. **attempt 1 / 독립 검사 12개와 최종 verify 모두 SUCCESS**, 2026-10-22 17:07:18 KST 완료다. workflow 생성→완료 11분 10초이며 향후 소요 시간 보장은 아니다.

| job | 결과·주요 수치 |
| --- | --- |
| audit | SUCCESS, 기존 high/critical 기준 유지 |
| lint | SUCCESS |
| typecheck | SUCCESS |
| unit | SUCCESS, 1,798 PASS / 기존 15 SKIP |
| search-performance | SUCCESS |
| functions-build | SUCCESS |
| production-build | SUCCESS, 동일 산출물 build/PWA/성능/Hosting gate |
| browser | SUCCESS, 310 PASS / 2 내부 flaky / 기존 8 SKIP |
| deferred-tools | SUCCESS, 2 PASS |
| phase17 | SUCCESS, NEIS 3·Rules 50·browser 83 PASS / 기존 재고 조건부 18 SKIP |
| inventory-photos | SUCCESS, 사진 4·transaction 12 PASS |
| delivery-photos | SUCCESS, 16 PASS |
| verify | SUCCESS, 모든 필수 job 결과 확인 |

실패한 CI job이나 job 재실행은 없다. 일반 browser의 `welcome-greeting.spec.ts:217` 모션 정지·설정 복원 검사가 mobile/desktop Chromium에서 첫 시도에 실패하고 기존 자동 재시도에서 통과했다. 정지 직후와 350ms 후의 transform을 문자열로 비교할 때 각 원의 이동 값이 0.1px 미만 달라졌다. pause 적용 프레임과 측정 시점의 차이 가능성은 있지만 정확한 원인은 미확정이다. 이 2개를 깨끗한 최초 성공으로 합산하지 않았으며 로컬 동일 welcome 25개는 재시도 없이 통과했다. 기존 재시도 정책·검사 기준을 유지했고 성공한 job을 다시 실행하지 않았다.

## 운영 배포와 배포 후 확인

- 실행: `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project onnuriway --only hosting:onnuriway --non-interactive`.
- live version **`a5bffa3fda8b9f8b`**, release **`1792656502986000`**, **2026-10-22 17:08:22.986 KST** (`2026-10-22T08:08:22.986Z`), FINALIZED다.
- 직전 복구 version은 **`c4e035caf38f7259`** / release `1792580507302000`이다. 복구 배포 자체는 실행하지 않았다.
- [급식길 운영](https://onnuriway.com)과 [Firebase 기본 주소](https://onnuriway.web.app)의 공개 Hosting 검사 각 **25 PASS**, www→apex **301**이다.
- 새 모바일 크기 Chromium 세션에서 두 origin 모두 로그인 UI 표시·서비스 워커 activated·pageerror 0이다. 공개 서비스 워커와 후보 SHA-256 **`22ea834184db8fc06824ce97e1c249c3c4019f617b86785d3172269ac284284a`**가 일치한다.
- 후보 113파일 digest와 기존 비공개 env 파일 digest는 배포 전후 같다. 전체 Functions 72개의 canonical metadata fingerprint·revision·updateTime, MCP 전용 Hosting version `392f487ef50a6a9c` / release `1791529886712000`도 전후 같다. Functions/Rules/Auth 배포·운영 업무 데이터 쓰기는 없다.

## 기록과 동기화

이 릴리스 기록·HANDOFF·구현 문서는 제품 코드가 같은 문서 전용 후속 커밋으로 main에 저장하고 `[skip ci]`를 사용한다. 동일 제품의 전체 CI와 배포를 반복하지 않는다. 로컬 main·기능 branch와 대응 원격 ref를 동기화하며 기존 다른 worktree·실험 branch·stash·AGENTS.md를 보존한다.

ignored 증거는 `output/welcome-release-20261022/`다. CI 결과, build/gate 로그, 후보 manifest, 배포 로그, 전후 Hosting·Functions metadata fingerprint, 공개·Chromium 확인 결과를 저장했다. 비공개 env 원문이나 자격 증명은 기록하지 않았다.

## 확인 범위

이번 결과는 로컬 합성 UI·자동 브라우저·에뮬레이터·공개 운영 주소의 확인이다. 실제 직원 PIN으로 업무 데이터를 조회·저장하는 운영 인수, 실제 iPhone·설치 PWA의 장시간 백그라운드·홈 복귀와 모션 인수는 별도다. 합성 visibility 이벤트의 정지·복구를 실제 기기 백그라운드 통과로 해석하지 않는다.
