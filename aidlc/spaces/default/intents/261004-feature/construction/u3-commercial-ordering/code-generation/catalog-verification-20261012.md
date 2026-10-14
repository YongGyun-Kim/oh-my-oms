# U3 상품 등록·조회 검증 기록

## 구현 범위와 계약 경계

승인 계획 Step 9–10의 상품 등록·개정·공통 조건·조회 경로와 시험을 구현했다. 기존 catalog 파일에 U3 전용 서비스와 현재 조회 권한 fence를 연결하고, 구형 입력·등록 계약 2는 보존했다. 실제 HTTP 등록 3 연결은 Step 15의 작업이다.

U3 상품 입력만 폐쇄적인 공통 조건 초안으로 보완했다. 저장 모델 CommonOfferRevision의 필수 유효 구간·조건 바인딩·개정 근거에 맞추며 offer 참조는 서버에서 발급한다. 조건이 미완성인 유효 초안은 INCOMPLETE로 기록한다. 기업별 예외 및 최종 가격은 아직 평가하지 않아 UNKNOWN으로 표시하며 이후 계약 업무에서 연결한다. 실제 주문 구매 스냅샷 연결은 Step 13에서 검증한다.

제품 변경은 `u3-commercial-v2.json`, `u3-operations-v2.json`, `u3-types.ts`, `catalog.ts`, `catalog-query.ts`, 신규 `catalog-conditions.ts`, `u3-commands.ts`다. 시험 변경은 U3의 catalog/commercial/command-authority fixture 및 신규 단위·통합 catalog 시험이다. root 검증 기록과 git 작업은 별도로 수행한다.

## 최초 검사

HEAD `2ce965a4c5b2cea3ae10b35b88642f9364da35b6`, runtime source digest `b81c4618aaf3141893f9cdb2edbd434f5d8a0abd872694d7af2bd8da267b719b`에서 소스 쓰기를 중지하고 Luna가 순차 실행했다. 기존 U3 격리 DB를 사용했고 실제 AWS나 장시간 부하·전체 재해 복구는 실행하지 않았다.

| 검사 | 종료 코드 | 실제 결과 |
| --- | --- | --- |
| TypeScript noEmit | 0 | 진단 없음 |
| 전체 U3 단위 | 1 | 9개 파일 / 133개 통과 / 1개 실패 / skip 0; `.reports/u3/catalog-unit-initial.json` |
| 상품·repository 통합 | 0 | 2개 파일 / 32개 통과 / skip 0; `.reports/u3/catalog-integration-initial.json` |
| 지정 ESLint | 1 | catalog-query의 미사용 store와 통합 catalog 시험의 미사용 ref 두 건 |

