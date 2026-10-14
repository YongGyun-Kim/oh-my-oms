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

## 다음 구현 묶음 — 아직 시험 전

- 저장 기반의 Step4/5 완료 체크와 검증 기록을 `ab0ebe1`로 커밋하고 `origin/feat/u4-financial-settlement`에 push했다. 승인 계획은18개 중5개 완료이며 전체 U4 완료가 아니다.
- Step6/7의 지급 계획·주문 연결을 진행 중이다. 기존 U1/U2/U3 기본 읽기 경로는 보존하고, U4에서만 같은 EntityManager·captured prefix를 사용하는 권위 읽기 접점을 연결한다. 기존 IdentitySession의 제한된 heartbeat/currentSecurityMatches·auth_ready 규칙과 보호된 원상 반환도 유지해야 한다.
- 새 model3 참조와 model2 이력의 실제 저장 개정을 구분한다. 기존 U3 닫힌 입력·구형 PREPAY/POSTPAY 판정을 느슨하게 하지 않고 U4 계약의 명시 지급 계획·승인·주문 snapshot 경로를 연결한다.
- 새 작업은 아직 단위/업무 통합 시험을 실행하지 않았다. 앞 절의51/25/11 통과는 `ab0ebe1` 저장 마일스톤의 근거이며 이후 소스까지 검증한 결과로 재사용하지 않는다.

## 지급 계획 첫 단위 검증

- Step6 제품 코드와 해당 단위 시험의 의존 소스를 고정하고, 개발 담당은 별도 통합 시험 파일만 작성하는 동안 Luna가 payment-plan.spec.ts를 실행했다.
- 명령: `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u4/vitest.unit.config.ts tests/u4/unit/payment-plan.spec.ts`
- 결과: exit0, 8/8, success=true, 미실행·수집·assertion·전역 오류0, runReason=passed. 주 실행자가 실제 JSON도 대조했다.
- 확인 범위는 임의 명칭/혼합 의무·총액 불일치/소수 거절·큰 정수 합계·명시 선후불·확인된0원과 미확인 구분·의무 키/근거·model3 실제 개정·구형 닫힌 입력 보존이다. 실제 계약 승인·주문·동의 흐름과 기존 권한 경로의 회귀는 아직 실행 전이다.

## 약정·주문 실제 DB 첫 실행 — 공통 실패

- 제품/시험 소스를 고정한 뒤 `npm run pretest:u4:integration`은 exit0으로 완료됐다. U4 격리 DB만 준비했다.
- 이어 `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U4_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u4/vitest.integration.config.ts tests/u4/integration/commercial-plan.spec.ts tests/u4/integration/renewal-plan.spec.ts` 실행은 exit1이었다.
- commercial-plan13건·renewal-plan2건, 총15건 전부 실패했다. 미실행·수집·전역 오류0이며 runReason=failed, success=false다. 첫 실행의 안전 오류 코드는 모두 UNCLASSIFIED_ERROR/OmsError, 알려진 위치는 u4-repository.ts:49:5·166:7·138:17이다.
- 주 실행자가 해당 위치를 확인한 결과 same()의 canonicalJson(storedModelData(...)) 호출을 거치는 원본 비교 경로다. 오류 코드와 실제 실패 모델은 아직 확정하지 않았다. 원문 입력을 출력하거나 전체 무변경 재시도를 하지 않고 한 건의 안전 진단부터 준비한다.
- 기존 권한/동의 회귀 및 전체 U4 시험은 아직 실행하지 않았다. 이 실패를 이후 작업이나 R-03 때문이라고 해석하지 않는다.

## 원본 비교의 단일 진단

- 제품 코드는 고정하고 INVALID_JSON 및 고정된 신규 소스/시험 경로만 안전 오류 투영에 추가한 뒤 commercial-plan 첫 시나리오 하나를 실행했다. exit1, 선택1실패·나머지12필터 미실행, 수집·전역 오류0이었다.
- 실제 코드는 INVALID_JSON/OmsError이며 u4-repository.ts:49·166·138과 u3-current-basis.ts:236에서 발생했다. 주 실행자가 확인한 호출자는 VerificationEvidence의 scope.current(reference)다.
- U4.same은 이미 논리 형식인 보호 원상에도 물리 변환용 storedModelData를 재적용했다. 기존 U3는 등록 검증 후 선택 nullable 필드만 비교용으로 정규화한다. 누락 선택 필드가 undefined로 만들어지는 경로를 U4 비교에서 바로잡되, 필수값/미등록 필드·미보호 변경 거절은 유지하는 최소 수정을 준비한다. 아직 수정 후 통과 결과는 없다.

## 비교 수정 후 다음 저장 검증

