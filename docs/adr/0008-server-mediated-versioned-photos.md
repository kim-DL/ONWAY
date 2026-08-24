# ADR 0008: 서버 중계형 버전 사진 파이프라인

- 상태: Accepted
- 날짜: 2026-08-23

## 배경

학교 현장 사진은 납품과 영업이 함께 사용하는 내부 업무 자산이다. Cloud Storage Rules만으로는 Firestore의 활성 `authz`, 즉시 변경되는 `sessionVersion`과 역할을 매 요청 교차검증할 수 없다. 동시에 휴대폰 사진은 EXIF 위치·기기 정보, 잘못된 방향, 과도한 해상도와 오래된 Browser Cache 문제를 만들 수 있다. 사진 교체와 사용자 삭제는 복구 가능해야 하며 학교 상세 진입만으로 Original 3장이 내려가서는 안 된다.

## 결정

- Storage Client SDK의 직접 읽기·쓰기는 모든 역할에서 계속 거부한다. 사진 Binary는 App Check·Firebase Auth·활성 `authz`·Token/Session/Permission Version·역할을 다시 확인하는 Callable만 통과한다.
- `preparePhotoUpload`는 학교, `01 | 02 | 03` Slot, Expected Revision, 파일 선언, UUID Request ID를 검증하고 10분 수명의 서버 전용 Upload Session과 불변 Version ID를 만든다.
- Client는 `finalizePhotoUpload`에 Upload Session ID와 Base64 파일을 전달한다. Signed URL이나 공개 Download URL을 발행하지 않는다.
- 서버는 임시 Object에 원본 입력을 기록한 뒤 10MB, 허용 MIME, magic bytes, 선언 크기 일치, 최대 40MP를 재검증한다. Sharp의 자동 방향 보정 후 Metadata를 계승하지 않는 WebP로 다시 인코딩한다.
- 파생본은 `thumbnail` 400×300 Cover, `preview` 최대 1440px, `original` 최대 2560px로 만들며 `schools/{schoolId}/photos/{slotId}/{versionId}/{variant}.webp`에 저장한다.
- Storage Object는 기존 Version을 덮어쓰지 않는다. Firestore Metadata의 `currentVersionId`만 새 Version으로 전환하고 `photoRevision`을 증가시킨다.
- Metadata 전환과 Audit Log는 Firestore Transaction으로 기록한다. 저장 사이에 Revision이 달라지면 `aborted`로 거부하며 해당 요청이 만든 파생본은 정리한다.
- 동일 Request ID·Payload의 Prepare와 동일 Upload Session의 Finalize는 멱등 재생한다. Request ID를 다른 Payload로 재사용하면 거부한다.
- 직원별 Upload Prepare는 UTC 시간당 30회로 제한하고 Finalize Function은 1GiB, 최대 Instance 4개로 제한한다.
- 삭제는 Storage Object를 제거하지 않고 `status=deleted`, 삭제 직원·시각·사유와 새 Revision을 기록한다. 7초 Undo는 `restoreSchoolPhoto`로 동일 Version을 다시 활성화한다.
- `getSchoolPhoto`는 활성 Metadata의 현재 Version만 제공한다. 학교 상세은 Preview/Thumbnail만 요청하고 Viewer 확대가 실제 발생할 때만 Original을 요청한다.
- Thumbnail·Preview는 사용자·역할·`sessionVersion`·학교·Slot·Version·Variant Namespace의 IndexedDB에 최대 24개/36MB만 보관한다. Original은 Persistent Cache하지 않는다.
- Object URL은 Component 해제 시 폐기하고 로그아웃·세션 무효화 시 사진 Memory, IndexedDB와 남은 Object URL을 모두 제거한다.

## 결과

- Storage Rules를 완화하지 않고 Viewer 읽기와 납품·영업 수정 권한을 서버에서 구분할 수 있다.
- EXIF와 원본 MIME을 그대로 배포하지 않으며 세 가지 화면 크기에 맞는 WebP만 활성 Version으로 노출한다.
- 교체 후 Version Cache Key가 달라져 오래된 사진이 현재 사진처럼 남지 않는다.
- Soft Delete와 Undo가 Storage 복구 작업 없이 Metadata Transaction만으로 동작한다.
- Callable Base64 전송은 단순하고 세션 경계가 강하지만 10MB보다 큰 전문 사진 업로드에는 적합하지 않다. 향후 대용량이 필요하면 동일 서버 승인 모델의 Resumable Upload를 별도 설계한다.
- 만료 Upload Session, Rate Limit 문서, Metadata에 연결되지 않은 고아 Version의 운영 TTL/Cleanup Job은 배포 Phase에서 구성한다.