원본 JSON에서 실패·pending·success 집계를 확인했다. 상품 단위 10개 중 하나는 PRICE 조건의 빈 evidenceRefs를 허용한 초안이 실제 ConditionBinding의 근거 min1/max100 계약에 맞지 않아 INVALID_INPUT으로 거절된 경우다. 기존 저장 계약을 완화하지 않고 초안 항목의 필수 근거 기준을 일치시키며, 명시 빈 근거는 입력 거절로 검증한다. 조건 항목이 아직 없거나 개정 근거가 비어 있는 유효 INCOMPLETE 초안 시험은 유지한다. 최초 실패 보고서는 보존한다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts --outputFile=.reports/u3/catalog-unit-initial.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/catalog.spec.ts tests/u3/integration/repository-boundaries.spec.ts --outputFile=.reports/u3/catalog-integration-initial.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint packages/contracts/src/u3-types.ts packages/core/src/catalog.ts packages/core/src/catalog-query.ts packages/core/src/catalog-conditions.ts packages/core/src/u3-commands.ts tests/u3/fixtures/catalog.ts tests/u3/fixtures/commercial.ts tests/u3/fixtures/command-authority.ts tests/u3/unit/catalog.spec.ts tests/u3/integration/catalog.spec.ts
```

## 최초 검사 시점의 후속 검증

최초 실패를 기록한 시점에는 Step 9–10을 완료로 표시하지 않았다. 상품 통합 10개는 실제 등록·개정·이전 조건 보존·기업 접근·내부망·현재 근거/권한 회수 경계를 확인했다. 실제 운영 근거의 신뢰·기업 계약의 최종 조건·주문 스냅샷·HTTP/worker binding·전체 커버리지·CI 및 최종 리뷰를 이 결과로 대신하지 않는다.

## 입력 근거 정합화 후 검사

초안의 조건 항목 근거를 기존 ConditionBinding의 1–100개 폐쇄 계약에 연결했다. 명시 빈 근거 및 101개 근거는 INVALID_INPUT으로 거절한다. 조건 항목이나 개정 근거가 미완성인 유효 초안은 실제 DB에서 INCOMPLETE·비공개로 저장하며, 잘못된 항목 입력은 이력을 증가시키지 않는다. 기존 저장 기준은 완화하지 않았다. 미사용 선언 두 곳은 제거했다.

현재 source digest `7df2afbff0a9643af29a63e23611249fca0e7802eaaca24fe3709b8cd225dd33`, HEAD `2ce965a4c5b2cea3ae10b35b88642f9364da35b6`에서 Luna 재검증 결과:

| 검사 | 종료 코드 | 결과 / `.reports/u3/` 보고서 |
| --- | --- | --- |
| TypeScript noEmit | 0 | 진단 없음 |
| 전체 U3 단위 | 0 | 9개 파일 / 134개 통과 / skip 0; `catalog-unit-evidence-aligned.json` |
| 상품·repository 통합 | 0 | 2개 파일 / 32개 통과 / skip 0; `catalog-integration-evidence-aligned.json` |
| 지정 ESLint | 0 | 진단 없음 |

원본 JSON도 실패·pending 0 및 success true를 확인했다. 수정 후 보고서는 별도 파일이며 최초 실패 기록은 유지한다. 기존 catalog 모듈과 공통 계약 변경의 영향 회귀는 선택 U1 계약/adapter 단위 및 business-flow 통합으로 확인한다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts --outputFile=.reports/u3/catalog-unit-evidence-aligned.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/catalog.spec.ts tests/u3/integration/repository-boundaries.spec.ts --outputFile=.reports/u3/catalog-integration-evidence-aligned.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint packages/contracts/src/u3-types.ts packages/core/src/catalog.ts packages/core/src/catalog-query.ts packages/core/src/catalog-conditions.ts packages/core/src/u3-commands.ts tests/u3/fixtures/catalog.ts tests/u3/fixtures/commercial.ts tests/u3/fixtures/command-authority.ts tests/u3/unit/catalog.spec.ts tests/u3/integration/catalog.spec.ts
```

## 기존 상품 업무 영향 회귀와 완료

같은 상품 구간 source에서 선택 U1 contracts/adapters 단위 2개 파일 / 31개와 business-flow 통합 1개 파일 / 53개가 모두 통과했다. 두 명령 모두 종료 코드 0·skip 0이며 원본 JSON 실패·pending 0·success true를 확인했다. 새 U3 경로가 기존 상품 입력·등록·업무 흐름의 의미를 덮어쓰지 않는지 검증했다. 전체 U1/U2를 불필요하게 다시 실행하지 않았다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u1/vitest.unit.config.ts tests/u1/unit/contracts.spec.ts tests/u1/unit/adapters.spec.ts --outputFile=.reports/u3/catalog-legacy-u1-unit.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U1_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u1/vitest.integration.config.ts tests/u1/integration/business-flow.spec.ts --outputFile=.reports/u3/catalog-legacy-u1-integration.json
```

상품 단위·통합·영향 회귀와 타입·lint 결과로 승인 계획 Step 9–10을 마무리한다. 기업 계약의 최종 가격과 실제 주문 스냅샷, HTTP 연결 및 전체 최종 검증은 이후 단계에 남긴다.
