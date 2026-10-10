# U1 Unit Test Instructions

**Unit:** u1-integrated-foundation
**범위:** U1 구현과 검증 지침. 실행 결과와 확인 범위는 `code-summary.md` 및 해당 보고서에서 확인한다.

## Framework and Runner Readiness

Testing Contract의 test-after를 따른다. 전용 Node22.23.3/npm10.9.9와 package-lock의 exact 조합을 사용한다. Vitest/coverage-v8 5.0.3, Playwright1.64.0/axe4.13.0, TypeORM1.1.2/PG17.11, Ajv2020 및 TypeScript6.0.3이 준비돼 있다. 버전·peer·지원 근거와 실제 적용 차단 조건은 `docs/u1/readiness.md`에 기록했다. 실행 전 `npm ci`의 기본 postinstall과 `npm run verify:u1:cdk-bundle`이 실제 CDK bundled 의존성 검사를 통과해야 한다.

U1 unit/integration config는 tests/u1/unit 및 tests/u1/integration의 정확한 파일만 include한다. E2E config는 tests/u1/e2e만 포함한다. 다른 Unit의 test/fixture를 자동 실행하지 않는다. 제품 source include는 U1이 작성/수정한 앱·패키지·CDK/실행 코드의 전체 testable 파일이고 미실행 파일도 포함한다. 후속 Unit 도입 때 source ownership/분모와 명령을 변경 절차로 갱신한다.

## Unit-scoped Commands

| 목적 | 정확한 U1 명령 | 범위/결과 |
|---|---|---|
| unit | npm run test:u1:unit | Vitest run --config tests/u1/vitest.unit.config.ts |
| integration | npm run test:u1:integration | Vitest run --config tests/u1/vitest.integration.config.ts |
| coverage | npm run test:u1:coverage | Vitest run --config tests/u1/vitest.coverage.config.ts --coverage |
| PC E2E | npm run test:u1:e2e | Playwright test --config tests/u1/playwright.config.ts |
| 형식/타입/계약/소스 경계 | npm run check:u1 | scripts/u1/check 경로와 U1 package/파일 명시 |
| 필수 보안 | npm run security:u1 | scripts/u1/security의 U1 exact targets·보고서 |
| 합성 성능 | npm run test:u1:performance | 이 Unit의 합성 profile |
| 장애/복구 | npm run test:u1:recovery | 이 Unit의 실제 fault 대상 |
| 통합 시연 후보 | npm run verify:u1:skeleton | scripts/u1/verify-skeleton에서 아래 전체 결과를 검증 |

하위 실제 도구 명령·exact version과 config는 `package.json`, `tests/u1` 및 `scripts/u1`에 고정돼 있으며 인터프리터/대상/필수 환경이 없으면 nonzero다. 명령의 missing report/SKIPPED/미준비를 성공 exit로 치환하지 않는다. 통합 시연 명령은 검증 보고서를 확인하는 명령이며 실제 실행 증거와 Construction Verification Command의 확인을 대신하지 않는다.

## Test Files and Required Behavior

