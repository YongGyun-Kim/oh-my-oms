# U3 repository·접수 명령 검증 기록

승인 계획 Step 7–8에서 현재 근거·권한 재검증, 같은 primary의 업무 변경/이력/접수/fact 및 최소 work/outbox, 별도 보호 확인을 연결하는 repository와 명령 경로를 구현했다. 최초 실행의 통합 검사는 fixture 준비에서 실패했으므로 실제 저장·장애·경쟁 시나리오를 검증 완료로 표시하지 않는다. Step 9 상품 업무 구현은 수정 후 검사까지 보류한다.

## 최초 검사 소스

- HEAD: `a2d43f86ebb4512c7d0faf60e9aa84f0ed4e600c`
- runtimeSourceIdentity digest: `4346238570c27ca658e2bf04a8230194e1e2501913dd39f53065c2b827f88531`
- 기존 Node `v22.23.3` / npm `10.9.9`; source 쓰기를 정지하고 Luna가 순차 검사했다.

## 결과

| 검사 | 종료 코드 | 결과 |
| --- | --- | --- |
| TypeScript noEmit | 2 | `repository-boundaries.spec.ts:522:22` TS2353: 입력 타입 `{ meta: CommandMeta; }`에 `targetScope`가 없음 |
| 현재 U3 단위 | 0 | 5개 파일 / 98개 통과 / skip 0; `.reports/u3/repository-unit.json` |
| 격리 U3 DB 준비 | 0 | 별도 합성 DB 준비; 기존 소유자 DB 미초기화 |
| repository 통합 | 1 | 1개 파일 / 0 통과 / 22 실패 / skip 0; `.reports/u3/repository-integration.json` |
| 지정 ESLint | 0 | 진단 없음 |

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts --outputFile=.reports/u3/repository-unit.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH node --import tsx scripts/u3/prepare-test-databases.ts
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/repository-boundaries.spec.ts --outputFile=.reports/u3/repository-integration.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint packages/persistence/src/u3-repository.ts packages/persistence/src/index.ts packages/core/src/u3-commands.ts packages/core/src/index.ts packages/core/src/pending-notification.ts tests/u3/fixtures/command-authority.ts tests/u3/unit/repository.spec.ts tests/u3/integration/repository-boundaries.spec.ts
```

## 실패 조사 경계

통합 22개는 공통 fixture의 `StaffRole` 기록 단계(`command-authority.ts:38`)에서 `INVALID_INPUT`으로 실패했다. `model-attribute.ts`의 현재 StaffActionList는 기존 9개 action만 허용하며, 새 fixture에는 U3의 `order.decide`·`contract.register`가 포함되어 있다. U3 작업 선언에도 `contract.register/approve/propose`가 있다. 이 차이가 실제 현재 권한 등록 경로의 누락인지 shared C01 및 역할 관리 계약을 함께 확인하도록 개발자에게 요청했다. 등록된 권한 카탈로그·허용 actor/대상 검증을 삭제하거나 아무 문자열을 허용하지 않는다.

입력 타입 오류도 지원하는 실제 U3 data 구조와 API를 대조하여 수정한다. 의도적인 무효 입력 시험과 정상 업무 입력 타입을 구분하며 cast로 구현 타입 오류를 숨기지 않는다. 실패한 명령을 같은 source에서 그대로 반복하지 않았다.

## 검증되지 않은 것

실제 권한 자료나 계약·금액·외부 사실의 신뢰를 이 합성 검사로 입증하지 않는다. 실제 rollback/보호 장애/예산/응답 유실/동일 key 경쟁/개정·epoch 검사는 fixture 수정 후 통합 시험이 실행되어야 판단할 수 있다. HTTP/worker 전체 v3 binding은 Step 15의 후속 작업이다. 전체 제품 커버리지 80%, 공식 Construction 체크포인트, 기존 U2 Major 해소 및 실제 AWS 배포도 완료로 표시하지 않는다.

## 근본 수정과 호환 경계

조사에서 단순 fixture 오타뿐 아니라 실제 U3 권한 등록의 누락을 확인했다. 구형 C00/StaffAccess/StaffActionList의 9개와 U2 역할 상태의 12개 폐쇄 목록에는 U3 registry의 계약 등록·승인·제안 및 주문 판단·변경 적용 행위 5개가 없었다.

구형 URI나 역할 목록의 의미를 변경하지 않고 U3 profile에 정확한 17개 직원 행위와 C01 역할 관리 계약을 추가했다. `U3_MODELS` 업무 18개와 별개로 `U3_SUPPORT_MODELS`의 StaffRole/RoleRevisionState 2개를 명시 modelVersion 2 및 필수 SourceContract로 등록한다. 실제 RecoveryRow·decoder도 버전 2이며 새 sourceContract 표시만으로 모델 1 의미를 확장하지 않는다. 기존 물리 이름 집합은 75개로 유지한다.

구형 StaffRole의 minItems 1과 U2 역할 상태의 12개 decoder는 유지한다. 빈 구형 행위 투영은 새 support model 2에서만 허용하며, 현재 RoleRevisionState 2가 누락되면 새 권한을 되살리지 않는다. 구형 역할 1의 자동 개정도 기존 upgrade 차단을 유지한다. 신규 profile 역할 등록 후 기존 grant/revoke 연결이 최초 지원 경로다.

U3StaffAccess는 기존 API 프로세스 내부 C01 역할 관리 서비스다. 새 인프라 서비스·주체·사업 역할을 자동 생성하지 않는다. 등록·개정·조회·비활성의 실제 명령 경로를 구현하고 기존 grant/revoke를 fixture에 연결했다. 이 역할 권한은 두 사람이라는 확인 근거를 생성하지 않는다. 원래 U2 Major 두 건과 실제 운영 선행조건은 별도로 유지한다.

U3Commands의 `run`은 실제 요청 구조를 받는 generic 타입으로 수정했으며 registry의 폐쇄 runtime 검증은 유지한다. C01 v3 HTTP binding은 Step 15에서 반드시 연결해야 한다. 수정 후 source 쓰기를 멈추고 별도 보고서로 단위·통합·타입·lint 재검사를 진행한다. 결과가 나오기 전 Step 7–8을 완료로 표시하지 않는다.

## 역할 보완 후 검사와 시험 SQL 수정

제품 source identity digest는 `378c3443f1b2226b10baa255fa4a5e9c3b322095a025ba981873a216481715a3`, HEAD는 최초와 같다. 별도 Luna 검사에서 TypeScript·지정 ESLint·격리 DB 준비가 종료 코드 0이었으며 단위 6개 파일 / 106개 통과 / skip 0이었다(`.reports/u3/repository-role-unit.json`).

첫 전체 U3 통합은 3개 파일 / 38개 통과 / 4개 실패 / skip 0이었다(`.reports/u3/repository-role-integration.json`). 네 실패 모두 시험에서 보호 테이블에 존재하지 않는 `request_id` 컬럼을 조회한 결과다. 보호 원장의 실제 키 `(epoch, commit_order)`는 유지하고 시험 helper에서 primary 후보의 request ID와 보호 payload의 requestId를 읽도록 수정했다. 단일 보호 기록·typed decode·순번·digest·previous digest·원본 bytes 및 양쪽 prefix를 대조한다. 제품 코드와 DDL은 이 수정에서 변경하지 않았다.

수정 후 Luna 순차 검사와 원본 보고서 count 확인 결과:

| 검사 | 종료 코드 | 결과 |
| --- | --- | --- |
| TypeScript noEmit | 0 | 진단 없음 |
| 전체 U3 통합 | 0 | 3개 파일 / 42개 통과 / skip 0; `.reports/u3/repository-role-integration-final.json` |
| 수정 시험 3개 파일 ESLint | 0 | 진단 없음 |

통합 42개는 repository 22개, staff role 10개, migration 10개다. 이전 실패 보고서는 보존한다. 제품 source는 위 역할 보완 검사와 동일하다. 기존 U1/U2 영향 회귀는 현재 source에서 별도로 확인한 뒤 이 구간을 완료한다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts --outputFile=.reports/u3/repository-role-integration-final.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint tests/u3/fixtures/protected-candidate.ts tests/u3/integration/repository-boundaries.spec.ts tests/u3/integration/staff-role-boundaries.spec.ts
```

