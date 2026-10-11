# U2 단위·통합 테스트 실행 지침

## 현재 시도 실행 지침 — PC fixture 수리, 승인 전 실행 금지 (2026-10-11)

이번 실행은 [계획의 현재 시도 Step1–Step6](code-generation-plan.md)의 fixture2+새 시험1만 대상으로 한다. 아래 「역사적 시험 지침」의 기존59항목/coverage·보안·부하·DR·전체 collector 명령은 이전 기록/후속 지침이며 이번 자동 실행 대상이 아니다. 현재는 계획 작성만이며 실제 source/시험/DB 변경·실행0이다. 새 실행은 conductor가 이번 사람 Plan Approval·native 허용·현재 tool-produced brief를 전달한 뒤 시작한다. Testing Contract의 test-after/Standard·제품80%/미실행분모·보안/권한/정확성/ACK 하한을 유지한다.

### 기존 runner·준비·출력 보호

고정 runtime `/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin`을 PATH 앞에 사용한다. Vitest5.0.3/Playwright1.64.0 및 기존 config를 유지하고 새 설치/config 변경은 없다. 아래 명령은 현재 등록 runner와 정확 파일/filter를 사용하지만 새 unit 파일 자체는 **승인 후 작성 예정**이다. 모든 출력 경로는 실행 전 부재를 확인한다. 재실행은 기존 실패를 exact archive한 뒤 새 고유 suffix를 정하며 같은 경로를 덮지 않는다.

준비 계층 구현→새 unit 작성/실행→기존 PG→PC4/5 순서다. 단순 unit·ESLint·Prettier --check는 Luna에게 맡기고 source 작성 중지·frozen runtimeSourceIdentity().digest와 exact 명령을 전달한다. TypeScript 검사는 파일 인수로 tsconfig를 무시하지 않고 기존 root `tsconfig.json`의 project 검사를 한 번 수행하는 별도 책임이며 [계획 R02](code-generation-plan.md)에 연결한다. 단위별 명령으로 프로젝트 전체 suite를 반복하지 않는다. root project type command `npx tsc --noEmit --project tsconfig.json`는 conductor/Luna가 이번 frozen source에 한 번만 수행하며 제품 시험·coverage 명령이 아니다.

원본 보호 목록은 `.reports/u1/unit.json`, `.reports/u1/integration.json`, `.reports/u1/e2e.json`, `.reports/u1/context-http-diagnostics.json`, `.reports/u2/validation-source.json`, `.reports/u2/e2e.json`, `.reports/u2/integration.json`, `.reports/project/coverage-aggregate.json`이다. 전후 exact bytes/hash·존재/부재를 기록한다. 기존 `.reports/u2/project-u2-e2e.log`·`.reports/u2/performance.json`도 보존 대상으로 포함한다. U1 PC가 원래 `context-http-diagnostics.json`을 쓰는 것은 실제 부수 write이며 숨기지 않는다. 실행 전 private exact archive를 하고 실행 후 새 파일 bytes/hash를 별도 저장하며 기존 파일을 무단 복원/덮어쓰지 않고 보존 사건을 기록한다. 고정 canonical reporter/receipt를 새 선택 결과로 교체하지 않는다.

U1 E2E script의 기존 pretest·config가 `e2e-isolated` DB 초기화→local-service `--reset-synthetic`→원래4계정 보호 seed→이번 backfill/최소 manager/fence 확인→API/BFF 개방을 소유한다. 사전에 외부 backfill을 하고 reset 뒤에 남는다고 추정하지 않는다. U1 exact primary/journal 경계는 계획 R01과 같고 U2 PG/PC는 기존 `oms_u2_verification`/`oms_u2_journal_verification`·`oms_u2_e2e`/`oms_u2_journal_e2e`의 등록 fixture만 사용한다. 실제 credentials는 기존 private env에서 읽고 CLI/log에 출력하지 않는다. 외부/production/다른 namespace·임의 reset·새 role/권한은 거절한다.

### 이번 정확 scoped 명령 — 아직 미실행

`PATH` 고정은 각 세션에서 적용한다. 순수 단위는 Luna, 실제 PG/PC는 구현 lead가 직렬 실행한다. 표의 예상 case 수는 원래 PC4/5만 확정이며 신규 unit 개수와 실제 성공/실패 수는 작성·실행 결과로 기록한다.

