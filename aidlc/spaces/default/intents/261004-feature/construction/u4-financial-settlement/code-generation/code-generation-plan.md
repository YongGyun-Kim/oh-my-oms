# U4 금융 정산 구현 계획

## Summary

- Builds: 복수 청구·직원 입금 확인·한 주문 내 수동 배분·정정·목적별 지급 판단·환불 기록을 18단계로 구현한다. R-03 실패분 재시도는 별도 해소 전 완료하지 않는다.
- Touches: 기존 packages/contracts·persistence·core, API/worker, U3 지급 약정 접점, tests/u4·scripts/u4와 공통 파일럿 CI를 확장한다. 새 서비스나 AWS 자원은 만들지 않는다.
- Tests: Standard/test-after로 10개 구성의 단위 시험 각 5–8건과 핵심 실제 PostgreSQL·HTTP·worker 통합 20건 이상을 계획한다. 전체 제품 라인80%·필수 보안 검사·기존 Unit 회귀를 유지한다.

## 범위와 완료 조건

기준은 U4 [기능 명세](../functional-design/functional-spec.md) WF4.1–WF4.8, [규칙](../functional-design/rules.md) BR4.1–BR4.24, [엔티티](../functional-design/entities.md)의 9개 업무 원본과 [SD01–SD11](../nfr-design/security-design.md), [LC01–LC10](../nfr-design/logical-components.md), [IP01–IP08](../infrastructure-design/cicd-pipeline.md)다. 아직 제품 코드는 변경하지 않았다.

- 한 주문에 여러 임의 명칭의 지급 의무/청구, 제공 전·후 혼합 계획, 실제 입금 하나의 현재 주문 하나, 같은 주문 안 1..100개 청구에 명시 수동 배분을 구현한다.
- 원 단위 정수 문자열/BigInt, 일반 JSON65,536바이트, 명칭100·설명/사유2000·문서/거래 참조256 Unicode code point를 유지한다. 주문 전체 청구 수100 제한은 만들지 않는다.
- 실제 원본을 확인한 직원의 수동 기록이다. source profile·원본 확인 권위가 미등록이면 REVIEW/HOLD다. 합성 profile을 production 등록으로 승격하지 않는다.
- FinancialSettlement만 금융 원본을 쓴다. U3는 약정/승인/주문, U5/U6는 실제 제공/회수·기간/회차, U7은 후속 승인·통지, U8/U9는 전체 금융 PC 화면을 소유한다.
- 새 UI/모바일·파일 업로드/OCR·URL 가져오기·은행망 실행·자동 배분/갱신·자동 연체 제재·부분 제공·보상 중첩 자동 산식은 추가하지 않는다. RenewalFeeAdjustment의 후속 의미/미지원 거절과 참조는 보존한다.
- 문서와 합성 검증은 실제 은행/회수·고객 운영 준비를 입증하지 않는다. 10곳/일1000건은 계획이며 대량100k/50분·전체 DR·무중단·30일 목표 실증은 후속이다. 최소 보호/백업·권한·알림·국내 경로 준비 의무는 유지한다.
- U4 완료·병합 판단은 현재 코드/명령/보고서·전체 분모와 미해결을 함께 대조한다. 다른 Unit의 과거 검증 성공을 U4 성공으로 사용하지 않는다.

## 작업 순서와 책임

체크박스 18개가 구현 작업 단위다. 테스트 가능한 계층은 구현 후 해당 시험을 작성·실행하고 다음 계층으로 진행한다. 단순 시험 실행은 별도 Luna, 코드 작성과 실패 원인 판단은 개발 담당이 맡는다. 자동 진행도 아래 R-03 및 공식 명령 선택의 사람 판단을 대신하지 않는다.

### Step 1
- [x] 실행 준비·U4 시험 설정을 추가한다. `tests/u4/vitest.unit.config.ts`, `vitest.integration.config.ts`, `vitest.coverage.config.ts`, `fixtures/profile.ts`, `fixtures/databases.ts`, `fixtures/safe-json-reporter.ts`, `scripts/u4/prepare-test-databases.ts`를 만들고 package.json/tsconfig.json에 U4의 정확한 범위를 등록한다. 기존 Vitest/Node/TypeORM/lock을 재사용하며 별도 U4 합성 primary·보호 DB/역할만 준비한다. 첫 실행 시험은 Step3의 실제 계약 시험이며 무시험 성공 설정을 넣지 않는다. 대응: 전체 U4 스토리의 실행 기반, NFR13.1–13.2·IP05.