## 현재 source의 U1/U2 영향 검사

Luna의 선택 단위 검사는 U1 9개 파일 / 85개 통과, U2 8개 파일 / 80개 통과로 모두 종료 코드 0·skip 0이었다. 각각 `.reports/u3/role-support-u1-unit-regression.json`, `.reports/u3/role-support-u2-unit-regression.json`의 실제 count와 success를 확인했다.

U1 전체 통합은 13개 파일 / 167개 통과 / 1개 실패 / skip 0, 종료 코드 1이었다(`.reports/u3/role-support-u1-integration-regression.json`). 실패는 `recovery-security.spec.ts`의 미보호 직원 grant 회수 시나리오다. 새 역할 물리 필드를 추가한 뒤 synthetic security collector가 구형 역할의 `modelVersion:null`·`sourceContract:null`을 논리 원본에 포함했다. 엄격한 모델 판정이 그 잘못된 구형 after-image를 거절했다. collector를 등록 버전별 검증된 `storedModelData` 논리 투영과 일치시키는 수정을 제안했다. 비정상 metadata 혼합이나 model2 필드를 제거해 통과시키지 않는다.

조사 중 새 model2 역할의 실제 `writeRecoveredSecurityTransition`이 SourceContract를 execute 및 Receipt에 전달하지 않는 호환 누락도 확인했다. 현재 원본의 검증된 계약 metadata만 조건부 전달하고 구형 경로와 `recoverySecurityChangeAllowed`의 엄격 대조는 유지하는 수정·회귀가 필요하다. 아직 이 조사 자체를 수정 완료나 재해 복구 실증으로 기록하지 않는다.