| 순서/책임 | 명령·정확 범위 | 판단 |
|---|---|---|
| R02 / Luna | `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/u1-pc-fixture-preparation.spec.ts --outputFile=.reports/u2/selected/pc-fixture-repair-unit-20261011-1.json` | 새 시험1파일·두 fixture별5–8개 의미 있는 정상/부정 경계. source/원래 report 전후 불변 |
| R02 / Luna | `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx eslint tests/u1/fixtures/local-service.ts tests/u1/fixtures/staff-bootstrap.ts tests/u2/unit/u1-pc-fixture-preparation.spec.ts` | 명시3파일, 고유 Luna log |
| R02 / Luna | `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx prettier --check tests/u1/fixtures/local-service.ts tests/u1/fixtures/staff-bootstrap.ts tests/u2/unit/u1-pc-fixture-preparation.spec.ts` | 명시3파일, 쓰기 없음 |
| R03 / lead | `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U2_SYNTHETIC_PROFILE=approved-local-only npm run test:u2:integration -- tests/u2/integration/migration-compatibility.spec.ts --testNamePattern='구형 보호 계정의 보안 backfill|legacy code' --outputFile=.reports/u2/selected/pc-fixture-repair-backfill-20261011-1.json` | 기존 보호 backfill/legacy admission만, 기존 pretest가 verification-isolated 준비 |
| R03 / lead | `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U2_SYNTHETIC_PROFILE=approved-local-only npm run test:u2:integration -- tests/u2/integration/runtime-security.spec.ts --testNamePattern='이미 보호된 고정 revision1 fixture' --outputFile=.reports/u2/selected/pc-fixture-repair-fence-20261011-1.json` | 실제 보호된 기존 fence 보존1case; 전체 runtime/security scanner 아님 |
| R04 / lead | `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH PLAYWRIGHT_BROWSERS_PATH=.runtime/u1/playwright PLAYWRIGHT_NO_COPY_PROMPT=1 PLAYWRIGHT_JSON_OUTPUT_FILE=.reports/u2/selected/pc-fixture-repair-u1-pc4-20261011-1.json npm run test:u1:e2e -- tests/u1/e2e/foundation-flow.spec.ts --workers=1 --retries=0 --output=.reports/u2/selected/pc-fixture-repair-u1-pc4-artifacts-20261011-1` | 원래4case 모두 실행, 추가 grep으로 줄이지 않음 |
| R04 / lead | `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH PLAYWRIGHT_BROWSERS_PATH=.runtime/u1/playwright OMS_U2_SYNTHETIC_PROFILE=approved-local-only PLAYWRIGHT_JSON_OUTPUT_FILE=.reports/u2/selected/pc-fixture-repair-u2-pc5-20261011-1.json npm run test:u2:e2e -- tests/u2/e2e/invitation-flow.spec.ts tests/u2/e2e/recovery-party.spec.ts tests/u2/e2e/staff-boundary.spec.ts --workers=1 --retries=0 --output=.reports/u2/selected/pc-fixture-repair-u2-pc5-artifacts-20261011-1` | 기존2+1+2case 모두 실행; U1 업무4case의 대체 아님 |

U1 PC 표의 판단은 원래4case 모두 실행하고 추가 grep으로 줄이지 않는다는 뜻이다. Playwright의 `PLAYWRIGHT_JSON_OUTPUT_FILE`은 pinned reporter가 config 기본 outputFile보다 우선하는 기존 지원 경로다. no-copy-prompt·trace off와 기존 screenshot/video 설정을 유지하며 원문 DOM/secret-bearing 진단을 수집하지 않는다. 고유 stdout/stderr log는 owning runner/file 도구로 보존하고 비민감 title·status/code/boolean·실제 case/skip/flaky·시각만 요약한다. 새 실패의 원문은 별도 private exact archive에 남긴다.

### 시험 자료·mock·부정 조건의 연결

새 unit 파일은 local-service의 실제 module 호출 순서와 staff-bootstrap의 실제 함수/transaction callback을 실행한다. DB/서버/timer/파일은 격리 double을 쓰며 fixture를 import할 때 실제 seed/listen/reset이 발생하지 않게 한다. 원래 코드 문자열/assert 항상true·권위 항상allow mock으로 대신하지 않는다. 정상 준비와 최소 grant/Receipt fields·기존 fence 보존을 검증하고, 잘못된 target/profile, source 없음/raw-only/개정 변경, backfill 실패, 기존 grant의 fence 없음, fence 불일치, tx 실패 rollback 및 API 미개방을 각각 확인한다. 가상 I/O 결과는 실제 PG 보호 증거와 구별한다.

기존 migration-compatibility의 legacy valid/revoked/unconfirmed/all-used/partial-used/unknown-binding/old-generation/stale-binding/unprotected, backfill 멱등/현재 Account bytes 보존을 재사용한다. 기존 runtime-security의 보호 fence 재seed 거절/원본 유지는 실제 PG 대조다. U1 PC는 이번 두 fixture를 직접 소비하는 실제 API→BFF→브라우저 회귀이며 U2 PC는 이미 등록된 별도 fixture의 초대/복구/직원 경계를 유지한다. 새 unit을 위해 production API/schema/authority/decrypt권한·기한/skew·pool/selector를 바꾸지 않는다.

### coverage·실패·후속 인계

이번3경로는 현재 `productInventory`에서 제외된 tests 경로이므로 제품 분모 정의를 바꾸지 않는다. 이 사실은 fixture 시험을 불필요하게 만드는 근거가 아니며 전체 source identity는 변한다. 이전9246/11518=80.274353%는 원래8972 identity의 결과이고 새3경로 수정 후의 current coverage PASS가 아니다. 전체80%/미실행 제품 분모·필수 보안·권한/정확성 조건은 유지하고 전체 current-source 검증 필요성을 인계한다. 이번에 whole coverage·scanner·이미지·100k50분/10분 부하·DR·release collector를 재실행하지 않는다.

시험/준비/보고서 보호 실패·skip/no-test/flaky는 숨기지 않고 관련 실행을 halt한다. 소유 프로세스/DB pool/browser를 정리하고 source와 원문/실제 exit·signal·cleanup 결과를 conductor에 넘긴다. 현재 진단에 따라 실제로 허용하는 처리 선택과 공식 checkpoint command 선정·승인/verify·commit/push·독립 review·native completion은 conductor가 처리한다. 이번 PC 통과는 성능 시간 FAIL/DR 미실행·provenance2OPEN·기존 review finding의 위험 수용/해결 근거가 아니다.

## 역사적 시험 지침 — 이전59항목·후속 명령, 이번 실행 대상 아님