### Step 2
- [x] 변경 계약/런타임 입력을 구현한다. 신규 `packages/contracts/schemas/u4-financial-v1.json`, `u4-operations-v1.json`, `src/u4-types.ts`, `u4-validation.ts`, `u4-declarations.ts`와 기존 schema/exports/registry 연결을 추가한다. 새 profile `urn:oms:contract:u4-financial:1`과 기존 등록 버전3과 구별한 버전4를 사용한다. AgreedPaymentPlan·DueBasis·거래 식별/별칭·배분 묶음·목적/개정·원래 환불 작업/부분/시도·허용 조회를 닫힌 형식으로 정의한다. C00 Money/Ref/Receipt/Problem을 재사용하고 문서/거래 참조를 가짜 업무 Ref로 만들지 않는다. 기존 U3 profile/version3 입력에 새 필드를 허용하지 않는다. 대응: US4.1/4.4/4.5/4.6/8.6, 협력 US2.4/2.6/3.1/3.4/7.1·BR4.2/4.22.

### Step 3
- [x] 계약 계층 구현 후 `tests/u4/unit/contracts.spec.ts`, `input-boundaries.spec.ts`를 작성·실행한다. 각 구성 5–8개 의미 있는 정상/실패/경계 시험을 기본으로 exact integer/범위 초과·알 수 없는 필드/Ref·1/100/0/101개와 중복 항목·한글/비BMP code point·상한+1·구버전 거절을 포함한다. HTTP byte 상한은 Step15 실제 parser에서 별도 확인한다. 대응: Step2와 NFR5.2/7.1/7.2/13.3.

### Step 4
- [x] 저장·복구 기반과 repository를 구현한다. 신규 `packages/persistence/models/u4-v1.json`, `src/u4-model-catalog.ts`, `u4-model-decoder.ts`, `u4-support-models.ts`, `u4-migration.ts`, `u4-recovery-payload.ts`, `u4-repository.ts`를 추가한다. 기존 model-catalog/model-attribute/data-source/migration 등록, protected-store/transaction/write, recovery-types/replay 및 버전 검증을 확장한다. U4 업무/기술 모델은 version1, 승인 약정/주문에 필요한 U3 소유 원본의 새 표현은 명시 version3으로 구분하고 legacy/version2 decoder·bytes를 보존한다. 새 profile의 공통 receipt/fact/work 검증을 연결하며 구형 validator를 느슨하게 해 우회하지 않는다.
  업무 식별/별칭 NOT NULL+UNIQUE·canonical payment PK binding·order+불변 obligationKey current invoice·실제 환불 결과 식별·보호 가능한 원금/공통 승인 root 집계를 등록한다. 긴 식별은 canonical material+고정 digest를 함께 보존하고 digest 충돌을 HOLD한다.
  U4 writer는 명시 READ COMMITTED, counter/epoch→payment ID→invoice ID→승인 root ID 순서, 같은 EntityManager로 현재 권한/원본·완전한 잔액을 재검증한다. 보호 prefix를 사전에 읽고 primary 안에서 그 개정/원상을 대조하며 counter 보유 중 별도 보호 I/O를 기다리지 않는다. 미보호 선행 소비는 HOLD다. 모든 보조 원본/이력/요청/Outbox를 원자 기록하고 primary commit 뒤 보호 확인·epoch 대조 후 성공한다. 대응: 전체 지원 U4 업무, BR4.5–4.10/4.18–4.19·SD05–SD09.

### Step 5
- [x] 저장 계층 후 `tests/u4/unit/models.spec.ts`, `repository.spec.ts`, `recovery-payload.spec.ts` 및 `integration/persistence.spec.ts`, `concurrency.spec.ts`, `protection-replay.spec.ts`를 작성·실행한다. 실제 PostgreSQL 별도 연결/서로 다른 요청의 유일성 경합·입금100에80+80·두 입금의 청구100 소비·동일 승인 root 경합·rollback·101건 이상 누적 집계·보호 실패/응답 유실/epoch 변경·보조 원상/제약 복구 누락을 확인한다. old U1/U2/U3 자료와 새 원본의 decoder/replay를 함께 검사한다. 전체 DR 부하 시험으로 확대하지 않는다. 대응: AC4.1.2/4.4.2/4.4.4/8.6.2/8.6.4·NFR4/5/13.

