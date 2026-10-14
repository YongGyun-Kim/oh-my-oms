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

## Step8 금융 명령 구현 중 확인한 취소 경계

- 현재 Step8의 직원 접근·실거래 출처·전체 원장 대조·청구/입금/배분 명령을 구현 중이다. 이 변경 이후의 금융 업무 시험은 아직 실행하지 않았다. 직전76/49 통과를 새 명령의 검증으로 사용하지 않는다.
- 기능 명세의 약정/금액 보존과 WF4.4, BR4.10은 취소를 U3 승인 계획/청구 개정에 결합하고 기존 소비·예약·이행 영향과 원본 이력을 보존하도록 한다. CANCELLED 상태 값만으로 직원이 현재 지급 의무를 독립 면제하는 기능을 만들지 않는다.
- 원 단위 양수 청구 입력에0원이나 임의 명칭을 넣어 취소를 가장하지 않는다. 필요하면 명시 취소 입력/명령을 기술 접점으로 추가하되, 현재 승인·고객 동의/적용 원본에서 의무 제거를 입증하는 경로로 한정한다. 잔존 의무·확인 불가 영향은 HOLD이며 계약 총액·현금 원금·배분을 청구 취소만으로 변경하지 않는다.
- 별도 사업 정책과 승인 계획/Testing Contract를 변경한 결정이 아니다. 실제 명령·거절 경계·시험 결과는 후속 검증에서 대조한다. Step8/9의 완료 체크는 아직 반영하지 않는다.

## Step8 출처·전체 원본 대조 하위 계층 검증

- 제품과 시험 의존 소스를 고정하고 Luna가 `tests/u4/vitest.unit.config.ts`로 financial-source.spec.ts와 financial-collection.spec.ts 두 파일을 한 번 실행했다. Node22 PATH를 사용했으며 DB 시험은 포함하지 않았다.
- 출처8/8·전체 원본 대조8/8, 총16/16이 exit0으로 통과했다. 보고서는 success=true·runReason=passed·미실행/수집/assertion/전역 오류0이며 주 실행자도 JSON 집계를 확인했다.
- 실제 원장/금융 명령과 DB 흐름은 별도 작성 중이다. 이 하위 계층 성공으로 Step8/9 전체나 첫 배포 준비를 완료했다고 표시하지 않는다.

## Step8 원장 계산 하위 계층 검증

- 이어 제품/공유 의존을 고정하고 Luna가 같은 Node22·U4 단위 설정에서 financial-ledger.spec.ts를 한 번 실행했다.8/8·exit0·success=true·runReason=passed이며 미실행/수집/assertion/전역 오류0을 주 실행자도 JSON으로 확인했다.
- 정확 정수와 순배분·예약 구분, 집계 불일치 및 별칭 원본 보존을 다루는 단위 계층 결과다. 실제 DB 금융 명령/원금 보존·동시 소비는 아직 검증 전이며 Step8/9는 계속 미완료다.

## Step8 금융 명령 업무 단위 검증

- 제품/공유 의존과 선택 시험을 고정해 Luna가 financial-commands.spec.ts를 같은 Node22·U4 단위 설정으로 한 번 실행했다.8/8·exit0·success=true·runReason=passed이며 미실행/수집/assertion/전역 오류0을 주 실행자도 보고서로 대조했다.
- 미수락 주문·승인 의무 변조·중복 청구 차단, 청구의 현금 미생성, 입금 후보/미등록 확인의 REVIEW, 거래 중복 DISPUTED, 소비된 배분 원금의 반전 차단을 검사했다.
- access.run을 분리한 업무 단위 시험이므로 실제 직원 권한·DB 저장/보호 접수 성공을 입증하지 않는다. 실제 금융 흐름의 격리 DB 검증을 계속 준비하며 Step8/9 완료 수는 아직 바꾸지 않는다.

## Step9 첫 실제 금융 흐름 — 저장 입력 실패

- 제품/공유 의존과 시험 소스를 고정하고 Luna가 U4 격리 DB 준비 후 financial-flow.spec.ts의 `청구200/800` 핵심 흐름1건을 실행했다. 준비 exit0, 선택 실행 exit1이었다.
- 총13건 중0통과·1실패·12필터 미실행, success=false·runReason=failed·수집/전역 오류0이다. 안전 오류 INVALID_INPUT/OmsError와 model-catalog.ts:244 → protected-transaction.ts:314 → u4-financial-access.ts:312의 저장 경계만 확인했다. 주 실행자도 안전 JSON을 대조했다.
- 원문 입력·SQL·금융 근거를 출력하지 않았다. 전체13건 및 후속 원장 DB 시험은 실행하지 않았고 동일 소스 재시도도 하지 않았다. 해당 저장 모델/필드/Ref 검증의 원인을 개발 담당이 조사한다. Step8/9는 미완료다.

## U4 공통 사실의 참조 context 수정과 금융 흐름 통과

- 공통 FactEnvelope의 실제 사람 검증 근거를 구형 common:2 Ref로 검증한 것이 원인이었다. 근거를 지우거나 구형 schema를 완화하지 않고, RequestReceipt/WorkItem/FactEnvelope의 recordedSourceContract를 먼저 닫힌 검증한 뒤 정확 U4 profile/registry4에만 새 attribute context를 선택했다.
- 모델 회귀는 사람 검증 참조의 U4 허용과 null/구형/위조 계약·추가 필드·미등록 profile/Ref 거절, 기존 빈 근거 common 원상 보존을 검사한다. Luna의 models10/10이 exit0·success=true로 통과했다.
- 이어 같은 소스의 핵심 금융 흐름 선택1건이 exit0(12필터·success=false), 전체 financial-flow.spec.ts13/13은 exit0·success=true로 통과했다. 두 실행은 수집/assertion/전역 오류0·runReason=passed다. 선택 실행을 전체 성공으로 기록하지 않았다.
- 실제 금융 흐름은 정상 권한 부여·현재 승인/수락된 주문부터 청구·입금 후보/확정·60/40 배분·재전송·중복 및 정정 경계를 연결한다. 이후 확인한 다른 주문 연결의 무소비 재결합 차단 보완과 추가 명령 경합 회귀가 남아 있어 Step8/9 완료 체크는 유지하지 않는다.