| 실제 시험 파일 | 필수 정상/실패/경계 |
|---|---|
| unit/contracts.spec.ts, inline-schema.spec.ts; integration/contract-bindings.spec.ts | canonical2020-12·C00/U1 operation·CE01–04·required/null/unknown·버전/등록 경계 |
| unit/models.spec.ts, model-snapshots.spec.ts; integration/postgres-models.spec.ts | 원본/FK/unique·정확 Money·현재 revision·원래 correlationId·migration/DB 권한 |
| integration/recovery.spec.ts, recovery-replay.spec.ts, recovery-security.spec.ts; unit/recovery-payload.spec.ts | DB/원장/prefix/가시성·gap/충돌·같은 원본 ID·후속 ACK/회수/파기/효과 보존·중단 후 같은 snapshot/deadline |
| unit/identity.spec.ts, challenge-cryptography.spec.ts, identity-browser.spec.ts, enterprise-access.spec.ts; integration/auth-access.spec.ts, http-auth-intents.spec.ts | 목적 제한·MFA·복구 코드·binding·현재 scope·관리/거래 분리·다른 계정/기업·늦은 인증 응답 |
| integration/http-primary-ac.spec.ts, business-flow.spec.ts; unit/admission.spec.ts, original-intents.spec.ts | 신청/승인/별도 관리자·직원 상품 등록·typed HW/SW·전체 확인 대기·원래 key·무효 입력/권한 |
| unit/worker.spec.ts, adapters.spec.ts, worker-start.spec.ts, worker-observation.spec.ts, worker-batch.spec.ts, worker-recovery-evidence.spec.ts | 보호된 relay·원래 Work/permit·중복/역순·epoch/lease·현재 권한·원래 attempt/deadline·불명 효과 대조 |
| unit/http.spec.ts, bff.spec.ts; integration/http-boundaries.spec.ts | 실제 HTTP/Problem Details·CSRF/origin·client principal/MFA/직원망 위조·timeout/commit 불명·readiness |
| unit/customer-ui.spec.tsx, portal-session.spec.tsx, context-picker.spec.tsx, enterprise-panel.spec.tsx, order-panel.spec.tsx, business-command.spec.tsx | 최소 표시·허용된 관리/거래 분리·원래 ID·late response·poll/idle·회수/계정 전환 |
| e2e/foundation-flow.spec.ts | 실제 고객/직원 PC1280 흐름·비신청자 관리자·일반 거래자·역할/사용자 단독 관리 권한·keyboard/axe/reflow |
| unit/infrastructure.spec.ts, runtime-configuration.spec.ts, telemetry.spec.ts, availability.spec.ts, incidents.spec.ts, operational-sender.spec.ts, deployment-control.spec.ts; integration/deployment-compatibility.spec.ts | 같은 계정 내 역할/secret/store/ingress 분리·TLS·bounded telemetry·독립 incident/ACK·안전한 digest 전환 |
| unit/measurement-provenance.spec.ts, requalify-performance.spec.ts, report-validation.spec.ts, performance-statistics.spec.ts, profile-observations.spec.ts, profile-resources.spec.ts, profile-ui.spec.ts, large-restore-runner.spec.ts, verify-acks.spec.ts, skeleton.spec.ts | 누락/실패/skip/잘못된 성공 상태 거절·정확한 profile·신규 Work 지연·자원·원래 t0 복구 기한·독립 ACK 대조 |
| unit/security-runner.spec.ts, security-policy.spec.ts, cdk-bundle.spec.ts, runtime-security-report.spec.ts, ci-local-health.spec.ts | 실제 scanner 출력 형식/실패·예외/secret 대응 구분·물리 의존성·CI loopback guard |

위 경로는 모두 `tests/u1/` 기준이다. 계획상 논리 컴포넌트 묶음을 실제 공유 경계 시험으로 통합했으며, 전체 파일 목록은 `source-manifest.json`에 포함된다.
컴포넌트당5–8개 기본 검증을 바닥으로 정상과 최소2개의 오류/경계를 포함한다. 실제 계약/권한/중복/동시/복구 요구가 더 많으면 시험을 추가하고 개수 상한으로 자르지 않는다. mock 호출 횟수만 검증하거나 구현의 내부 표현을 그대로 복제한 assertion으로 업무 결과를 대신하지 않는다.

## Primary AC and Cross-cutting Mapping

- AC1.1.1–3: 신청 원본/지속 접수와 본인 재조회, 미승인 주문 거절, 다른 신청자/기업의 내용·존재·건수 비노출.
- AC1.2.1–3: 필요한 근거/현재 개정/행위 권한의 기업 승인, 별도 최초 관리자 지정·최소 관리 grant, 부족/불명 근거 승인 및 승인권한만으로 지정 금지.
- AC3.3.1–3: UNVERIFIED/특례/충돌/기술 실패의 품목별 사유, 일부 확인돼도 전체 대기, 허용되지 않은 직원/기업의 판단 근거 비노출.
- FD trace의 총61개(주 책임9개·공통/협력52개) 목록과 기존 Deferred 이유를 보존한다. U2–U10 전체 구현/운영 실증을 U1 시험으로 완료 처리하지 않는다.
- BR34개와 상세 NFR62개를 소스·시험·선행조건·추가 운영 검증에 연결한다. 추적 OK는 실행 PASS와 다르다.

