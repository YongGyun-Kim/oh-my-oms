# U3 계약 업무 부분 구현 검증 기록

## 승인 계획의 현재 범위

Step 11–12의 첫 부분으로 계약 등록·새 개정 초안·다른 사람 승인·중첩 충돌 차단·조건별 기업 우선 해석과 시험을 작성했다. 제안·동의·수동 갱신·고객 변경 요청·예외 진입은 다음 부분에 남아 있으므로 두 단계는 완료로 표시하지 않는다.

U3 계약 입력에만 저장 모델의 필수 유효 구간·조건 바인딩에 맞는 폐쇄 초안 필드를 연결했다. 신원 판단은 구형 U2 compare 결과만 신뢰하지 않고, 현재 사람 링크·계정의 정확 개정, PersonVerification·정책 목적·필수 출처 전체·현재 확인자 권위를 대조한다. 이것이 기존 U2 Major 두 건의 전역 해결을 의미하지 않는다.

## 최초 검사

HEAD `96d13bc5f5f35a7bd70a256e33b45862df199753`, source digest `72946d26575e3501eaf0b190dfa994a682e0430321c117502e77afebb5454406`에서 쓰기를 중지하고 Luna가 순차 실행했다. 기존 U3 격리 DB를 사용했으며 새 운영 workflow·실제 AWS 작업은 수행하지 않았다.

| 검사 | 종료 코드 | 실제 결과 |
| --- | --- | --- |
| TypeScript noEmit | 0 | 진단 없음 |
| 전체 U3 단위 | 0 | 11개 파일 / 150개 통과 / skip 0; `.reports/u3/agreement-first-unit-initial.json` |
| 계약·상품 통합 | 1 | 상품 10개 통과 / 계약 10개 실패 / skip 0; `.reports/u3/agreement-first-integration-initial.json` |
| 지정 ESLint | 1 | 계약 통합 시험의 미사용 ref 한 건 |