## 실제 원장 DB6건의 공통 준비 경계 실패

- 마지막 financial-ledger.spec.ts 통합은 exit1·0/6통과·6실패·미실행/수집/전역 오류0·runReason=failed·success=false였다. 전건 같은 protected-transaction.ts:361 → 시험 파일:50의 초기 저장 경계를 가리켰다.
- 안전 진단은 UNCLASSIFIED_ERROR/OmsError이며 실제 정적 오류 코드가 없다는 뜻은 아니다. 원문 메시지·SQL·금융 자료를 출력하지 않고 공통 fixture 저장/참조 원인을 소스로 조사한다. 주 실행자도 안전 보고서6개 실패를 대조했다.
- 같은 소스 반복 실행은 하지 않았다. 제품의 보호·참조/원금 검증을 완화하지 않고 원인 수정 후 좁은 재검증부터 수행한다. 앞선 실제 금융 흐름13건 통과와 원장 DB6건 실패를 구별한다.

## 원장 fixture 배치 수정과101번째 선택 검증

- 공통 실패의 실제 코드는 기존 putNewBatch의 BATCH_LIMIT이었다. fixture가101개를 한 배치로 넣었으므로 같은 트랜잭션에서100+1로 나눴다. 제품의1..100 상한을 늘리지 않았다. 고의 primary-only 오염 준비도 정상 physicalData로 필수 FK를 보존하고 보호 누락만 주입하도록 수정했다.
- Luna가 같은 U4 격리 DB에서 financial-ledger.spec.ts의 `101번째 배분까지`만 한 번 실행해 exit0·1통과/5필터·실패/수집/assertion/전역 오류0·runReason=passed였다. 선택 실행의 success=false를 전체 suite 통과로 바꾸지 않았다.
- 전체 원장6건은 아직 재실행하지 않았다. 다른 주문 연결 이동 차단·금융 명령 경합·소비 원금/입금 정정 회귀를 보완한 뒤 같은 안정 소스로 전체 묶음을 확인한다. Step8/9는 미완료다.

## BR4.6·정정·실제 금융 경합 첫 묶음

- 일반 배분에서 이미 다른 주문에 연결된 입금은 소비0이어도 거절하도록 좁혔다. 별도 정정과 일반 배분을 구분한다. 실제 정정7건과 금융 명령 경합3건을 작성했으며 예약/환불 소비 원상은 보호된 합성 seed로서 환불 명령/U7 운영 성공이 아니다.
- 고정 소스에서 Luna의 금융 명령/출처/집합/원장/모델 단위5파일42/42가 exit0·success=true·runReason=passed·미실행/수집/assertion/전역 오류0으로 통과했다.
- 다음 corrections/races 실제 DB는10건 중6통과·4실패, exit1·success=false·runReason=failed·미실행/수집/전역 오류0이었다. 정정3/4번은 financial-commands.ts:379/557의 OmsError, 경합1/2번은 시험 파일:51의 AssertionError다. 안전 진단의 UNCLASSIFIED_ERROR를 실제 오류 코드 부재로 해석하지 않는다.
- 후속 flow13+ledger6 실행은 중단했고 재시도하지 않았다. 제품의 원금/권한/현재성 기준과 실제1회 효과를 보존하며 실패 원인을 조사한다. Step8/9는 미완료다.

## 청구 취소의 정상 계획 전환 검증 준비

- 무기한 승인 계획의 충돌 차단은 유지한다. 처음부터 명시된 종료를 가진 계획이 끝난 뒤 비중첩 구간의 새 계약/계획을 정상 등록·다른 사람 승인·고객 동의/적용하는 기존 생산자 경로로 취소 성공을 검증할 수 있는지 대조했다.
- raw 승인/계획 변조로 긍정 결과를 만들지 않는다. 실제 U7 운영 등록 대신 명시된 합성 후속 판단 포트를 사용했다는 한계를 유지하고, 해당 정상 경로의 실제 시험은 아직 준비 중이다.

## 정정 입력·경합 패자 사유 선택 재검증

- 정정 fixture가 등록 truth의 actualPaidAt 대신 새 시각을 전달해 U4_SOURCE_UNVERIFIED를 유발한 경로를 수정했다. 경합의 예상 밖 패자 예외는 원래 안전 오류로 전달하도록 했으며 허용 실패 사유를 넓히지 않았다.
- Luna가 선택4건만 실행해 전체10건 기준1통과·3실패·6필터, exit1·success=false·runReason=failed·수집/전역 오류0이었다. 정정3번은 통과했고4번은 여전히 U4_SOURCE_UNVERIFIED다. 경합1/2번은 AssertionError 대신 protected-write.ts:73의 QueryFailedError로 확인됐다.
- 원문 DB 메시지/SQL/매개변수를 출력하지 않았다. 정정의 원래 identity/provenance 불변값을 추가 대조하고, 경합은 알려진 SQLSTATE만 확인해 정상 충돌인지 판단한다. QueryFailedError 전체를 허용해 시험을 녹색으로 바꾸지 않는다. 추가 전체 실행이나 같은 소스 재시도는 하지 않았다.

## 정정 근거 문서 수정과 잠금 충돌 식별

- 남은 정정 fixture는 원래 입금 시각 외 sourceEvidence 문서도 등록 truth와 달랐다. 원래 문서/identity를 재사용하도록 수정했다. 안전 진단은 driverError.code의 알려진 SQLSTATE만 읽도록 보완하고 원문 메시지·detail·SQL/parameters는 계속 제외했다.
- Luna의 안전 진단 단위6/6이 exit0·success=true로 통과했다. 이어 선택3건은 정정1통과·경합2실패·나머지7필터, exit1·success=false·runReason=failed·수집/전역 오류0이었다.
- 경합의 실제 안전 코드는55P03이며 counter FOR UPDATE 위치를 가리킨다. 제품 lock_timeout/시험 barrier를 대조하여 유한 잠금 충돌과 인위적 fixture 지연을 구별한다. 승자1회·패자 전체 rollback·원금/현재성·기한과 원래 키 재확인을 유지하며 임의 허용 사유 확장이나 제품 timeout 증대로 결과를 맞추지 않는다.