- 생략된 VerificationEvidence.operatorAuthorityRef에 undefined를 주입하던 U4 비교만 수정했다. 공통 canonical/storedModelData는 유지하고, 등록 검증 후 선택 nullable 값만 정규화했다. repository 단위의 생략/물리NULL 동등성·필수/미등록 필드 거절·미보호 원본 거절을 포함해11/11이 exit0으로 통과했다.
- 동일 업무 선택1건은 원래 INVALID_JSON을 지나 AgreementRevision put의 INVALID_INPUT에서 실패했다. 나머지12필터 미실행·수집/전역 오류0이다. 위치는 model-catalog.ts:244·protected-transaction.ts:283·u4-payment-plan.ts:153이다.
- 개발 담당이 실제 작성값과 기존 정상 분기를 대조해 RefList 검증의 context.u4 선택 누락을 확인했다. 단일 Ref와 기존 model2 목록의 정확 validator는 유지하며, 새 model3 목록에 맞는 validator 연결과 위조 참조 거절 회귀를 준비한다. 실패 원문이나 금융 입력을 보관하지 않는다.

## 참조 목록 수정 후 시나리오 진행

- RefList의 정확 U4 validator 연결과 model3/model2·위조 entity 회귀를 추가한 뒤 models 단위9/9가 exit0으로 통과했다.
- 동일 업무 선택1건은 약정 승인·주문 생성·직원 수락·원래 요청 재조회 assertion을 지난 뒤 마지막 조회용 inspect helper에서 실패했다. 안전 보고서는 UNCLASSIFIED_ERROR/OmsError, protected-write.ts:145·207과 commercial-plan.spec.ts:25·66을 가리켰다. 다른12건은 필터 미실행이다.
- 주 실행자가 해당 소스를 대조하니 inspect가 읽기만 수행하면서 repository.mutate로 빈 보호 커밋을 시도했다. protected-write.ts:145는 EMPTY_COMMIT 검사다. 이는 아직 보고서에 해당 코드가 허용되지 않은 상태의 소스 대조 결과다. 제품의 빈 커밋 금지는 유지하고 조회 fixture를 적절한 읽기 트랜잭션으로 구성해 다시 확인한다.

## 혼합 지급 주문 선택 흐름 첫 통과

- 조회 fixture를 같은 manager에서 control/prefix를 읽는 READ COMMITTED·READ ONLY 트랜잭션으로 바꿨다. 원본과 premise를 검증하고 rows=0을 확인하며 제품의 빈 커밋 금지를 우회하지 않는다.
- 동일 commercial-plan 선택1건이 exit0으로 통과했다. 총13건 중1통과·12필터 미실행, 수집·assertion·전역 오류0, runReason=passed다. 필터가 있으므로 보고서 success=false이며 전체 suite 성공이 아니다.
- 전체 실행 전에 정적 대조에서 제안의 proposedTermsRef와 실제 승인 계획 Ref 결합, 변경 이력의 기업/범위·상품 타입·행 보존 검사 두 항목을 보완한다. 수정 중 시험은 실행하지 않으며 이후 새 통합 전체를 검증한다.

## 약정·주문 새 묶음 통과

- 위 두 원본 검증과 접수 상태/준비 등록 kind의 닫힌 검사를 보완하고 회귀를 추가했다. 새 상업 경계 단위5건은 실제 승인 원본과 다른 제안 참조/미등록 kind 등을 거절한다. 역사 손상 통합 회귀는 실제 동의·적용을 기록한 후 역사 읽기 응답에만 기업/범위·상품/행 변조를 주입한다. 저장/제약을 모의 객체로 대체한 결과가 아니다.
- 소스를 고정하고 Luna가 payment-plan.spec.ts와 commercial-boundaries.spec.ts를 실행해13/13, 이어 commercial-plan.spec.ts14건과 renewal-plan.spec.ts2건을 실행해16/16이 모두 exit0으로 통과했다. 두 보고서는 success=true, 미실행·수집·assertion·전역 오류0, runReason=passed였다.
- 실제 흐름에는 다른 사람의 승인, 혼합200/800 주문·직원 FULL 수락, 원래 접수 재조회, 고객 동의 후1회 적용과 최초 snapshot 보존, 미승인/미등록 원본/합계·권한·위조 fingerprint 거절, 정상 heartbeat/권위 변조·auth_ready 폐쇄, 갱신 회차 중복 및 과거 지급 근거 재사용 거절이 포함된다.
- 이는 Step6/7 관련 묶음의 통과다. 전체 U4 단위/DB 및 기존 U1/U2/U3 권한·동의·migration 회귀는 같은 소스에서 이어 실행한다. API/worker 노출과 실제 금융 명령은 후속 Step8/14에 남아 있다.

## 같은 소스의 첫 전체 단위 실행