원본 JSON의 실패·pending·success 집계를 확인했다. 계약 통합 10개는 개별 승인 판단 전에 공통 fixture의 seedU2Enterprise(`enterprise.ts:122`)에서 개정 증가 검증으로 실패했다. 시험 초기화·중복 seed 순서를 조사하고 모델의 개정 검사를 유지하는 최소 수정을 진행한다. 미사용 import도 제거한다. 최초 실패 보고서는 유지한다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts --outputFile=.reports/u3/agreement-first-unit-initial.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/commercial-agreement.spec.ts tests/u3/integration/catalog.spec.ts --outputFile=.reports/u3/agreement-first-integration-initial.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint packages/contracts/src/u3-types.ts packages/core/src/u3-current-basis.ts packages/core/src/commercial-terms.ts packages/core/src/commercial-agreement.ts packages/core/src/index.ts tests/u3/fixtures/agreement.ts tests/u3/unit/commercial-terms.spec.ts tests/u3/unit/current-commercial-basis.spec.ts tests/u3/integration/commercial-agreement.spec.ts
```

## 운영 근거 연결의 구현 누락

root 검토에서 최초 U3CurrentBasis가 UNREGISTERED/LOCAL_SYNTHETIC만 선언하고 policy/evidence의 synthetic:true만 허용함을 확인했다. 이는 실제 근거 미설정이라는 선행조건뿐 아니라, 실제 등록 소유자를 연결할 실행 경로 자체가 없는 구현 누락이다. 기본 미등록 차단과 운영 환경의 합성 금지는 유지하면서 기존 U2 소유자·보호 근거 경로를 사용하는 명시 서버 등록 검증 포트를 보완한다. 요청 본문의 flag나 marker만으로 운영 근거를 신뢰하게 하지 않는다.

실제 운영 owner 설정·근거 검증을 로컬 시험으로 대신하지 않는다. 수정·검증 결과와 제안/동의/갱신 등 남은 범위는 이후 기록하며, 아직 첫 계약 부분도 완료로 표시하지 않는다.

## owner 포트와 fixture 보완

반복 bootstrap의 공통 fixture가 기존 StaffAuthorityFence를 revision 1로 다시 쓰던 것을 확인했다. 현재 원본을 읽어 정확한 예상 개정으로 authorityRevision/revision을 각각 증가시키며, 최초 seed는 기존 revision 1을 유지한다. 변경 경로는 공유 `tests/u2/fixtures/enterprise.ts`이며 모델의 개정 검사는 유지한다. 미사용 ref도 제거했다.

실제 경로는 서버 생성자의 명시 REGISTERED_OWNER 등록 및 owner 검증 콜백을 요구한다. 보호된 원본의 정확 ref·개정·목적·대상·기업·현재 epoch와 승인 내용 지문을 owner 응답과 대조하며 실제 경로의 정책/근거는 synthetic:false, local은 true만 허용한다. 본문 flag/KNOWN으로 범위나 등록을 선택하지 않고 기본 미등록·운영 local 차단을 유지한다.

서로 다른 link ID만으로 다른 사람을 인정하지 않는다. 등록 owner의 고정 namespace 안에서 검증된 비식별 person key를 비교하며 같은 key·namespace/결합 불일치·미확인 응답은 차단한다. 이 key는 API/저장에 노출하지 않는다. 실제 owner 구현/운영 설정이 없으면 승인은 여전히 보류된다.

승인 전체는 기존 ExecutionBudget의 남은 기한과 10초 중 작은 예산을 사용한다. 개별 콜백은 그 남은 예산과 5초 중 작은 기한으로 제한하고 AbortSignal을 무시하는 지연 응답도 호출자를 계속 기다리게 하거나 늦게 적용하지 않는다. 실제 DB의 owner 경계 및 모의 응답 시험을 추가했고 소스 쓰기를 중지했다. 검사 결과는 이후 기록한다. 모의 owner 응답은 실제 운영 신원·근거 확인의 증거가 아니다.

## owner 보완 후 검사

source digest `70844241211a68dc556c68dbde9b69987d1c694113a2f9cac16b4c5dd454bc48`, HEAD `96d13bc5f5f35a7bd70a256e33b45862df199753`에서 Luna 순차 실행 결과다. 원본 JSON의 집계를 확인했고 이전 실패 보고서는 유지했다.

| 검사 | 종료 코드 | 실제 결과 / `.reports/u3/` 보고서 |
| --- | --- | --- |
| TypeScript noEmit | 0 | 진단 없음 |
| 전체 U3 단위 | 0 | 11개 파일 / 164개 통과 / skip 0; `agreement-owner-unit-initial.json` |
| 계약·owner 포트 통합 | 1 | 2개 파일 / 0개 통과 / 15개 실패 / skip 0; `agreement-owner-integration-initial.json` |
| 공유 fixture U2 권한 회귀 | 0 | 1개 파일 / 7개 통과 / skip 0; `agreement-fixture-u2-regression.json` |
| 지정 ESLint | 0 | 진단 없음 |

계약 통합은 반복 bootstrap을 넘어 진행했으나, 이번에는 공통 `seedAgreementAuthority`의 `agreement.ts:134` 근거 등록에서 INVALID_INPUT으로 실패했다. 개별 승인 판단을 통과했다고 해석하지 않는다. 등록 스키마의 정확한 필드/enum/조건과 합성 fixture를 대조해 최소 수정한 뒤 별도 보고서로 검증한다. 스키마·현재 권위 대조를 완화하거나 시험을 건너뛰지 않는다. Step 11–12는 미완료다.

원인은 VerifiedPersonLink.evidenceRefs의 `/0/entity` enum이었다. 구형 모델은 common:2 참조를 사용하므로 U2 VerificationEvidence를 직접 넣을 수 없다. 구형 계약을 유지하고 기존 IdentityHistory anchor를 통한 제한된 매핑을 보완한다. 실제 producer의 afterRef/resultRefs·확인 actor·sourceRevision 및 PersonVerification의 정확한 정책/근거를 대조하고, reason을 purpose로 해석하지 않는다. 목적·대상은 검증된 정책과 각 근거의 account/기업/binding 및 등록 owner 콜백 결합으로 확인한다.

현재 U2에는 운영용 person-history 생성자가 등록되어 있지 않다. fixture는 명시 합성 anchor를 준비하는 것으로 한정하며 실제 운영 생성/등록 완료를 주장하지 않는다. 운영 소유자·사람 확인 원본의 설정/생성은 여전히 출시 전 선행조건이며, U3가 다른 업무 소유자의 원본을 임의 생성해 이를 대신하지 않는다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts --outputFile=.reports/u3/agreement-owner-unit-initial.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/commercial-agreement.spec.ts tests/u3/integration/commercial-owner-port.spec.ts --outputFile=.reports/u3/agreement-owner-integration-initial.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U2_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u2/vitest.integration.config.ts tests/u2/integration/authority-race.spec.ts --outputFile=.reports/u3/agreement-fixture-u2-regression.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint packages/contracts/src/u3-types.ts packages/core/src/u3-current-basis.ts packages/core/src/commercial-terms.ts packages/core/src/commercial-agreement.ts packages/core/src/index.ts tests/u2/fixtures/enterprise.ts tests/u3/fixtures/agreement.ts tests/u3/unit/commercial-terms.spec.ts tests/u3/unit/current-commercial-basis.spec.ts tests/u3/integration/commercial-agreement.spec.ts tests/u3/integration/commercial-owner-port.spec.ts
```

## 이력 연결 수정 후 검사

수정 후 source digest는 `19ba82c2cfdc76efb8bdadc826cdf6c3828e353542bc61c8c70b502e7adf31a4`, HEAD는 `96d13bc5f5f35a7bd70a256e33b45862df199753`다. Luna의 타입·lint는 종료 코드 0, U3 단위는 164개 모두 통과했다. 통합 15개는 데이터 준비를 넘어 실제 계약 등록 입력 검증에서 INVALID_INPUT으로 실패했다. 보고서는 `.reports/u3/agreement-anchor-unit.json`, `agreement-anchor-integration.json`에 보존했다.