아래는 이전 지침 제목 아래 원문이다. 현재 수리 scope의 명령은 위 표뿐이며 역사적 전체 명령/예정 상태/기존 완료 표현을 새로운 실행 허가 또는 성공으로 해석하지 않는다.


## 현재 상태·목적

59항목 계획의 구현/직접 시험과 필수 current-source 검사를 수행했다. 원래 source8972b7b0의 단위/통합·전체 coverage·PC/보안 근거는 [code-summary.md](code-summary.md)에 연결하며, 최종 collector는 부하 구간 시간 하한 FAIL이고 DR는 미실행이다. 출력 격리 실행기는 구현·검증했으나 원래 U1 상세563건 report와 최초 실패 SAST child 상세 원본의 gap 두 건은 OPEN이다. 아래 명령은 등록된 실행/후속 검증 지침이며 이번 문서 정리에서 실행하지 않는다.

Unit은 library/embedded이며 API·worker·두 BFF의 실제 local 통합을 시험한다. 테스트는 계획의 Testing Contract(test-after/standard/feature)를 그대로 따른다. 각 계층 구현→그 계층 시험 작성/실행→다음 계층 순서다. 첫 시험 전에 runner/config를 준비한다. component당5–8개 시험을 기본으로 정상+최소두error/edge·명시된 부정/동시/장애·호환 회귀를 추가한다. 테스트가 없는 상태를 pass 처리하거나 중요 통합 시험을 빈 stub/todo로 남기지 않는다.

## 실행 전 준비와 환경 격리

PART2의 실제 Plan Approval/현재 tool-produced brief 확인 후에만 실행한다. Node22.23.3/npm10.9.9·현재 exact lock/Vitest5.0.3/V8·Playwright1.64.0 및 현 ESLint/Prettier를 유지한다. runtime 버전/의존성 지원은 P00에서 검사하며 불일치는 실패로 보고한다. 테스트명령에 aidlc를 대체 런타임으로 사용하지 않는다. 모든 AI-DLC engine 명령은 PATH 원래 aidlc만 사용한다.

기존 npm ci에는 postinstall CDK bundle 작업이 있어 읽기전용 명령이 아니다. 계획 단계에는 실행하지 않으며 승인된 구현 환경에서만 현 lock으로 설치한다. PostgreSQL은 기존17.11 pinned image의 **별도 primary·journal 인스턴스/DB권한**를 사용한다. U2용 별도 DB oms_u2_verification/oms_u2_journal_verification, E2E는 oms_u2_e2e/oms_u2_journal_e2e로 분리한다. U1 baseline/원래 대량측정 DB·다른 작업자 DB를 drop/reset하지 않는다. 두 instance의 현재 loopback port15432/25432 및 소유/합성 labels를 검증하고 불확실하면 차단한다.

P00 등록 파일과 원래 실행 설계:
- tests/u2/fixtures/databases.ts: OMS_U2_DATABASE_PROFILE=verification-isolated|e2e-isolated만 허용. localSynthetic/loopback·DB명·current owner/합성 profile를 대조한다. 원래 U1 fixture를 U2 reset target으로 직접 재사용하지 않는다.
- scripts/u2/prepare-test-databases.ts·bootstrap-ci.ts: .runtime/u2/test-databases.env에 한시 합성 credentials를 생성/0600으로 보관, console/artifact에 출력하지 않음. target admission 후 U2 schema/role/migration만 준비한다.
- tests/u2/fixtures/identity.ts·enterprise.ts·provider.ts·queue.ts·clock.ts·local-service.ts·reset.ts: deterministic fixture/현재 원본·실제 경계의 SDK doubles/로컬 queue, U2 합성 profile only.
- 외부 Cognito/SQS/SNS/Slack/email 네트워크를 차단한 service fixture, 인증과 통지는 등록된 local doubles/sink만. 실제 provider/doc 지원과 mock 결과를 구별한다.
- 실제 문의 정책/위임·운영 권위·국내경로/법적retention이 없으면 fixture만 synthetic policy를 사용하고 realactivation deny를 시험한다.

예정 bootstrap 명령(지금 미실행):

```bash
npm run bootstrap:u2:ci
node --import tsx scripts/u2/prepare-test-databases.ts
```

준비 실패/target 불명/실credentials·실receiver 발견 시 dependent 실행은 차단한다. DB/worker/readiness와 제한 권한·fence의 건강 상태를 분리한다. 합성 실행 fixture가 실제 활성화 flag를 올리지 못하게 한다.

## runner/config와 정확한 명령

| 구분 | 현재 존재 / 준비할 runner·설정 | 명령 |
|---|---|---|
| U2 단위 | 예정 tests/u2/vitest.unit.config.ts; include tests/u2/unit/**/*.spec.{ts,tsx}, no-test 실패·serial·30s | npm run test:u2:unit |
| U2 통합 | 예정 tests/u2/vitest.integration.config.ts; include tests/u2/integration/**/*.spec.ts·serial·30s·격리DB | npm run test:u2:integration |
| U2 coverage 기여 근거 | 예정 tests/u2/vitest.coverage.config.ts; tests/u2 unit/integration만 실행·전체 inventory에 대한 부분 실행 근거, 전체80%는 별도 project gate | npm run test:u2:coverage |
| 최소 PC E2E | 예정 tests/u2/playwright.config.ts; viewport1280×900·Chromium·traceoff·격리DB·serial | npm run test:u2:e2e |
| 격리 실행중 서비스 보안 | 예정 integration runtime-security + scripts/u2/runtime-security-report.ts | npm run test:u2:runtime-security |
| 현재 U2 부하 | 예정 scripts/u2/performance.ts·고정 runtime-profile | npm run test:u2:performance |
| 현재 U2 복원/ACK/보안 상태 | 예정 scripts/u2/recovery.ts | npm run test:u2:recovery |

