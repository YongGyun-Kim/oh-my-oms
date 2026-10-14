# U2 Code Generation 계획

## 범위와 승인 경계

**Unit:** u2-identity-enterprise-access  
**상태:** 59항목 계획의 P00–P09 구현·직접 시험과 P10 도구/CI/IaC·현재 source 검사를 수행했다. 최신 전체 collector는 부하 구간 시간 하한 미달로 FAIL이다. 사용자의 명시 지시에 따라 부하 측정을 현재 상태로 종료하고 DR는 추후 진행하며 P11 산출물만 정리한다. Unit 완료·위험 수용·첫 배포 범위 승인은 아니다.  
**구현 담당:** 개발자 본인, IdentityRecovery/EnterpriseAccess 원본과 기존 호스트의 U2 통합 접점.  
**실행 형태:** library/embedded, U1 의존. 독립 인증 서비스나 추가 AWS 계정을 만들지 않는다.

초기 승인·보완 이후 계약/모델·암호/보호 재구성·현재 권한/범위·초대/소속/역할·당사자 인계/claim·직접/비상 복구/HOLD·완료 conjunction·worker/API/BFF/최소 PC를 구현하고 계층별 검증했다. 현재 source8972b7b0의 전체 coverage·보안/같은 이미지 runtime·PC 결과는 해당 source 증거이며 전체 Unit·성능/DR·출시 완료를 뜻하지 않는다. P10 측정 시간 하한 FAIL·DR 미실행과 P11 독립 review 대기는 아래 실행 결과에 구분한다. 실제 AWS/Cognito/계정/자료·Slack/email·git commit/push/merge는 실행 범위에 포함하지 않는다.

P06에서 tests/u1/unit/identity.spec.ts·identity-browser.spec.ts 선택16/16을 U1 기본 reporter로 실행해 .reports/u1/unit.json을16개 결과로 덮어썼다. 저장소·보고서·검토 기록의 bounded 조사에서는 원래 상세 보고서의 정확 bytes 사본을 찾지 못했다. U1의563/563 요약 및 별도 U2 baseline은 남아 있지만 원래 상세 보고서와 같은 근거로 대체하지 않는다. 손실은 [실행 편차 기록](test-report-isolation-incident.md)에 열린 문제로 유지하고, 현재 파일16/16의6818bytes·SHA256 b0d001e61fb14673305a56307ce38cd5de866f11d2e314826f59817ec4f2e745는 .reports/u2/incidents/u1-unit-overwrite-20261010.json의 base64 payload에 정확히 보존했다. 과거 U1 검토·상태·요약·측정값은 수정하지 않는다. 새 검증은 현재 source로 새 namespace에 수집하며, 과거 상세 report 복구나 전체 U1 재검증 통과로 표현하지 않는다. 외부/개인 백업의 존재는 미확인이다.

59항목 보완 이후 scripts/u2/run-u1-regression.ts가 정확 선택경로·명시된 U2 JSON output·기존 U1 default report의 before/after hash 동일성을 강제하도록 구현·검증했다. 계층별 선택시험은 U2 selected report에 쓰고 전체 run의 canonical report와 분리했다. 현재는 문서 정리만 수행하고 새 source 구현·시험은 재개하지 않는다. Testing Contract와 품질 하한·기존 기능/신뢰 경계는 유지한다.

주 책임은 US1.3–US1.10의26AC다. 나머지201AC에는 현재 신원/MFA·행위별 scope·동일인·정보/이력 경계를 제공한다. 전체69스토리/227AC·43NFR의 업무/UI/cloud/운영 실증을 U2 local 합성 결과로 완료 처리하지 않는다. 상품 등록은 내부 직원만, B2B HW/SW와 기존 거래 원본 책임을 유지한다.

## Sources

- [기능 명세](../functional-design/functional-spec.md), [규칙](../functional-design/rules.md), [엔티티](../functional-design/entities.md), [기능 추적](../functional-design/traceability.json), [기능 답변](../functional-design/functional-design-questions.md): WF01–09, BR31개, CE-U2-01–07·주책임/협력 구별.
- [보안 요구](../nfr-requirements/security-requirements.md), [기술/호스트 요구](../nfr-requirements/tech-stack-decisions.md):43NFR·기존 기술·품질 하한.
- [보안 설계](../nfr-design/security-design.md), [논리 컴포넌트](../nfr-design/logical-components.md), [상세 설계 답변](../nfr-design/nfr-design-questions.md): SD01–12/LC01–10·당사자 인계96bit/16문자·청구5분/오류5회·청구 후 별도5분.
- [CI/CD 설계](../infrastructure-design/cicd-pipeline.md), [인프라 답변](../infrastructure-design/infrastructure-design-questions.md): IP01–10·synthetic-only·현재 검증과 future 배포 구별.
- [계약](../../../inception/contract-design/contract-summary.md): C01/C02/C21/C20-E01·G19/G22/G23·closed profile·원래 target/operation/deadline/actual effect.
- [컴포넌트](../../../inception/domain-design/components.md), [Unit](../../../inception/units-generation/unit-of-work.md), [스토리 할당](../../../inception/units-generation/unit-of-work-story-map.md), [요구사항](../../../inception/requirements-analysis/requirements.md): 원본/거래/UI/통지 소유와8정확성.
- [기능 검토](../functional-design/reviews/review-01.md) R-01–03, [NFR 검토](../nfr-design/reviews/review-01.md) R-01, [U1 코드 검토](../../u1-integrated-foundation/code-generation/reviews/review-01.md) R-01/02: 후속 구현·부정/회귀 시험의 provenance. 과거 finding 상태/위험 수용은 수정하지 않는다.
- 현재 bounded inventory: package.json/package-lock.json·tsconfig.json/eslint.config.mjs/.prettierrc.json, tests/u1의 runner/fixture 설정, .github/workflows/u1-validation.yml, 아래 현재 소스. sibling construction 전체 탐색을 하지 않았다.

## 초기 계획 작성 당시 소스와 통합 영향

Node22.23.3/npm10.9.9·TypeScript/Next/Nest+Express·TypeORM/PG·Cognito SDK·Vitest/V8·Playwright·CDK가 root manifest에 있다. package scripts는 U1만 등록했고 U2 runner·계약 profile·인계 구현은 아직 없다. root Vitest 설정 대신 tests/u1/vitest.*.config.ts를 사용한다. tsconfig는 tests/u1·scripts/u1만 포함한다. 기존 formatter는 singleQuote/trailingComma/printWidth100, ESLint no-explicit-any를 유지한다. 현재 source는 기존 작업자의 변경을 포함하며 무관한 수정·기록을 되돌리지 않는다.