## 유한 금융 진입 경합과 정정·취소 묶음 통과

- barrier는 명령 진입 전이며 트랜잭션 안에서 상대를 기다리지 않는다. 기존 ExecutionBudget의 lock_timeout=min(500ms,남은예산)에서 발생한55P03이었다. 기존 직접 저장 시험에는 이 budget 경계가 없었다.
- 제품 timeout은 유지했다. 실제 TypeORM QueryFailedError의55P03만 안전한503 U4_FINANCIAL_BUSY로 바꾸며 다른 오류/원문은 통과 조건에 넣지 않는다. 기존 API도 비OmsError를 원문 없이503으로 처리하지만 금융 진입의 구체 재확인 경계를 별도로 두었다.
- 원래 요청 키/내용 재확인과 새 키/현재 Ref를 이용한 잔여 한도 검증을 구분했다. 패자 접수/배분0·승자 효과1회, 정상 소비 반전/확인 정정·별칭 보존, 현재 계획이 정상 비중첩 승인·고객 동의/적용된 뒤 청구 취소와 소비 후 취소 거절을 포함한다.
- 고정 소스에서 Luna의 financial-access/safe-diagnostics11/11, races/corrections/cancellation 실제 DB12/12가 모두 exit0·success=true·runReason=passed·미실행/수집/assertion/전역 오류0으로 통과했다. 이어 같은 소스의 기본 흐름13+원장6 검증을 실행 중이다.
- 미연결 입금의 첫 주문 binding·정상 다른 기업/새 후보의 전역 실제 거래 중복·잘못된 주문 연결의 명시 정정 경계는 마지막 보완으로 남아 있다. 일반 배분의 암묵적 이동을 되살리지 않으며 REVERSED 이력과 현재 APPLIED 귀속을 분리하되 원래 보호 이력/원금을 보존한다. Step8/9는 아직 미완료다.

## 같은 소스의 금융 기본 흐름·누적 원장 통과

- 마지막 flow13+ledger6 통합19/19도 exit0·success=true·runReason=passed·미실행/수집/assertion/전역 오류0으로 통과했다. 주 실행자가 현재 단위11/11 및 통합19/19 보고서의 파일별 실제 집계도 확인했다.
- 이번 고정 소스3단계 결과는 단위11/11·정정/경합/취소12/12·기본 흐름/원장19/19다.42/42는 앞선 소스의 선택 단위 묶음이며 이번11건과 바꿔 적지 않는다. 실행 담당의 마지막 요약에서 혼동한 수치를 원래 명령/보고서 기준으로 바로잡았다.
- 정상 비중첩 승인 계획·고객 동의/적용을 통한 취소 긍정2건은 실제 합성 생산자 경로로 통과했으며 무기한 승인 충돌 차단은 유지한다. 실제 U7/금융 운영 등록·배포 준비를 뜻하지 않는다.
- 미연결 첫 binding·두 정상 기업/새 후보의 전역 중복·명시 잘못된 binding 정정의 마지막 묶음을 이어 구현한다. 전체 U4 및 공유 변경의 기존 영향 회귀는 이 묶음 후 안정 소스로 검증하며 아직 Step8/9 완료 체크를 바꾸지 않는다.

## 마지막 금융 연결·전역 중복 묶음 구현과 검증 시작

- 닫힌 PaymentBindingCorrectionInput/명령을 추가했다. 정확한 기존 입금과 양쪽 주문·현재 권한/계획·원본 확인·실제 영향, 절대 소비 L/RA/RU/HA/HU0을 확인하고 현재 binding 하나와 정정 이력만 원자 변경한다. 일반 배분의 다른 주문 연결은 계속 거절한다.
- REVERSED 과거 원본은 현재 binding과 구별하면서 원래 allocation/invoice/order 보호 개정·FinancialHistory 전후·이전 이력·동일 기업/범위를 검증한다. 같은 명령의 새 반전은 실제 transaction.rows의 after-image로 구별하며 기존 보호 이력을 생략하지 않는다.
- binding8건, 미연결 첫 배분과 정상 두 기업/새 후보 전역 거래 중복2건, 닫힌 계약 회귀를 작성했다. 원래 실제 거래 namespace는 기업/채널/profile 개정으로 쪼개지 않으며 타 기업 원본 정보를 노출하지 않는다.
- 고정 소스에서 Luna가 관련 계약/원장/명령/access/안전 진단36/36을 exit0·success=true·runReason=passed·미실행/수집/assertion/전역 오류0으로 확인했다. 이어 새 binding8+flow15의 실제 DB23건을 실행한다.
- 새 묶음 통과 후 바로 전체 U4 단위/통합으로 넓힌다. 기존 정정/경합/취소/원장18건은 전체 통합에 포함되므로 별도로 같은 소스를 두 번 실행하지 않는다. 공유 context/페이지 조회/원상 대조 변경의 기존 U1/U2/U3 영향 회귀도 이후 직렬 확인한다. Step8/9는 아직 미완료다.

## 마지막 연결 묶음과 전체 U4 단위 통과

- 같은 소스의 binding8+flow15 실제 DB23/23이 exit0·success=true·runReason=passed·미실행/수집/assertion/전역 오류0으로 통과했다. 주 실행자도 보고서의8/15 파일별 실제 집계를 확인했다.
- 이어 전체 U4 단위116/116·15파일이 exit0·success=true·runReason=passed·미실행/수집/assertion/전역 오류0으로 통과했다. 전체 U4 DB 통합을 이어 실행 중이며, 이 결과 전에 완료 체크/커밋을 하지 않는다.
- 기존 영향은 공통 source4 attribute context·ProtectedTransaction의 금융 전용 현재 페이지·U4Repository의 전체 집합 대조·core 공개 접점이다. 기존 쓰기/권한·역할/복구 전이를 이번 묶음에서 재작성하지 않았다. U1/U2/U3의 구형 모델/Ref·보호 payload·DB 권한·계약/접수 영향 회귀를 별도 좁은 목록으로 확인한다.