### Step 6
- [x] U3 소유의 지급 계획/승인·주문 연결을 확장한다. 신규 `packages/core/src/u4-payment-plan.ts`, `u4-commercial-adapter.ts`와 기존 commercial-terms/commercial-agreement/commercial-proposal/proposal-terms/order-terms/order-acceptance/u3-order-readiness/u3-current-basis의 필요한 접점을 변경한다. 승인한 exact 총액과 의무 합계·현재 계약/계획·다른 사람 승인·제안/고객 동의를 연결한다. `u3-renewal-source.ts`의 검증된 회차를 별도 갱신 주문의 안정 키에 결합한다. 수락용 지급 판단은 제공용 충족과 분리하고 구버전 PREPAY/POSTPAY/기존 snapshot을 자동 변환하지 않는다. 다른 소유자의 테이블을 U4에서 직접 수정하지 않는다. 대응: US4.1/4.5·협력 US2.4/2.6/3.1/3.4/3.5/7.1/7.5·BR4.3/4.11/4.12/4.23.

### Step 7
- [x] 약정/주문 계층 후 `tests/u4/unit/payment-plan.spec.ts`, `integration/commercial-plan.spec.ts`를 작성·실행한다. 총액 불일치·미승인/동일인·stale revision·명시 전액후불과 미확인·혼합 제공 전200/후800·미발행 필수 의무·동의 없는 변경·같은 회차의 별도 주문 중복·과거 지급 재사용 거절을 검증한다. U3의 기존 구버전 혼합 거절을 제거하지 않고 신버전 지원 회귀를 추가한다. 대응: Step6·VS4.1/4.2/4.14/4.15.

### Step 8
- [ ] 핵심 금융 명령을 구현한다. 신규 `packages/core/src/u4-financial-commands.ts`, `u4-financial-ledger.ts`, `u4-financial-access.ts`, `u4-financial-source.ts`에 청구 발행/정정·입금 REVIEW/확정/분쟁·한 주문 binding·수동 배분/정정·대조·불변 이력을 구현한다. 서버 등록 source profile/검증된 직원·원본 없이는 confirmed로 승격하지 않으며 파일hash/UUID/요청 키를 거래 증거로 쓰지 않는다. 정정/취소 후 별칭을 유지하고 기존 환불/예약 원금이 새 현금이 되지 않게 한다. 대응: US4.1/4.4, US4.3의 미지원 자동 연결 거절 기여·BR4.1–4.10/4.16/4.21.

### Step 9
- [ ] 금융 명령 계층 후 `tests/u4/unit/financial-commands.spec.ts`와 기존 Step5 통합 시험을 확장해 `integration/financial-flow.spec.ts`를 실행한다. 청구→원본 확인→입금100→청구60/40 수동 배분→원래 접수 재조회·정정의 완전 경로, 다른 주문/기업/채널/profile 개정의 동일 거래 차단, 한 항목 오류의 전체 rollback, 권한 회수·원본 실패·이미 환불/예약한 배분 취소 거절을 검증한다. 대응: VS4.3–4.6/4.8/4.10/4.11·주 책임 AC4.1/4.4.

### Step 10
- [ ] 제공 자격·기한·수동 제한과 후속 원본 포트를 구현한다. 신규 `packages/core/src/u4-eligibility.ts`, `u4-due-basis.ts`, `u4-owner-sources.ts`로 SALE_ACCEPTANCE/PROVISION 목적·현재 계획/의무/회차·명시 빈 집합을 검증한다. KST 실제 완료일+합의 달력N·기한일 전체·다음날 후보, 고정일/다른 확인 사건·상위 정정 개정을 구별한다. 직원이 계약상 제한/해제를 기록하고 U5/U6 실제 완료/회수·U7 승인 root를 등록된 포트로 읽는다. 미등록 주체는 UNVERIFIED/HOLD이며 실제 완료/기간을 만들어 넣지 않는다. 대응: US4.5/4.6·협력 US3.4/5.5/6.1/6.5/7.1·BR4.11–4.17/4.23.

### Step 11
- [ ] 판단 계층 후 `tests/u4/unit/eligibility.spec.ts`, `due-basis.spec.ts`와 `integration/owner-facts.spec.ts`를 작성·실행한다. 제공 전후 혼합·필수 청구 미발행·현재/과거 회차·미등록 공급자·stale ALLOW·완료12/1+30=12/31·N0·한국 자정·윤일/연말·역순/공백/확인 정정·부분 미완료·조기 설치·수동 제한의 범위를 검사한다. 대응: VS4.1/4.2/4.7/4.14/4.15·NFR5.3/5.6.