| 현재 파일/책임 | 확인한 차이·영향 | 예정 처리 |
|---|---|---|
| packages/contracts/src/schema.ts, registry.ts, declarations.ts, types.ts / schemas/operations-v2.json | 현재 common:2/default version2와 U1 operation binding. 설계의 common:1·기존 v1도 보존해야 한다 | 새 u2-access-additions:1 별도 schema/operation catalog; version1이 profile family 식별자임을 registry key와 명시 대조. 기존 v1/v2 bytes/명령 의미 변경 금지 |
| packages/persistence/src/model-catalog.ts·models/u1-v2.json | catalog가 U1 JSON 하나를 읽고 tableName은 u1_ prefix. 논리 ID와 physical bindingId/setId/roleId 등이 다름 | additive U2 catalog/decoder/migration을 등록, 기존 안정 ID/table를 재명명하지 않음 |
| packages/core/src/identity.ts·identity-state.ts·identity-codes.ts·identity-session.ts | MFA/사전코드·authRevision 존재; case/party/grant/EnrollmentAuthority 결합은 확장 필요 | 보안 세대·현재 binding·epoch와 명시 연결. 기존 로그인/코드 보관 조건 회귀 |
| packages/core/src/authorization.ts·scopes.ts·current-customer-scopes.ts | legacy multiID 사업장/부서 OR 지원, DEPARTMENT_SITE 한쌍. 현재 조회 원본 보호 비교 | 별도 ScopeV2 및 lossless decoder·현재 access fence. 기존 유효 multiID 거절/교차행위 합성 금지 |
| packages/core/src/enterprise-access.ts·enterprise-roles.ts·enterprise-organisation.ts·staff-access.ts | 역할 생성/grant·소속 최소 경로, 초대 수락/새 역할 개정/재지정 확대 필요 | 현재 관리 범위의 before/after·명시 self-grant·행위별 권위, 기존 기업 승인/최초 지정 보존 |
| packages/persistence/src/protected-store.ts·security-state.ts·recovery-types.ts·recovery-security.ts·recovery-replay.ts | primary→independent journal→prefix 가시성/currentProtected, 복구 재구성 경계 | 새 권위/단회/실패수/회수/파기 marker를 완전 재구성, gap시 old allow fallback 금지 |
| packages/persistence/src/encrypted-challenges.ts·packages/integrations/src/cognito.ts | 현재 challenge 암호 저장과 user MFA/조회 adapter | 목적 vault 별도 제한 권한·AAD/expiry. admin 복구 capability와 실제 종료/격리 확인은 추가, 없으면 HOLD |
| packages/core/src/worker-consumer.ts·worker-relay.ts, packages/integrations/src/sqs.ts·worker-batch.ts | expired consume은 보호 변경 전에 WORK_DEADLINE, broker receive 전체 map parse가 poison으로 batch 거절 | P07의 실제 owning source 보완+SDK-double/두PG 통합 회귀. 과거 review를 Resolved로 바꾸지 않음 |
| apps/api/src/operations.ts·authentication.ts·routes.ts·application.ts, apps/worker/src/main.ts | registry/호스트 결합, worker는 현재 notice consumer | 목적별 binding·명시 등록 consumer, 위임 실패 SYSTEM 승격 금지. notice queue를 recovery queue로 전용 금지 |
| packages/ui/src/bff.ts·client.ts·login.tsx·security-proxy.ts, 두 web app proxy와 catch-all route | 기존 PC/BFF·CSRF/private 경계 | U2 초대/인계/제한 등록 최소 연결과 상태 표시만. U8/U9 전체 UI·브라우저 실증은 별도 |
| packages/persistence/src/data-source.ts | pool8/acquire2000ms/lock1000ms가 LC02와 다름 | 기존 pool 공유의 역할별10/5·보호5/3, acquire/lock≤500ms·statement≤2s·transaction≤3s/잔여예산을 explicit config로 대조 |
| scripts/u1/check.ts·security.ts·runtime-source.ts / U1 CI | check/SAST·coverage scripts가 scripts/u1에 한정, U1 reports namespace | U2 검사/전체 source 분모/보고서 별도 구현. U1 기록·고정 측정 원본 덮어쓰기 금지 |

API/worker·계약/모델·현재 권한/protection 변경은 high 영향이다. 후속 U3–U7 owner의 승인/정보 접근과 두 BFF가 소비한다. exact imports/callers는 P00에서 현재 바이트로 다시 확인하고 diff 범위를 계획과 대조한다. 신규 파일명은 **예정 경로**이며 존재/등록 완료를 뜻하지 않는다.

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


## 순차 구현·계층별 test-after

각 P 단계는 구현 직후 해당 계층 시험을 작성·실행한 후 다음 계층으로 간다. 공통 runner를 첫 시험 전에 준비한다. component당5–8개 정상/거절/경계 시험을 기본으로 하고 명시된 동시/장애/보안은 추가한다. 최소 happy path+두 error/edge를 유지한다. 실행 명령·fixture·보고서는 [unit-test-instructions.md](unit-test-instructions.md)가 원본이다.

### Step1 — P00. 현재 기준·구조·runner 준비

- [x] scripts/u2/run-u1-regression.ts와 tests/u2/unit/u1-regression-output.spec.ts를 구현하고 계층 test-after로 검증한다. unit/integration의 승인된 정확 tests/u1 경로만 선택하고 U2 report-key/고유 JSON output을 강제한다. 누락·잘못된 모드/경로·U1 output·임의 reporter override·no-test·실패/미생성/skip는 거절하고, 기존 U1 default report의 byte hash를 실행 전후 대조해 변경 시 차단한다. 기존 runner/config·DB admission/명시된 준비 규칙과 하한을 보존하며 추가 DB reset이나 외부 실행을 넣지 않는다. 보호된 원래 보고서 바이트를 새 측정으로 대체하지 않는다. incident의 현재16/16 증거/해시·원래 상세 bytes 미복구·남은 조치를 기록하고, 전체 현재 source proof와 과거 근거를 구별한다. 모든 기존/후속 U1 선택 회귀는 이 실행기만 사용하며 U2 선택시험도 명시 selected output으로 전체 report를 덮어쓰지 않는다.

- [x] tests/u1/unit/skeleton.spec.ts의 보고서 fixture를 격리한다. readFileSync/statSync가 .reports/u1/ 아래 요청을 fixture map에서 찾지 못하면 mock ENOENT를 반환하고 실제 disk로 fallback하지 않게 한다. 상대/절대 경로를 같은 보고서 namespace로 정규화하고 fixture 존재/누락을 동일하게 판정한다. runtime source identity 계산에 필요한 보고서 namespace 밖 파일의 실제 읽기는 유지한다. 기존 보존 보고서·제품 verifySkeleton·80%/필수보고서 기준은 수정하지 않는다. 누락 read/stat·상대/절대 경로·fixture 존재 및 source 파일 읽기 회귀를 해당 테스트에 추가하고 정확한 단일 파일 명령으로 실행한 뒤 current-source 전체 unit baseline을 별도 project-validation에서 재수집한다.
- [x] 현재 설계/계약·source drift·existing 변경·callers 확인, 실제 Plan Approval receipt/brief 확인 후에만 실행한다. 기존 U1 전체 baseline 실행은 아래 project-validation 담당에게 요청해 변경 전 source identity당 한 번 기록한다. U2 단위 지침은 U2 시험과 직접 영향받는 U1 파일 filter만 실행한다. U1 두 미해결 회귀를 일반 기존 suite 통과로 숨기지 않는다.
- [x] package.json에 U2 명령을 추가하고 tsconfig.json의 tests/u2·scripts/u2를 포함한다. 버전은 현 lock 유지, 새 dependency가 필요하면 관련 코드 전 exact 지원/보안 근거를 확보하고 package-lock.json 변경을 선언한다.
- [x] tests/u2/vitest.unit.config.ts, vitest.integration.config.ts, vitest.coverage.config.ts, playwright.config.ts; tests/u2/fixtures/{databases,identity,enterprise,provider,queue,clock,local-service,reset}.ts; scripts/u2/{prepare-test-databases,bootstrap-ci,check}.ts를 만든다.
- [x] U2 local-only admission과 독립 primary/journal DB·역할·namespace를 준비한다. 기존 U1 baseline DB/보고서·다른 작업자 자료를 reset하지 않는다. runner/config tests/u2/unit/tooling.spec.ts 작성·실행으로 대상/denominator/no-test/미지원 차단을 확인한다.

