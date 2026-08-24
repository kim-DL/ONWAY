# ADR 0004: Firestore Standard/Native 계약

- 상태: Accepted
- 날짜: 2026-08-23

## 배경

Phase 1은 실제 Firebase 프로젝트를 연결하기 전에 데이터 계약, Converter, Seed, Index를 확정한다. 현재 저장소는 외부 프로젝트 대신 `demo-onnuriway`를 사용하며, Firestore Rules도 Phase 2 전까지 전 경로 Default DENY 상태다.

Firestore Edition에 따라 지원되는 데이터 모델과 인덱스 동작이 달라질 수 있으므로 Phase 1 계약의 Edition을 명시해야 한다.

## 결정

- MVP 데이터 계약은 Firestore **Standard Edition / Native mode**를 기준으로 한다.
- Phase 1 Seed와 테스트는 `demo-onnuriway` Local Emulator에서만 실행한다.
- Domain Model은 Firebase에 의존하지 않는 JavaScript `Date`를 사용하고, Converter가 Firestore `Timestamp`와 상호 변환한다.
- 복합 조회는 `firestore.indexes.json`에서 명시적으로 관리한다.
- 실제 Firebase 프로젝트, Database, Region은 Phase 1에서 생성하거나 연결하지 않는다.

## 검증

`npm run seed:verify` 실행 시 Firestore Emulator가 Standard Edition으로 시작했으며, Auth 사용자 5명과 Firestore 문서 45개가 생성됐다.

## 결과

- MongoDB compatibility나 Enterprise 전용 기능을 데이터 계약에 사용하지 않는다.
- 실제 Development/Staging/Production 환경을 연결하기 전 `firestore:databases:list`로 Edition을 확인한다.
- 실제 Database가 Standard/Native가 아니면 배포하지 않고 별도 Migration ADR을 작성한다.
- 실제 Region 선택과 프로젝트 생성은 명시적 승인 뒤 처리한다.