package.json의 예정 U2 scripts는 다음 명령에 정확히 연결하며 모든 test runner는 tests/u2만 선택한다. 프로젝트 전체 check/scan/build·U1 전체 baseline·coverage 집계/release 실행은 [별도 project-validation](code-generation-plan.md#project-validation)에 있다. 통합/coverage/recovery/e2e의 pretest는 U2 admission/DB prepare를 실행한다. 직접 npx 실행은 pretest를 우회하므로 준비된 fixture 조건을 먼저 확인한다.

```bash
vitest run --config tests/u2/vitest.unit.config.ts
OMS_U2_DATABASE_PROFILE=verification-isolated vitest run --config tests/u2/vitest.integration.config.ts
OMS_U2_DATABASE_PROFILE=verification-isolated vitest run --config tests/u2/vitest.coverage.config.ts --coverage
OMS_U2_DATABASE_PROFILE=e2e-isolated playwright test --config tests/u2/playwright.config.ts
OMS_U2_DATABASE_PROFILE=verification-isolated vitest run --config tests/u2/vitest.integration.config.ts tests/u2/integration/runtime-security.spec.ts
node --import tsx scripts/u2/performance.ts
node --import tsx scripts/u2/recovery.ts
```

## 계층별 파일·실행·assertion

각 행의 구현은 계획 P 단계에서 먼저 한다. 이어 아래 exact 명령으로 시험을 작성/실행한다. config/json reports는 별도 report key를 기록한다. U1 선택 회귀는 scripts/u2/run-u1-regression.ts만 사용해 정확 test path·U2 output·U1 default report의 before/after hash 불변을 강제한다. U2 개별 선택시험도 아래 명시 selected output을 사용하며 전체 run의 reports를 덮어쓰지 않는다. 모든 단계는 최소 정상/거절/경계를 갖는다.

| 단계 | 실제 작성할 시험 파일 / 핵심 assertion | 구현 뒤 정확한 실행 명령 |
|---|---|---|
| P00 기존 보고서 fixture 격리 | tests/u1/unit/skeleton.spec.ts: .reports/u1/ fixture 누락의 read/stat은 mock ENOENT·실 disk fallback0, 상대/절대 경로 동일 판정·fixture 존재·보고서 밖 source 읽기 유지. 제품 verifier/보존 보고서/기준은 변경 없음 | node --import tsx scripts/u2/run-u1-regression.ts unit --report-key p00-skeleton -- tests/u1/unit/skeleton.spec.ts |
| P00 runner | tests/u2/unit/tooling.spec.ts: target admission·누락/skip 차단·coverage config/파일 분모·명령 전파 | npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/tooling.spec.ts --outputFile=.reports/u2/selected/p00-tooling.json |
| P01 schema/model | tests/u2/unit/contracts.spec.ts, models.spec.ts: closed enums/nullable/target/purpose·old profiles 미변경·unknown keys/세대 누락; PostgreSQL constraint/decoder/unique효과는 integration | npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/contracts.spec.ts tests/u2/unit/models.spec.ts --outputFile=.reports/u2/selected/p01-contracts.json |
| P01 DB | tests/u2/integration/postgres-models.spec.ts, migration-compatibility.spec.ts: 실제 TypeORM/SQL·기존ID·중복 binding/member/effect·expand/backfill/rollback | npm run test:u2:integration -- tests/u2/integration/postgres-models.spec.ts tests/u2/integration/migration-compatibility.spec.ts --outputFile=.reports/u2/selected/p01-postgres-models.json |
| P02 암호/재구성 | tests/u2/unit/purpose-verifier.spec.ts, secret-vault.spec.ts, recovery-payload.spec.ts: entropy형식·candidatebyte결합·AAD/key/purpose·raw표식0 | npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/purpose-verifier.spec.ts tests/u2/unit/secret-vault.spec.ts tests/u2/unit/recovery-payload.spec.ts --outputFile=.reports/u2/selected/p02-purpose-verifier.json |
| P02 저장 | tests/u2/integration/repository.spec.ts, protected-state.spec.ts, secret-lifecycle.spec.ts: 두PG·primary/journal/prefix각fault·no ACK/handle·회수소비/5실패/파기복원 | npm run test:u2:integration -- tests/u2/integration/repository.spec.ts tests/u2/integration/protected-state.spec.ts tests/u2/integration/secret-lifecycle.spec.ts --outputFile=.reports/u2/selected/p02-repository.json |
| P03 권한/범위 | tests/u2/unit/scopes.spec.ts, scope-compatibility.spec.ts, authorization.spec.ts, verified-person.spec.ts:15action/4kind·OR·oldmultiID·NOT_USED/UNSET·다계정같은사람/미확인 | npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/scopes.spec.ts tests/u2/unit/scope-compatibility.spec.ts tests/u2/unit/authorization.spec.ts tests/u2/unit/verified-person.spec.ts --outputFile=.reports/u2/selected/p03-scopes.json |
| P03 현재원본 | tests/u2/integration/authority-race.spec.ts, information-projection.spec.ts: commit직전role회수/fenceCAS·current result/count/error·다른grant보존 | npm run test:u2:integration -- tests/u2/integration/authority-race.spec.ts tests/u2/integration/information-projection.spec.ts --outputFile=.reports/u2/selected/p03-authority-race.json |
| P04 초대/역할 | tests/u2/unit/invitations.spec.ts, memberships.spec.ts, role-revisions.spec.ts, administrator.spec.ts:7일/resend·ACTIVE충돌·selfgrant·admin0허용 | npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/invitations.spec.ts tests/u2/unit/memberships.spec.ts tests/u2/unit/role-revisions.spec.ts tests/u2/unit/administrator.spec.ts --outputFile=.reports/u2/selected/p04-invitations.json |
| P04 동시변경 | tests/u2/integration/invitation-race.spec.ts, membership-role-race.spec.ts, administrator-restoration.spec.ts: accept/revoke·role/org/inviter변경·0admin동시회수·근거없는restore | npm run test:u2:integration -- tests/u2/integration/invitation-race.spec.ts tests/u2/integration/membership-role-race.spec.ts tests/u2/integration/administrator-restoration.spec.ts --outputFile=.reports/u2/selected/p04-invitation-race.json |
| P05 인계 | tests/u2/unit/party-context.spec.ts, handoff.spec.ts, enrollment-authority.spec.ts:16문자/96bit·5분/5실패·별도5분·partysecret/원래case | npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/party-context.spec.ts tests/u2/unit/handoff.spec.ts tests/u2/unit/enrollment-authority.spec.ts --outputFile=.reports/u2/selected/p05-party-context.json |
| P05 소비/복원 | tests/u2/integration/handoff-race.spec.ts, handoff-recovery.spec.ts: 타인의 선행 case·다른 cookie/code만 보유·issuer 회수·동시 claim 단회/5실패·generation fence·retry TTL 고정 | npm run test:u2:integration -- tests/u2/integration/handoff-race.spec.ts tests/u2/integration/handoff-recovery.spec.ts --outputFile=.reports/u2/selected/p05-handoff-race.json |
| P06 복구 | tests/u2/unit/saved-code-recovery.spec.ts, recovery-verification.spec.ts, recovery-hold.spec.ts, emergency-recovery.spec.ts, recovery-completion.spec.ts: password+code/무정기만료·actualpolicy·HOLD/close·완료conjunction | npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/saved-code-recovery.spec.ts tests/u2/unit/recovery-verification.spec.ts tests/u2/unit/recovery-hold.spec.ts tests/u2/unit/emergency-recovery.spec.ts tests/u2/unit/recovery-completion.spec.ts --outputFile=.reports/u2/selected/p06-saved-code-recovery.json |
| P06 통합 | tests/u2/integration/recovery-concurrency.spec.ts, hold-transitions.spec.ts, recovery-completion.spec.ts: 동시code·세대/issuer변경·expiredauthority·새준비와oldUNKNOWN·E01의무vs전달 | npm run test:u2:integration -- tests/u2/integration/recovery-concurrency.spec.ts tests/u2/integration/hold-transitions.spec.ts tests/u2/integration/recovery-completion.spec.ts --outputFile=.reports/u2/selected/p06-recovery-concurrency.json |
| P07 provider/queue | tests/u2/unit/provider-capabilities.spec.ts, identity-worker.spec.ts, mixed-sqs-batch.spec.ts, expired-work.spec.ts: originaltarget/permit·unknownhold·per-envelope·만료controltransition | npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/provider-capabilities.spec.ts tests/u2/unit/identity-worker.spec.ts tests/u2/unit/mixed-sqs-batch.spec.ts tests/u2/unit/expired-work.spec.ts --outputFile=.reports/u2/selected/p07-provider-capabilities.json |
| P07 실제경계 | tests/u2/integration/provider-unknown.spec.ts, worker-boundaries.spec.ts: postpublishexpired 보호상태·normal sibling effect/ACK·poison noACK·lateeffect/재시작 | npm run test:u2:integration -- tests/u2/integration/provider-unknown.spec.ts tests/u2/integration/worker-boundaries.spec.ts --outputFile=.reports/u2/selected/p07-provider-unknown.json |
| P08 API | tests/u2/unit/http-contracts.spec.ts, bff-purpose.spec.ts, resource-budget.spec.ts: runtime closed context·origin/target·cursor/상한/예산 | npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/http-contracts.spec.ts tests/u2/unit/bff-purpose.spec.ts tests/u2/unit/resource-budget.spec.ts --outputFile=.reports/u2/selected/p08-http-contracts.json |
| P08 HTTP | tests/u2/integration/http-identity.spec.ts, http-access.spec.ts, http-primary-ac.spec.ts, runtime-security.spec.ts: private/CSRF/현재purpose·ACassertions·비밀/cache/거절0 | npm run test:u2:integration -- tests/u2/integration/http-identity.spec.ts tests/u2/integration/http-access.spec.ts tests/u2/integration/http-primary-ac.spec.ts tests/u2/integration/runtime-security.spec.ts --outputFile=.reports/u2/selected/p08-http-identity.json |
| P09 React | tests/u2/unit/purpose-ui.spec.tsx, access-state-ui.spec.tsx: 실제result표시·만료/회수·label/focus/키보드·영속secret없음 | npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/purpose-ui.spec.tsx tests/u2/unit/access-state-ui.spec.tsx --outputFile=.reports/u2/selected/p09-purpose-ui.json |
| P09 PC | tests/u2/e2e/invitation-flow.spec.ts, recovery-party.spec.ts, staff-boundary.spec.ts: owninvite→accept·verifiedparty→claim→MFA·staffprivate1280 | npm run test:u2:e2e |
| P10 설정/보고서 | tests/u2/unit/infrastructure.spec.ts, ci-report-gates.spec.ts, coverage-aggregate.spec.ts: worker exactIAM/API deny·realactivation false·보고서 누락/digest 불일치·coverage line 합집합/중복·전체 inventory80% gate | npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/infrastructure.spec.ts tests/u2/unit/ci-report-gates.spec.ts tests/u2/unit/coverage-aggregate.spec.ts --outputFile=.reports/u2/selected/p10-infrastructure.json |

React 시험은 jsdom project/environment를 명시하며 DB integration과 혼합하지 않는다. integration은 모델·owner·registry·실제HTTP·두PG를 사용한다. authorization/protected transaction 자체를 항상allow/success하는 mock으로 바꾸지 않는다. provider SDK double·local ingress proof는 합성 출처로 표시한다.

## 출력 격리 추가 검증

scripts/u2/run-u1-regression.ts는 재승인 후 구현한다. 등록된 정확 경로 외 glob/전체suite·../·다른 repo·output 경로/모드/임의 reporter override를 거절한다. 실행별 고유 U2 output과 원래 U1 default report before/after byte hash를 기록한다. 같은 report-key로도 이전 실행/실패 증거를 덮어쓰지 않는다. 호출 실패/보고서 누락·skip·원래 report 변형은 실패이며, 원본을 새 성공 결과로 자동 복구하지 않는다. 모드별 기존 준비/admission 조건을 지키고 새로운 U1 baseline/대량측정 DB reset은 추가하지 않는다.

```bash
npx vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/u1-regression-output.spec.ts --outputFile=.reports/u2/selected/p00-u1-regression-output.json
node --import tsx scripts/u2/run-u1-regression.ts unit --report-key p06-identity -- tests/u1/unit/identity.spec.ts tests/u1/unit/identity-browser.spec.ts
```

이 추가 wrapper 시험은 forced reporter/output 전파, 정확 대상 허용/비정상 경로 거절, U1 default output 불변, 실패/미생성/skip/no-test 차단, report-key 재사용 시 증거 보존을 검증한다. P06 연결 뒤 위 identity 두 파일 회귀를 현재 source로 재수집하며 과거16/16 파일의 복구로 부르지 않는다.

## 필수 부정·동시·호환 fixture

- HMAC: 같은 metadata/키에 candidate secret 한byte만변경→실패; 다른 purpose/target/account/binding/security/keyVersion→실패.16문자base64url 정확12bytes·재encoding, 비정규/다른길이/trim/casefold 거절. rawsecret oracle는 메모리에만·log/Outbox/journal/browserstorage/trace에 표식0.
- 인계: 공격자가 먼저 case를 생성해도 실제 본인 확인의 새 party context로 당사자에게만 코드를 인계한다. 익명 요청자/Receipt/case ID/status/code 단독·다른 party/case/challenge·확인자 권한 회수는 거절한다. now=expiry-1ms/expiry/+1ms, 오류1–5/6·동시5실패/claim·claim 후 별도5분·retry TTL 불변을 확인한다.
- 초대: exactlyissued+7×24h·재발송기한불변/tokenrotation·24h raw파기·inviter role/org/contact revisions 변경·없는membership/create·INACTIVE intent·ACTIVE덮기금지·accept/revoke동시 단일effect.
- scope:2기업×서울/부산×IT/총무×15action×4kind×USED/NOT_USED/UNSET·retired원래문맥×구/신profile의 finite Cartesian fixture로 **대상별 기대허용집합** 비교. scope행의 축끼리 곱집합을 생성하지 않음. businessID/정책모호한 legacy는보류.
- 복구: savedcode 정기만료없음·used/reissued/revoked/invalidbinding 거절,password없음 manual 확인→당사자claim→허가된password교체→newTOTP/backupack, ResourceNotFound/probe/lateolddelete 종료증명없음HOLD. 같은account실행slot/oldsubject/currentgeneration·새BUSINESS재로그인.
- HOLD/restore: 부족근거→현재보완→예상개정/기한/currentauthority→resume/apply 또는close+linkednewsource. 이전authority되살림/expireddeadline연장/oldUNKNOWN삭제금지.두마지막admin동시0·기업이용/다른grant 유지.
- U1 회귀: 신뢰된 봉투와 원래 작업을 대조한 PUBLISHED 만료 Work는 업무 effect 없이 보호된 REVIEW_REQUIRED/HOLD로 기록하고 원래 ID/deadline/이력을 남긴다. ACK를 만들어내지 않는다. valid+malformed JSON/missing attribute/invalid schema batch에서 정상 siblings effect/ACK는 계속하고, invalid는 no-success-ACK와 원래 receive/redrive 사실을 보존한다.
- fault: PRIMARY_COMMITTED/JOURNAL_PROTECTED/VISIBILITY_UPDATED 각각 중단·journalgap/conflict·응답유실/재시도·새epoch/rollback/restore. independentACK목록과최신소비/회수/5실패/폐기/UNKNOWN 비교·부활/누락/중복0. 보호payload replay는 원래provider effect 재호출이 아님.

위 모든 fixture는 실제 타인·고객데이터가 아닌 합성이다. fake clock은 경계unit시험, 실제DB concurrency는 barrier로 commit순서/원본개정 대조한다. 시간지연만으로 경합통과를 추정하지 않는다.

## 회귀와 coverage 분모

P07 공유queue·기한 보완 뒤 관련 기존 정확명령:

```bash
node --import tsx scripts/u2/run-u1-regression.ts unit --report-key p07-worker -- tests/u1/unit/worker-batch.spec.ts tests/u1/unit/adapters.spec.ts tests/u1/unit/worker.spec.ts
node --import tsx scripts/u2/run-u1-regression.ts integration --report-key p07-business -- tests/u1/integration/business-flow.spec.ts tests/u1/integration/http-boundaries.spec.ts tests/u1/integration/recovery.spec.ts
npm run test:u2:unit
npm run test:u2:integration
npm run test:u2:coverage
```

tests/u2/vitest.coverage.config.ts는 **U2 unit/integration만** 실행한다. 전체 제품 inventory에 대한 실행 기여 근거를 수집하되 이 부분 report만으로 전체80% 통과를 선언하지 않는다. U2 기여의 executable/covered line set·현재 source SHA/파일별 content hash·lock/schema/config/도구/형식 버전을 보고한다. 기존 U1 전체 suite를 U2 coverage runner에 넣지 않는다.

현재 전체 제품 source의80% 하한은 [project-validation](code-generation-plan.md#project-validation)의 scripts/u2/coverage-aggregate.ts와 release gate가 판정한다. 같은 current source identity에서 별도 수집한 U1·U2의 실행 라인을 파일별로 합집합하며, 겹친 파일/라인을 중복 계수하지 않는다. U1 변경 전 baseline/과거80.73%/보존된 측정 report는 최종 입력으로 재사용하지 않는다. 전체 suite의 수집/집계 명령은 이 단위 지침에 두지 않는다.

전체 분모는 apps/**/*.{ts,tsx,js,mjs,cjs}·packages/**/src/**/*.{ts,tsx,js,mjs,cjs}·infra/cdk/**/*.ts·scripts/u1와 scripts/u2의 직접 작성한 테스트 가능한 제품 source 전체다. 미실행 파일은0실행 분모로 남긴다. d.ts·외부/생성물의 제외 근거를 기록하며, coverage가 낮다는 이유로 자체 wrapper/script/TSX/CDK 파일을 제외하지 않는다. 미실행 파일 포함·겹친 실행라인/파일 합집합·누락/stale/mismatched source/lock/inventory/line mapping·전체80% 경계는 tests/u2/unit/coverage-aggregate.spec.ts에서 구현 뒤 시험한다.

집계 교환 형식은 V8 provider가 source map을 적용해 내보내는 Istanbul coverage-final.json의 파일별 statementMap/s/fnMap/f/branchMap/b와 별도 provenance manifest다. 현재 runner의 실제 JSON export·같은 source map/line 변환·형식 버전 지원을 관련 코드 전에 고정하고 fixture로 검증한다. unsupported·같은 파일의 statement/line map 불일치는 차단한다. raw V8 중간 결과나 요약 percentages를 평균/합산해 전체 coverage를 만들지 않는다. 누락/stale 입력·inventory mismatch·중복 line count·파일 누락·전체80% 미달은 집계/release 차단이다. 기존 U1 runner의 정의된 하한을 수정/비활성하지 않고 전체 현재80%도 유지한다.

## 필수 보안·성능·복원·보고서

기존 도구를 유지한다. security:u2는 고정 TS/Node Semgrep 규칙으로 apps/packages/infra/cdk/scripts/u1+u2를 검사하고, 실제 lock의 npm audit·Trivy root 비밀 검사·현재 합성 CDK template·동일 image digest의 OS/library 검사·격리 runtime 공격 시험을 연결한다. scanner/규칙 digest 미지원·오류/누락·취약점/비밀/SAST 발견을 PASS로 표시하지 않는다. dependency/SAST/secret는 기존0발견 차단, IaC actionable HIGH/CRITICAL 및 image HIGH/CRITICAL 차단을 유지한다. 기존 context-aware 분류는 같은 template로 검증하며 예외를 자동 생성하지 않는다.

실행 runtime 검사는 CSRF/origin·잘못된 purpose/target·만료/current fence·SQL filter injection·XSS escape/no-store·직원의 public/direct API/위조 ingress·비밀 누출·자원 고갈·handoff/초대 공격을 실제 local HTTP/BFF에서 수행한다. 정적 scanner만으로 대체하지 않는다. 실제 권위/계정/신원 정책·회사망/국내 경로 미확인은 계속 HOLD다.

예정 U2 단위 검증 명령이다. 각 runner의 정확한 tests/u2 범위와 U2 fixture/source identity를 확인한다. 전체 scanner·build·synth·coverage 집계·release 명령은 [project-validation](code-generation-plan.md#project-validation)에서 한 current source당 한 번 실행한다.

```bash
npm run test:u2:unit
npm run test:u2:integration
npm run test:u2:e2e
npm run test:u2:coverage
npm run test:u2:runtime-security
npm run test:u2:performance
npm run test:u2:recovery
```

동일4role 제품 image의 local build·digest/platform/source 확인·전체 보안 scanner 실행은 project-validation 책임이다. U2 runtime-security는 위 tests/u2/integration/runtime-security.spec.ts의 정확한 범위에서 실행한다. 원문 취약 결과·합성 DB credentials를 CI artifact로 업로드하지 않으며 project release gate는 동일 image와 U2 runtime 증거를 대조한다.

성능은 계획 P10과 docs/u2/runtime-profile.json의 u2-pilot-v1 한 정의로 검증한다. 고객사10곳·일주문1000은 첫 버전 계획 목표이고, 누적주문10000(목표10일분)·상품1000·고객계정100·내부계정10·동시20 및 정상5req/s5분→집중20req/s1분→정상5req/s2분 내 회복/2분 유지(총10분)는 승인된 합성 검증 가정이다. 읽기80/변경20·평균5/시험최대50품목을 유지한다. 고정 seed·단계/경로/원래 request ID·허용/거절/최초 실패와 provider/current auth/primary/journal을 포함한 client 송신→본문 수신 시간을 기록한다. 읽기p95≤1s/변경≤2s/유효 기술 오류≤0.1%, 실행 가능 작업의 first-start≤10s를 실제 집계한다. 요청률은 일주문량과 같지 않으며 서비스 상한이 아니다. 기존100000주문·50분은 docs/u2/pilot-verification-change.md에 후속 확장 검증으로 남기고 첫 버전 완료 gate에서 분리한다. 과거 FAIL/미실행/OPEN을 성공으로 재분류하지 않는다.

복원은 같은 u2-pilot-v1 규모의 실제 DB 원본과 independent ACK를 사용하여 local process/논리 손상/두 PG 경계의 t0→현재 보안 검증·fresh MFA·실제 HTTP 허용 조회까지30분/RPO0과 소비·회수/epoch를 비교한다. 실제 AWS/AZ/RTO30분·30일99.9%·실제1인 운영/Slack/email 수신·전체 WCAG/브라우저 통과는 이 합성 결과로 종결하지 않는다.

U2 단위 실행의 보고서 경로는 .reports/u2/unit.json·integration.json·coverage.json·coverage/coverage-final.json·coverage/coverage-summary.json·coverage/lcov.info·e2e.json·runtime-security.json·performance.json·recovery.json이다. 전체 check.json·security.json·security-policy.json·release-validation.json과 .reports/project/coverage-aggregate.json은 project-validation이 만드는 별도 근거다. 현재 source/lock/model/schema/config/image/tool/fixture digest·실행 시각/범위·failure/skip/미실행을 묶는다. 기존 U1 보존 측정 원본을 수정하지 않고 새 namespace에 기록한다. 선택 시험/실패 로그와 단위 전체 run·프로젝트 최종 gate를 구분한다.

## 수락 추적·실패 처리·후속 인계

주 책임26AC는 assertion을 해당 AC별로 연결하고 정상/실패/경계·동시/재시도·UI 협력/실제 미확인을 구별한다. 특히 AC1.3.4의 과거 mobile 문구는 최신 PC1280 첫 버전 정책을 함께 기록하며 mobile 구현 완료로 부르지 않는다.43NFR/31BR와 협력201AC 전체는 상위 trace에서 정확한 ID/소유자를 상속한다.

검사 실패/미실행/보고서 누락이면 관련 merge/release를 보류하고 개발자 본인이 원인과 처리를 보고한다. flaky 시험을 반복해 우연한 통과를 선택하거나 coverage/기한/보안 하한을 낮추지 않는다. 새 실패를 해결한 뒤 관련 회귀를 실행하고 실패 원문/현재 source와 연결한다. 예외는 실제 담당·사유·만료·재검토를 기록하고, 비밀 노출은 폐기/교체·사용/영향/로그/backup 확인으로 처리한다. 비밀 원문을 evidence에 복제하지 않는다.

후속 Build and Test는 이미 작성/실행한 시험을 검증·확장한다. 전체 AC/UI·실제 provider/SQS·현재 회수와 업무 owner commit·실통지/회사망·국내/운영 실증은 해당 owner에게 남긴다. 과거 finding 해소/위험 수용은 시험 계획 문서만으로 기록하지 않는다.

## Sources

[code-generation-plan.md](code-generation-plan.md)의 Testing Contract와 P00–P11, SD01–12/SV01–08·LC02–09·IP01–08 및 기능 trace가 시험 원본이다. 기존 실제 명령/설정은 package.json·tests/u1/vitest.*.config.ts·playwright.config.ts·scripts/u1/check.ts/security.ts·.github/workflows/u1-validation.yml을 읽어 대조했다. 등록·실행한 U2 runner/config/시험/명령의 실제 source별 결과는 code-summary.md와 원래 receipt를 따른다. 미실행 DR/release·실제 외부 검증을 통과로 표현하지 않는다. 프로젝트 전체 검증의 명령·집계 책임은 [계획의 project-validation](code-generation-plan.md#project-validation)과 향후 docs/u2/verification.md에 있다.

## 첫 배포와 후속 검증의 구분 — 2026-10-11

사용자가 “제안 범위로 확정”으로 답한 [첫 배포 범위](../../../release-planning/first-release-scope-proposal.md)·[첫 배포 실행 계획](../../../release-planning/first-release-delivery-plan.md)을 적용한다. 고객사10곳 이내 제한 파일럿에서 필요한 접근/관리·MFA·복구 경계는 유지하고 고급 관리 UI/대량 편의는 후속이다. 원본26주책임AC/협력201AC 전체의 완료와 첫 배포 적용 부분을 구별한다.

기존10분 측정 시간 하한 FAIL의 재실행·100k/50분 확장·재해 RTO30분/RPO0 실증은 후속이다. 위 기존 수집 명령/targets는 원래 검증과 후속 재개 지침이며 현재 자동 실행 또는 첫 배포 필수 장기 묶음으로 해석하지 않는다. 짧은 지원 경로 종합 검증의 정확 규모/기간은 후속 설계 전 미정이다. 전체80%/미실행분모·필수 보안·권한/정확성/ACK 조건을 낮추거나 과거 FAIL/미실행을 PASS로 바꾸지 않는다. 이번 수정은 문서 연결만이며 제품/시험/DB/collector를 재개하지 않는다.
