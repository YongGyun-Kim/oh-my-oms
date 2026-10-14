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

## 저장 경계 보완과 실제 복구 시험

- U4 계약으로 영향받는 U3 원본을 쓸 때 명시 modelVersion3을 강제했다. 선택 단위1건·DB2건이 통과했다. U4 신규17개 모델의 row/modelVersion1을 구형 payload1/2로 포장하는 PG append도 거절하도록 보완했고, 선택3건이 통과했다. 각 필터 실행은 전체 검증으로 취급하지 않는다.
- U4 복구 append 역할을 등록하고, U4 보조 원본/제약 검증 뒤에만 append 권한을 재개하도록 순서를 보완했다. 실제 restoreFromJournal 재생과 원본 누락 시 폐쇄 시험을 추가했다.
- 첫 선택 복구 시험은3건 중1통과·2실패였다. 새 fixture의 거래 식별에 필수 sourceProfileId/sourceProfileRevision이 없어 INVALID_INPUT으로 중단됐다. 필수값을 보완한 다음 실행에서도1통과·2실패였고, 별도 최소 진단1건에서 QueryFailedError/SQLSTATE23503을 확인했다. 당시 실패는 복구 실행 전에 입금 fixture가 참조하는 기업 원본을 준비하지 않은 FK 위반이었다.
- fixture의 계정→기업 신청→기업→입금 참조를 기존 소유자의 보호 트랜잭션으로 기록해 재생 원장에도 선행 원본을 포함했다. 기업은 UNVERIFIED로 두고 실제 업무 승인을 가장하지 않았으며 제품 FK를 완화하지 않았다.
- 수정 후 protection-replay.spec.ts의 선택 복구3건이 exit0으로 통과했다. 전체13건 중3통과·10필터 미실행, 실패·수집 오류0이다. 모든 원본/별칭/binding/잔액 재생과 누락 시 writer/append 폐쇄의 선택 검증이며, 전체 suite 통과 판정은 아직 아니다.
- 다음 검증은 전역 unhandled error/종료 사유를 보고서에 반영한 뒤 전체 U4 단위·DB 통합 및 U3 migration 회귀다. Step4/5 완료 판정과 다음 마일스톤 커밋은 그 결과를 확인한 뒤 진행한다.

## 저장 기반 보완 마일스톤의 검증

- 안전한 reporter가 전역 오류/종료 이유·수집/재시도 오류·빈 suite·미실행을 반영하도록 보완했다. 해당 회귀7건과 안전 진단5건, 두 파일12/12가 exit0으로 통과했다. 전체 단위50/50도 통과했다.
- 계획의 누적 집계 경계를 빠뜨리지 않도록 두 보호 접수로100개와1개를 기록하는 실제 DB 회귀를 추가했다. 전체 정상 대조 후101번째 잔액만 배분 원본과 불일치하게 바꾸면 U4_RECOVERY_AGGREGATE로 차단됨을 확인한다. 선택1건 통과·나머지13건 필터 미실행이며, 새 보고서의 success=false는 필터를 전체 성공으로 오인하지 않기 위한 정상 결과다. 실제 금융 명령의101배분 업무 흐름을 입증한 것은 아니다.
- 소스를 고정한 뒤 Luna가 순차 실행한 최종 결과: `npm run test:u4:unit` 50/50, `npm run test:u4:integration` 25/25, U3 격리 DB 준비 후 기존 migration-compatibility.spec.ts 11/11. 모두 exit0이며 U4는 미실행·수집·assertion·전역 오류0, runReason=passed, success=true였다. 주 실행자가 U4 두 JSON의 실제 집계도 대조했다.
- U4 통합의 세 파일은 concurrency4·persistence7·protection-replay14건이다. 동시 소비는 저장 잠금/콜백 수준 검증이며 실제 청구/입금 업무 명령의 원자성과 권한 검증은 Step8/9에서 별도로 확인해야 한다.
- 이 마일스톤은 저장·복구 기반의 구현/회귀 검증이다. 전체 제품 커버리지80%·공식 PC 검증·보안/이미지·실거래·운영/배포 준비 및 R-03 해소를 선언하지 않는다.

## 저장 기반 최종 대조에서 확인한 두 접점

- 기존 경합4건이 임의 예외를 패자의 정상 거절로 오인하지 않도록 허용된 오류 코드를 확인한다. 두 입금→같은 청구 경합에는 서로 다른 두 입금 잔액을 실제 기록하고, 자금 소비 후 청구 검증에서 거절된 쪽의 잔액/개정이 rollback되며 청구80·원래 seed와 승자 접수만 남음을 확인했다. 미보호 선행 소비에 대한 CURRENT_U4_NOT_PROTECTED는 안전 HOLD이며 업무 잔여 한도 거절과 구분한다.
- 공통 recordedSourceContract가 새 U4 계약을 판독하도록 기존 U3/registry3 또는 정확 U4/registry4의 닫힌 validator로 분기했다. 미상 원본 보존·미등록 profile·위조 registry·추가 필드 거절을 함께 검증한다. 구형 스키마 허용 범위를 넓히지 않았다.
- 위 두 묶음 수정 후 Luna의 선택 단위8/8·실제 경합4/4가 통과했다. 같은 소스로 전체 U4 단위51/51·실제 DB 통합25/25가 exit0, success=true, 미실행·수집·전역 오류0으로 통과했다. 기존 U3 격리 DB 준비와 migration 회귀11/11도 최종 소스에서 exit0으로 통과했다.