## 전체 U4 DB 통과와 기존 영향 회귀

- 전체 U4 실제 DB90/90·12파일이 exit0·success=true·runReason=passed·미실행/수집/assertion/전역 오류0으로 통과했다. 주 실행자도 전체 단위116/116·15파일 및 DB90/90의 현재 보고서를 직접 확인했다.
- 파일별 DB는 commercial14·concurrency4·binding8·cancellation2·corrections7·flow15·ledger6·races3·persistence7·protection-replay14·renewal2·staff-access8이다. 전체 제품 coverage/공식 검증·SYSTEM 지속 기록·실제 금융 운영/배포 성공을 선언한 결과가 아니다.
- 기존 영향은 Luna 두 명으로 분리했다. 한 명은 DB 없는 U1/U2/U3 선택 단위를 직렬 실행하고, 다른 한 명은 Unit별 격리 DB 준비/통합을 직렬 실행한다. 단위/통합 보고서 경로를 분리하고 DB 병렬 실행은 하지 않는다.
- U1 선택 단위38/38·실제 DB32/32, U2 실제 DB32/32는 exit0으로 통과했다. 기존 보고서에는 runReason이 없는 경우가 있어 그 필드를 새 보고서처럼 있다고 기록하지 않는다.
- U2 선택 단위는34건 중33통과·1실패였다. models.spec.ts:68의 전체 등록 이름 기대가 기존 MODELS+U2_MODELS+U3_MODELS만 합쳐 ALL_MODELS와 비교한 것이 원인이다. U3 선택 단위는 이 실패 뒤 미실행했다. CLI와 기존 JSON의 suite 집계 차이는 테스트 assertion 집계와 구분했다.
- 기존 MODELS의43개와 원래 모델 파일/구형 decoder는 변경하지 않았다. U4가 별도17개 물리 이름을 추가했으므로 해당 U2 단위 파일만 기존 합집합 보존과 명시 신버전 추가·중복/누락·물리 schema 일치를 별도로 검사하도록 보완한다. 제품/현재 DB 실행 의존은 고정하고 수정된 U2 선택 및 미실행 U3 선택만 재검증한다.
- 전체 DB 중 간헐적인 동일 PG client query 대기 deprecation 경고가 있었다. 정적 후보는 기존 Authorization의 유한 병렬 grant 검사와 U4 동일 manager 읽기 접점이며, 경고 stack으로 동적 위치를 확정한 결과는 아니다. 오류/원금·권한 정합성 결함으로 확인되지 않아 경고를 숨기거나 timeout·권한 알고리즘을 수정하지 않았다.

## Step8/9 최종 영향 회귀 통과

- U2 단위 한 파일의 전체 목록 기대만 위 원칙으로 보완했다. 제품·기존 구형 모델/decoder·U4 시험 실행 의존은 바꾸지 않았다. 주 실행자도 diff에서 기존43개와 기존합집합 보존 및 신규17개 literal의 정확추가·비중첩/누락/중복 검사 유지를 확인했다.
- Luna의 수정 후 U2 선택 단위34/34·3파일, 미실행 U3 선택 단위119/119·7파일이 모두 exit0·success=true·실패/미실행/수집 오류0으로 통과했다. 기존 보고서의 runReason 부재와 JSON suite 중복 집계는 CLI 파일/실제 assertion 수와 구분한다.
- 같은 제품 소스의 기존 단위는 U1 모델/스냅샷/payload/budget38, U2 모델/payload/권한34, U3 모델/현재원상/Ref/repository/payload/receipt/계약119다. DB는 U1 모델/계약binding/권한32, U2 모델/migration/repository32, U3 계약/고객동의/migration/repository경계61이며 모두 통과했다. 주 실행자도 DB 보고서의 실제32/32/61과 실패0을 확인했다.
- 각 DB 준비는 기존 Unit의 격리 검증 경로만 사용해 보존 원본을 초기화하지 않았다. 단위/DB를 Luna 두 명으로 분리했지만 DB 실행은 직렬로 유지했다. 수정된 구형 단위 파일을 U4 전체의 제품 변경으로 취급해 의미 없이 동일116/90 실행을 반복하지 않았다.
- 승인 계획 Step8/9의 금융 명령과 그 시험을 완료로 기록한다. 총9/18 완료이며 다음은 Step10/11 제공 자격·기한·수동 제한이다. 정상 SYSTEM 지속 기록·실제 환불 명령/U7운영·API/worker·전체 coverage/CI·공식 검증·R-03은 이 마일스톤의 완료 범위가 아니다.
- 현재 제품/시험/작업기록의 diff-check는 audit 경로를 제외하고 exit0이다. 도구 소유 audit의 기존 trailing whitespace는 직접 편집하지 않았으며 전체 diff가 깨끗하다고 주장하지 않는다. 이 마일스톤을 명시 경로로 커밋·push하고 다음 계층을 진행한다.

## 금융 마일스톤 저장과 Step10/11 착수