연결: 전8스토리·BR7.1/7.3/7.4, NFR9.2/13.3/14.1/14.2. 선행: P00 runtime/도구 준비와 실제 승인.

### Step2 — P01. 데이터 모델·닫힌 계약 구현 → 시험

- [x] packages/contracts/schemas/u2-access-additions-v1.json·u2-operations-v1.json, packages/contracts/src/u2-{types,declarations}.ts를 추가하고 schema.ts/registry.ts/index.ts에 명시 등록한다. CE-U2-01–07와 CE-U2-ND-01–03의 exact operation/target/context/input/output/Problem·Knowledge·expectedRevision·closed nullable/enum을 정의한다. 기존 common/C01/C02/C21/E01의 미등록 필드/목적을 추가하지 않는다.
- [x] packages/persistence/models/u2-v1.json, packages/persistence/src/{u2-model-catalog,u2-migration,u2-model-decoder}.ts를 추가하고 model-catalog.ts/model-attribute.ts/data-source.ts/index.ts의 additive 등록을 연결한다. Account security generation·binding/auth/session/enterprise/staff fence는 기존 ID와 explicit mapping한다.
- [x] PartyClaimContext/RecoveryHandoffGrant/ClaimReceipt/EnrollmentAuthority·Recovery/Verification/Emergency/Restoration·Invitation·role/grant/ScopeV2·등록연락/증거 policy 참조·HOLD 관계·소비/파기 marker를 SD/LC의 현재 원본으로 물리 매핑한다. logical FD의 옛 상태 enum을 그대로 runtime에 넓히지 않고 ND CLOSED/VERIFYING 등 새 전이는 U2 decoder/profile로 닫는다.
- [x] unique active binding·membership enterprise/account·active grant·원래 invitation acceptance/claim receipt·recovery execution slot·idempotent effect와 조회 인덱스를 migration으로 보장한다. expand/backfill/구·신 decoder 공존, rollback의 원본 보존을 정의한다.
- [x] tests/u2/unit/{contracts,models}.spec.ts·tests/u2/integration/{postgres-models,migration-compatibility}.spec.ts를 작성·실행한다. additionalProperties/wrong owner/target/purpose/TTL/enum·필수값/constraint·기존 안정ID·구형 미지원·rollback 차분·동시 unique 효과를 검증한다.

연결: 전8스토리·BR1.1/2.1/2.4/3.1/7.3, CE 전체, NFR1.2/1.6/1.12/1.13/13.1/13.2. 선행: 원래 contract meanings/등록 범위를 확정하고 새 기능은 binding 검증 전 비활성.

### Step3 — P02. repository·암호 자료·보호 재구성 구현 → 시험

- [x] packages/persistence/src/{u2-repository,purpose-secret-vault,u2-recovery-payload,u2-security-state}.ts와 기존 protected-store.ts/protected-transaction.ts/security-state.ts/recovery-types.ts/recovery-security-policy.ts/recovery-security.ts/recovery-replay.ts를 확장한다. 현재 fence·짧은 lock/CAS·consumer effect·history/Receipt/notice obligation은 한 primary logical change로 후보 기록한다.
- [x] packages/core/src/purpose-verifier.ts를 구현한다. HMAC 메시지는 domain/version·길이 제한 canonical metadata **및 검증할 후보 secret 정확 bytes**를 포함한다. handoff는12bytes random→16문자 canonical base64url·재인코딩/길이 검사, trim/casefold 없음. 목적/target/account/binding/security/source revision/keyVersion을 결합하고 constant-time compare한다.
- [x] AES256-GCM unique nonce/AAD·현재 exact permit/권한별 read·expiry/revoke/claim 파기·backup suppression을 구현한다. 보호 DB 제한 namespace/역할+별도 key 권위이며 journal append/diagnostic reader는 decrypt 불가. 일반 payload에는 verifier/Ref/marker만 포함한다.
- [x] tests/u2/unit/{purpose-verifier,secret-vault,recovery-payload}.spec.ts·tests/u2/integration/{repository,protected-state,secret-lifecycle}.spec.ts 작성·실행. primary/journal/prefix/visibility fault·응답유실 재대조·no handle/ACK before prefix, 소비/회수/5실패/UNKNOWN/tombstone 복원·권한 부활0·secret표식0을 확인한다.

연결: 전8스토리·BR7.1/7.2, BR5.1/5.4/5.5/7.5, NFR1.10/1.12/4.1/4.2/5.1/5.3/11.2/11.3; NFR review R-01/IP03/05. 선행: 실제 key/legal policy 없는 경로는 realactivation 불가.

### Step4 — P03. 행위·현재권한·ScopeV2/동일인 구현 → 시험

- [x] packages/core/src/{scope-v2,scope-compatibility,authorization-fence,verified-person}.ts 및 authorization.ts/scopes.ts/current-customer-scopes.ts/customer-contexts.ts를 확장한다. 정확15행위/4kind·한 완성 술어씩 OR·policy revision·NOT_USED/UNSET/oldorder/retired ID를 유지한다.
- [x] 구 multiID 사업장/부서는 한 행위의 EXACT predicate 각각으로 분해, known pair만 보존한다. 기존 허용 집합 동일·타기업/타행위/곱집합 확대 금지. 표현 불명·policy/revision 누락은 보류/거절한다.
- [x] management action 범위 안에서 before/after target과 역할 전체를 검증하되 직접 업무권 부재만으로 explicit self/other grant를 거절하지 않는다. enterpriseAccessRevision/membershipRevision/roleRevisions/accountSecurityRevision 및 staffAuthorityRevision을 실행/commit/투영에서 재대조한다.
- [x] 등록된 actual person policy/evidence·current link 상태를 제공한다. 같은 사람 다계정·UNCONFIRMED/CONFLICT를 다른 사람으로 반환하지 않는다. 계약 실제 승인은 U3, SW 같은사람 두권한·별도승인은 U6에 남긴다.
- [x] tests/u2/unit/{scopes,scope-compatibility,authorization,verified-person}.spec.ts·tests/u2/integration/{authority-race,information-projection}.spec.ts 작성·실행. grant회수/role개정 경합·다른 유효 grant 유지·현재 count/history/error/cache 누출0 포함.

연결: US1.4/1.5/1.6/1.7·BR1.1–1.4/2.1/2.3/3.1–3.6/4.1/4.2; NFR1.2/1.3/1.7/1.8/1.14/1.15/13.2; FD R-03.

### Step5 — P04. 초대·소속·역할/관리자 구현 → 시험

