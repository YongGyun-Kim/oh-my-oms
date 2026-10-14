# U3 저장 모델·migration 검증 기록

승인 계획 Step 5–6의 구현 후 Luna 검사를 시간순으로 기록한다. 최초 실행은 통합 검사가 시작하지 못한 **미완료 결과**였고, 실패·원인·수정 후 검사를 아래에 보존했다. 최신 판정은 마지막 절의 검사 범위에 한정한다.

## 최초 실행

- HEAD: `d742d923f42abd0fd592b7d89d475597eac258d2`
- 변경 제품 소스를 포함한 runtimeSourceIdentity digest: `7d5eb5ac23f85374b34782169eaa99fa642547c4347d1f6dc512ae306abd3fb1`
- Node `v22.23.3`, npm `10.9.9`, 기존 의존성 사용.
- source 쓰기를 정지하고 아래 순서로 실행했다. 실패 명령을 그대로 반복하지 않았다.

| 검사 | 종료 코드 | 결과 |
| --- | --- | --- |
| TypeScript noEmit | 0 | 진단 없음 |
| 현재 U3 단위 전체 | 0 | 4개 파일 / 86개 통과 / skip 0; `.reports/u3/unit.json` 갱신 |
| 격리 U3 DB 준비 | 0 | 전용 합성 DB 준비; 다른 소유자 DB 초기화 없음 |
| U3 migration integration | 1 | 설정 로드 실패; 실행된 테스트 파일/사례 없음 |
| 지정 ESLint | 0 | 진단 없음 |

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH node --import tsx scripts/u3/prepare-test-databases.ts
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/migration-compatibility.spec.ts
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint packages/persistence/src tests/u3 scripts/u3
```

## 실패 경계와 조사

오류는 `ERR_MODULE_NOT_FOUND`: `packages/persistence/src/index.ts`가 import한 `packages/persistence/src/model-catalog.js`를 설정 로드 중 찾지 못했다. 아직 DB migration의 성공/실패를 검사한 결과가 아니다.

정적 대조에서 U3 integration/coverage 설정이 profile guard를 가져오면서 `fixtures/databases.ts`의 `@oms/persistence` 제품 모듈까지 설정 로드에 포함하는 점을 확인했다. 기존 U1/U2 integration 설정에는 이 제품 모듈 import가 없다. 이 경계에 대한 최소 수정과 변경 후 재검증을 개발자에게 요청했다. profile 및 실제 DB namespace/loopback 보호를 완화하거나 `.js` 생성물을 만들어 우회하지 않는다.

## 아직 남은 증거

실제 DDL/권한·구형/신형 모델 읽기·보호 payload 1/2 및 mixed commit·원상 재연은 통합 검사가 실행되어야 판단할 수 있다. 단위 86개 통과는 전체 제품 커버리지 80%, 공식 Construction 체크포인트, U3 전체 완료 또는 기존 U2 Major 해결의 증거가 아니다. 장시간 부하·재해 복구·실제 AWS 배포도 실행하지 않았다.

## 설정 로드 수정 후 재검증

무의존 `tests/u3/fixtures/profile.ts`로 profile guard를 분리하고 `databases.ts`에서 같은 함수를 re-export했다. integration/coverage 설정은 이 가벼운 모듈을 직접 사용한다. 실제 DB profile·namespace·loopback·port·synchronize 검증은 유지했다. 생성된 `.js`를 추가하거나 검증을 완화하지 않았다.

변경 후 Luna가 아래 네 명령을 순차 실행했고 모두 종료 코드 0이었다. runtimeSourceIdentity는 위 `7d5eb5...`와 동일했다. 이번 수정은 제품 소스 밖의 fixture/config 경계다.

| 검사 | 결과 |
| --- | --- |
| migration-compatibility integration | 1개 파일 / 10개 통과 / skip 0; `.reports/u3/integration.json` |
| coverage 설정 load smoke | 1개 파일 / 6개 통과 / skip 0; `.reports/u3/coverage.json`; **coverage 측정 아님** |
| TypeScript noEmit | 진단 없음 |
| 수정한 fixture/config ESLint | 진단 없음 |

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/migration-compatibility.spec.ts
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.coverage.config.ts tests/u3/unit/fixture-boundaries.spec.ts
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint tests/u3/fixtures/profile.ts tests/u3/fixtures/databases.ts tests/u3/vitest.integration.config.ts tests/u3/vitest.coverage.config.ts
```