- 위 검증과 실제 구현을 대조해 Step8/9의 완료 체크 두 개만 반영하고 `fa6e0f1`로 커밋·origin/feat/u4-financial-settlement에 push했다. 총9/18 완료이며 U4 전체/배포 완료가 아니다.
- 다음 계층은 승인된 세 경로를 구분한다. 현재 원본의 순수 지급 자격 조회, 현재 U2 사람 확인을 통과한 STAFF의 판단/제한 기록, 미등록 SYSTEM 지속 기록 요청의 UNREGISTERED/HOLD다. SYSTEM을 실제 사람으로 가장하거나 입력에 없는 입금 증빙을 만들지 않는다.
- 근거는 공통 계약의 assessEligibility query→EligibilityView, 권한 있는 직원 또는 검증된 SYSTEM 원본 읽기의 대안, 첫 배포의 직원 수동 지원이다. SYSTEM 새 지속 기록의 정상 권위/감사 주체 정책은 확인되지 않아 지원 성공으로 표시하지 않는다. 직원 계산의 닫힌 분기에서도 현재 사람 확인·계획/원장·근거Ref와 감사 연결은 유지한다.
- 실제 완료 사건의 기한 재대조는 계약 의무 정정과 구분한 STAFF 전용 reconcileInvoiceDue 입력/명령으로 연결한다. 정확 주문/청구·HW/SW/FULL 대상과 완료 원본/aggregate/tranche 개정을 확인하고 같은 invoiceId의 기한·완료근거·이력만 바꾼다. 현금·배분·계약액은 바꾸지 않는다.
- 청구 Ref.revision·aggregateVersion·실제 tranche sourceRevision은 서로 다를 수 있어 섞지 않는다. invoiceId에 결합한 명시 model1 보조 원상 FinancialCompletionBasis로 닫힌 완료 view/사건 개정을 보존하는 기술 접점을 추가한다. 저장 snapshot 자체를 실제 제공/현재 권위로 승격하지 않고, basis누락은HOLD다.
- 신규 보조 원상은 같은 트랜잭션/보호/복구·owner권한·구형payload위장거절에 포함한다. 기존U4 저장소에서도 additive 적용되고 과거 원본을 보존하는 실제 회귀가 필요하다. 구형43개/기존합집합 보존은 유지하고 별도 물리이름 기대는 이번18번째 추가를 정확 반영한다. 계획/Testing Contract 문구는 수정하지 않는다. 아직 Step10/11의 구현/시험 완료가 아니다.

## Step10 날짜·원본 포트 첫 하위 단위 검증

- 날짜/FULL 완료 계산 모듈과 서버 등록 owner 포트를 먼저 구현하고 시험을 작성했다. 지급 자격/제한·기한 지속 기록과 보조 원상은 아직 미구현이며 하위 계층 성공으로 전체 지원을 주장하지 않는다.
- 고정 소스에서 Luna가 due-basis.spec.ts·owner-sources.spec.ts를 한 번 실행해16건 중14통과·2실패·미실행/수집/전역 오류0·exit1·success=false·runReason=failed였다. 날짜8/8은 통과, owner-sources6/8이며6/7번은 INVALID_INPUT/OmsError다.
- 안전 위치가 없으므로 새 고정 상대경로의 진단 등록과 해당 포트의 닫힌 입력/참조/응답 계약을 소스로 조사한다. 프레임상한5·원문/SQL/금융자료 미출력은 유지하며 스키마 완화나 같은 소스 반복 실행으로 결과를 맞추지 않는다. Step10/11은 미완료다.

## 날짜·원본 포트 fixture 수정과 하위 계층 통과

- 두 실패는 fixture의 decisionRef.entity가 미등록 AfterSalesDecision이고 정확 등록 이름은 AfterSalesDecisionRecord였기 때문이다. fixture만 바로잡고 제품 schema/검증은 유지했다. 새 core/unit 고정 상대경로와 실제 정적 코드만 안전 진단에 등록했으며 프레임상한5를 보존했다.
- Luna가 선택2건을 실행해2통과/6필터·exit0·실패/수집/assertion/전역 오류0·runReason=passed였다. success=false는 필터 실행이며 전체 suite 성공으로 적지 않았다.
- 이어 안전 진단6+기한8+owner포트8의 관련 전체22/22가 exit0·success=true·미실행/수집/assertion/전역 오류0·runReason=passed로 통과했다. 실제 DB는 실행하지 않았다.
- 이 결과는 순수 계산/등록 포트의 하위 계층이다. 보조 원상·기한 지속 기록·목적별 자격/수동 제한·실제 STAFF 감사는 다음 구현/시험에 남아 있다. Step10/11 완료 체크는 아직 바꾸지 않는다.

## 판단 조회와 실제 원본 개정의 분리

- EligibilityView.sourceRevision은 FinancialEligibility 자체 개정이다. 주문 개정을 대신 넣을 근거가 없어 그 제안을 철회했고, 구형 View/개정 의미는 보존했다. 순수 query만 별도 닫힌 CurrentEligibilityView로 주문/목적/계획/계약/판단/근거Refs/계산시각을 반환한다. 저장되지 않은 원본Ref/임의개정을 만들지 않는다.
- STAFF evaluate는 실제 FinancialEligibility와 그 실제 개정·감사를 기록한다. 기존 readiness/C04 소비자에 순수 View를 구형 원본처럼 전달하지 않으며 현재 목적/전체근거·원본 부재·권위 미등록은 구별한다. 지급/제한이 바뀌어도 주문 개정이 같을 수 있어 주문 개정만으로 현재성을 판단하지 않는다.
- 완료 보조 원상·순수 READ ONLY 판단·STAFF 계산/제한·기한 재대조 연결을 구현하고 eligibility8·completion-basis8 및 계약/모델/복구·기존 증빙 분기 회귀를 작성했다. 고정 소스에서 Luna의 관련10파일82/82가 exit0·success=true·runReason=passed·미실행/수집/assertion/전역 오류0으로 통과했다.
- 실제 DB의 수락 전 SALE_ACCEPTANCE·미발행 필수 지급·지급/제한 변경 후 stale 거절·기한 정정/복구·기존U4 DB의 추가 적용 시험은 아직 준비 중이다. 신규18번째 물리 모델을 반영한 U2 선택 단위를 별도 확인하며 Step10/11은 계속 미완료다.

## 신규 모델의 구형 회귀와 실제 DB 첫 선택 검증