- [x] packages/core/src/{enterprise-invitations,enterprise-memberships,enterprise-role-revisions,administrator-restoration}.ts 및 enterprise-access.ts/enterprise-access-state.ts/enterprise-organisation.ts/enterprise-roles.ts/staff-access.ts를 확장한다.
- [x] 초대 issuedAt+7일·256bit token verifier, contact/version·org policy/role revision·inviter/current management·create/reactivate intent를 고정한다. 수락은 verified own password+TOTP invitation purpose이며 소속 선행/일반기업자료를 요구/노출하지 않는다.
- [x] 수락/회수/동시accept의 한 protected effect·ACTIVE 소속 덮어쓰기 금지·INACTIVE exact intention·role/org/inviter 변경 재확인, tokenGeneration rotate/resend 원래 expiry 유지·24h raw 전달수명/원문 파기를 구현한다.
- [x] role define와 revise/deactivate 분리·명시 self-grant/직원 catalog·기업관리 before/after 검증, 마지막/동시 마지막 admin0 허용/경고와 실효관리 부재 별도 표시. 재지정은 현재 staff restore+사설/MFA·검증 위임/person·explicit management grants만 적용한다.
- [x] tests/u2/unit/{invitations,memberships,role-revisions,administrator}.spec.ts·tests/u2/integration/{invitation-race,membership-role-race,administrator-restoration}.spec.ts 작성·실행. expiry직전/정각/이후·resend/재시도·currentauthority/revision·admin0/다른grant·보호실패 검증.

연결: US1.3/1.4/1.6/1.10·BR2.1–2.6/3.1–3.3/3.6/4.1/6.1/6.2/7.1/7.2/7.4; NFR1.13–1.16/4.1/5.2.

### Step6 — P05. 확인 당사자 인계·제한 등록 구현 → 시험

- [x] packages/core/src/{party-claim-context,recovery-handoff,enrollment-authority}.ts와 identity.ts/identity-state.ts/identity-session.ts/identity-challenges.ts에 목적별 서버 상태를 연결한다.
- [x] 새 verified PartyClaimContext256bit browser secret+challenge, 확인자의 결정/권위·당사자 contextRef·case/target/binding/security/verification/policy revisions를 고정한다. 익명 case 생성자/기존 cookie 자동 승격 금지·발급 자체는 generation 증가 없음.
- [x] handoff96bit16문자/발급후5분/유효형식 잘못된claim5회는 grant 원본에 원자 보호 누적. unknown/malformed/wrongcontext가 타인 grant를 소진시키지 않음. 발급/교체/회수·동일case active grant 하나를 보존한다.
- [x] claim code+party secret+CSRF/origin+exactchallenge/currentissuer 검증→ISSUED 단회소비/ClaimReceipt→post-fence generation/EnrollmentAuthority 보호→handle 반환 순서. consumedAt부터 별도5분/provider더짧은기한, retry/read-result TTL 연장 없음.
- [x] tests/u2/unit/{party-context,handoff,enrollment-authority}.spec.ts·tests/u2/integration/{handoff-race,handoff-recovery}.spec.ts 작성·실행. 타인선행case/code탈취/다른cookie·case/purpose/challenge/issuer회수·5실패/정각만료·동시claim·재발급/restore 부활0 포함.

연결: US1.7/1.9·BR1.1/1.2/5.2/5.3/5.6/7.1/7.2/7.3, NFR1.5/1.6/1.10/1.12/4.1/5.1/5.3; FD R-01.

### Step7 — P06. 직접·담당자·비상 복구/HOLD 구현 → 시험

- [x] packages/core/src/{recovery-case,recovery-verification,recovery-hold,emergency-recovery,recovery-completion}.ts와 identity-codes.ts/identity-factor.ts/identity-security-events.ts/recovery-codes.ts를 확장한다.
- [x] password+현재 미사용 code 원자소비→generation회수/제한authority, 사전code 정기만료없음·재발급/회수/invalidbinding 거절. 직접복구에는 직원handoffcode를 추가 요구하지 않는다.
- [x] 수동은 현재 recovery.verify+private/MFA·실제정책/출처/권위, 비상은 별도actual운영권위로 원래담당자만. capability/evidence/policy 없음은 HOLD. 일반role/header/publicendpoint로 EMERGENCY를 만들지 않는다.
- [x] 각 Recovery/Emergency/AdministratorRestoration의 현재근거·예상개정 기반 HOLD resume/close/supersedes를 닫는다. expiredgrant/oldUNKNOWNeffect 재사용·새기한 덮기 금지. 새준비도 동일 unresolved execution slot에 연결한다.
- [x] 새TOTP 실제확인+옛factor/code/session 무효화/옛effect종료·격리+새필수code보관확인+COMPLETED/보호history/E01의무를 모두 충족해야 완료. 통지요청/실전달·새BUSINESS재로그인은 별개다.
- [x] tests/u2/unit/{saved-code-recovery,recovery-verification,recovery-hold,emergency-recovery,recovery-completion}.spec.ts·tests/u2/integration/{recovery-concurrency,hold-transitions,recovery-completion}.spec.ts 작성·실행. 이메일만/증거Ref만·issuer상실/expiredpermit·generation/oldsubject/rollback 경계 포함.

연결: US1.8/1.9/1.10·BR5.1–5.6/6.2/7.1/7.2/7.5; NFR1.11/1.12/1.16/3.2/4.2/5.2/5.3/9.3; FD R-02.

### Step8 — P07. 제공자/worker 통합·기반 경계 보완 → 시험

- [x] packages/integrations/src/{identity-capabilities,cognito-recovery}.ts·cognito.ts, packages/core/src/{identity-work,identity-consumer}.ts·identity-provider.ts·worker-consumer.ts·worker-relay.ts·queue.ts, packages/integrations/src/{sqs,worker-batch,runtime-loop,runtime-configuration}.ts와 apps/worker/src/main.ts를 결합한다.
- [x] C21 exact approvedOperation/work/target/providerbinding/inputDigest/lease/epoch/attempt/deadline·SDK maxAttempts1·전체subjectmutation1/capability/providerbreaker를 등록한다. admin제거/signout/당사자firstpassword교체는 exactpool/현재permit에만. timeout/ResourceNotFound/probe/factor없음은 원래 제거 종료 증명이 아니므로 HOLD, 실capability 없는 actualadapter 실행불가.
- [x] **U1 R-01:** matched expired PUBLISHED Work를 business effect 실행 없이 별도 bounded control transaction으로 REVIEW_REQUIRED/HOLD·원래IDs/deadline/delivery/history/currentepoch 보호한다. expired effect permit을 완화하지 않고 이 transition의 current 권위를 명시한다. 보호 기록 불가면 no-success-ACK/대조필요, 무한 PENDING 재소비 금지.
- [x] **U1 R-02:** SqsBroker.receive의 per-envelope parse/identity·receive/redrive 근거와 finite quarantine 결과를 명시하고 valid siblings를 bounded consumer lanes로 전달한다. invalid envelope를 성공ACK하지 않으며 missing receipt/속성/schema/JSON 각각 격리한다. SDK-double 성공을 실제SQS증거로 부르지 않는다.
- [x] tests/u2/unit/{provider-capabilities,identity-worker,mixed-sqs-batch,expired-work}.spec.ts·tests/u2/integration/{provider-unknown,worker-boundaries}.spec.ts 작성·실행. 기존 tests/u1/unit/{worker-batch,adapters,worker}.spec.ts·tests/u1/integration/{business-flow,http-boundaries,recovery}.spec.ts 회귀도 수행한다.

연결: US1.8/1.9·협력US3.3/8.9/9.1/9.2·BR1.2/1.4/5.4/7.1/7.3/7.5; NFR1.9/3.2/4.2/5.3/6.2/10.1. 과거 U1 review 상태는 보존한다.

### Step9 — P08. API/endpoint·BFF 경계 구현 → 시험