## Coverage and Evidence

직접 작성한 testable 제품 코드 전체의 line coverage는80% 이상이다. apps/core/persistence/integrations/UI와 handwritten runtime·CDK/실행 구성 코드를 포함하고 실행하지 않은 파일도 분모에 넣는다. 테스트/fixture·외부의존·순수 생성 선언/파일 제외는 목록과 사유를 기록하며 실제 동작을 담은 handwritten 코드를 이름/경로로 제외하지 않는다. HTML/LCOV/JSON summary와 include/exclude·파일별 결과를 .reports/u1에 보관한다.80%를 맞추기 위한 하한 완화·무의미 시험·우연 통과 반복은 금지한다.

필수 보고서는 unit/integration/E2E·coverage·형식/타입/canonical·secret/SAST/dependency/IaC/격리 runtime·성능/장애·원래ACK 대조와 준비 상태다. 검사 미실행/보고서 누락/실패는 해당 병합/배포·완료를 막는다. 예외는 사유/담당/만료/재검토와 실제 secret 폐기/교체·영향 확인을 구분한다. 원장/설계 docs 검사만으로 제품 시험을 통과시키지 않는다.

## Data, Mocks and Integration Boundaries

합성기업A/B·각 고객/직원·조직 USED/NOT_USED/UNSET/폐지ID·명시 grant·HW/SW·다품목/미확인 근거·양수/무효 수량·같은/다른키내용·오래된 revision을 사용한다. 필요한 합성 기업 확인/최초 지정 profile은 관련 코드 전에 명시적으로 확인한다. 실제 개인정보/고객 주문/계약/비밀을 fixture·보고서·로그에 넣지 않는다.

실제 PostgreSQL의 두 독립 인스턴스/자격·transaction/lock·journal 보호/prefix/재시작을 시험한다. broker/provider의 test double은 tests/u1의 합성 설정에서만 허용하고 prod adapter로 등록되지 않아야 한다. 실제 Cognito/회사망/SQS·메일/Slack/SNS·관측/배포 환경의 미준비를 mock 성공으로 감추지 않는다. 실제 계정/서비스 정보가 없으면 해당 integration 증거를 미실행으로 기록하고 필요한 준비/사용자 확인을 요구한다. 외부 발송/운영 변경은 별도 승인 범위를 따른다.

연결/SDK 실패와 효과 불명·duplicate/reorder·현재권한 회수·primary/journal failure·old writer epoch·TTL/마커 파기/나중 ACK·실제 false/unknown을 주입한다. fake timer는 논리 retry/기한 시험이며 실제 처리 지연·30분 복구 측정을 대신하지 않는다.

## Skeleton and Operational Verification

시연은 MFA→기업 신청→직원 확인/기업 승인→별도 최초 관리자 지정→조직/역할 설정→직원 상품 등록→고객HW/SW 각각 주문→독립 보호 후 원래접수/전체 확인대기→worker/최소통지·원래ID조회→프로세스재시작/보존→타기업/무권한 거절을 포함한다. 단순health200·문서 lint·화면 screenshot만으로 통합 실행을 판정하지 않는다.

SLO·RTO/RPO·국내 저장·한사람 작업·실제2채널수신/ACK는 목표와 proof를 분리한다. U1에서는 접수/보호/재시작·기본 fault/보안 경계를 실제 검증하고 U10/운영의 전체 장애·단일AZ·야간/30일실적을 Deferred 사유/담당으로 남긴다. 정의된 정확성 위반/권한 누출/성공ACK 유실·중복은 시험에서0건이다. 해당 실제 proof가 없으면 목표 달성으로 보고하지 않는다.

## Sources