### Step 12
- [ ] 환불 예약·실제 결과/정정 계층을 구현한다. 신규 `packages/core/src/u4-refund.ts`에서 U7 승인 root/원금/필요 회수·모든 case/시도/개정의 공통 한도, 부분별 성공/불명/실패 예약, 실제 결과 식별 중복·동일 작업의 추가 확인과 RECONCILING 정정을 구현한다. 성공분 재실행·불명분 해제·승인 개정마다 한도 복제를 금지한다.
  **R-03의 실패분 새 시도 상태 구현에 도달하면 중단하고 별도 수정 판단을 요청한다.** 본 계획의 승인은 frozen Functional Design 상태표를 변경하거나 PARTIAL/IN_PROGRESS 중 하나를 임의 선택하는 승인이 아니다. 모순 없는 부분 구현도 전체 환불/이 단계 완료로 표시하지 않는다. 대응: US8.6·BR4.18/4.19/4.24·미해결 AC8.6.3.

### Step 13
- [ ] 환불 계층 후 `tests/u4/unit/refund.spec.ts`와 `integration/refund-flow.spec.ts`를 작성·실행한다. 다른 case의 같은 원금/root 경합·성공60/불명40→같은 작업40확인·완료 결과 정정·예약 원금 복원 금지·외부 과다 결과의 DISPUTED와 신규 소비 HOLD를 검증한다. R-03의60성공/40확정실패 후40만 새 시도는 불일치 재현/미해결로 보고하며 skip/삭제/expect-failure 녹색으로 AC8.6.3 통과를 가장하지 않는다. 해소 전 Step12/13과 전체 환불 검증은 미완료다. 대응: VS4.6/4.9/4.12/4.13·AC8.6.1–4.

### Step 14
- [ ] 기존 실행 호스트에 U4를 연결한다. 신규 `apps/api/src/u4-operations.ts`, `u4-routes.ts`, `u4-runtime.ts`, `packages/core/src/u4-financial-query.ts`, `u4-financial-consumer.ts`와 기존 API application/operations/main, worker main/owner binding, 공통 registry/exports를 연결한다. 현재 MFA·직원 접점·CSRF·서버 대상 권한·64KiB와 유한 예산을 유지한다. 목록/상세/합계/이력/중복 오류를 동일 범위로 투영하고 protected prefix에서 읽는다. Outbox 사실은 최소 참조만 전달하며 원문·거래 참조를 진단/알림에 내보내지 않는다. 전체 금융 PC 화면은 U8/U9로 남긴다. 대응: US4.1/4.4/4.5/4.6/8.6·협력 US8.8/8.9/8.12/9.4·SD01–SD04/07/08.

### Step 15
- [ ] 진입/조회 계층 후 `tests/u4/unit/host-contracts.spec.ts`, `integration/http-worker.spec.ts`를 작성·실행한다. 실제 Nest/Express→명령→primary/보호→조회·별도 큐/worker 원본 재대조 경로, 권한/직원망·CSRF·위조 profile·고객 대금 조회 권한·다른 기업 파생 응답·캐시/민감 출력·잘못된 JSON/압축/실제64KiB와+1/415/400/413을 검증한다. U3 전용1MiB를 우회 사용하지 못해야 한다. 기존 PC 흐름은 회귀하고 U4 전체 금융 화면 성공으로 표시하지 않는다. 대응: VS4.10/4.11·NFR1/7/11/13.

### Step 16
- [ ] 파일럿 CI의 U4 기여를 구현한다. `scripts/u3/runtime-source.ts`, `pilot-commands.ts`, `ci-pilot-proof.ts`, `pilot-validation.ts`, `coverage-evidence.ts`, `coverage-aggregate.ts`, `pilot-tools.ts`, `pilot-safe-diagnostics.ts`, `tests/project/vitest.pilot.coverage.config.ts`, `.github/workflows/u1-validation.yml`의 U1/U2/U3 고정 scope/matrix·source/test inventory·제품 전체 분모·보고서 parser/allowlist·집계를 함께 확장한다. 신규 `tests/u4/unit/pilot-evidence.spec.ts`에서 U4 누락/다른 source/보고서 위조·skip/미실행 분모 누락/금융 출력 누출을 거절하는 회귀를 구현 후 실행한다. 기존 full-proof workflow의 후속 의미/원래 실패는 유지한다. 대응: 모든 지원 스토리의 전달 검증·IP02/IP03/IP07.