- 새18번째 물리 모델 기대를 반영한 U2 모델/권한/payload34/34가 exit0·success=true·실패/미실행/수집 오류0으로 통과했다. 기존 보고서에는 runReason이 없으며 중첩 suite 수를 파일 수로 바꾸지 않았다.
- 실제 owner-facts14건과 completion-migration3건을 작성했다. 기존U4의 원본/보호prefix·고정일/미산출 청구를 보존하고 새 빈 basis 테이블만 없는 상태에서 명시 migration/역할 준비를 재실행하는 경계다. reset을 수행하지 않는다.
- 복구의 basis 필수 조건은 실제 source4 reconcileInvoiceDue 접수와 불변 이력이 현재 Invoice 개정에 결합한 표식으로 판단한다. 과거 dueDate만으로 새basis를 일괄 요구하지 않으며, 계산된 실제 완료 근거의 누락은 writer/append 재개 전에 차단하도록 연결했다.
- 고정 소스에서 전체 U4 단위150/150·19파일이 exit0·success=true·미실행/수집/assertion/전역 오류0·runReason=passed로 통과했고 U4 격리 DB 준비도 성공했다.
- 이어 핵심 선택2건은 수락 전 SALE 정상1통과·실제 FULL 완료 기한 case8의 U4_PAYMENT_LIMIT1실패·12필터, exit1·success=false·수집/전역 오류0·runReason=failed였다. 전체17건은 실행하지 않았고 재시도도 하지 않았다.
- 기한 사례의 준비 배분에서 실제 확인 원금·가용액/기존 소비와 요청의 정합성을 조사한다. 제품 원금 검증을 완화하거나 준비 현금을 임의 증가시키지 않는다. Step10/11은 미완료다.

## 기한 통합 fixture 원금 수정 후 다음 검증 실패

- provisionPaid가 기존 f.payment의 첫 인수(문서 식별자)를 금액으로 오해했다. 도우미는 실제 확인/기록/확정 원금을100으로 만들었는데200 배분을 요청해 정상 U4_PAYMENT_LIMIT였다. 제품과 공유 helper를 유지하고, 해당 시험만 명시 truth200→record200→confirm 경로 및 배분 전후 P/L assertion으로 고쳤다.
- 같은 제품 소스의 단위150건을 반복하지 않고 Luna가 핵심 선택2건을 재검증했다. 수락 전 SALE1통과, 기한 case8은 다음 입력 경계 INVALID_INPUT/OmsError(access.ts:380 → 시험:268)로 실패했다.12필터·exit1·success=false·수집/전역 오류0·runReason=failed이며 전체17은 미실행이다.
- 추가 정적 대조에서 기존 correctInvoice가 기한/제공 refs를 비워 새 Invoice 개정을 만들면 이전 FinancialCompletionBasis의 정확 invoiceRef가 과거 개정에 남는 경계를 발견했다. 정상 계약/청구 정정→실제 완료 재대조와 정정 직후 복구를 원래 basis·불변 정정 이력으로 연결하는 좁은 보완이 필요하다.
- 과거 basis를 일괄 허용하거나 원본/이력을 삭제하지 않는다. 현재 입력 검증 실패와 정상 정정 호환을 함께 조사·수정한 뒤 관련 단위와 핵심 실제 DB부터 확인한다. 아직 Step10/11은 미완료다.

## 접수 참조와 정상 청구 정정 연결의 첫 검증

- U4 Receipt만 등록된 U4 target/result Ref를 검증하도록 연결했다. 구형 공통/U3 계약은 보존하고 미등록·다른 owner·위장 source Ref와 추가 필드는 계속 거절한다. 같은 트랜잭션의 RequestReceipt/FinancialHistory 저장 검증이 성공 응답 전에 수행된다.
- FinancialCompletionBasis의 원래 기한 접수/불변 이력과 정상 correctInvoice 개정 사슬을 검증하는 보조 연결을 기한 재대조·청구 정정/취소·복구에서 재사용한다. 기한이 비워진 정상 정정 중간 상태도 실제 과거 접수에서 추적하며, 과거 고정일·미산출 원상에 새 basis를 일괄 요구하지 않는다. 금액·업무 상태를 추가하지 않고 이력을 삭제하지 않는다.
- 고정 소스의 관련 단위7파일58/58이 Luna 실행에서 exit0·success=true·runReason=passed·미실행/수집/전역 오류0으로 통과했다.
- 이어 실제 owner-facts 선택4건은3통과·1실패·12필터, exit1·success=false·runReason=failed·수집/전역 오류0이었다. 실패는 위조 결과 참조의 원자 rollback 시험 case11, owner-facts.spec.ts:393:8의 AssertionError다. 후속 owner-facts/completion-migration 전체20건은 실행하지 않았다.
- 해당 단언과 실제 트랜잭션 결과를 조사한다. 허용 오류를 넓히거나 rollback 검사를 약화하지 않으며, 수정 후 영향 검증부터 재개한다. Step10/11 완료 체크는 아직 바꾸지 않는다.

- 정적 원인은 access의 실제 기록 행 검사가 Receipt 스키마보다 앞서 수행되는 점이다. 미등록 entity/다른 owner는 정확히 U4_RESULT_NOT_WRITTEN이며 INVALID_INPUT을 기대한 시험이 잘못됐다. 두 경우는 정확한 기존 코드를 기대하도록 수정하고, 위장 source 사례는 실제 같은 트랜잭션에 기록한 새 Invoice 개정을 참조시켜 행 존재 검사를 통과한 뒤 닫힌 Receipt 저장에서 INVALID_INPUT을 검증한다. 각 사례의 원본/이력/접수/fact 전체 rollback 단언은 유지한다. 제품 소스는 바꾸지 않았다.
- 수정 후 같은 제품의 위조 결과 선택1건이 통과했다. exit0·실패/수집/assertion/전역 오류0·runReason=passed이며15건은 필터 pending이라 success=false를 전체 통과로 해석하지 않았다. 미실행이던 전체20건을 이어 실행한다.
- 분리한 Luna가 현재 소스의 구형 선택 단위를 실행해 U1 모델/payload/복구 보안30/30·3파일, U2 모델/payload24/24·2파일, U3 모델/payload/접수46/46·3파일 모두 exit0·success=true·실패/미실행/수집/전역 오류0으로 통과했다. 구형 보고서의 runReason 부재와 중첩 suite 수를 실제 파일/단언 수와 구별했다. DB 병렬 실행은 하지 않았다.

## 새 완료 근거의 실제 DB 전체 첫 결과

