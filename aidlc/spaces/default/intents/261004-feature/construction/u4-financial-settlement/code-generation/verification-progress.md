# U4 구현 중 검증 기록

## 적용 범위

승인한 18단계 구현의 중간 실행 기록이다. U4 전체 완료·커버리지80%·실거래·배포 준비 판정이 아니다. 명령은 저장소 root에서 실행했고, 단순 테스트 실행은 별도 Luna가 수행했다. 원문 금융 입력·비밀값·assertion 메시지는 보관하지 않는다.

## 계약 계층

- 기준 커밋: `368b6d6`에 Step1–3 구현과 시험을 저장했다.
- 명령: `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u4/vitest.unit.config.ts tests/u4/unit/contracts.spec.ts tests/u4/unit/input-boundaries.spec.ts`
- 결과: exit0, 두 파일 각8개로16/16 통과. 실패·pending·수집 오류0.
- 범위: 닫힌 계약/등록 버전·원 단위 정수·문자/배분 입력 경계. 실제 DB·금융 명령·HTTP 검증이 아니다.

## 저장 계층 첫 실행

- 명령: `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u4/vitest.unit.config.ts tests/u4/unit/models.spec.ts tests/u4/unit/repository.spec.ts tests/u4/unit/recovery-payload.spec.ts`
- 결과: exit0, 모델7·repository7·복구payload6, 총20/20. 실패·pending·수집 오류0.
- 이어 현재 저장 변경을 포함한 `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npm run test:u4:unit` 실행: exit0, 5파일36/36 통과. 실패·pending0.

## 실제 PostgreSQL 통합 첫 실행 — 실패

- 명령: `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npm run test:u4:integration`
- pretest: U4 전용 합성 primary/보호 DB 준비 성공. 기존 U1/U2/U3 DB 초기화 없음.
- 결과: exit1, 3파일18개 중6통과·12실패·pending0. 세 suite 모두 실패 상태.
- 실패 위치는 보고서의 파일 내 case 순서다: concurrency.spec.ts 1–4; persistence.spec.ts 3·4·6; protection-replay.spec.ts 1·2·3·5·6.
- 첫 실패: concurrency.spec.ts case1. 현재 비민감 보고서에는 원인 기술 코드가 없어 실패 원인을 아직 확정하지 않았다.
- 이후 예정한 U3 DB 준비/기존 migration 회귀는 실행하지 않았다. 실패 원인 조사와 최소 재현 전 우연 통과를 얻기 위한 재실행은 하지 않는다.
- 이 통합 시험은 공통 저장·직렬화/제약·보호 경계 검증이다. 이후 실제 청구/입금/배분 명령의 업무 흐름 시험을 대신하지 않는다.

## 남은 검증과 미해결

- 실제 DB 통합 실패 원인을 확인·수정한 후 영향 시험을 다시 검증하고, U3 구형 원본/migration 회귀를 실행한다. 저장 계층 단계는 아직 완료 판정하지 않았다.
- 별도 읽기 조사에서 U4 writer의 U3 신표현 쓰기에 명시 modelVersion3을 강제할 필요가 발견됐다. 이번 통합12실패 원인과 동일하다고 단정하지 않는다.
- 환불 재시도 R-03·기존 U2/U3 위험과 실제 source profile/신뢰·국내 저장·운영 준비는 그대로 남아 있다. 이번 통합 실패를 R-03 때문이라고 표현하지 않는다.

## 최소 재현의 원인 조사

- 제품 코드를 바꾸기 전 비민감 reporter만 보완하고 protection-replay.spec.ts의 보조 원상 보존 case6 하나를 실행했다. exit1, 1실패·나머지7개는 필터로 미실행이다. 전체 suite 성공으로 취급하지 않는다.
- Luna의 첫 요약은 안전 코드가 없다고 보고했으나, 개발 담당과 주 실행자가 실제 JSON을 직접 대조해 잘못된 요약임을 확인했다. assertionResults[5].errors에 `22023` / `QueryFailedError`와 protected-store.ts:116·protected-write.ts:212·해당 테스트:124가 있었다. 같은 진단을 다시 실행하지 않았다.
- 해당 경로는 보호 DB append 함수 호출이다. recovery-migration.ts의 기존 함수는 payload/row 버전1·2만 허용했지만 새 U4 쓰기는 payload3을 사용한다. 실제 오류와 기존 U3 정상 패턴을 대조해 이 버전 경계 불일치부터 단일 수정·최소 검증한다.
- 구조화된 오류 코드/알려진 상대 파일 위치만 보존하며 메시지·SQL·매개변수·환경/입력값은 진단에도 기록하지 않는다.

## append 수정 후 결과와 추가 원인

- PG append의 payload3/profile4·row3/modelVersion3 분기를 추가하고 구형 버전/잘못된 profile 거절 회귀를 추가했다. 최소 선택2건 통과, 나머지7개 필터 미실행. 전체 단위41/41 통과.
- 전체 DB 통합은19건 중16통과·3실패·pending0으로 개선됐으나 여전히 exit1이다. protection-replay는9/9 통과했다. 남은 실패는 concurrency case1 및 persistence case3·4다.
- 세 실패의 공통 경로는 FinancialIdentityClaim 저장이다. 재귀 의미 검증이 sourceNamespace/canonicalIdentity를 가진 지원 claim을 PaymentIdentity로 오인해 존재하지 않는 aliases를 펼치면서 TypeError를 만들었다. 잔액 원본 기반 다른 시험은 이 분기를 지나지 않아 통과했다.
- 실제 claim을 담은 RecoveryPayload 회귀를 추가하고, 스키마의 필수값/닫힌 형식을 유지한 채 aliases 배열을 가진 값 객체와 지원 claim을 구분하도록 최소 수정했다. 그 영향 시험 결과는 아직 확인 중이다.

## claim 수정 후 첫 저장 마일스톤

- 최소 회귀 선택1건과 기존 실패 위치 선택3건이 모두 통과했다. 각각 나머지7건은 필터로 미실행이며 전체 검증으로 대체하지 않았다.
- 현재 전체 U4 단위42/42, 실제 PostgreSQL 통합19/19가 exit0으로 통과했다. 실패·pending·수집 오류0. 주 실행자도 해당 JSON의 실제 집계를 대조했다.
- 이어 기존 U3 격리 DB 준비와 migration-compatibility.spec.ts 회귀11/11이 exit0으로 통과했다. U3 고정 열 개수는 U4 등록 모델까지 포함한 정확한 기대값으로 바꿨으며 구형 원본/버전 보존 조건은 유지했다.
- 이 결과를 첫 저장 마일스톤으로 저장한다. Step4/5는 아직 체크하지 않는다. 명시 modelVersion3 쓰기 강제, PG의 row1 U4 원본에 대한 위장 경계, 실제 보조 원본 replay 복원·역할 등록, 전역 unhandled error 보고서 반영을 추가 검증한 후 판단한다.