실제 통합 테스트가 실행되어 10개 사례를 검사했다. 구형 synthetic Product/Order의 자동 v2 개정은 `MODEL_UPGRADE_REQUIRED`로 차단한다. 과거 성공 접수·원상 bytes/hash 보존 및 신규 등록/혼합 원상 경계를 검사하며, 운영 데이터 자동 전환이나 실제 재해 복구 검증을 수행했다고 주장하지 않는다. U1/U2 영향 회귀 결과는 다음 실행 기록으로 구분한다.

## 공통 저장·복구 영향 회귀: 수정 필요

같은 제품 digest `7d5eb5...`에서 아래 네 명령을 순차 실행했다. 두 통합 명령의 기존 pretest는 각 소유자의 격리 검증 DB 준비를 통과했다. 실패한 명령을 같은 source에서 다시 실행하지 않았다.

| 검사 | 종료 코드 | 파일 결과 | 테스트 결과 | 보고서 |
| --- | --- | --- | --- | --- |
| U1 선택 단위 | 0 | 5개 통과 | 46 통과 / skip 0 | `.reports/u3/models-u1-unit-regression.json` |
| U2 선택 단위 | 1 | 4 통과 / 1 실패 | 49 통과 / 1 실패 / skip 0 | `.reports/u3/models-u2-unit-regression.json` |
| U1 선택 통합 | 1 | 4 통과 / 1 실패 | 85 통과 / 1 실패 / skip 0 | `.reports/u3/models-u1-integration-regression.json` |
| U2 선택 통합 | 1 | 4 통과 / 1 실패 | 51 통과 / 7 실패 / skip 0 | `.reports/u3/models-u2-integration-regression.json` |

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npm run test:u1:unit -- tests/u1/unit/models.spec.ts tests/u1/unit/model-snapshots.spec.ts tests/u1/unit/recovery-payload.spec.ts tests/u1/unit/enterprise-access.spec.ts tests/u1/unit/worker.spec.ts --outputFile .reports/u3/models-u1-unit-regression.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npm run test:u2:unit -- tests/u2/unit/models.spec.ts tests/u2/unit/verified-person.spec.ts tests/u2/unit/enrollment-authority.spec.ts tests/u2/unit/scopes.spec.ts tests/u2/unit/resource-budget.spec.ts --outputFile .reports/u3/models-u2-unit-regression.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npm run test:u1:integration -- tests/u1/integration/business-flow.spec.ts tests/u1/integration/auth-access.spec.ts tests/u1/integration/contract-bindings.spec.ts tests/u1/integration/http-primary-ac.spec.ts tests/u1/integration/postgres-models.spec.ts --outputFile .reports/u3/models-u1-integration-regression.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npm run test:u2:integration -- tests/u2/integration/repository.spec.ts tests/u2/integration/migration-compatibility.spec.ts tests/u2/integration/postgres-models.spec.ts tests/u2/integration/http-primary-ac.spec.ts tests/u2/integration/worker-boundaries.spec.ts --outputFile .reports/u3/models-u2-integration-regression.json
```

실패 위치는 다음과 같다.

- `tests/u2/unit/models.spec.ts:64`: 기존 `MODELS` 43개 보존 검사는 통과했지만 `ALL_MODELS`를 U1+U2의 66개로만 기대하는 검사가 실제 75개와 달랐다. U3 신규 이름 9개를 포함하는 정확한 이름 합집합과 중복 없는 물리 등록을 검사하도록 보완한다. 기존 U2 보안/decoder 검사를 삭제하거나 하한을 낮추지 않는다.
- `tests/u1/integration/business-flow.spec.ts:237`: worker 결과의 `failed`가 기대 0 대신 10이었다.
- `tests/u2/integration/worker-boundaries.spec.ts`: 만료 PUBLISHED 작업 제어 7개 시나리오가 실패했다. 확인된 진단에서 기대 `EXPIRED_CONTROL_BINDING` 대신 `OUTBOX_CHANGED`, 의도한 합성 crash 대신 원래 작업/발행 개정·기한 대조 오류가 나왔다. 일부 실행 출력은 잘렸으므로 확인되지 않은 세부 원인은 확정하지 않는다.

정적 조사에서 신규 nullable `sourceContract` 컬럼이 물리 WorkItem에 NULL로 읽히지만 과거 보호 이미지에는 해당 필드가 없는 차이를 발견했다. `worker-traversal.ts`의 전체 원본 대조와 `ProtectedTransaction.get`의 version-aware projection 경계를 조사하도록 개발자에게 요청했다. 원인 확정 전에는 단일 가설이며, 실제 오염이나 개정 차이를 무시하도록 canonical/security 대조를 삭제하지 않는다. Step 5–6 완료 및 Step 7 착수는 수정 후 실제 영향 회귀 통과까지 보류한다.

## 원인 확인과 projection 수정 후 검사

개발자가 `ProtectedTransaction.get/list → storedModelData` 경로를 확인했다. 새 SourceContract metadata의 물리 NULL이 원래 보호 WorkItem 이미지에는 없는 필드로 추가되어 전체 canonical 대조가 실패했다. 등록된 `U3Contract:SourceContract` metadata의 null/undefined만 과거 projection에서 제외했다. non-null metadata와 다른 필드는 보존하며, 기존 보안/전체 원본 대조를 삭제하지 않았다.

U2 모델 목록 검사는 U1 43개 보존과 기존 U2 decoder/보안 검사를 유지하고, U1/U2/U3의 정확한 이름 합집합·중복 부재·물리 schema 등록을 확인하도록 수정했다. worker 시험에는 primary-only metadata 오염 시 ACK/업무 효과를 차단하는 사례를 추가했다.

검사 시 HEAD는 `d742d923f42abd0fd592b7d89d475597eac258d2`, 수정 제품 digest는 `f6636f0de8455fe31c5163e975edcfdd5804f8c75409ece25aff04fc0f2e9a60`였다.

| 검사 | 종료 코드 | 결과 | 별도 보고서 |
| --- | --- | --- | --- |
| U3 단위 | 1 | 88 통과 / 1 실패 / skip 0 | `.reports/u3/models-projection-unit.json` |
| U2 모델 단위 | 0 | 1개 파일 / 16 통과 / skip 0 | `.reports/u3/models-projection-u2-unit.json` |
| U1 전체 통합 | 0 | 13개 파일 / 168 통과 / skip 0 | `.reports/u3/models-projection-u1-integration.json` |
| U2 전체 통합 | 0 | 21개 파일 / 274 통과 / skip 0 | `.reports/u3/models-projection-u2-integration.json` |
| U3 migration 통합 | 0 | 1개 파일 / 10 통과 / skip 0 | `.reports/u3/models-projection-integration.json` |
| TypeScript noEmit | 0 | 진단 없음 | 콘솔 종료 결과 |
| 수정 파일 ESLint | 0 | 진단 없음 | 콘솔 종료 결과 |

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts --outputFile=.reports/u3/models-projection-unit.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u2/vitest.unit.config.ts tests/u2/unit/models.spec.ts --outputFile=.reports/u3/models-projection-u2-unit.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U1_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u1/vitest.integration.config.ts --outputFile=.reports/u3/models-projection-u1-integration.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U2_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u2/vitest.integration.config.ts --outputFile=.reports/u3/models-projection-u2-integration.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/migration-compatibility.spec.ts --outputFile=.reports/u3/models-projection-integration.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint packages/persistence/src/model-catalog.ts tests/u3/unit/models.spec.ts tests/u2/unit/models.spec.ts tests/u2/integration/worker-boundaries.spec.ts
```