- [x] apps/api/src/{u2-operations,u2-authentication,u2-routes}.ts·operations.ts/authentication.ts/routes.ts/application.ts/transport-input.ts/security.ts와 packages/persistence/src/http-auth-intents.ts/http-attempts.ts를 결합한다.
- [x] operation별 registered profile/version/target/data를 runtime검증한다. PRE/INITIAL/INVITE/RECOVERY/MFA_REENROLMENT/BUSINESS·private 운영authority를 서버 원본으로 구별, caller boolean·header·공유BFFcredential이 authority 아님. firstMFA에 아직없는MFA증거를 요구하지 않는다.
- [x] packages/ui/src/{bff,client,security-proxy,ui-types}.ts·apps/customer-web/proxy.ts·apps/staff-web/proxy.ts·apps/customer-web/app/api/[...path]/route.ts·apps/staff-web/app/api/[...path]/route.ts에 목적cookie/CSRF/origin/ no-store/no-referrer/private ingress를 연결한다. 안전GET은 consume/변경 없음·URL raw token 즉시깨끗한 landing 교환.
- [x] JSON64KiB/depth16/string4096·roleRefs100/predicate200/evidence20·page25/max100/cursor5분·scan200/total2000·bounded32+32/250ms·crypto4+16·network/identifier/global limit를 명시한다. 각 현재 권한 predicate의 SQL pushdown/allowlist와 current fence를 조회·commit·projection에 적용한다.
- [x] tests/u2/unit/{http-contracts,bff-purpose,resource-budget}.spec.ts·tests/u2/integration/{http-identity,http-access,http-primary-ac,runtime-security}.spec.ts 작성·실행. direct API/직원public/위조ingress·origin/CSRF·subject/challenge·opaquecursor/cache·oversized/고갈/no-leak·원래결과재시도 포함.

연결: 전8스토리·BR1.1–1.4/3.5/7.3/7.4; NFR1.1/1.2/1.4–1.6/1.8/1.16/6.2/7.2/13.1.

### Step10 — P09. U2 목적/상태의 최소 PC UI 연결 → 시험

- [x] packages/ui/src/{invitation-acceptance,recovery-claim,recovery-status}.tsx·login.tsx/member-panel.tsx/staff-role-panel.tsx/portal.tsx/index.ts와 두 app/page.tsx에 실제 U2 API의 허용목적/결과를 연결한다. 한국어·PC1280·남은기한/오입력/보류/재확인·접수/수락/실제MFA/통지상태를 구별한다.
- [x] raw secret 브라우저 영속저장/telemetry 없음, 복사붙여넣기·label/keyboard/focus/no-color-only·재인증/계정전환/회수와 data-testid를 적용한다. 전체U8/U9 화면·직원mobile·MDM/NAC를 이 단계에서 추가하지 않는다.
- [x] tests/u2/unit/{purpose-ui,access-state-ui}.spec.tsx·tests/u2/e2e/{invitation-flow,recovery-party,staff-boundary}.spec.ts 작성·실행. Chromium1280 및 axe/keyboard·누출/회수 fixture를 현재 소스에 실행한다. 고객4브라우저/직원2브라우저 출시최신·직전stable·수동확대/WCAG2.2AA 전체실증은 U8/U9·품질 인계다.

연결: US1.3–1.10의 해당 접점·BR7.4/3.5, NFR12.1/12.2/1.8. AC1.3.4의 원래 PC·mobile 문구는 최신 첫버전PC결정과 함께 provenance 유지, 모바일완료를 주장하지 않는다.

### Step11 — P10. build/환경·IaC·CI·필수검사·성능/복원 검증

- [x] scripts/u2/{security,runtime-security-report,synth,performance,recovery,release-validation,runtime-source,ci-full-proof,coverage-evidence,coverage-aggregate}.ts·docs/u2/runtime-profile.json·coverage-scope.md·verification.md·security-exceptions.json·secret-exposures.json을 작성한다. 모든 파일을 실제 manifest에 선언하고 미실행PASS를 만들지 않는다.
- [x] infra/cdk/src/{runtime-binding,compute,storage,profile,stack}.ts·Dockerfile·tsconfig.build.json에 U2 shared module/model/schema/vault·worker exactadmin/consumer capability·별도key/DBrole 및 전체pool합계를 반영한다. synthetic synth만·REAL_ACTIVATION_UNVERIFIED 유지, API에 worker admin을 자동허용하지 않음. queue/secret 최소mapping·국내설정값만 검증하며 actual topology/regionproof를 주장하지 않는다.
- [x] .github/workflows/u1-validation.yml에 U1검증 보존+별도U2 job/두결과 필수집계·한 current source identity당 한 project-validation 집계 job, contents:read·동일lock/source/image/digests·cancel-in-progress:false/180분·별도DB/보고서를 연결한다. 실패/취소/skip/report누락/SHA불일치 차단, 최소결과7일·rawtrace/ACK/secret자료 업로드금지. 지금 push/CI실행/배포하지 않는다.
- [x] tests/u2/unit/{infrastructure,ci-report-gates,tooling,coverage-aggregate}.spec.ts를 계층 구현 직후 실행한다. U2 단위 coverage runner는 tests/u2의 unit/integration만 실행한다. 전체 U1 suite·필수 공통 검사·현재 전체 제품 coverage≥80%는 아래 project-validation에서 source identity당 한 번 수행한다. apps/packages/infra·scripts/u1+u2의 모든직접testable제품파일/미실행분모 포함·제외근거 기록. secret/SAST/dependency/CDKtemplate/image/격리runtime 보고서 하한 유지.
- [ ] current U2 파일럿 정의(u2-pilot-v1)를 docs/u2/runtime-profile.json 한 원본에서 소비한다. 첫 버전 계획 목표는 고객사10곳·일주문1000이며, 합성 검증 가정은 누적주문10000(목표10일분)·상품1000·고객계정100·내부계정10·동시20이다. 정상5req/s5분80/20→집중20req/s1분→정상5req/s2분 내 회복/2분 유지의 총10분을 실제 검증한다. 평균5/max50품목·조회p95≤1초/변경≤2초/유효기술error≤0.1%, eligible firststart≤10초·HTTP5/10초·work30초/1+3/5분·전체제품80%·보안·정확성/ACK/RTO30분·RPO0·pool32+32를 유지한다. 요청률/계정/동시성은 실제 수요나 서비스 상한이 아니다. 기존100기업/1000고객/10000상품/100000주문·100active·20req/s30분→100req/s5분→회복5분/유지10분은 후속 확장 검증으로 연기하며 첫 버전 완료 gate에서 분리한다. docs/u2/pilot-verification-change.md에 frozen NFR7→LC04→IP06의 원문·변경근거·후속 owner/조건과 과거 FAIL/미실행/OPEN을 연결한다.
- [ ] ACK independent manifest·현재fence/grant/code/claim/5실패/tombstone/UNKNOWN를 primary/journal각fault/재기동/복원에서 비교한다. 성공접수유실/중복0·부활0·local RTO30분 이하를 실제측정한다. 실패·미실행이면 간극을 보고, AWS/AZ·30일99.9%·실제한사람운영/수신실적은 별도미확인이다.

연결: BR7.1–7.5·NFR2.1/3.1/4.1/5.1/6.1/6.2/7.1/7.2/8.1/9.1–9.3/10.1/11.1–11.3/12.1/12.2/13.1–13.3/14.1/14.2. 필수실행은 승인된 local 합성환경만.

### Step12 — P11. 문서·추적·source manifest·후속 review