### Step 17
- [ ] 현재 소스의 U4 단위·실제 DB/HTTP/worker 통합과 기존 Unit 회귀·전체 분모80%·타입/린트/형식·필수 보안/합성 IaC/검증 이미지 검사를 수행한다. 단순 실행은 Luna에 분리하고 격리 DB를 쓰는 시험은 직렬로 둔다. 신규 `scripts/u4/verify-pilot.ts`는 U4 지원 범위와 기존 완료 Unit 통합을 묶는 공식 명령 후보로 구현한다. 현재 기록된 U1 PC 전용 검증은 U4를 입증하지 못하므로 명령 교체 시 별도 사용자 확인/정상 등록 후에만 공식 체크포인트에서 실행한다. 실패/미실행/누락·R-03을 감추지 않으며 전체 실증이 미완료면 해당 성공 선언/병합을 보류한다. 대응: NFR13/14·IP06.

### Step 18
- [ ] `docs/u4/financial-settlement.md`에 명령/API·참조 전용 증빙·버전 전환/호환 복구·미등록 원본/오류/운영 인계를 기록한다. 이 기록 폴더의 code-summary.md·traceability.json·source-manifest.json에 실제 변경/실행/남은 결함을 연결하고 독립 Astra 검토·공식 Unit 검증을 수행한다. 추적은 주 책임26 AC+협력147 AC·BR24·상세NFR36을 중복 없이 보존하며 후속/기여/미해결을 전체 OK로 바꾸지 않는다. 논리 마일스톤마다 커밋·push하고 U4 main 병합/실제 배포는 이번 계획의 자동 실행으로 포함하지 않는다.

## 테스트 구성과 추적

테스트 파일10개 구성은 계약, 입력, 모델, repository, recovery payload, 지급 계획, 금융 명령, 자격, 기한, 환불이다. host/pilot 경계 시험은 추가다. Standard의 구성별5–8개를 기준으로 정상·최소2개 오류/경계를 포함하며 중요한 독립 시나리오 때문에 필요한 추가 시험은 개수 목표에 맞춰 줄이지 않는다. DB/HTTP 통합20건 이상은 실제 격리 실행을 요구하는 하한 계획이며 현재 실행 건수/성과가 아니다.

| 원래 스토리 | 첫 배포 구현/검증 | 후속·의존 |
| --- | --- | --- |
| US4.1 | Step2–9/14–15 청구·입금·정정·네 안전장치 | 실제 금융 source profile/확인 권위 |
| US4.2 | Step2/10/14의 미등록·역순/충돌 거절 경계 | 외부 자동 수신 AC4.2.1–3 전체는 Deferred |
| US4.3 | Step8/9 자동 오연결 차단·미배분 표시 | 자동 배분 AC4.3.1–3 전체는 Deferred |
| US4.4 | Step4/5/8/9 원자 수동 배분·정정·잔액 | 실제 source 원본 확보 |
| US4.5 | Step10/11 FULL 완료 기산·정정 | 여러 부분 제공 건 전체 AC4.5.1 Deferred |
| US4.6 | Step10/11 수동 제한/해제·근거 | 자동 제재 전체는 Deferred |
| US7.8 | Step2/10 미지원 명시·원래 참조/기간 경계 | 중첩 자동 계산·요금 조정 전체는 Deferred |
| US8.6 | Step4/5/12/13 예약·원본 결과/부분·정정 | R-03/AC8.6.3 미해결, U7/회수 실주체 미등록 |
| 협력147 AC | 공유 소유자 계약·현재성/권한·대금 원본 기여 | 다른 Unit의 전체 완료는 주장하지 않음 |

상세 검증 명령·fixture·안전 범위는 [unit-test-instructions.md](unit-test-instructions.md)에 둔다. 제품 전체 coverage 기여는 U4 단독 하한으로 전체를 대체하지 않으며 같은 source의 U1–U4 합집합에서 판정한다. 기존 U2/U3 위험은 이번 변경으로 해결했다고 표시하지 않는다.

## Assumptions & Open Questions

- R-03은 실제 실패분 재시도의 부모 상태 모순이다. 별도 기능 수정/검토와 근거가 없으면 해당 구현/시험·U4 전체 완료를 선언하지 않는다. 본 계획은 그 문제를 묵시 해소하거나 수용하는 선택이 아니다.
- 실제 source profile·정규화·원본 접근/확인 권위·은행/환불 결과·증빙 보관·국내 저장/보존 정책·직원망/신뢰는 미확인이다. 서버의 UNREGISTERED 경계를 유지하며 테스트는 격리 합성값만 사용한다.
- 입력·거래/환불·공통 DB/보호·버전 변경은 위 계획의 실제 통과가 필요하다. 현재 처리 용량·복구/SLO·1인 운영 목표 달성을 가정하지 않는다.
- 계획의 신규 파일/명령은 만들 대상으로 현재 존재/성공 주장과 구별한다. 구현 중 범위/명세 판단이 필요하면 해당 지점에서 사용자에게 확인하고 계획/원본 변경 권한을 임의 확대하지 않는다.