U2 전체 통합 최종 결과는 21개 파일 / 274개 통과 / skip 0·종료 코드 0이었다(`.reports/u3/role-support-u2-integration-regression.json`). 원본 JSON도 실패·pending 0·success true를 확인했다. Vitest JSON의 suite 수는 중첩 describe를 포함하므로 콘솔의 Test Files 수와 구분한다. U1 실패를 보존하고 관련 수정 뒤 현재 source의 별도 보고서로 회귀한다.

이번 영향 검사 명령:

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u1/vitest.unit.config.ts tests/u1/unit/models.spec.ts tests/u1/unit/model-snapshots.spec.ts tests/u1/unit/recovery-payload.spec.ts tests/u1/unit/security-state.spec.ts tests/u1/unit/notice-source.spec.ts tests/u1/unit/worker.spec.ts tests/u1/unit/worker-batch.spec.ts tests/u1/unit/enterprise-access.spec.ts tests/u1/unit/contracts.spec.ts --outputFile=.reports/u3/role-support-u1-unit-regression.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/models.spec.ts tests/u2/unit/authorization.spec.ts tests/u2/unit/role-revisions.spec.ts tests/u2/unit/recovery-payload.spec.ts tests/u2/unit/scope-compatibility.spec.ts tests/u2/unit/expired-work.spec.ts tests/u2/unit/identity-worker.spec.ts tests/u2/unit/contracts.spec.ts --outputFile=.reports/u3/role-support-u2-unit-regression.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U1_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u1/vitest.integration.config.ts --outputFile=.reports/u3/role-support-u1-integration-regression.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U2_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u2/vitest.integration.config.ts --outputFile=.reports/u3/role-support-u2-integration-regression.json
```

## 복구 호환 수정 후 검사

collector 논리 투영과 실제 recovery-security-write의 계약 버전 보존을 수정했다. 원본/변경 모델은 둘 다 검증하고 버전 변경은 거절한다. 새 model2의 검증된 SourceContract는 실제 execute와 Receipt에 보존하며 구형 요청에 새 metadata를 추정하지 않는다. 기존 legacy 회수 시험은 변경하지 않았다.

검사 source digest는 `2ac74a91a339ebb73e15ab09193ce696ebeda4e4b50041691e603f18b9151576`, HEAD는 `a2d43f86ebb4512c7d0faf60e9aa84f0ed4e600c`다. Luna가 source 쓰기 정지 상태에서 실행했다.

| 검사 | 종료 코드 | 결과 / 보고서 |
| --- | --- | --- |
| TypeScript noEmit | 2 | 새 통합 시험 179–180행에서 negative 원본 객체에 modelVersion/sourceContract 키가 없다는 TS2339 두 건 |
| 전체 U3 단위 | 0 | 7개 파일 / 113개 통과 / skip 0; `recovery-role-unit.json` |
| 전체 U3 통합 | 1 | 4개 파일 / 42개 통과 / 3개 실패 / skip 0; `recovery-role-integration.json` |
| 선택 U1 복구 회귀 | 0 | 3개 파일 / 34개 통과 / skip 0; `recovery-role-u1-selected-regression.json` |
| 선택 U2 복구 회귀 | 0 | 3개 파일 / 52개 통과 / skip 0; `recovery-role-u2-selected-regression.json` |
| 수정 코드/시험 ESLint | 0 | 진단 없음 |

보고서는 `.reports/u3/`에 있다. U3 새 통합 세 건은 `recovery-security.ts:126`의 RecoverySecurityObservation 계약 검증에서 INVALID_INPUT으로 실패했다. 타입 오류는 negative 원본을 실제 ModelData로 명시해 수정했다. 기존 통합 42개 성공과 새 세 건의 실패를 구분하며 Step 7–8은 미완료로 유지한다.

관측 오류의 직접 원인은 currentData의 model2 필드가 아니었다. foundation:1의 observation.model 폐쇄 목록은 U1 보안 14개인데 실제 복구 대상으로 등록된 목록에는 U2 보안 모델도 포함되어 있다. U3 fixture의 AccountSecurityState·RecoveryCodeSecurityState·RoleRevisionState 전체 관측이 그 계약에서 거절됐다. 선택 U2 회귀 52개는 이 전체 관측 경로의 지원 증거가 아니다.

구형 foundation:1의 계약·기본 해석을 보존하고, 서버에 명시 등록하는 새 U3 관측 계약을 별도로 연결한다. 현재 등록 보안 모델만 허용하고 관측 버전·계약 metadata 및 본문의 실제 모델 버전을 대조한다. 요청이나 관측 본문의 marker가 decoder를 선택하게 하지 않는다. 기존 owner/checkId/개정/최신성/권한 확대 금지/봉인 대조는 유지한다. 구현과 새 negative 및 실제 재연 시험 결과는 이후 기록한다.

## 관측 버전 보완 검증

새 RecoverySecurityObservation은 U3 profile에 observationVersion 2, 등록 SourceContract 및 실제 모델 버전 1/2를 구분하여 선언했다. 기존 14개 foundation 목록·기본 출력·bytes는 유지했다. 서버에 등록된 authority의 관측 profile을 복구 시작에서 한 번 고정하고, 미등록·잘못된 profile 및 출력 marker에서의 decoder 선택은 허용하지 않는다. 새 profile은 현재 등록 보안 37개 모델만 허용하며 owner/본문의 버전·ID·개정을 확인한다. 실제 운영 owner 등록이나 전체 재해 복구 검증을 추가하지 않았다.

현재 source digest `fa13c177bf289623ee1d32c86df432e6d53551e6375215f2d54f9457c1aa426b`, HEAD `a2d43f86ebb4512c7d0faf60e9aa84f0ed4e600c`에서 Luna가 쓰기 정지 후 실행했다. 원본 JSON count/success도 확인했다.

| 검사 | 종료 코드 | 결과 / `.reports/u3/` 보고서 |
| --- | --- | --- |
| TypeScript noEmit | 0 | 진단 없음 |
| 전체 U3 단위 | 0 | 8개 파일 / 124개 통과 / skip 0; `recovery-observation-v2-unit.json` |
| 새 역할 복구 통합 | 0 | 1개 파일 / 3개 통과 / skip 0; `recovery-observation-v2-integration.json` |
| 선택 U1 복구 회귀 | 0 | 3개 파일 / 34개 통과 / skip 0; `recovery-observation-v2-u1-regression.json` |
| 수정 코드/시험 ESLint | 0 | 진단 없음 |

시험은 구형 계약 bytes 보존, 미등록/잘못된 profile, 구형 profile에 신형 원본 주입, marker·owner·대상·개정·계약 metadata 불일치를 거절한다. 통합의 정상 취소 적용·같은 후보 재보호·버전 하향 거절 세 건도 통과했다. 기존 통합 42개를 현재 source에서 포함한 전체 U3 결과는 다음 검사로 별도 확인한다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts --outputFile=.reports/u3/recovery-observation-v2-unit.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/recovery-role-source.spec.ts --outputFile=.reports/u3/recovery-observation-v2-integration.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U1_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u1/vitest.integration.config.ts tests/u1/integration/recovery-security.spec.ts tests/u1/integration/recovery-replay.spec.ts tests/u1/integration/recovery.spec.ts --outputFile=.reports/u3/recovery-observation-v2-u1-regression.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint packages/persistence/src/recovery-security-observation.ts packages/persistence/src/recovery-security.ts packages/persistence/src/index.ts tests/u1/fixtures/recovery-security-oracle.ts tests/u3/unit/recovery-observation-profile.spec.ts tests/u3/integration/recovery-role-source.spec.ts
```

현재 source의 전체 U3 통합 최종 결과도 종료 코드 0, 4개 파일 / 45개 통과 / skip 0이었다. `.reports/u3/repository-completion-integration.json`의 실제 JSON은 45 total/passed, failed/pending 0, success true다. repository 22개·역할 10개·migration 10개·복구 3개를 같은 source의 한 실행으로 확인했다. 제품/시험 diff의 공백 검사도 통과했다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts --outputFile=.reports/u3/repository-completion-integration.json
```

이 결과로 승인 계획 Step 7–8의 구현과 로컬 시험을 마무리한다. HTTP의 실제 v3 역할/업무 binding, 상품·계약·주문 업무, 전체 제품 커버리지·CI·최종 리뷰는 후속 단계다. 이전 실패·기존 U2 미해결 Major 및 실제 운영 선행조건은 이 시험으로 해소된 것으로 바꾸지 않는다.