- [x] 현재 구현/시험/설정 파일·실제 명령·결과/분모·실제준비/미실행·계획편차를 code-summary.md에 기록한다. 관련 docs/u2/*.md에 원래operation/target/deadline/actualeffect·HOLD/파기/복구·버전/rollback·API/모듈의존을 문서화한다.
- [x] 후속 source-manifest.json을 strict schema stage=code-generation/unit=u2-identity-enterprise-access/version=1/writes로 작성한다. 모든 생성/수정/삭제 app/test/config/CI/IaC/lock/docs·shell/generator결과를 workspace-relative exactpath로 포함한다. mainworkspace라 repo는 생략, generatedtree만 trailing slash. 이번 PART1에서는 만들지 않는다.
- [x] 후속 traceability.json은 기능trace의227AC+rules31BR+상세43NFR를 누락없이 열거한다. OK target은 실제존재하는 구현/시험 한파일; 경계구현만으로 wholeAC성공을 주장하지 않는다. 후속owner/real-evidence는 Deferred와 구체사유·소유자/남은시험으로 기록한다.
- [ ] conductor에 계획/지침·실제diff/manifest·소스identity·U2/U1회귀·security/coverage/results·남은finding/actualHOLD를 전달한다. architecture reviewer는 새코드/계획의 설계일치·보호/인계/현재권위·버전/기반회귀를 검토한다. agent가 lifecycle/decision/gate/추가dispatch를 실행하지 않는다.


<a id="project-validation"></a>

## 프로젝트 전체 검증 — current source당 한 번

이 절의 명령은 project-validation 담당이 실행하며 Unit별 Build and Test 명령으로 반복하지 않는다. 실행 권한은 초기 실제 Plan Approval 이후의 승인된 local 합성 환경에 한정한다. 현재는 전부 미실행이다. docs/u2/verification.md에 이 역할·전체 명령·source identity·실행 결과를 별도로 기록한다.

변경 전 기존 전체 suite baseline은 변경 전 source identity로 한 번 확보한다. 최종 구현 후에는 최종 source SHA+workspace source inventory/content hashes·lock/tool/model/schema/config의 동일 identity로 **현재 U1 전체 시험/coverage 근거와 U2 근거를 새로** 확보한다. 변경 전 baseline이나 U1 과거80.73%/보존 측정 원본은 최종 집계 입력이 아니다. current source가 바뀌면 새 identity에 필요한 전체 검증을 수행하며 다른 Unit의 Build and Test 때문에 같은 identity를 재실행하지 않는다.

예정 전체 검증 파일:
- tests/project/vitest.u1.coverage.config.ts: U1 unit/integration만 실행해 현재 소스에 대한 전체 제품 inventory의 coverage **기여 근거**를 수집한다. 기존 tests/u1/vitest.coverage.config.ts의80% 하한은 수정/비활성하지 않는다. 새 수집 설정은 자체 overall PASS 판정이 없으며 아래 전체 집계80% gate의 입력이다.
- scripts/u2/coverage-evidence.ts: 집계 교환 형식은 V8 provider가 source map을 적용해 내보내는 Istanbul coverage-final.json의 파일별 statementMap/s/fnMap/f/branchMap/b와 별도 provenance manifest로 정한다. 현재 고정 Vitest/V8의 실제 JSON reporter export·동일 source map/line 변환 지원을 관련 코드 작성 전에 확인·시험하고 schema/version/파일 경로/소스 hash/line layout을 고정한다. U1·U2에 동일 변환을 사용하며 unsupported이면 차단한다. 요약 백분율 또는 HTML/LCOV totals만 결합하지 않는다.
- scripts/u2/coverage-aggregate.ts: U1/U2 coverage의 파일별 executable line set와 실제 실행된 line set를 source inventory/hash에 맞춰 **합집합**한다. 여러 report가 같은 파일/라인을 실행해도 한 번만 센다. 미실행 제품 파일은 같은 전체 inventory의0실행 분모로 포함한다.
- tests/u2/unit/coverage-aggregate.spec.ts: 각 계층의 구현 뒤 같은 line 중복/겹친 파일·부분 실행·미실행 파일·누락/stale report·다른SHA/lock/inventory·source map 불일치·잘못된 JSON format·threshold80 경계를 시험한다.
- docs/u2/coverage-scope.md: 전체 직접 테스트 가능한 제품 파일 inventory·제외 사유·U1/U2 기여 범위·현재 전체 분자/분모·line 합집합 형식/버전·미실행 목록을 기록한다.

집계 입력은 source SHA만 비교하지 않고 수정/미추적 파일을 포함한 정확한 파일 content hash·workspace-relative normalized path·lock/model/schema/config digest·수집 도구/형식/line mapping identity를 비교한다. collector 형식/변환 지원을 확인하지 못하면 관련 coverage 구현/활성화부터 차단한다. raw V8의 중간 결과를 바로 합산하지 않고 동일한 source map 기반 Istanbul line 변환을 고정·시험한다. 현재 runner의 실제 export와 line 변환을 확인한 뒤 strict schema로 읽는다. 두 report의 동일 파일 statement/line map이 다르면 합집합하지 않고 실패한다. runtime export 형식 확인 없는 임의 JSON 합성으로 실행 근거를 만들지 않는다.

집계/release gate는 missing/stale input·input format/line mapping 오류·inventory mismatch·겹친라인 중복계수·미실행 파일 누락/근거 없는 제외·현재 전체 라인80% 미달에 실패한다. 직접 작성한 apps/packages/infra/cdk/scripts/u1+u2의 모든 테스트 가능한 제품 source와 미실행 파일 분모를 유지한다. Unit 부분 report를 전체80% 달성으로 표시하지 않으며 기존 coverage/보안 하한을 낮추지 않는다. U1 기존 suite는 최종 current source에서 green이어야 한다.

다음은 project-validation 전용 실제 예정 명령이다. U1 기존 세 명령만 현재 manifest에 존재한다. 나머지 project/U2 수집·집계/검증 명령은 구현/등록할 예정이며 지금 실행하지 않았다.

```bash
npm run test:u1:unit -- --reporter=default --reporter=json --outputFile=.reports/project/current-u1-unit.json
npm run test:u1:integration -- --reporter=default --reporter=json --outputFile=.reports/project/current-u1-integration.json
npm run check:u2
OMS_U1_DATABASE_PROFILE=verification-isolated npx vitest run --config tests/project/vitest.u1.coverage.config.ts --coverage
npm run test:u2:coverage
node --import tsx scripts/u2/coverage-aggregate.ts
npm run synth:u2
docker build --platform linux/amd64 --label oms.unit=u2-identity-enterprise-access -t oms-u2-local:verification .
npm run security:u2
npm run verify:u2:release
```

현재 전체 U1 unit/integration은 위 명시 project output으로만 쓴다. legacy check:u1은 기존 보존 check report를 직접 덮어쓰므로 이 current-source gate에서 별도 실행하지 않는다. check:u2가 기존 U1 형식/타입/계약/소스 경계의 모든 검사·하한을 그대로 포함하고 U2 검사까지 수행해 새 .reports/u2/check.json에 기록한다. 기존 검사 생략/완화·auto-executing legacy reporter import나 report 경로 암묵 fallback은 금지한다. 같은 전체 검사 source identity를 두 번 수집하지 않는다.

project U1 coverage 수집 전에 기존 승인된 U1 verification-isolated DB 준비를 확인한다. U2 unit/통합/PC/runtime-security/부하/복원은 [단위 시험 지침](unit-test-instructions.md)의 정확한 U2 runner/파일 범위로 실행하고, 동일 current source의 결과가 있으면 project gate는 그 결과를 검증한다. U2 coverage는 U2 unit/integration만 실행하며 project gate가 필요 시 해당 identity에서 한 번 수집한다. 어떤 명령도 과거 성공 report만으로 현재 suite green을 추론하지 않는다.

전체 check/Semgrep·npm audit·Trivy root비밀/합성CDKtemplate/동일image 검사는 project-validation의 한 current source identity에 속한다. 실패/미지원/보고서누락·실행runtime U2 보안 근거누락이면 release gate를 차단한다. 보안 도구·기존0발견 및 actionable HIGH/CRITICAL 차단 하한은 유지한다. 전체 scanner/전체 build 명령을 unit-test-instructions에 넣어 Unit마다 재실행하지 않는다.

예정 project evidence는 .reports/project/current-u1-coverage/coverage-final.json·u2 coverage 원문·coverage-aggregate.json·source-inventory.json와 .reports/u2/release-validation.json에 연결한다. 정확한 raw format/필수 세부 필드는 코드 전 exporter 확인으로 고정하고 report provenance에 기록한다. summaries는 line 합집합 원문/소스 identity 대조 후 파생한다. CI 필수 project gate는 U1/U2 결과와 전체 coverage≥80%·보안/보고서의 동일 identity를 확인하며 실패/취소/skip를 통과로 만들지 않는다.

## 주 책임26AC와31BR 매핑

표의 단계/시험은 예정이며 AC 통과 판정이 아니다. 모든 BR는 단계에 포함한다.

| Story | 정확한 AC | 단계 / 주 시험 | BR 연결 |
|---|---|---|---|
| US1.3 | AC1.3.1, AC1.3.2, AC1.3.3, AC1.3.4 | P03/04/08/09; invitations/memberships/invitation-race/http-primary-ac | BR1.2/2.2–2.6/3.5/3.6/7.1–7.4 |
| US1.4 | AC1.4.1, AC1.4.2, AC1.4.3 | P03/04/08; role-revisions/authority-race/information-projection | BR2.3/3.1–3.3/3.5/3.6/4.1 |
| US1.5 | AC1.5.1, AC1.5.2, AC1.5.3, AC1.5.4 | P03/08; scopes/scope-compatibility/authority-race | BR1.2/2.1/2.3/3.4/3.5 |
| US1.6 | AC1.6.1, AC1.6.2, AC1.6.3 | P03/04/08; authorization/verified-person/membership-role-race | BR1.2/1.3/3.2/3.3/3.6/4.1/4.2/7.2 |
| US1.7 | AC1.7.1, AC1.7.2, AC1.7.3 | P03/05/08/09; http-identity/http-access/staff-boundary | BR1.1/1.4/3.4/7.3/7.4 |
| US1.8 | AC1.8.1, AC1.8.2, AC1.8.3 | P02/06/07/08/09; saved-code-recovery/provider-unknown/recovery-completion | BR5.1–5.5/7.4/7.5 |
| US1.9 | AC1.9.1, AC1.9.2, AC1.9.3 | P02/05/06/07/08/09; handoff-race/emergency-recovery/hold-transitions | BR5.2–5.6/7.1/7.2/7.5 |
| US1.10 | AC1.10.1, AC1.10.2, AC1.10.3 | P04/06/08/09; administrator/administrator-restoration/http-primary-ac | BR2.2/3.6/6.1/6.2/7.1 |

협력201AC는 [기능 추적](../functional-design/traceability.json)의 전체 ID와 [스토리 할당](../../../inception/units-generation/unit-of-work-story-map.md)을 그대로 상속한다. 현재 신원·허용 scope·원래 대상·동일인·최소 투영·보호 경계를 P03/07/08에서 검증하고 다음 소유자에게 전체 결과를 인계한다.

| 후속 소유자 | 정확한 협력 스토리 집합 | U2가 제공할 검증과 후속 미완료 |
|---|---|---|
| U1 | US1.1, US1.2, US3.3 | 기업 승인/최초 지정·최소 주문/원래 대기 결과 회귀. 과거 완료 기록은 수정하지 않음 |
| U3 | US2.1, US2.3–US2.7, US3.1, US3.2, US3.4–US3.6, US7.5 | 상품/계약/주문·현재 scope/실제 다른사람 predicate. 전체 가격/승인/주문 결과는 U3 |
| U4 | US4.1–US4.6, US7.8, US8.6 | 대금 정보/행위·현재권위·보호 결과. 금액/배분/환불 정확성은 U4 |
| U5 | US5.1–US5.7, US8.11 | 직원 HW행위/고객 정보 범위. 수량/재고/출고/회수 실제결과는 U5 |
| U6 | US6.1, US6.3–US6.6, US7.1–US7.4, US7.6, US7.7, US8.5 | 발급/기간/갱신 scope·동일인 근거. SW기간의 같은사람 두권한/별도승인·실제권한/기간은 U6 |
| U7 | US8.1–US8.4, US8.7–US8.10, US9.4 | 정보별 투영·E01 의무/원래사실·이력. 전체 후속판단/조회·당사자 실제통지 전달은 U7 |
| U8 | US2.2, US6.2 및 U2스토리 고객 UI 협력 | U2 최소목적 연결/PC fixture, 전체 C01–C09·고객4브라우저/접근성은 U8 |
| U9 | US8.12 및 U2스토리 직원 UI 협력 | 사설경계·직원 목적/현재권위, 전체 S01–S11·실회사망/직원2브라우저는 U9/Infra |
| U10 | US9.1–US9.3, US9.5–US9.7 | 현재 ACK/보안 원본·합성 장애/통지 sink. 실제 cloud/국내 경로/30일99.9%/야간·1인 운영 실증은 U10/Infra |

## 상세43NFR 구현·검증·후속 책임

동일 ID는 아래에 한 번씩 연결한다. 단독 local 검증 범위와 전체 목표/realactivation 조건을 구별한다. 현재 구현/시험 통과를 뜻하지 않는다.

| NFR | 단계 / 실제 예정 시험·증거 | 후속 실제 조건 |
|---|---|---|
| NFR1.1 | P05/06/08; http-identity/recovery-completion | 실제 provider MFA·전체 BFF/U8/U9 |
| NFR1.2 | P01/02/03/08; authorization/authority-race/http-access | 각 업무 owner commit/투영 통합 |
| NFR1.3 | P03; scopes/scope-compatibility | 거래 owner 원래 조직문맥 |
| NFR1.4 | P07/08/09; staff-boundary/http-identity | 실제 회사망·private ingress/Infra |
| NFR1.5 | P05/08; enrollment-authority/http-identity | 실제 세션활동/U8/U9 |
| NFR1.6 | P01/08; bff-purpose/http-identity | 두 실제 BFF 모든접점 |
| NFR1.7 | P03; verified-person | 실제 person policy·U3 계약/U6 기간승인 |
| NFR1.8 | P03/08/09; information-projection/runtime-security | U7/U8/U9 전체투영/캐시 |
| NFR1.9 | P07; identity-worker/worker-boundaries | 각 실제 consumer/provider |
| NFR1.10 | P02/05/08; purpose-verifier/secret-lifecycle/runtime-security | 실제 key/vault/국내전달 |
| NFR1.11 | P06/07; saved-code-recovery/recovery-completion | 실제 새 MFA/옛 무효화·U7 전달 |
| NFR1.12 | P05; handoff/handoff-race/handoff-recovery | 실제 인정된 확인당사자/안전전달 |
| NFR1.13 | P04; invitations/invitation-race | 검증연락/U7 실제전달 |
| NFR1.14 | P03/04; role-revisions/authority-race | 각 업무 owner 관리/거래분리 |
| NFR1.15 | P03/04; membership-role-race/administrator-restoration | 실제 현재 위임·owner commit |
| NFR1.16 | P06/07/08/10; capabilities/realactivation deny fixture | actual readiness 없으면 HOLD |
| NFR2.1 | P10; 업무별 SLI profile/manifest | U10 rolling30일99.9% actual downtime |
| NFR3.1 | P02/10; recovery/독립 ACK/currentsecurity 비교 | Infra 실제AZ/복원·야간30분RTO |
| NFR3.2 | P06/07; hold-transitions/provider-unknown | 실제 원래effect 종료/격리 capability |
| NFR4.1 | P02/10; protected-state/recovery | 실제내구/backup·독립원장 실증 |
| NFR4.2 | P06/07; provider-unknown/worker-boundaries | 실제제공자 원래결과 대조 |
| NFR5.1 | P03–08/10; AC/invariant별 zero violation 보고 | 거래8정확성 owner 전체통합 |
| NFR5.2 | P06; recovery-hold/hold-transitions | actual authority·현재근거 |
| NFR5.3 | P05/06/07; handoff-race/hold-transitions/expired-work | 실제원래작업/새허가 연결 |
| NFR6.1 | P10; performance/currentsource profile | 실제배포/클라이언트·provider latency |
| NFR6.2 | P07/08/10; resource-budget/worker-boundaries | 실제eligible dispatch/cumulative deadlines |
| NFR7.1 | P10; fixedseed normal/peak/recovery | 실제수요·용량 아님, 후속U10 |
| NFR7.2 | P02/08/10; resource-budget/repository/performance | replica×pool/provider 전체상한 |
| NFR8.1 | P10/11; compatibility/release gate doc | U7/U8/U9 실제24h안내·점검집계 |
| NFR9.1 | P10/11; 자동화·수동시간 기록 형식 | U10 실제30분/일·15분/배포·30분복구 |
| NFR9.2 | P00/07/08/10; hostbinding/infrastructure | 기존 shared host 유지 |
| NFR9.3 | P06/10; emergency-recovery/realactivation deny | actual 비공개운영/업무담당자 자격 |
| NFR10.1 | P07/10; local notice/incident sink fixture | 실제Slack/email 수신·명시확인/U10 |
| NFR11.1 | P02/10; infrastructure/runtimeprofile admission | 실제한국 provider/vault/log/backup/전달경로 |
| NFR11.2 | P02/10; secret-lifecycle/recovery suppression | 인정출처/법적retention 정책 확보 전 실자료금지 |
| NFR11.3 | P02/07/10; runtime-security/telemetry 최소화 | 실제관측 권한/국내저장 |
| NFR12.1 | P09; purpose-ui/PC1280 | U8/U9 전체한국어/시각/PC |
| NFR12.2 | P09; axe/keyboard/Chromium | 전체WCAG2.2AA·출시브라우저/수동확대 |
| NFR13.1 | P01/07/08; contracts/http-contracts/worker-boundaries | 각consumer/version actual registration |
| NFR13.2 | P01/03; scope-compatibility/migration-compatibility | 실제legacy policy/backfill·rollback |
| NFR13.3 | P00–11; 계층 test-after·U2 부분 기여/별도 project 집계의 전체 coverage≥80% | CI 실제필수실행/보고서 |
| NFR14.1 | P10; security/CI/report-gates | 현재source 실제scanner/격리실행 증거 |
| NFR14.2 | P00/07/10; exactversions/support·보안예외/노출보고 | 개발자 실제대응·사유/담당/만료/재검토 |

## Assumptions & Open Questions

새 제품 정책 선택 질문: None. 승인된 스택·인력·AWS/CDK·Cognito/Keycloak 방향·MFA/인계/초대·PC 정책을 다시 질문하지 않는다.

현재 미확인 actual 확인/위임/비상운영 정책·자격/법적retention·국내key/DB/vault/provider/회사망·수신자/capability는 U2-OQ01/03/06 및 LC10/IP10의 activation blocker로 유지한다. 합성 fixture로 실제 fact를 채우지 않는다. local 코드의 factory/admission은 이 조건을 필수로 검사하고 값 없음은 HOLD/realactivation false다.

ND 상세 상태/인계/ScopeV2는 기존 FD 정의보다 구체화된 후속 설계다. P01의 explicit 새 profile/decoder가 둘을 연결하고 안정 ID/과거 이력은 보존한다. 예기치 않은 실제 소스/원래 계약 충돌이 나오면 source를 임의확장하거나 답을 추정하지 않고 conductor에 경로·질문안을 반환한다.

## 현재 산출과 다음 확인

현재 source8972b7b0e26cbd9748c9ad80153dd9ecabe90e1ea066b70f421243f40a88d803를 보존한 채 code-summary.md·source-manifest.json·traceability.json·source-write-ledger.json·follow-up-status-20261011.md를 작성했다. 완료 체크는 해당 항목의 구현/직접 시험 또는 실제 문서 작성 근거이며 전체 검증·실제 CI·출시 완료를 뜻하지 않는다. 제품·시험·DB·runtime·새 collector를 변경/실행하지 않았다. 문서 JSON/경로/301ID 확인은 conductor가 Luna에 맡기며 독립 최신 review와 native 완료/후속 결정도 conductor 책임이다. 첫 배포 기능 범위는 아직 PROPOSED이며 원래 전체 기능 설계/배정은 유지한다.

## 2026-10-11 실행 결과와 사용자 보류

- 최신 전체 collector는 source8972b7b0, controller40381/PID80449 exit1이다. U1 unit571/integration168/coverage739, U2 unit449/integration272/coverage721, 전체9246/11518=80.27435318631707%, PC5/5와 check/synth/image/scans/same-image runtime는 통과했다.
- pilot3900 요청의 기술/정확성/worker failure는0이지만 NORMAL299885.091333ms/300000, RECOVERY119838.427ms/120000, HOLD119882.437041ms/120000의 최소 구간을 충족하지 못했다. PEAK60030.027875ms/60000 통과는 전체 성공이 아니다.
- U2 first-start58/p95494ms/missing0와 UI/purpose/resource/worker recovery true, ACK782 수집은 실제 관측이다. ACK의 DR 전수 대조·RPO0/RTO30분 실증은 미실행이다.
- 사람은 부하 측정을 현재 상태로 기록하고 종료하며 DR를 추후 진행하고 최종 산출물 정리부터 진행하도록 지시했다. 따라서 P10 두 실행 항목과 P11 독립 review를 완료 표시하지 않는다. 기준·FAIL 원문·현재 source를 바꾸지 않는다.
- 기존100k/50분 확장 검증은 Deferred, 두 original provenance gap과 U1 R-01/R-02는 OPEN이다. 새 첫 배포 제안은 사용자 확인 전이며 전체 설계/기능 범위를 여기서 제외하지 않는다.
- 상세 근거는 code-summary.md와 execution-failure-duration-20261011.md, 후속 책임은 follow-up-status-20261011.md에 연결한다. 문서 정리는 승인/위험 수용/native completion 또는 reviewer verdict가 아니다.