## Sources

- [기능/흐름](../functional-design/functional-spec.md), [규칙](../functional-design/rules.md), [원본](../functional-design/entities.md), [기능 검토](../functional-design/reviews/review-02.md).
- [NFR 요구](../nfr-requirements/security-requirements.md), [기술 적용](../nfr-requirements/tech-stack-decisions.md), [보안 설계](../nfr-design/security-design.md), [논리 구성](../nfr-design/logical-components.md), [CI 전달](../infrastructure-design/cicd-pipeline.md).
- [Unit 정의](../../../inception/units-generation/unit-of-work.md), [스토리 배정](../../../inception/units-generation/unit-of-work-story-map.md), [요구사항](../../../inception/requirements-analysis/requirements.md), [계약](../../../inception/contract-design/contract-summary.md), [컴포넌트](../../../inception/domain-design/components.md), [파일럿 범위](../../../release-planning/first-release-delivery-plan.md).
- 실제 확인한 packages/contracts·persistence·core, apps/api/worker, package.json/tsconfig.json, scripts/u3와 tests/u3의 현재 파일·공유 파일럿 workflow. 현재 U4 제품 경로/명령은 없다.

## Testing Contract

```json
{
  "version": 1,
  "methodology": "test-after",
  "source": "team",
  "ordering": "테스트 가능한 각 계층을 구현한 뒤 그 계층의 테스트를 작성하고 실행한다. [Q3]",
  "scope": "feature",
  "test_strategy": "standard",
  "project_type": "greenfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
    },
    {
      "layer": "team",
      "text": "- **Methodology**: test-after\n- **Ordering**: 테스트 가능한 각 계층을 구현한 뒤 그 계층의 테스트를 작성하고 실행한다. [Q3]\n- 단위·통합 테스트를 포함하는 `Standard` 전략을 유지하고 병합 전 CI에서 검사한다. [Q3; 현재 실행 설정]\n- 직접 작성한 테스트 가능한 제품 코드 전체에 라인 커버리지 80% 하한을 적용한다. 미실행 제품 파일도 분모에 포함하고 생성물·외부 코드 등의 제외 사유를 기록한다. 수락 기준별 정상·실패·경계 검증을 별도로 추적한다. [Q4]\n- 비밀 유입, 코드 취약 패턴(SAST), 의존성 취약점, CDK·생성 인프라 보안 설정, 격리된 검증 환경과 합성 데이터를 사용하는 실행 중 서비스 보안 검사를 필수 계획에 포함한다. [Q7]\n- 언어·구조가 정해진 뒤 도구·대상·실행 시점·차단 기준을 구체화하고 실제 적용 전에 확인한다. 검사 실패·누락은 Way of Working의 차단 원칙을 따른다. 아직 검사가 구현되거나 통과한 상태로 표시하지 않는다. [Q7–Q8]"
    }
  ],
  "obligations": {
    "strategy": "standard",
    "strategy_volume": [
      "Five to eight tests per component.",
      "Unit tests plus integration tests for key boundaries.",
      "Add E2E, performance, or security tests when requirements demand them."
    ],
    "scope_floor": [
      "Meet an 80% line-coverage floor.",
      "Run the selected tests in CI before merge."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "test-after",
    "runner_step": "Bootstrap the minimal test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Bootstrap the minimal test runner/configuration and record the exact unit-scoped command.",
      "Data model / database behavior - implement.",
      "Data model / database behavior - write and run its tests after implementation.",
      "Repository / data access - implement.",
      "Repository / data access - write and run its tests after implementation.",
      "Business logic - implement.",
      "Business logic - write and run its tests after implementation.",
      "API / endpoint - implement.",
      "API / endpoint - write and run its tests after implementation.",
      "Frontend behavior - implement.",
      "Frontend behavior - write and run its tests after implementation.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:f0f09f6d1b55c87564cb3db20873ab60f5b42924e0726c0b5089998b3080bfed",
  "contract_sha256": "sha256:13f152f4c3058c2b60200db7b5b96fba74e7d312052a9fb0e92c883f68c5628b"
}
```