- 관련 묶음 통과 후 전체 U4 단위를 실행했으나68건 중67통과·1실패, exit1이었다. 미실행·수집·전역 오류0이다. 보고서와 실제 집계를 주 실행자도 대조했다.
- 실패는 safe-diagnostics.spec.ts의 기존 스택 위치 최대5개 검사다. 진단 보완 때 상한을8로 늘려 기존 제한과 불일치했다. 시험 기대값을 올려 맞추지 않고 진단 상한을5로 복원한다.
- 전체 DB 통합은 앞선 전체 단위 실패로 실행하지 않았다. 수정 후 안전 진단과 전체 U4 단위/통합을 다시 확인한다.

## 상한 복원 후 전체 U4 검증

- 진단 프레임 최대5개를 복원하고 업무 코드/시험 기대값은 바꾸지 않았다. 안전 진단5/5, 전체 U4 단위68/68, 전체 실제 DB 통합41/41이 순차 실행에서 모두 exit0으로 통과했다.
- 두 전체 U4 보고서는 success=true, 미실행·수집·assertion·전역 오류0, runReason=passed이며 주 실행자도 실제 집계를 대조했다. 통합은 commercial14·concurrency4·persistence7·protection-replay14·renewal2다.
- 현재 소스를 고정한 채 기존 U1/U2/U3 권한·동의·원본/migration 영향 회귀를 이어 실행한다. 최종 CI/전체 제품 분모80%·API/worker·실거래·배포 준비·R-03 해소를 선언한 결과가 아니다.

## 같은 소스의 기존 Unit 영향 회귀

- Luna가 U2/U3 단위와 U1→U2→U3 격리 DB 준비/통합의8개 명령을 순차 실행했다. 모두 exit0이며 실패·미실행·수집 오류0이다. DB 준비는 각 Unit의 기존 pretest 명령이며 보존 원본 DB를 초기화하지 않았다.
- U2 단위25/25: authorization(10), role-revisions(8), scope-compatibility(7).
- U3 단위79/79: current-commercial-basis(24), role-own-write(28), staff-role-versions(8), consent-authority(12), renewal-source(4), after-sales-source(3).
- U1 실제 DB17/17: auth-access. U2 실제 DB17/17: authority-race(7), membership-role-race(10).
- U3 실제 DB50/50: commercial-agreement(18), customer-consent-authority(10), staff-role-boundaries(11), migration-compatibility(11).
- 선택한 파일은 각각 tests/uN/unit 또는 integration 아래이며 기존 tests/uN/vitest.unit.config.ts·vitest.integration.config.ts를 사용했다. 공통 Node22 PATH와 통합의 OMS_UN_DATABASE_PROFILE=verification-isolated를 명시했다. 전체 이전 Unit 회귀나 최종 CI를 대신하는 결과가 아니다.

## 다음 금융 명령의 권한 정합성 점검

- 구현 조사에서 U4 초기 선언의 금융 조회/등록 토큰과 현행 역할의 정상 부여 경로가 맞지 않음을 확인했다. 고객은 승인된 U2 payment.read(허용된 대금 조회)를 재사용하고, 직원은 별도 조회/등록 권한을 U2 소유의 명시 역할 정의·개정·grant로 연결해야 한다.
- 근거: U4 functional-design/rules.md BR4.1과 functional-spec.md의 U2 권한 책임, nfr-design/security-design.md의 현재 권한·조회/등록 분리. U2 functional-spec.md는 고객 payment.read와 직원 서버 허용 목록/명시 grant를 정의한다. 현행 u3-staff-access.ts의 model2/registry3 닫힌 목록에는 금융 직원 행위가 없다.
- 이는 승인된 권한 분리를 실제 정상 부여 경로에 연결하기 위한 구현 접점이다. 자동 권한 승격·raw 역할 주입·구형 닫힌 목록 완화·U4의 다른 소유자 직접 쓰기로 우회하지 않는다. 정확한 새 버전과 구형 판독/복구 보존 범위를 다음 Step8의 access 연결에서 먼저 대조한다. 아직 이 권한 보완은 구현/검증하지 않았다.

## Step6/7 저장과 Step8 권한 접점 구현 방안

- Step6/7의 실제 구현/검증을 대조해 두 완료 체크만 반영하고 `fb5360a`로 커밋·push했다. 현재 승인 계획은7/18 완료이며 금융 핵심 명령은 아직 구현 전이다.
- 승인 근거를 대조한 뒤, 별도 조회/금융 등록 권한의 정상 부여 경로를 만드는 기술 접점으로 정리했다. 기존 U4 profile/registry4에 닫힌 직원 역할 명령을 연결하고 StaffRole/RoleRevisionState의 명시 model3/source4 판독·보호·복구를 추가하되 기존 model1/2 및 grant를 보존하는 방안이다. 계획 문구/Testing Contract를 변경하거나 새로운 사업 권한 정책을 승인받았다고 기록한 것이 아니다.
- 금융 전용 역할의 legacy 교집합이 비더라도 가짜 기존 권한을 채우지 않는다. EnterpriseAccess 명령은 해당 소유자의 등록 역할/상태/권한 이력·fence 변경으로 제한하고 실제 정의→명시 grant→현재 권한→회수·구형 거절·복구 회귀를 먼저 검증한다. 아직 이 접점의 구현/시험 결과는 없다.