직접 원인은 U3 Ref가 common:2 Ref를 참조하여 U2 VerificationEvidence를 허용하지 않는 것이었다. 입력의 `/agreementEvidenceRefs/0/entity`와 `/conditions/0/evidenceRefs/0/entity`에서 기존 enum으로 거절됐다. 기존 common 계약을 유지하고 U3의 참조만 이미 등록된 폐쇄 U2 참조와 연결한다. 승인 입력의 공통 DecisionInput 연결도 U3의 실제 필드·참조와 일치시킨다. 실제 등록 명령의 정상 입력을 DB 앞단에서 검증하는 시험을 추가하며, 임의 owner/entity/field를 허용하지 않는다.

## 등록 입력 정합화 후 검사

source digest `8aebbfff2603e46ca90817a453b6848ca122f9418bf7e8ff835d0bb63ef55155`, HEAD `96d13bc5f5f35a7bd70a256e33b45862df199753`에서 Luna 타입·lint는 종료 코드 0, U3 단위는 12개 파일 / 171개 통과 / skip 0이었다. 실제 등록 입력 preflight 7개를 포함한다. 통합 15개는 입력 검증을 넘어갔으나 `U3Transaction.current`의 primary/보호 원본 대조에서 실패했다. 보고서는 `.reports/u3/agreement-input-aligned-unit.json`, `agreement-input-aligned-integration.json`이며 원본 집계를 확인했다.

대상은 VerificationEvidence의 선택·nullable인 operatorAuthorityRef다. 보호 after-image는 필드를 생략했지만 TypeORM primary는 등록 컬럼을 null로 읽었다. 나머지 필수 null 필드는 시험 원본에 이미 명시되어 있었다. 등록된 선택·nullable 필드의 생략/null만 비교용으로 정규화하는 최소 수정을 진행한다. 보호/historical bytes·지문·반환 의미는 보존하고 필수 nullable·non-null 값·참조·version/source metadata의 변경은 계속 거절한다. 임의 null 제거 또는 보호 검사 우회로 통과시키지 않는다. 계약 첫 부분과 Step 11–12는 여전히 미완료다.

## 계약 첫 구간 최종 검증

source digest `95ec8d76367ff0ef7f72f6e5c2e9b977ece50998aec6833fdc27e238e9135891`, HEAD `96d13bc5f5f35a7bd70a256e33b45862df199753`에서 소스 쓰기를 중지하고 Luna가 실행했다. root가 세 JSON 보고서의 실제 집계를 확인했다. 이전 실패 보고서는 보존한다.

| 검사 | 종료 코드 | 실제 결과 / `.reports/u3/` 보고서 |
| --- | --- | --- |
| TypeScript noEmit | 0 | 진단 없음 |
| 전체 U3 단위 | 0 | 13개 파일 / 184개 통과 / skip 0; `agreement-current-image-unit.json` |
| 계약·owner 포트 통합 | 0 | 2개 파일 / 15개 통과 / skip 0; `agreement-current-image-integration.json` |
| 지정 ESLint | 0 | 변경한 repository·current-image 시험에 진단 없음 |
| 저장 경계 회귀 | 0 | 1개 파일 / 22개 통과 / skip 0; `agreement-current-image-repository-regression.json` |

세 JSON 모두 success:true, 실패·pending 0이다. 등록 모델을 검증한 뒤 required:false이며 nullable:true인 속성만 비교용 복사본에서 생략/null을 동등하게 본다. modelVersion/sourceContract는 제외하고, 필수 필드·non-null 참조·알 수 없는 속성·개정·출처의 차이는 거절한다. 실제 보호 원본과 반환값을 수정하지 않는다. 변경된 U2 bootstrap fixture의 권한 회귀 7개 통과 기록도 앞서 확보했다.

첫 계약 구간은 통과했지만 제안·동의·수동 갱신·고객 변경 요청·예외 진입과 후속 구현은 남아 있으므로 Step 11–12는 완료로 표시하지 않는다. 실제 운영 owner·사람 확인 원본의 등록은 별도 출시 선행조건이다. 이 결과를 전체 제품 coverage, 실제 운영 증명, U2 미해결 문제의 해소로 해석하지 않는다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts --outputFile=.reports/u3/agreement-current-image-unit.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/commercial-agreement.spec.ts tests/u3/integration/commercial-owner-port.spec.ts --outputFile=.reports/u3/agreement-current-image-integration.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint packages/persistence/src/u3-repository.ts tests/u3/unit/current-image.spec.ts
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/repository-boundaries.spec.ts --outputFile=.reports/u3/agreement-current-image-repository-regression.json
```