- owner-facts16/16은 통과했다. completion-migration4건 중2통과·2실패로 합계18/20·2파일, exit1·success=false·runReason=failed·미실행/수집/전역 오류0이다.
- 복구 재생 case2는 INVALID_INPUT/OmsError(model-catalog.ts:253 → u4-recovery-verification.ts:64 → 시험:109), 계산 근거 누락 차단 case3은 AssertionError(시험:159)다. 정상 정정 중간 상태의 누락 차단과 구형U4 additive migration 사례는 통과했다. 동일 소스로 재시도하지 않았고 후속 전체U4 시험은 아직 실행하지 않았다.
- 복구 전 검증에서 새 완료 근거/기한 원상의 참조 형식을 대조한다. 구형 payload를 완화하거나 누락 차단 기대를 제거하지 않으며, 실제 원인 수정 후 복구 사례부터 다시 확인한다. Step10/11은 미완료다.

- 추가 정적 조사에서 Ref 허용 문제가 아니라 SQL date/LocalDate 판독 형식 차이를 원인 후보로 좁혔다. 정상 TypeORM 조회는 YYYY-MM-DD로 hydration하지만 복구 verifier의 직접 조회는 pg Date 객체를 그대로 닫힌 Date 문자열 검증에 전달할 수 있다. 제품 수정 전 합성 DATE 조회의 raw 형·정상 driver hydration·닫힌 schema 거절을 검사하는 회귀를 추가했다.
- Luna의 해당 진단 선택1건이 exit0·실패/수집/assertion/전역 오류0·runReason=passed로 통과했다.4필터 pending이므로 success=false이며 전체 복구 성공을 뜻하지 않는다. 제품 바이트는 이 재현까지 불변이다. 기존 Date schema를 유지하고 LocalDate 필드에 정상 driver의 hydration을 적용하는 최소 수정 후 실패했던 실제 복구를 확인한다.
- 최소 수정은 raw 조회의 LocalDate 필드가 Date 객체일 때만 같은 EntityMetadata/driver.prepareHydratedValue를 적용한 뒤 기존 validateModel을 수행하는 것이다. Instant·bigint·Ref/profile·payload와 닫힌 Date schema는 바꾸지 않았다. 모델 단위는 null/정확 날짜 허용과 Date 객체·불가능한 날짜·잘못된 월·형식 거절을 검사한다.
- 수정 후 관련 모델11+복구payload8의 단위19/19·2파일이 Luna 실행에서 exit0·success=true·runReason=passed·미실행/수집/전역 오류0으로 통과했다. 실제 복구5건과 전체U4 단위를 보고서 경로를 분리해 검증한다.

## 날짜 판독 수정 후 복구·전체 단위 통과

- completion-migration 전체5/5가 exit0·success=true·runReason=passed·미실행/수집/assertion/전역 오류0으로 통과했다. 이전 case2의 복원과 case3의 실제 근거 누락 차단이 함께 통과해 잘못된 날짜 표현이 선행 오류를 만든 공통 원인이었음을 확인했다. 정상 정정 중간 상태의 누락 차단과 기존U4 원본/prefix 보존 추가 적용도 포함한다.
- 분리 실행한 현재 U4 전체 단위159/159가 exit0·success=true·runReason=passed·미실행/수집/전역 오류0으로 통과했다. 주 실행자도 실제 보고서의159 및 기존 영향 선택 단위30/24/46을 직접 대조했다.
- 제품 소스는 동결하고 전체U4 실제 DB와 기존U1 재생/복구 보안, U2 추가 migration, U3 추가 migration/복구 권위 선택을 직렬 실행한다. 기존 Unit은 각 격리 DB 준비 후 실행하며 보존 원본 초기화/DB 병렬 실행/대량 DR로 범위를 넓히지 않는다. Step10/11의 최종 완료와 커밋은 이 영향 회귀 후 판단한다.

## 동결 중 추가로 확인한 목록 표현 경계

- 정상100항목 배분은 PaymentEvidence1+PaymentAllocation100+FinancialHistory1의102개 결과 Ref를 보존해야 한다. U4 응답은 개수 상한이 없지만 저장 RequestReceipt의 공통 RefList100이 이를 거절할 수 있다. 누적101개 repository 시험은 실제100항목 명령 성공의 증거가 아니므로 구분한다.
- 100품목 및 수명 동안100개를 넘는 배분의 현재성 판단도 전체 근거를 FactEnvelope에 보존하면서 공통 evidenceRefs100에 걸릴 수 있다. 전체 청구/누적 배분 수를100·512·1000 등 새 정책으로 제한하거나 근거Ref를 버리지 않는다. 전체 원장은 기존 cursor100의 완전 대조를 유지한다.
- 최소 보완은 정확 source4/registry4·FinancialSettlement의 특정 필드 연결이다. allocatePaymentBatch의 닫힌 결과3..102 전용 schema/응답 검증을 RequestReceipt.resultRefs에 적용하고, 정확 U4 FactEnvelope.evidenceRefs에는 기존 U4 Refs 표현을 연결한다. 다른 operation/모델·입력·구형100 제한과 현행4MiB 보호 payload/실행 예산의 commit 전 자원 검사는 유지한다. 새로운 digest/보조 원상은 만들지 않는다.
- 정상 생산자에서는 발생하지 않지만 빈 basis.historyRefs의 undefined 비교가 명시 근거 누락 대신 INVALID_JSON이 되는 음성 경계도 확인했다. 누락 비교값은 불일치로 닫고 기존 U4_DUE_BASIS_MISSING/복구 차단을 유지하는 좁은 보완이 필요하다.
- 위 발견은 현재 실행 중인 소스에 아직 반영하지 않았다. DB 연속 실행 종료 후 최소 수정·단위/실제 명령 회귀를 추가하고, 그 전후 소스의 결과를 분리한다. 기존 승인한100입력/완전 근거 보존을 충족하는 수정이며 계획/Testing Contract를 변경하지 않는다.

## 중간 커밋과 전체 DB 검증 종료