## 금융 역할 접점 첫 검증 — 기존 wire 경계의 시험 기대 불일치

- 권한 접점의 닫힌 역할3/상태3/source4와 payload3·명시 등록한 복구 관측3 연결을 작성했다. 주문 model3의 지급 계획 제약과 역할 모델은 분리했다. 고객 payment.read 조회3개와 직원 financial.read 조회를 별도 선언으로 구분한다.
- 첫 선택 단위는 staff-access·contracts·models·recovery-payload·safe-diagnostics의5파일37건 중36통과·1실패, exit1이었다. 실패는 staff-access 첫 case의 AssertionError이며 미실행·수집·전역 오류0이다. DB 준비/통합은 실행하지 않았다.
- 기존 common:2 StaffRoleInput은 wire에서 일반 문자열 목록을 받고, 실제 구형 StaffAccess.defineRole이 STAFF_ACTIONS로 확인해 금융 문자열을 UNKNOWN_STAFF_ACTION으로 거절한다. 신규 시험이 구형 wire 스키마 자체의 거절을 기대해 기존 의미와 어긋났다.
- 제품/구형 스키마는 바꾸지 않았다. 잘못된 단위 기대를 기존 wire 동작 보존으로 바로잡고, 실제 DB 시험에 정상 구형 역할 명령의 금융 권한 등록 거절을 명시 추가했다. 수정 후 단위→U4 DB 준비→새 역할 실제 DB8건을 순차 확인한다.

## 금융 역할 실제 경로 검증

- 수정 후 위 단위37/37과 U4 격리 DB 준비는 exit0으로 통과했다. 첫 역할 실제 DB 실행은8건 중7통과·1실패였다. 실패는 고의 primary 권한 오염 후 마지막 원상 assertion에서 currentProtected를 사용한 경우로, protected-store.ts:316의 CURRENT_AUTH_NOT_PROTECTED 차단 경로였다. 제품 차단이 잘못됐다는 근거가 아니다.
- 제품 코드는 유지하고 마지막 원상 검사를 store.read의 보호 prefix와 primary의 실제 오염 상태로 구분했다. 같은 조회에서 현재 권한으로 승격하지 않음을 먼저 확인한다. 제목도 실제 시험하는 미보호 오염 경계로 수정했다.
- 수정 후 선택1통과·7필터 미실행을 확인하고, 같은 소스로 전체 역할 DB8/8이 exit0, success=true, 미실행·수집·assertion·전역 오류0으로 통과했다. 실제 역할 정의→기존 명시 grant→개정/회수/비활성, 구형 소유자 명령 거절, 미보호 원본 차단, owner/rollback 및 재생→관측3 보안 재확인을 포함한다.
- 현재 소스를 고정하고 전체 U4 단위/DB와 기존 권한·복구 정책/관측·role source·migration의 좁은 회귀를 순차 실행한다. 대량 DR 검증이나 금융 업무 명령 완료로 해석하지 않는다.

## 금융 역할 접점 최종 호환 검증

- 같은 소스로 Luna가11개 명령을 순차 실행했다. 전체 U4 단위76/76·실제 DB49/49가 exit0, success=true, 미실행·수집·assertion·전역 오류0, runReason=passed로 통과했다.
- 기존 단위 회귀: U1 recovery-security-policy8/8, U2 authorization/role-revisions/scope-compatibility25/25, U3 staff-role-versions/role-own-write/recovery-observation-profile/recovery-role-source/recovery-payload60/60.
- 기존 실제 DB 회귀: U1 auth-access/recovery-security28/28, U2 authority-race/membership-role-race17/17, U3 staff-role-boundaries/recovery-role-source/migration-compatibility25/25. 각 Unit의 기존 pretest로 격리 DB만 준비했으며 모두 exit0·미실행/수집 오류0이었다.
- 실행은 기존 tests/uN/vitest.unit.config.ts·vitest.integration.config.ts, 공통 Node22 PATH, 실제 DB의 OMS_UN_DATABASE_PROFILE=verification-isolated를 사용했다. 대량 재난/복구 부하 시험은 추가하지 않았다.
- 이 결과는 금융 직원 권한의 정상 부여·버전/복구 기술 접점 마일스톤이다. Step8/9의 실제 청구·입금·배분 업무와 전체 제품 커버리지/공식 검증은 아직 미완료다. 계획의 완료 수는7/18 그대로 유지한다.