- [구현 계획과 Testing Contract](code-generation-plan.md)
- [functional spec](../functional-design/functional-spec.md), [FD trace](../functional-design/traceability.json), [rules](../functional-design/rules.md), [entities](../functional-design/entities.md)
- [NFR/readiness](../nfr-design/logical-components.md), [security](../nfr-design/security-design.md), [reliability](../nfr-design/reliability-design.md), [performance](../nfr-design/performance-design.md), [scalability](../nfr-design/scalability-design.md), [observability](../nfr-design/observability-design.md)
- [infrastructure](../infrastructure-design/infrastructure-specification.md), [monitoring](../infrastructure-design/monitoring-design.md), [CI/CD](../infrastructure-design/cicd-pipeline.md)


## 반복 실행과 원본 보호

`test:u1:integration`·`test:u1:coverage`·`test:u1:recovery`의 prehook는 정확한 verification-isolated DB만 준비한다. PC E2E는 별도의 e2e-isolated DB를 사용한다. 성능/대규모 복구의 원래 주문·독립 ACK 자료를 reset 대상으로 삼지 않는다. 누락되거나 맞지 않는 profile/DB 이름은 거절한다.

`npm run test:u1:profile`은 U1 실행 경계 probe 전용 명령이다. 전체 부하는 `npm run test:u1:performance`로 100개 실제 현재 세션·정상30분/집중5분/회복5분/유지10분을 측정한다. 전체 profile 통과 후 `node --import tsx scripts/u1/large-recovery.ts`로 원래 10만 건 이상 자료의 실제 SIGKILL/원장 재생/현재 보안/새 MFA·원래 주문 조회를 확인한다. 이 명령들은 승인된 로컬 합성 profile과 두 독립 원본 PG/보호 원장 및 준비된 API/BFF를 필요로 한다. 단축 측정이나 다른 report를 완료 증거로 대체하지 않는다.

GitHub CI는 같은 lock/config·검사·전체 부하/복구 흐름을 실행하도록 작성했다. 로컬 실행 결과를 GitHub CI 실행 결과로 보고하지 않는다. 실제 회사망/Cognito/SQS/수신자/AWS의 준비 조건과 운영 목표는 별도 확인 범위로 유지한다.

## 측정과 재평가의 출처

측정 당시 `performance-source.json`의 runId/capturedAt/full source hash와 현재 판정기 source hash를 구별한다. `performance-evaluation-source.json`은 파일별 원래/current hash와 제한된 delta를 명시하며, runtime/config/부하 scheduling/serving fixture 변경은 전체50분 재측정 없이 허용하지 않는다. 원측정 실패 보고서와84k 원문·full source/config 사본은 `recovery-window-original-performance/`에 보존하고 hash로 검증한다. 회복 구간은 모든 원래 Work의 결과/실제ACK·기한/전체분포를 유지하며 고정60초창에서5분 내 정상 복귀, 이후10분 유지를 판정한다. 정상10초 목표와 회복300초/HOLD600초를 바꾸지 않는다.

별도 `recovery-preservation` verifier는 유한25 ID keyset과 각 ID의 최신 보호 버전을 대조하여 원래 전체 업무/효과/회수·파기 자료를 hash한다. 페이지 양 끝 삭제, 미보호 삭제와 보호된 삭제의 차이를 실제PG로 검증한다. 성능 실행 중에는 이 verifier가 사용되지 않는다. 원본 DB에서 실행할 때는 전체 복구의 같은 fault t0와 고정 snapshot을 유지하며 중단된 회복 기한을 다시 시작하지 않는다.

측정 소스 동결에서 누락됐던 `tsconfig.build.json`은 당시 immutable runtime image의 `/app` 사본과 실제 SHA256이 같음을 `build-config-preservation.json`에 기록한다. 원래 capturedAt/full source hash를 바꾸지 않고 누락된 범위를 명시적으로 보완한다.

측정 당시 준비 문서의 로컬복구/컨테이너 미검증 메모는 동결 원문으로 보존한다. 최신 전체731시험·50분 부하·26분46.633초 로컬복구·4역할 TLS 양성 결과와 아직 확인하지 않은 실제 운영 조건은 `code-summary.md`와 해당 실제 보고서에서 확인한다.