- 구현·시험·열린 경계와 검증 기록을 중간 커밋6771f02로 저장하고 origin/feat/u4-financial-settlement에 push했다. 완료 체크는9/18로 유지했다. 제품 바이트를 변경하지 않고 진행 중인 실제 DB 실행을 보존했다.
- 목록 표현 보완 발견 후 검증 순서를 조정했다. 실행 중인 전체U4는 완료까지 기다리고 구형U1/U2/U3 DB 준비/회귀는 보완 후 소스에서 수행한다. 같은 소스 재시도나 DB 병렬 실행은 하지 않았다.
- 전체U4 실제 DB111건은110통과·1실패·14파일, exit1·success=false·runReason=failed·미실행/수집/전역 오류0이다. persistence.spec.ts의 두 번째 사례가 AssertionError(47:57)로 실패했고, owner-facts16/16·completion-migration5/5를 포함한 나머지13파일은 통과했다. 전체 성공으로 표시하지 않는다.
- 소스 동결을 해제하고 해당 저장 시험의 정확 기대, source4 목록 필드 연결, 빈 이력 비교 가드와 실제100항목/100품목·101누적 배분 경계를 함께 보완한다. 정상 생산자를 우회하지 않으며 현재 권한·완전 근거·원금 보존·구형 제한을 유지한다. Step10/11은 계속 미완료다.
- persistence의 실패는 옛 업무9+보조8=17의 고정 기대였다. 기존17개에 FinancialCompletionBasis가 추가된18개를 검증해야 한다. 기존17 보존/신규1/중복 없음과 각 실제 테이블 존재를 분리 확인하도록 시험을 보완하며 제품 저장 구조를 되돌리지 않는다.

## 승인된 입력 범위를 보존하는 결과·근거 연결

- allocatePaymentBatch의 실제 응답을 operation.output의 닫힌 AllocationReceipt로 검증하고 결과3..102를 허용했다. 저장에서는 정확 source4/registry4·RequestReceipt·FinancialSettlement·allocatePaymentBatch·resultRefs에만 같은 닫힌 AllocationResultRefs를 연결한다. 허용 entity는 PaymentEvidence/PaymentAllocation/FinancialHistory이며 중복은 거절한다. 입력1..100과 다른operation/구형100은 유지한다.
- FactEnvelope는 정확 source4/registry4·FinancialSettlement·schemaVersion 일치의 evidenceRefs만 기존 U4 Refs로 연결한다. 전체 근거/실제 사람 연결·원장 cursor 전체 대조·기존4MiB 보호 payload/예산 사전 검증은 유지한다. 저장량이 많다는 이유로 Ref를 생략하거나 새 업무 개수 상한을 만들지 않는다.
- 누락된 basis 이력 비교값은 불일치로 닫아 기존 근거 누락/복구 보류 경로로 보내며, 정상 금액/권한 분기는 변경하지 않았다. persistence 시험은 기존17 보존+신규1·중복 없음·실제 테이블 존재로 보완했다.
- 관련 단위5파일43/43, 실제 persistence7/7이 Luna 실행에서 각각 exit0·success=true·runReason=passed·미실행/수집/전역 오류0으로 통과했다. 이전 전체111의 모델 수 고정 기대 실패가 해소됐다. 보완 후 전체111을 재실행한 결과라고 주장하지 않는다.
- 정상100항목/102결과·마지막 오류의 전체rollback·누적101배분의 근거/현재성·100품목 실제 판단·복구·기존 payload/기한 사전 차단을 새 실제 명령 회귀로 확인한다. 정상 producer100회 준비가 필요한 새 시험 사례만 fixture120초이며 제품10초/DB2초/lock500ms 예산은 유지했다. 아직 해당 실행 결과는 없다.
- 보완 후 전체U4 단위167/167이 exit0·success=true·runReason=passed·미실행/수집/전역 오류0으로 통과했다. 별도 Luna의 같은 소스 구형 선택 단위도 U1 30/30·U2 24/24·U3 46/46으로 다시 통과했다. 공통 model attribute/catalog가 바뀌어 구형 표현 보존을 재확인한 것이며 DB 없는 단위/DB 실행 보고서를 분리했다.
- 새 선택100항목 실제 명령은 case1의 AssertionError(financial-result-boundaries.spec.ts:80:51)로 실패했다. exit1·success=false·runReason=failed·실패1/3필터·수집/전역 오류0이며 뒤100품목/기한/서버근거 선택3건은 미실행이다. 실패 단언과 실제 경계를 조사하고 동일 소스 재시도·허용 오류 확대는 하지 않는다.
- 실패 지점은 정상100개 배분/102결과와 같은키 재조회 이후의 전체 PaymentAllocation 개수 검사다. ProtectedStore.list의 기본25개 페이지를 전체100개로 오해한 시험 문제였다. 제품은 유지하고 안정cursor100/deadline의 store.scan으로 끝까지 읽는 helper를 사용해 배분 개수와100개 FinancialInvoiceBalance의 오류 전후를 확인한다. 지급 판단까지 도달한 결과는 아니며 이후100/101 현재성·복구 성공을 선행 주장하지 않는다.
- 시험 한 파일의 전체읽기만 수정한 재실행은 Error/UNCLASSIFIED_ERROR(사례 선언22:3)로 실패했다. exit1·success=false·실패1/3필터·수집/전역 오류0이며 뒤3건은 여전히 미실행이다. 선언 위치만으로 원인을 확정하지 않고120초 fixture 초과 가능성과 준비·전체읽기·복구 구간을 대조한다. timeout/품질 목표를 단순 확대하거나 실제100생산자·전체효과 검사를 삭제해 통과시키지 않는다.
- 설치된 Vitest의 정확한120000ms timeout 전체문구만 VITEST_TEST_TIMEOUT으로 분류하고 해당 신규 DB 파일의 허용stage/청구완료개수0..100/유한 경과·duration만 진단에 투영하도록 시험 도구를 보완했다. 변형문구·다른파일·임의meta/stage·범위 밖 개수/시간은 폐기한다. 제품/120초/요청·DB 예산은 바꾸지 않았다.
- 이 진단의 양성·음성 단위16/16·2파일이 Luna 실행에서 exit0·success=true·runReason=passed·미실행/수집/전역 오류0으로 통과했다. 같은 실제 선택 사례를 한 번 관찰해 실패 종류/단계를 확인하며, 원인은 아직 확정하지 않는다.