남은 U3 실패는 `FactEnvelope`에 없는 `revision`을 시험에서 변경한 것이 원인이었다. 실제 등록된 개정 필드는 `aggregateVersion`이다. 제품 코드의 projection을 넓히지 않고 실제 필드 변경 보존을 검증하도록 시험만 수정했다. 미등록 `revision` 입력은 `UNKNOWN_MODEL_FIELD`로 거절되는 검사도 추가했다.

## 최종 단위 검사와 현재 판정

제품 digest `f6636f0...`는 유지됐고, source 쓰기를 멈춘 뒤 Luna가 아래 세 명령을 순차 실행했다. 모두 종료 코드 0이었다. 최종 U3 단위는 4개 파일 / 89개 통과 / skip 0이며 새 보고서는 `.reports/u3/models-projection-unit-final.json`이다. 이전 실패 보고서는 덮어쓰지 않았다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts --outputFile=.reports/u3/models-projection-unit-final.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint tests/u3/unit/models.spec.ts
```

Root가 최종 U3 단위, U2 모델 단위, U1/U2 전체 통합, U3 migration 보고서 다섯 개의 실제 JSON 집계를 읽어 각각 89/16/168/274/10개 통과, 실패·pending 0, success true를 확인했다. 현재 모델/migration/복구 계층의 계획 Step 5–6을 완료 표시하고 repository Step 7로 진행한다. 실제 고객 업무, HTTP/worker v3 연결, 전체 제품 커버리지 80%, 공식 Construction 체크포인트 및 최종 리뷰는 후속이다. 기존 U2 Major 두 건과 실제 운영 선행조건은 별도 미해결로 유지한다.
